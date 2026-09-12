import type { Readable } from 'node:stream';
import { Client } from 'minio';
import { env } from '../config/env.js';
import type { StorageProvider } from './storage-provider.js';

export class MinioStorageProvider implements StorageProvider {
  private readonly client = new Client({
    endPoint: env.storage.minio.endpoint,
    port: env.storage.minio.port,
    useSSL: env.storage.minio.useSSL,
    accessKey: env.storage.minio.accessKey,
    secretKey: env.storage.minio.secretKey,
  });
  private readonly bucket = env.storage.minio.bucket;

  async ensureReady(): Promise<void> {
    if (!(await this.client.bucketExists(this.bucket))) await this.client.makeBucket(this.bucket);
  }

  async putObject(key: string, body: Readable | Buffer, contentType: string): Promise<void> {
    await this.client.putObject(this.bucket, key, body, undefined, { 'Content-Type': contentType });
  }

  getObject(key: string): Promise<Readable> {
    return this.client.getObject(this.bucket, key);
  }

  getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    return this.client.presignedGetObject(this.bucket, key, expiresInSeconds);
  }

  async removeObjects(keys: string[]): Promise<void> {
    if (keys.length) await this.client.removeObjects(this.bucket, keys);
  }

  async health() {
    try {
      await this.client.bucketExists(this.bucket);
      return { provider: 'minio', bucket: this.bucket, healthy: true };
    } catch {
      return { provider: 'minio', bucket: this.bucket, healthy: false };
    }
  }
}
