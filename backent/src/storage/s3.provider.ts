import { Readable } from 'node:stream';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';
import { AppError } from '../errors/app-error.js';
import type { StorageProvider } from './storage-provider.js';

export class S3StorageProvider implements StorageProvider {
  private readonly bucket = env.storage.s3.bucket;
  private readonly client = new S3Client({
    region: env.storage.s3.region,
    ...(env.storage.s3.endpoint ? { endpoint: env.storage.s3.endpoint } : {}),
    credentials: {
      accessKeyId: env.storage.s3.accessKeyId,
      secretAccessKey: env.storage.s3.secretAccessKey,
    },
  });

  async ensureReady(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  async putObject(key: string, body: Readable | Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async getObject(key: string): Promise<Readable> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!result.Body) throw new AppError(404, 'MEDIA_NOT_FOUND', 'Media object was not found');
    if (result.Body instanceof Readable) return result.Body;
    if ('transformToWebStream' in result.Body) return Readable.fromWeb(result.Body.transformToWebStream() as never);
    throw new AppError(500, 'STORAGE_ERROR', 'Storage returned an unsupported media body');
  }

  getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: expiresInSeconds });
  }

  async removeObjects(keys: string[]): Promise<void> {
    if (!keys.length) return;
    await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys.map((Key) => ({ Key })) } }));
  }

  async health() {
    try {
      await this.ensureReady();
      return { provider: 's3', bucket: this.bucket, healthy: true };
    } catch {
      return { provider: 's3', bucket: this.bucket, healthy: false };
    }
  }
}
