import { z } from 'zod';
import { ApiError } from './errors.js';

const querySchema = z.strictObject({
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(50))
    .optional(),
  cursor: z.string().min(1).max(300).optional(),
});
const cursorSchema = z.strictObject({
  createdAt: z.iso.datetime(),
  id: z.uuid(),
});
export function pageQuery(query: unknown) {
  const parsed = querySchema.parse(query);
  let after: { createdAt: Date; id: string } | undefined;
  if (parsed.cursor) {
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(parsed.cursor)) throw new Error();
      const decoded = cursorSchema.parse(
        JSON.parse(Buffer.from(parsed.cursor, 'base64url').toString('utf8')),
      );
      after = { createdAt: new Date(decoded.createdAt), id: decoded.id };
    } catch {
      throw new ApiError(400, 'INVALID_CURSOR', 'Invalid pagination cursor.');
    }
  }
  return { limit: parsed.limit ?? 20, after };
}
export function afterWhere(after?: { createdAt: Date; id: string }) {
  return after
    ? {
        OR: [
          { createdAt: { gt: after.createdAt } },
          { createdAt: after.createdAt, id: { gt: after.id } },
        ],
      }
    : {};
}
export const pageOrder = [
  { createdAt: 'asc' as const },
  { id: 'asc' as const },
];
export function pageResult<T extends { createdAt: Date; id: string }>(
  rows: T[],
  limit: number,
) {
  const data = rows.slice(0, limit);
  const last = data.at(-1);
  const nextCursor =
    rows.length > limit && last
      ? Buffer.from(
          JSON.stringify({
            createdAt: last.createdAt.toISOString(),
            id: last.id,
          }),
        ).toString('base64url')
      : null;
  return { data, page: { nextCursor, limit } };
}
