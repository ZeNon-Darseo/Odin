// Checks the Netlify adapter without Netlify: Blob DB semantics plus end-to-end
// routing through the same application handler used by netlify/functions/app.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlobDb, ensureSeeded } from '../netlify/lib/blob-db.mjs';
import { createAppHandler } from '../netlify/lib/app-handler.mjs';
import { buildSeed } from './seed.mjs';
import { loadSeed, applyPasswordOverrides } from '../netlify/lib/seed-with-env.mjs';

function memoryStore() {
  const data = new Map();
  return {
    async get(key) { return data.has(key) ? data.get(key) : null; },
    async set(key, value) { data.set(key, value); },
  };
}

async function harness() {
  const store = memoryStore();
  await ensureSeeded(store, buildSeed);
  const db = createBlobDb(store);
  const handler = createAppHandler({ db, origin: 'https://aura-test.netlify.app' });
  return { store, db, handler };
}

const call = async (handler, path, { method = 'GET', body, cookie, origin = 'https://aura-test.netlify.app' } = {}) => {
  const headers = { origin };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  const request = new Request(`https://aura-test.netlify.app/functions/v1/app${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const response = await handler(request);
  let data = null;
  try { data = await response.json(); } catch { /* empty body */ }
  return { status: response.status, data, cookie: response.headers.get('set-cookie') };
};

test('blob db seeds and supports filtered writes', async () => {
  const store = memoryStore();
  await ensureSeeded(store, buildSeed);
  const db = createBlobDb(store);

  const users = (await db.from('users').select('id,email,role').eq('role', 'client').limit(10)).data;
  assert.equal(users.length, 3);

  const duplicate = (await db.from('users').insertIfAbsent({
    id: 'test-id', email: 'anna.smirnova@example.com', name: 'Дубль', phone: '+7 700 000-00-00',
    password_salt: 'x', password_hash: 'y', password_iterations: 1, role: 'client', created_at: new Date().toISOString(),
  }, { onConflict: 'email' }).select('id')).data;
  assert.deepEqual(duplicate, []);

  const limiter = await db.from('auth_limiter').insert({ key: 'login:a', window_started_at: 't0', attempt_count: 1 }).select('key');
  assert.equal(limiter.data.length, 1);
  const bumped = await db.from('auth_limiter').update({ attempt_count: 2 }).eq('key', 'login:a').eq('attempt_count', 1).select('key');
  assert.equal(bumped.data.length, 1);
  const stale = await db.from('auth_limiter').update({ attempt_count: 9 }).eq('key', 'login:a').eq('attempt_count', 1).select('key');
  assert.equal(stale.data.length, 0);

  await db.from('auth_limiter').delete().eq('key', 'login:a').select('key');
  const gone = await db.from('auth_limiter').select('key').eq('key', 'login:a');
  assert.equal(gone.data.length, 0);
});

test('netlify handler routes health and rejects foreign origins', async () => {
  const { handler } = await harness();
  const health = await call(handler, '/api/health');
  assert.equal(health.status, 200);
  assert.deepEqual(health.data, { ok: true });

  const blocked = await call(handler, '/api/login', {
    method: 'POST', origin: 'https://evil.example',
    body: { email: 'anna.smirnova@example.com', password: 'GuestDemo-2026' },
  });
  assert.equal(blocked.status, 403);
});

test('netlify handler logs in and keeps the session cookie', async () => {
  const { handler } = await harness();
  const login = await call(handler, '/api/login', {
    method: 'POST', body: { email: 'anna.smirnova@example.com', password: 'GuestDemo-2026' },
  });
  assert.equal(login.status, 200);
  assert.match(login.cookie, /^__Host-app_auth\.session=/);

  const cookie = login.cookie.split(';')[0];
  const me = await call(handler, '/api/me', { cookie });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.email, 'anna.smirnova@example.com');

  const gallery = await call(handler, '/api/gallery');
  assert.equal(gallery.status, 200);
  assert.ok(Array.isArray(gallery.data));
  assert.ok(gallery.data.length >= 5);
});

test('netlify handler accepts the rewritten function path', async () => {
  const store = memoryStore();
  await ensureSeeded(store, buildSeed);
  const db = createBlobDb(store);
  const handler = createAppHandler({ db, origin: 'https://aura-test.netlify.app' });
  const request = new Request('https://aura-test.netlify.app/.netlify/functions/app/api/services');
  const response = await handler(request);
  assert.equal(response.status, 200);
  const services = await response.json();
  assert.ok(Array.isArray(services));
  assert.ok(services.length >= 9);
});

test('netlify handler persists a booking across calls', async () => {
  const { handler } = await harness();
  const login = await call(handler, '/api/login', {
    method: 'POST', body: { email: 'anna.smirnova@example.com', password: 'GuestDemo-2026' },
  });
  const cookie = login.cookie.split(';')[0];
  const services = await call(handler, '/api/services');
  const service = services.data.find((item) => item.category !== 'party') ?? services.data[0];
  const date = new Date(Date.now() + 5 * 86400000 + 3 * 3600000).toISOString().slice(0, 10);
  const availability = await call(handler, `/api/availability?service_id=${service.id}&date=${date}`);
  const slot = availability.data.slots.find((item) => item.available)?.time;
  assert.ok(slot, 'a free slot exists');

  const created = await call(handler, '/api/bookings', {
    method: 'POST',
    cookie,
    body: {
      service_id: service.id, date, slot,
      participants: [{ name: 'Аня', age: 6 }, { name: 'Тимур', age: 7 }],
      payment_method: 'cash', name: 'Анна Смирнова', phone: '+7 916 204-11-87', comment: 'Тест Netlify',
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.payment_method, 'cash');
  assert.equal(created.data.participants.length, 2);

  const list = await call(handler, '/api/bookings', { cookie });
  const saved = list.data.find((item) => item.id === created.data.id);
  assert.ok(saved);
  assert.equal(saved.payment_method, 'cash');
  assert.equal(saved.participants.length, 2);
});

test('owner password can be set through the environment', async () => {
  delete process.env.AURA_OWNER_PASSWORD;
  const store = memoryStore();
  await ensureSeeded(store, loadSeed);
  const db = createBlobDb(store);

  process.env.AURA_OWNER_PASSWORD = 'Owner-Published-2026';
  try {
    await applyPasswordOverrides(store, db);
    const handler = createAppHandler({ db, origin: 'https://aura-test.netlify.app' });
    const login = await call(handler, '/api/login', {
      method: 'POST', body: { email: 'owner@aura-kids.kz', password: 'Owner-Published-2026' },
    });
    assert.equal(login.status, 200);
    assert.equal(login.data.user.role, 'owner');

    const old = await call(handler, '/api/login', {
      method: 'POST', body: { email: 'owner@aura-kids.kz', password: 'Aura-Owner-2026' },
    });
    assert.equal(old.status, 401);
  } finally {
    delete process.env.AURA_OWNER_PASSWORD;
  }
});
