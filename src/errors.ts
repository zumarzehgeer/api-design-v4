import type { ErrorRequestHandler } from 'express';
import { Prisma } from './generated/prisma/client.js';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _req,
  res,
  _next,
) => {
  if (error instanceof ApiError) {
    res
      .status(error.status)
      .json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request.',
        details: error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
    });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      res.status(409).json({
        error: { code: 'CONFLICT', message: 'That username is unavailable.' },
      });
      return;
    }
    if (error.code === 'P2025') {
      res
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'Resource not found.' } });
      return;
    }
  }
  if (typeof error === 'object' && error !== null && 'type' in error) {
    if (error.type === 'entity.parse.failed') {
      res.status(400).json({
        error: {
          code: 'INVALID_JSON',
          message: 'Request body must be valid JSON.',
        },
      });
      return;
    }
    if (error.type === 'entity.too.large') {
      res.status(413).json({
        error: {
          code: 'BODY_TOO_LARGE',
          message: 'Request body exceeds 32kb.',
        },
      });
      return;
    }
  }
  // Never log request bodies, tokens, passwords or database error details.
  console.error('Unhandled API error');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    },
  });
};
