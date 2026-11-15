import { PrismaClient } from './generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

export function createDb(connectionString: string) {
  const schema =
    new URL(connectionString).searchParams.get('schema') ?? 'public';
  return new PrismaClient({
    adapter: new PrismaPg(
      {
        connectionString,
        max: 10,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 10000,
      },
      { schema },
    ),
  });
}
