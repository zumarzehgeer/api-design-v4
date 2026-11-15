import 'dotenv/config';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/server.js';
import { createDb } from '../src/db.js';

// Each run creates its own schema, applies the real migrations and removes only that schema.
// Never truncate an existing table or reset the caller's database.
const baseUrl = process.env.TEST_DATABASE_URL;
if (!baseUrl)
  throw new Error(
    'Set TEST_DATABASE_URL to a local disposable PostgreSQL database.',
  );
const url = new URL(baseUrl);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
  throw new Error('Integration tests require a loopback PostgreSQL host.');
const schema = `test_${randomUUID().replaceAll('-', '')}`;
url.searchParams.set('schema', schema);
const connectionString = url.toString();
const admin = new Client({ connectionString: baseUrl });
const db = createDb(connectionString);
const secret = 'integration-only-secret-with-at-least-32-bytes';
const app = createApp(db, secret);
const api = request(app);
const password = 'synthetic-password-2026';
let sequence = 0;
let schemaCreated = false;
const release = {
  title: 'Route explanations',
  body: 'Explain synthetic weather route choices.',
  asset: 'https://example.com/release',
  version: '1.0.0',
};
const point = {
  name: 'Weather details',
  description: 'Show checkpoint conditions.',
};
async function account() {
  const username = `reviewer_${++sequence}`;
  const r = await api.post('/user').send({ username, password }).expect(201);
  return { ...r.body.data, token: r.body.token, username } as {
    id: string;
    username: string;
    token: string;
  };
}
function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}
async function fixture() {
  const owner = await account();
  const p = await api
    .post('/api/products')
    .set(auth(owner.token))
    .send({ name: 'Demo product' })
    .expect(201);
  const path = `/api/products/${p.body.data.id}`;
  const u = await api
    .post(`${path}/updates`)
    .set(auth(owner.token))
    .send(release)
    .expect(201);
  const updatePath = `${path}/updates/${u.body.data.id}`;
  const n = await api
    .post(`${updatePath}/points`)
    .set(auth(owner.token))
    .send(point)
    .expect(201);
  return {
    owner,
    product: p.body.data,
    update: u.body.data,
    point: n.body.data,
    path,
    updatePath,
    pointPath: `${updatePath}/points/${n.body.data.id}`,
  };
}
before(async () => {
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  execFileSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    { env: { ...process.env, DATABASE_URL: connectionString }, stdio: 'pipe' },
  );
  await db.$connect();
});
after(async () => {
  await db.$disconnect();
  if (schemaCreated) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
  await admin.end();
});

