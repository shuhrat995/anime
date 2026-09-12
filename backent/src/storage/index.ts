import { env } from '../config/env.js';
import { MinioStorageProvider } from './minio.provider.js';
import { S3StorageProvider } from './s3.provider.js';
import type { StorageProvider } from './storage-provider.js';

export const storage: StorageProvider = env.storage.provider === 's3'
  ? new S3StorageProvider()
  : new MinioStorageProvider();
