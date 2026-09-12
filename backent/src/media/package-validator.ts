import { createReadStream } from 'node:fs';
import { basename } from 'node:path';
import yauzl, { type Entry, type ZipFile } from 'yauzl';
import Joi from 'joi';
import { badRequest } from '../errors/app-error.js';

const REQUIRED_FILES = ['manifest.json', 'metadata.json', 'master.m3u8', 'thumbnail.jpg'];
const REQUIRED_DIRECTORIES = ['1080/', '720/', '480/', 'subtitles/'];
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;

const manifestSchema = Joi.object({ version: Joi.alternatives().try(Joi.string(), Joi.number()) }).unknown(true);
const metadataSchema = Joi.object({
  durationSeconds: Joi.number().integer().min(0),
  duration_seconds: Joi.number().integer().min(0),
}).unknown(true);

export interface ValidatedPackage {
  manifest: Record<string, unknown>;
  metadata: Record<string, unknown>;
  fileNames: string[];
  durationSeconds: number | null;
}

const openZip = (filePath: string): Promise<ZipFile> => new Promise((resolve, reject) => {
  yauzl.open(filePath, { lazyEntries: true, autoClose: false }, (error, zip) => {
    if (error || !zip) reject(error ?? new Error('Unable to read zip archive'));
    else resolve(zip);
  });
});

const readEntry = (zip: ZipFile, entry: Entry): Promise<Buffer> => new Promise((resolve, reject) => {
  if (entry.uncompressedSize > MAX_MANIFEST_BYTES) return reject(badRequest(`${basename(entry.fileName)} is too large`));
  zip.openReadStream(entry, (error, stream) => {
    if (error || !stream) return reject(error ?? new Error('Unable to read archive entry'));
    const chunks: Buffer[] = [];
    let size = 0;
    stream.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_MANIFEST_BYTES) stream.destroy(badRequest(`${basename(entry.fileName)} is too large`));
      else chunks.push(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
});

const parseJson = (fileName: string, value: Buffer): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(value.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected a JSON object');
    return parsed as Record<string, unknown>;
  } catch {
    throw badRequest(`${fileName} must be a valid JSON object`);
  }
};

export const validateEpisodePackage = async (filePath: string, maxArchiveBytes: number): Promise<ValidatedPackage> => {
  const zip = await openZip(filePath);
  const entries = new Set<string>();
  const directoryPrefixes = new Set<string>();
  let uncompressedBytes = 0;
  let manifest: Record<string, unknown> | undefined;
  let metadata: Record<string, unknown> | undefined;
  let masterManifest: Buffer | undefined;

  return new Promise<ValidatedPackage>((resolve, reject) => {
    const fail = (error: unknown) => { zip.close(); reject(error); };
    zip.on('error', fail);
    zip.on('entry', (entry: Entry) => {
      void (async () => {
        try {
          const name = entry.fileName.replaceAll('\\', '/');
          if (!name || name.startsWith('/') || name.includes('../') || entries.has(name)) throw badRequest('Archive contains an unsafe or duplicate path');
          entries.add(name);
          if (name.endsWith('/')) directoryPrefixes.add(name);
          else {
            uncompressedBytes += entry.uncompressedSize;
            if (uncompressedBytes > maxArchiveBytes * 2) throw badRequest('Archive expands beyond the allowed size');
            for (const directory of REQUIRED_DIRECTORIES) if (name.startsWith(directory)) directoryPrefixes.add(directory);
            if (name === 'manifest.json') manifest = parseJson(name, await readEntry(zip, entry));
            if (name === 'metadata.json') metadata = parseJson(name, await readEntry(zip, entry));
            if (name === 'master.m3u8') masterManifest = await readEntry(zip, entry);
          }
          zip.readEntry();
        } catch (error) { fail(error); }
      })();
    });
    zip.on('end', () => {
      try {
        for (const file of REQUIRED_FILES) if (!entries.has(file)) throw badRequest(`Package is missing required file: ${file}`);
        for (const directory of REQUIRED_DIRECTORIES) if (!directoryPrefixes.has(directory)) throw badRequest(`Package is missing required directory: ${directory}`);
        if (!masterManifest?.toString('utf8').startsWith('#EXTM3U')) throw badRequest('master.m3u8 is not a valid HLS manifest');
        if (!manifest || !metadata) throw badRequest('Package metadata is incomplete');
        const manifestCheck = manifestSchema.validate(manifest);
        const metadataCheck = metadataSchema.validate(metadata);
        if (manifestCheck.error || metadataCheck.error) throw badRequest('Package manifest or metadata has an invalid structure');
        const duration = metadata.durationSeconds ?? metadata.duration_seconds;
        zip.close();
        resolve({
          manifest,
          metadata,
          fileNames: [...entries].filter((name) => !name.endsWith('/')),
          durationSeconds: typeof duration === 'number' ? duration : null,
        });
      } catch (error) { fail(error); }
    });
    zip.readEntry();
  });
};

export const streamZipEntries = async (
  filePath: string,
  onFile: (entry: Entry, stream: NodeJS.ReadableStream) => Promise<void>,
): Promise<void> => {
  const zip = await openZip(filePath);
  await new Promise<void>((resolve, reject) => {
    const fail = (error: unknown) => { zip.close(); reject(error); };
    zip.on('error', fail);
    zip.on('entry', (entry: Entry) => {
      void (async () => {
        try {
          if (entry.fileName.endsWith('/')) return zip.readEntry();
          zip.openReadStream(entry, async (error, stream) => {
            if (error || !stream) return fail(error ?? new Error('Unable to read archive entry'));
            try { await onFile(entry, stream); zip.readEntry(); } catch (streamError) { fail(streamError); }
          });
        } catch (error) { fail(error); }
      })();
    });
    zip.on('end', () => { zip.close(); resolve(); });
    zip.readEntry();
  });
};

export const archiveIsReadable = (filePath: string) => createReadStream(filePath);
