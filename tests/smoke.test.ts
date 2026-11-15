import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('compiled smoke cannot pass against an unrelated API on the old fixed port', async (t) => {
  let requests = 0;
  let registrations = 0;
  let deleted = false;
  // This stub satisfies the old demo. The real child uses an unavailable database.
  const unrelated = createServer((req, res) => {
    requests++;
    const path = req.url ?? '';
    const visitor = req.headers.authorization === 'Bearer visitor';
    let status = 200;
    let body: unknown = {};
    if (path === '/health') body = { status: 'ok' };
    else if (path === '/user') {
      status = 201;
      body = {
        data: { id: 'synthetic-user' },
        token: ++registrations === 1 ? 'owner' : 'visitor',
      };
    } else if (req.method === 'DELETE') {
      status = 204;
      deleted = true;
    } else if (visitor || deleted) status = 404;
    else if (req.method === 'POST') {
      status = 201;
      body = {
        data: { id: path.endsWith('/products') ? 'product' : 'release' },
      };
    } else if (req.method === 'PATCH')
      body = { data: { id: 'release', status: 'LIVE' } };
    else body = { data: [{ id: 'release' }] };
    req.resume();
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(status === 204 ? undefined : JSON.stringify(body));
  });
  try {
    unrelated.listen(3101, '127.0.0.1');
    await once(unrelated, 'listening');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      t.skip('Port 3101 is owned by another process; leave it untouched.');
      return;
    }
    throw error;
  }
  const child = spawn(process.execPath, ['scripts/smoke.mjs'], {
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://invalid:invalid@127.0.0.1:1/unavailable',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  try {
    const [code] = await once(child, 'exit', {
      signal: AbortSignal.timeout(15000),
    });
    assert.notEqual(code, 0, output);
    assert.equal(requests, 0, 'Smoke must never probe the unrelated listener.');
    assert.doesNotMatch(output, /Demo passed\./);
  } finally {
    if (child.exitCode === null) child.kill('SIGTERM');
    await new Promise<void>((resolve, reject) =>
      unrelated.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
