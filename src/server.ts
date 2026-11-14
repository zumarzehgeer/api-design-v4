import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import type { PrismaClient } from './generated/prisma/client.js';
import { createAuth } from './modules/auth.js';
import { createRouter } from './router.js';
import { errorHandler, ApiError } from './errors.js';

export function createApp(db: PrismaClient, jwtSecret: string) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '32kb' }));
  const auth = createAuth(db, jwtSecret);
  const authLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new ApiError(429, 'RATE_LIMITED', 'Try again later.')),
  });
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.post('/user', authLimit, auth.register);
  app.post('/signin', authLimit, auth.signIn);
  app.use('/api', auth.protect, createRouter(db));
  app.use((_req, _res, next) =>
    next(new ApiError(404, 'NOT_FOUND', 'Route not found.')),
  );
  app.use(errorHandler);
  return app;
}
