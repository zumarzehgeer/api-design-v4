import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { RequestHandler } from 'express';
import type { PrismaClient } from '../generated/prisma/client.js';
import { z } from 'zod';
import { ApiError } from '../errors.js';

const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
const credentials = z.strictObject({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9_-]+$/),
  password: z.string().min(12).max(128),
});
const issuer = 'api-design-v4';
const audience = 'release-api';
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt);
  return `scrypt$${salt}$${key.toString('hex')}`;
}
export async function comparePassword(password: string, stored: string) {
  const [algorithm, salt, hash] = stored.split('$');
  if (algorithm !== 'scrypt' || !salt || !hash || !/^[a-f0-9]{128}$/.test(hash))
    return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = await derive(password, salt);
  return timingSafeEqual(expected, actual);
}
declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

export function createAuth(db: PrismaClient, secret: string) {
  if (Buffer.byteLength(secret) < 32)
    throw new Error('JWT secret must contain at least 32 bytes.');
  const tokenFor = (id: string) =>
    jwt.sign({}, secret, {
      algorithm: 'HS256',
      subject: id,
      issuer,
      audience,
      expiresIn: '1h',
    });
  const dummyHash = hashPassword(randomBytes(32).toString('hex'));
  const register: RequestHandler = async (req, res) => {
    const input = credentials.parse(req.body);
    const user = await db.user.create({
      data: {
        username: input.username,
        password: await hashPassword(input.password),
      },
      select: { id: true, username: true },
    });
    res
      .status(201)
      .json({ data: user, token: tokenFor(user.id), expiresIn: 3600 });
  };
  const signIn: RequestHandler = async (req, res) => {
    const input = credentials.parse(req.body);
    const user = await db.user.findUnique({
      where: { username: input.username },
    });
    const matches = await comparePassword(
      input.password,
      user?.password ?? (await dummyHash),
    );
    if (!user || !matches)
      throw new ApiError(
        401,
        'INVALID_CREDENTIALS',
        'Invalid username or password.',
      );
    res.json({
      data: { id: user.id, username: user.username },
      token: tokenFor(user.id),
      expiresIn: 3600,
    });
  };
  const protect: RequestHandler = async (req, _res, next) => {
    const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization ?? '');
    if (!match)
      throw new ApiError(
        401,
        'UNAUTHORIZED',
        'A valid bearer token is required.',
      );
    let id: string;
    try {
      const payload = jwt.verify(match[1], secret, {
        algorithms: ['HS256'],
        issuer,
        audience,
      });
      if (
        typeof payload === 'string' ||
        !payload.sub ||
        !z.uuid().safeParse(payload.sub).success ||
        !payload.exp
      )
        throw new Error('Invalid subject or expiry');
      id = payload.sub;
    } catch {
      throw new ApiError(
        401,
        'UNAUTHORIZED',
        'A valid bearer token is required.',
      );
    }
    if (!(await db.user.findUnique({ where: { id }, select: { id: true } })))
      throw new ApiError(
        401,
        'UNAUTHORIZED',
        'A valid bearer token is required.',
      );
    req.userId = id;
    next();
  };
  return { register, signIn, protect };
}
