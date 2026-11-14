import 'dotenv/config';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const port = 3101;
const origin = `http://127.0.0.1:${port}`;
// A different random secret on each run; never use an actual account credential.
const server = spawn(process.execPath, ['dist/index.js'], {
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(port),
    JWT_SECRET: randomBytes(32).toString('hex'),
  },
  stdio: 'inherit',
});
const exited = once(server, 'exit');
let ready = false;
try {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (server.exitCode !== null)
      throw new Error('Compiled server exited before becoming ready.');
    try {
      ready = (
        await fetch(`${origin}/health`, { signal: AbortSignal.timeout(500) })
      ).ok;
    } catch {
      /* Startup not ready. */
    }
    if (ready) break;
    await delay(250);
  }
  if (!ready) throw new Error('Compiled server did not become healthy.');
  const demo = spawn(process.execPath, ['scripts/demo.mjs'], {
    env: { ...process.env, API_URL: origin },
    stdio: 'inherit',
  });
  const [code] = await once(demo, 'exit');
  if (code !== 0) throw new Error(`Demo failed with exit code ${code}.`);
} finally {
  server.kill('SIGTERM');
  await exited;
}
