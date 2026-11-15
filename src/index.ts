import 'dotenv/config';
import { createDb } from './db.js';
import { createApp } from './server.js';
import type { AddressInfo } from 'node:net';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const db = createDb(process.env.DATABASE_URL);

const secret = process.env.JWT_SECRET;
if (!secret || Buffer.byteLength(secret) < 32)
  throw new Error('JWT_SECRET must contain at least 32 bytes.');
const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw new Error(
    'PORT must be between 0 and 65535 (0 selects an available port).',
  );
const host = process.env.HOST ?? '127.0.0.1';

async function main() {
  await db.$connect();
  const server = createApp(db, secret!).listen(port, host, () => {
    const boundPort = (server.address() as AddressInfo).port;
    console.log(`API listening on http://${host}:${boundPort}`);
    process.send?.({ type: 'ready', port: boundPort });
  });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    const timeout = setTimeout(() => process.exit(1), 10_000).unref();
    server.close(() => {
      void db.$disconnect().finally(() => {
        clearTimeout(timeout);
        process.exit(0);
      });
    });
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
main().catch(async () => {
  console.error(
    'Startup failed. Check database connectivity and configuration.',
  );
  await db.$disconnect();
  process.exitCode = 1;
});
