import 'dotenv/config';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';

// Only this child can announce the ephemeral port it successfully bound.
const server = spawn(process.execPath, ['dist/index.js'], {
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: '0',
    JWT_SECRET: randomBytes(32).toString('hex'),
  },
  stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
});
const exited = once(server, 'exit');
const prematureExit = exited.then(([code, signal]) => {
  throw new Error(`Compiled server exited unexpectedly (${code ?? signal}).`);
});
let timeout;
let demo;
try {
  const [message] = await Promise.race([
    once(server, 'message'),
    prematureExit,
    new Promise((_, reject) => {
      timeout = setTimeout(
        () => reject(new Error('Compiled server did not announce readiness.')),
        10000,
      );
    }),
  ]);
  clearTimeout(timeout);
  if (
    message?.type !== 'ready' ||
    !Number.isInteger(message.port) ||
    message.port < 1 ||
    message.port > 65535
  ) {
    throw new Error('Invalid readiness message from compiled server.');
  }
  const origin = `http://127.0.0.1:${message.port}`;
  const health = await Promise.race([
    fetch(`${origin}/health`, { signal: AbortSignal.timeout(5000) }),
    prematureExit,
  ]);
  if (!health.ok) throw new Error('Compiled server health check failed.');
  demo = spawn(process.execPath, ['scripts/demo.mjs'], {
    env: { ...process.env, API_URL: origin },
    stdio: 'inherit',
  });
  const [code] = await Promise.race([once(demo, 'exit'), prematureExit]);
  if (code !== 0) throw new Error(`Demo failed with exit code ${code}.`);
} finally {
  clearTimeout(timeout);
  if (demo && demo.exitCode === null) demo.kill('SIGTERM');
  if (server.exitCode === null && server.signalCode === null)
    server.kill('SIGTERM');
  await exited;
}
