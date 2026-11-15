import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

// Exercise only the local server and newly-created synthetic accounts/resources.
const base = new URL(process.env.API_URL ?? 'http://127.0.0.1:3001');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname))
  throw new Error('Demo requires a local API_URL.');
async function call(method, path, body, token, status = 200) {
  const response = await fetch(new URL(path, base), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(
    response.status,
    status,
    `${method} ${path}: expected ${status}, got ${response.status}`,
  );
  return status === 204 ? undefined : response.json();
}
const suffix = randomBytes(6).toString('hex');
const password = randomBytes(24).toString('hex');
const owner = await call(
  'POST',
  '/user',
  { username: `demo_owner_${suffix}`, password },
  undefined,
  201,
);
const visitor = await call(
  'POST',
  '/user',
  { username: `demo_other_${suffix}`, password },
  undefined,
  201,
);
console.log(
  'PASS two synthetic accounts registered (tokens/passwords omitted)',
);
let productPath;
try {
  const product = await call(
    'POST',
    '/api/products',
    { name: 'Synthetic dispatch planner' },
    owner.token,
    201,
  );
  productPath = `/api/products/${product.data.id}`;
  const release = await call(
    'POST',
    `${productPath}/updates`,
    {
      title: 'Explain route alternatives',
      body: 'Show sample weather impacts.',
      asset: 'https://example.com/synthetic-release',
      version: '1.0.0',
    },
    owner.token,
    201,
  );
  const releasePath = `${productPath}/updates/${release.data.id}`;
  await call(
    'POST',
    `${releasePath}/points`,
    {
      name: 'Checkpoint details',
      description: 'Explain each synthetic checkpoint.',
    },
    owner.token,
    201,
  );
  console.log('PASS product, release and note persisted');
  await call('GET', releasePath, undefined, visitor.token, 404);
  await call('PATCH', releasePath, { status: 'LIVE' }, visitor.token, 404);
  console.log('PASS second account cannot read or modify the release');
  const published = await call(
    'PATCH',
    releasePath,
    { status: 'LIVE' },
    owner.token,
  );
  assert.equal(published.data.status, 'LIVE');
  const list = await call(
    'GET',
    `${productPath}/updates?limit=1`,
    undefined,
    owner.token,
  );
  assert.equal(list.data[0].id, release.data.id);
  console.log('PASS owner publishes and retrieves the paginated release');
} finally {
  if (productPath) {
    await call('DELETE', productPath, undefined, owner.token, 204);
    await call('GET', productPath, undefined, owner.token, 404);
    console.log('PASS synthetic product removed with its releases and notes');
  }
}
console.log(
  'Demo passed. Two synthetic accounts remain in your local database; no real accounts or providers were used.',
);
