import type { RequestHandler } from 'express';
import type Joi from 'joi';
import { validationError } from '../errors/app-error.js';

type Schemas = Partial<Record<'body' | 'params' | 'query' | 'headers', Joi.ObjectSchema>>;

export const validate = (schemas: Schemas): RequestHandler => (req, _res, next) => {
  const targets: Record<keyof Schemas, unknown> = {
    body: req.body,
    params: req.params,
    query: req.query,
    headers: req.headers,
  };

  for (const [location, schema] of Object.entries(schemas) as Array<[keyof Schemas, Joi.ObjectSchema]>) {
    const { value, error } = schema.validate(targets[location], {
      abortEarly: false,
      stripUnknown: location !== 'headers',
      allowUnknown: location === 'headers',
      convert: true,
    });

    if (error) {
      return next(
        validationError(
          error.details.map((detail) => ({
            path: detail.path.join('.'),
            message: detail.message,
          })),
        ),
      );
    }

    if (location === 'body') {
      req.body = value;
    }

    if (location === 'params') {
      req.params = value as typeof req.params;
    }

    if (location === 'query') {
      Object.assign(req.query, value);
    }
  }

  next();
};