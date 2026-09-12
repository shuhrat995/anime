import type { Readable } from 'node:stream';

export interface StoredObject {
  key: string;
  contentType: string;
  byteSize: number;
}

export interface StorageProvider {
  ensureReady(): Promise<void>;
  putObject(key: string, body: Readable | Buffer, contentType: string): Promise<void>;
  getObject(key: string): Promise<Readable>;
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
  removeObjects(keys: string[]): Promise<void>;
  health(): Promise<{ provider: string; bucket: string; healthy: boolean }>;
}
