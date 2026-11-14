import { Router } from 'express';
import type { PrismaClient } from './generated/prisma/client.js';
import { z } from 'zod';
import { ApiError } from './errors.js';
import { pageQuery, afterWhere, pageOrder, pageResult } from './pagination.js';

const text = (max: number) => z.string().trim().min(1).max(max);
const productSchema = z.strictObject({ name: text(120) });
const updateSchema = z.strictObject({
  title: text(255),
  body: text(10_000),
  status: z.enum(['IN_PROGRESS', 'LIVE', 'DEPRECATED', 'ARCHIVED']).optional(),
  version: text(40).nullable().optional(),
  asset: z
    .url()
    .max(2048)
    .refine((s) => /^https?:\/\//.test(s), 'Use an HTTP(S) URL.'),
});
const pointSchema = z.strictObject({
  name: text(255),
  description: text(2000),
});
const nonEmpty = (value: object) => Object.keys(value).length > 0;
const ids = z.object({
  productId: z.uuid(),
  updateId: z.uuid().optional(),
  pointId: z.uuid().optional(),
});
function found<T>(value: T | null): T {
  if (value === null)
    throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
  return value;
}

export function createRouter(db: PrismaClient) {
  const router = Router();
  router.post('/products', async (req, res) => {
    const input = productSchema.parse(req.body);
    const data = await db.product.create({
      data: { ...input, belongsToId: req.userId },
    });
    res.location(`/api/products/${data.id}`).status(201).json({ data });
  });
  router.get('/products', async (req, res) => {
    const { limit, after } = pageQuery(req.query);
    const rows = await db.product.findMany({
      where: { belongsToId: req.userId, ...afterWhere(after) },
      orderBy: pageOrder,
      take: limit + 1,
    });
    res.json(pageResult(rows, limit));
  });
  router.get('/products/:productId', async (req, res) => {
    const { productId } = ids.parse(req.params);
    res.json({
      data: found(
        await db.product.findUnique({
          where: { id: productId, belongsToId: req.userId },
        }),
      ),
    });
  });
  router.patch('/products/:productId', async (req, res) => {
    const { productId } = ids.parse(req.params);
    const data = productSchema.parse(req.body);
    res.json({
      data: await db.product.update({
        where: { id: productId, belongsToId: req.userId },
        data,
      }),
    });
  });
  router.delete('/products/:productId', async (req, res) => {
    const { productId } = ids.parse(req.params);
    await db.product.delete({
      where: { id: productId, belongsToId: req.userId },
    });
    res.sendStatus(204);
  });
  router.post('/products/:productId/updates', async (req, res) => {
    const { productId } = ids.parse(req.params);
    const input = updateSchema.parse(req.body);
    const data = await db.update.create({
      data: {
        ...input,
        product: { connect: { id: productId, belongsToId: req.userId } },
      },
    });
    res
      .location(`/api/products/${productId}/updates/${data.id}`)
      .status(201)
      .json({ data });
  });
  router.get('/products/:productId/updates', async (req, res) => {
    const { productId } = ids.parse(req.params);
    found(
      await db.product.findUnique({
        where: { id: productId, belongsToId: req.userId },
        select: { id: true },
      }),
    );
    const { limit, after } = pageQuery(req.query);
    const rows = await db.update.findMany({
      where: {
        productId,
        product: { belongsToId: req.userId },
        ...afterWhere(after),
      },
      orderBy: pageOrder,
      take: limit + 1,
    });
    res.json(pageResult(rows, limit));
  });
  router.get('/products/:productId/updates/:updateId', async (req, res) => {
    const { productId, updateId } = ids.parse(req.params);
    res.json({
      data: found(
        await db.update.findUnique({
          where: {
            id: updateId!,
            productId,
            product: { belongsToId: req.userId },
          },
        }),
      ),
    });
  });
  router.patch('/products/:productId/updates/:updateId', async (req, res) => {
    const { productId, updateId } = ids.parse(req.params);
    const data = updateSchema
      .partial()
      .refine(nonEmpty, 'Supply at least one field.')
      .parse(req.body);
    res.json({
      data: await db.update.update({
        where: {
          id: updateId!,
          productId,
          product: { belongsToId: req.userId },
        },
        data,
      }),
    });
  });
  router.delete('/products/:productId/updates/:updateId', async (req, res) => {
    const { productId, updateId } = ids.parse(req.params);
    await db.update.delete({
      where: { id: updateId!, productId, product: { belongsToId: req.userId } },
    });
    res.sendStatus(204);
  });
  const points = '/products/:productId/updates/:updateId/points';
  router.post(points, async (req, res) => {
    const { productId, updateId } = ids.parse(req.params);
    const input = pointSchema.parse(req.body);
    const data = await db.updatePoint.create({
      data: {
        ...input,
        update: {
          connect: {
            id: updateId!,
            productId,
            product: { belongsToId: req.userId },
          },
        },
      },
    });
    res
      .location(
        `/api/products/${productId}/updates/${updateId}/points/${data.id}`,
      )
      .status(201)
      .json({ data });
  });
  router.get(points, async (req, res) => {
    const { productId, updateId } = ids.parse(req.params);
    found(
      await db.update.findUnique({
        where: {
          id: updateId!,
          productId,
          product: { belongsToId: req.userId },
        },
        select: { id: true },
      }),
    );
    const { limit, after } = pageQuery(req.query);
    const rows = await db.updatePoint.findMany({
      where: {
        updateId,
        update: { productId, product: { belongsToId: req.userId } },
        ...afterWhere(after),
      },
      orderBy: pageOrder,
      take: limit + 1,
    });
    res.json(pageResult(rows, limit));
  });
  router.get(`${points}/:pointId`, async (req, res) => {
    const { productId, updateId, pointId } = ids.parse(req.params);
    res.json({
      data: found(
        await db.updatePoint.findUnique({
          where: {
            id: pointId!,
            updateId,
            update: { productId, product: { belongsToId: req.userId } },
          },
        }),
      ),
    });
  });
  router.patch(`${points}/:pointId`, async (req, res) => {
    const { productId, updateId, pointId } = ids.parse(req.params);
    const data = pointSchema
      .partial()
      .refine(nonEmpty, 'Supply at least one field.')
      .parse(req.body);
    res.json({
      data: await db.updatePoint.update({
        where: {
          id: pointId!,
          updateId,
          update: { productId, product: { belongsToId: req.userId } },
        },
        data,
      }),
    });
  });
  router.delete(`${points}/:pointId`, async (req, res) => {
    const { productId, updateId, pointId } = ids.parse(req.params);
    await db.updatePoint.delete({
      where: {
        id: pointId!,
        updateId,
        update: { productId, product: { belongsToId: req.userId } },
      },
    });
    res.sendStatus(204);
  });
  return router;
}