test('registration awaits persistence, stores a salted hash and never returns it', async () => {
  const user = await account();
  const stored = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.notEqual(stored.password, password);
  assert.match(stored.password, /^scrypt\$/);
  const r = await api
    .post('/signin')
    .send({ username: user.username.toUpperCase(), password })
    .expect(200);
  assert.deepEqual(Object.keys(r.body.data).sort(), ['id', 'username']);
  const token = jwt.verify(r.body.token, secret, {
    algorithms: ['HS256'],
    issuer: 'api-design-v4',
    audience: 'release-api',
  });
  assert.equal(typeof token, 'object');
  if (typeof token !== 'string') {
    assert.equal(token.sub, user.id);
    assert.equal(token.exp! - token.iat!, 3600);
  }
});
test('duplicate usernames conflict, including concurrent registrations', async () => {
  const username = `concurrent_${++sequence}`;
  const results = await Promise.all(
    [1, 2].map(() => api.post('/user').send({ username, password })),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(
    results.find((r) => r.status === 409)!.body.error.code,
    'CONFLICT',
  );
});
test('invalid and unknown credentials return the same error', async () => {
  const user = await account();
  const a = await api
    .post('/signin')
    .send({ username: user.username, password: 'wrong-password-2026' })
    .expect(401);
  const b = await api
    .post('/signin')
    .send({ username: 'unknown_reviewer', password })
    .expect(401);
  assert.deepEqual(a.body, b.body);
});
test('rejects missing, malformed, expired, tampered and wrong-audience tokens', async () => {
  const user = await account();
  const options = {
    subject: user.id,
    issuer: 'api-design-v4',
    audience: 'release-api',
  };
  const invalid = [
    '',
    'Basic abc',
    `Bearer ${user.token} altered`,
    `Bearer ${user.token.slice(0, -8)}abcdefgh`,
    `Bearer ${jwt.sign({}, secret, { ...options, expiresIn: -1 })}`,
    `Bearer ${jwt.sign({}, secret, { ...options, audience: 'other', expiresIn: 3600 })}`,
    `Bearer ${jwt.sign({}, secret, { ...options, subject: randomUUID(), expiresIn: 3600 })}`,
  ];
  for (const header of invalid) {
    const r = await api
      .get('/api/products')
      .set('Authorization', header)
      .expect(401);
    assert.equal(r.body.error.code, 'UNAUTHORIZED');
  }
});
test('complete owner workflow persists product, release and notes, with updates and deletion', async () => {
  const f = await fixture();
  const headers = auth(f.owner.token);
  await api
    .patch(f.path)
    .set(headers)
    .send({ name: 'Renamed product' })
    .expect(200);
  const before = new Date(f.update.updatedAt).getTime();
  const r = await api
    .patch(f.updatePath)
    .set(headers)
    .send({ status: 'LIVE', title: 'Published release' })
    .expect(200);
  assert.ok(new Date(r.body.data.updatedAt).getTime() >= before);
  assert.equal(r.body.data.status, 'LIVE');
  await api
    .patch(f.pointPath)
    .set(headers)
    .send({ description: 'Updated explanation' })
    .expect(200);
  assert.equal(
    (await api.get(f.pointPath).set(headers).expect(200)).body.data.description,
    'Updated explanation',
  );
  assert.equal(
    (await api.get(f.path).set(headers).expect(200)).body.data.name,
    'Renamed product',
  );
  assert.equal(
    (await api.get(f.updatePath).set(headers).expect(200)).body.data.title,
    'Published release',
  );
  await api.delete(f.pointPath).set(headers).expect(204);
  await api.get(f.pointPath).set(headers).expect(404);
  await api.delete(f.updatePath).set(headers).expect(204);
  await api.get(f.updatePath).set(headers).expect(404);
  await api.delete(f.path).set(headers).expect(204);
  await api.get(f.path).set(headers).expect(404);
});
test('another account cannot read, edit, delete or add children to owned resources', async () => {
  const f = await fixture();
  const other = await account();
  const headers = auth(other.token);
  for (const path of [
    f.path,
    f.updatePath,
    f.pointPath,
    `${f.path}/updates`,
    `${f.updatePath}/points`,
  ])
    await api.get(path).set(headers).expect(404);
  await api.patch(f.path).set(headers).send({ name: 'Stolen' }).expect(404);
  await api
    .patch(f.updatePath)
    .set(headers)
    .send({ title: 'Stolen' })
    .expect(404);
  await api
    .patch(f.pointPath)
    .set(headers)
    .send({ name: 'Stolen' })
    .expect(404);
  for (const path of [f.path, f.updatePath, f.pointPath])
    await api.delete(path).set(headers).expect(404);
  await api.post(`${f.path}/updates`).set(headers).send(release).expect(404);
  await api.post(`${f.updatePath}/points`).set(headers).send(point).expect(404);
  assert.deepEqual(
    (await api.get('/api/products').set(headers).expect(200)).body.data,
    [],
  );
  assert.equal(
    (await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).name,
    'Demo product',
  );
});
test('nested IDs must belong to the exact URL parent even for the same owner', async () => {
  const f = await fixture();
  const headers = auth(f.owner.token);
  const p = await api
    .post('/api/products')
    .set(headers)
    .send({ name: 'Other product' })
    .expect(201);
  const wrong = `/api/products/${p.body.data.id}/updates/${f.update.id}`;
  await api.get(wrong).set(headers).expect(404);
  await api
    .patch(wrong)
    .set(headers)
    .send({ title: 'Wrong parent' })
    .expect(404);
  await api.delete(wrong).set(headers).expect(404);
  await api.post(`${wrong}/points`).set(headers).send(point).expect(404);
  await api.get(`${wrong}/points/${f.point.id}`).set(headers).expect(404);
  await api
    .patch(`${wrong}/points/${f.point.id}`)
    .set(headers)
    .send({ name: 'Wrong' })
    .expect(404);
  await api.delete(`${wrong}/points/${f.point.id}`).set(headers).expect(404);
});
test('product deletion cascades atomically to releases and notes', async () => {
  const f = await fixture();
  await api.delete(f.path).set(auth(f.owner.token)).expect(204);
  assert.equal(
    await db.update.findUnique({ where: { id: f.update.id } }),
    null,
  );
  assert.equal(
    await db.updatePoint.findUnique({ where: { id: f.point.id } }),
    null,
  );
});
test('release deletion cascades notes and preserves its parent product', async () => {
  const f = await fixture();
  await api.delete(f.updatePath).set(auth(f.owner.token)).expect(204);
  assert.equal(
    await db.updatePoint.findUnique({ where: { id: f.point.id } }),
    null,
  );
  assert.ok(await db.product.findUnique({ where: { id: f.product.id } }));
});
test('keyset pagination handles tied timestamps and a deleted cursor row', async () => {
  const owner = await account();
  const rows = Array.from({ length: 5 }, (_, i) => ({
    id: randomUUID(),
    name: `Product ${i}`,
    belongsToId: owner.id,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  }));
  await db.product.createMany({ data: rows });
  const first = await api
    .get('/api/products?limit=2')
    .set(auth(owner.token))
    .expect(200);
  assert.equal(first.body.data.length, 2);
  const firstIds = first.body.data.map((p: { id: string }) => p.id);
  await db.product.delete({ where: { id: firstIds[1] } });
  const second = await api
    .get('/api/products')
    .query({ limit: 2, cursor: first.body.page.nextCursor })
    .set(auth(owner.token))
    .expect(200);
  const third = await api
    .get('/api/products')
    .query({ limit: 2, cursor: second.body.page.nextCursor })
    .set(auth(owner.token))
    .expect(200);
  const seen = [
    ...firstIds,
    ...second.body.data.map((p: { id: string }) => p.id),
    ...third.body.data.map((p: { id: string }) => p.id),
  ];
  assert.deepEqual(seen, rows.map((r) => r.id).sort());
  assert.equal(third.body.page.nextCursor, null);
});
test('release and note collections are paginated under their owner scope', async () => {
  const f = await fixture();
  const headers = auth(f.owner.token);
  await api
    .post(`${f.path}/updates`)
    .set(headers)
    .send({ ...release, title: 'Second' })
    .expect(201);
  await api
    .post(`${f.updatePath}/points`)
    .set(headers)
    .send({ ...point, name: 'Second' })
    .expect(201);
  for (const path of [`${f.path}/updates`, `${f.updatePath}/points`]) {
    const r = await api.get(path).query({ limit: 1 }).set(headers).expect(200);
    const next = await api
      .get(path)
      .query({ limit: 1, cursor: r.body.page.nextCursor })
      .set(headers)
      .expect(200);
    assert.notEqual(r.body.data[0].id, next.body.data[0].id);
    assert.equal(next.body.page.nextCursor, null);
  }
});
test('strict validation prevents mass assignment and invalid domain data', async () => {
  const f = await fixture();
  const headers = auth(f.owner.token);
  for (const body of [
    { name: '' },
    { name: 'x', belongsToId: randomUUID() },
    { name: 'x'.repeat(121) },
    null,
  ])
    await api.post('/api/products').set(headers).send(body).expect(400);
  for (const body of [
    { ...release, status: 'INVALID' },
    { ...release, asset: 'javascript:alert(1)' },
    { ...release, productId: randomUUID() },
  ])
    await api.post(`${f.path}/updates`).set(headers).send(body).expect(400);
  await api.patch(f.updatePath).set(headers).send({}).expect(400);
  await api
    .patch(f.pointPath)
    .set(headers)
    .send({ updateId: randomUUID() })
    .expect(400);
  await api.get('/api/products/not-a-uuid').set(headers).expect(400);
});
test('pagination rejects malformed cursors, duplicate and out-of-range limits', async () => {
  const owner = await account();
  const headers = auth(owner.token);
  for (const query of [
    'limit=0',
    'limit=51',
    'limit=1.2',
    'limit=1&limit=2',
    'cursor=not_json',
    'unexpected=x',
  ])
    await api.get(`/api/products?${query}`).set(headers).expect(400);
});
test('JSON syntax, payload size and unknown routes produce consistent errors', async () => {
  const invalid = await api
    .post('/user')
    .set('Content-Type', 'application/json')
    .send('{')
    .expect(400);
  assert.equal(invalid.body.error.code, 'INVALID_JSON');
  const large = await api
    .post('/user')
    .send({ username: 'x'.repeat(34_000), password })
    .expect(413);
  assert.equal(large.body.error.code, 'BODY_TOO_LARGE');
  const missing = await api.get('/missing').expect(404);
  assert.equal(missing.body.error.code, 'NOT_FOUND');
  await api.get('/health').expect(200, { status: 'ok' });
});
test('credential constraints reject short passwords, extra fields and invalid usernames', async () => {
  for (const body of [
    { username: 'valid', password: 'short' },
    { username: 'bad space', password },
    { username: 'valid', password, admin: true },
  ])
    await api.post('/user').send(body).expect(400);
});
test('authentication limiter returns the documented JSON error', async () => {
  const limited = request(createApp(db, secret));
  for (let i = 0; i < 30; i++)
    await limited.post('/signin').send({}).expect(400);
  const r = await limited.post('/signin').send({}).expect(429);
  assert.equal(r.body.error.code, 'RATE_LIMITED');
});
test('additive migration preserves existing course-schema data', async () => {
  const upgradeSchema = `${schema}_upgrade`;
  await admin.query('BEGIN');
  try {
    await admin.query(`CREATE SCHEMA "${upgradeSchema}"`);
    await admin.query(`SET LOCAL search_path TO "${upgradeSchema}"`);
    await admin.query(
      await readFile(
        'prisma/migrations/20241001120525_init/migration.sql',
        'utf8',
      ),
    );
    const userId = randomUUID();
    const productId = randomUUID();
    const updateId = randomUUID();
    await admin.query(
      'INSERT INTO "User" (id, username, password) VALUES ($1, $2, $3)',
      [userId, 'migration_fixture', 'synthetic_legacy_hash'],
    );
    await admin.query(
      'INSERT INTO "Product" (id, name, "belongsToId") VALUES ($1, $2, $3)',
      [productId, 'Preserved product', userId],
    );
    await admin.query(
      'INSERT INTO "Update" (id, title, body, asset, "productId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [
        updateId,
        'Preserved release',
        'Sample body',
        'https://example.com',
        productId,
      ],
    );
    await admin.query(
      await readFile(
        'prisma/migrations/20261114130000_release_workflow/migration.sql',
        'utf8',
      ),
    );
    const r = await admin.query('SELECT title FROM "Update" WHERE id = $1', [
      updateId,
    ]);
    assert.equal(r.rows[0].title, 'Preserved release');
    assert.equal(
      (await admin.query('SELECT password FROM "User" WHERE id = $1', [userId]))
        .rows[0].password,
      'synthetic_legacy_hash',
    );
  } finally {
    await admin.query('ROLLBACK');
  }
});
