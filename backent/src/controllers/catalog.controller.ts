import type { RequestHandler } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { success } from '../utils/response.js';
import { CatalogRepository, type CatalogResource } from '../repositories/catalog.repository.js';
import { conflict, notFound } from '../errors/app-error.js';
import { toSlug } from '../utils/slug.js';
import { logger } from '../services/logger.service.js';
import {
  getString,
} from '../utils/request.js';

type Handler = RequestHandler<Record<string, string>>;

const catalog = new CatalogRepository();
const resource = (value: string): CatalogResource => value as CatalogResource;
const serialize = (row: { id: string; name: string; slug: string; created_at: Date }) => ({ id: row.id, name: row.name, slug: row.slug, createdAt: row.created_at });

export const listCatalog: Handler = asyncHandler(async (req, res) => {
  const resourceParam = getString(req.params.resource);
  success(res, (await catalog.list(resource(resourceParam))).map(serialize));
});
export const createCatalog: Handler = asyncHandler(async (req, res) => {
  try {
    const resourceParam = getString(req.params.resource);
    const item = await catalog.create(resource(resourceParam), req.body.name, toSlug(req.body.slug ?? req.body.name));
    await logger.audit('catalog.create', 'Catalog entry created', req, { resource: resourceParam, itemId: item.id });
    success(res, serialize(item), 'Catalog entry created', 201);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw conflict('Name or slug already exists');
    throw error;
  }
});
export const updateCatalog: Handler = asyncHandler(async (req, res) => {
  try {
    const resourceParam = getString(req.params.resource);
    const itemId = getString(req.params.id);
    const item = await catalog.update(resource(resourceParam), itemId, {
      ...req.body,
      ...(req.body.slug === undefined ? {} : { slug: toSlug(req.body.slug) }),
    });
    if (!item) throw notFound('Catalog entry');
    await logger.audit('catalog.update', 'Catalog entry updated', req, { resource: resourceParam, itemId: item.id });
    success(res, serialize(item), 'Catalog entry updated');
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw conflict('Name or slug already exists');
    throw error;
  }
});
export const deleteCatalog: Handler = asyncHandler(async (req, res) => {
  const resourceParam = getString(req.params.resource);
  const itemId = getString(req.params.id);
  if (!(await catalog.delete(resource(resourceParam), itemId))) throw notFound('Catalog entry');
  await logger.audit('catalog.delete', 'Catalog entry deleted', req, { resource: resourceParam, itemId });
  success(res, null, 'Catalog entry deleted');
});