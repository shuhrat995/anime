import 'dotenv/config';
import Joi from 'joi';

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  API_PREFIX: Joi.string().pattern(/^\//).default('/api/v1'),
  DATABASE_URL: Joi.string().uri({ scheme: ['postgres', 'postgresql'] }).required(),
  LOG_DATABASE_URL: Joi.string().uri({ scheme: ['postgres', 'postgresql'] }).required(),
  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).required(),
  JWT_ACCESS_SECRET: Joi.string().min(64).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(64).required(),
  JWT_REFRESH_TTL: Joi.string().default('30d'),
  CORS_ORIGINS: Joi.string().allow('').default(''),
  STORAGE_PROVIDER: Joi.string().valid('minio', 's3').default('minio'),
  MINIO_ENDPOINT: Joi.string().hostname().default('localhost'),
  MINIO_PORT: Joi.number().port().default(9000),
  MINIO_USE_SSL: Joi.boolean().default(false),
  MINIO_ACCESS_KEY: Joi.string().required(),
  MINIO_SECRET_KEY: Joi.string().required(),
  MINIO_BUCKET: Joi.string().default('anime-media'),
  S3_REGION: Joi.string().default('auto'),
  S3_BUCKET: Joi.string().default('anime-media'),
  S3_ENDPOINT: Joi.string().allow('').default(''),
  S3_ACCESS_KEY_ID: Joi.string().allow('').default(''),
  S3_SECRET_ACCESS_KEY: Joi.string().allow('').default(''),
  MAX_PACKAGE_SIZE_MB: Joi.number().integer().min(1).max(10_240).default(2048),
  LOG_LEVEL: Joi.string().valid('debug', 'info', 'warn', 'error').default('info'),
}).unknown(true);

const { value, error } = schema.validate(process.env, { abortEarly: false, convert: true });
if (error) throw new Error(`Invalid environment: ${error.message}`);

export const env = Object.freeze({
  nodeEnv: value.NODE_ENV as 'development' | 'test' | 'production',
  port: value.PORT as number,
  apiPrefix: value.API_PREFIX as string,
  databaseUrl: value.DATABASE_URL as string,
  logDatabaseUrl: value.LOG_DATABASE_URL as string,
  redisUrl: value.REDIS_URL as string,
  jwt: {
    accessSecret: value.JWT_ACCESS_SECRET as string,
    accessTtl: value.JWT_ACCESS_TTL as string,
    refreshSecret: value.JWT_REFRESH_SECRET as string,
    refreshTtl: value.JWT_REFRESH_TTL as string,
  },
  corsOrigins: (value.CORS_ORIGINS as string).split(',').map((origin) => origin.trim()).filter(Boolean),
  storage: {
    provider: value.STORAGE_PROVIDER as 'minio' | 's3',
    minio: {
      endpoint: value.MINIO_ENDPOINT as string,
      port: value.MINIO_PORT as number,
      useSSL: value.MINIO_USE_SSL as boolean,
      accessKey: value.MINIO_ACCESS_KEY as string,
      secretKey: value.MINIO_SECRET_KEY as string,
      bucket: value.MINIO_BUCKET as string,
    },
    s3: {
      region: value.S3_REGION as string,
      bucket: value.S3_BUCKET as string,
      endpoint: value.S3_ENDPOINT as string,
      accessKeyId: value.S3_ACCESS_KEY_ID as string,
      secretAccessKey: value.S3_SECRET_ACCESS_KEY as string,
    },
  },
  maxPackageBytes: (value.MAX_PACKAGE_SIZE_MB as number) * 1024 * 1024,
  logLevel: value.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error',
});
