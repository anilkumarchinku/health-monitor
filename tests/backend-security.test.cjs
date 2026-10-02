const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const crypto = require('node:crypto');
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, require: (id) => id in mocks ? mocks[id] : require(id), Buffer, URL, Date, Intl, Set, process, console });
  return exports;
}
function subscription(endpoint = 'https://fcm.googleapis.com/fcm/send/token') {
  const ecdh = crypto.createECDH('prime256v1');
  return { endpoint, keys: { p256dh: ecdh.generateKeys().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } };
}
test('push allows known providers and rejects arbitrary hosts, credentials, ports and bad keys before sending', async () => {
  const sends = [];
  const helper = load('lib/push-server.ts', { 'web-push': { sendNotification: (...args) => { sends.push(args); return Promise.resolve({}); } } });
  for (const endpoint of ['https://fcm.googleapis.com/fcm/send/x', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/Q/x', 'https://wns2-par02p.notify.windows.com/w/?token=x']) {
    await helper.sendSafePushNotification(subscription(endpoint), '{}');
  }
  assert.equal(sends.length, 4);
  assert.equal(sends[0][2].timeout, 10000);
  for (const endpoint of ['https://127.0.0.1/x', 'https://example.com/x', 'https://fcm.googleapis.com.evil.test/x', 'https://fcm.googleapis.com:8443/x', 'https://user:pass@fcm.googleapis.com/x', 'http://fcm.googleapis.com/x']) {
    assert.throws(() => helper.sendSafePushNotification(subscription(endpoint), '{}'));
  }
  const invalid = subscription(); invalid.keys.auth = 'x';
  assert.throws(() => helper.sendSafePushNotification(invalid, '{}'));
  assert.equal(sends.length, 4);
});
test('shared limiter fails closed when durable counter is unavailable', async () => {
  const { consumeRateLimit } = load('lib/server-rate-limit.ts');
  assert.equal(await consumeRateLimit({ rpc: async () => ({ data: false }) }, 'x', 1, 60), false);
  await assert.rejects(consumeRateLimit({ rpc: async () => ({ error: { message: 'missing' } }) }, 'x', 1, 60));
});
function snapshotHandler() {
  let current = null;
  const db = { from: () => ({
    insert: async (row) => { if (current) return { error: { code: '23505' } }; current = row; return {}; },
    update: (row) => {
      const filters = {};
      const query = { eq: (k, v) => { filters[k] = v; return query; }, select: async () => {
        if (!current || Object.entries(filters).some(([k, v]) => current[k] !== v)) return { data: [] };
        current = row; return { data: [{ updated_at: row.updated_at }] };
      } }; return query;
    }
  }) };
  const auth = { auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) } };
  const mod = load('app/api/sync/snapshot/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => ({ status: init?.status ?? 200, body }) } },
    '@supabase/supabase-js': { createClient: (_url, key) => key === 'service' ? db : auth },
    '@/lib/server-rate-limit': { consumeRateLimit: async () => true },
    '@/lib/meal-images': { stripEmbeddedMealImages: (x) => x, mealImagePrefix: 'meal-image:', mealImagePath: (x) => x.startsWith('meal-image:') ? x.slice(11) : null },
  });
  return { post: (data) => mod.POST(new Request('http://localhost/api/sync/snapshot', { method: 'POST', headers: { authorization: 'Bearer test' }, body: JSON.stringify(data) })), row: () => current };
}
const baseSnapshot = { date: '2026-10-02', profile: { timezone: 'Asia/Kolkata' }, sleep: {}, meals: [], water: 0, expectedUpdatedAt: null };
test('snapshot requires version, validates dates/shape and derives owner and server timestamp', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'; process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'publishable'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  const h = snapshotHandler();
  assert.equal((await h.post({ ...baseSnapshot, expectedUpdatedAt: undefined })).status, 400);
  assert.equal((await h.post({ ...baseSnapshot, date: '2026-02-30' })).status, 400);
  assert.equal((await h.post({ ...baseSnapshot, water: -1 })).status, 400);
  assert.equal((await h.post({ ...baseSnapshot, profile: [] })).status, 400);
  const saved = await h.post({ ...baseSnapshot, userId: 'attacker', updatedAt: '2099-01-01T00:00:00Z' });
  assert.equal(saved.status, 200); assert.equal(h.row().user_id, 'owner'); assert.notEqual(saved.body.updatedAt, '2099-01-01T00:00:00Z');
});
test('snapshot CAS prevents stale saves and simultaneous initial inserts from replacing data', async () => {
  const h = snapshotHandler();
  const first = await h.post(baseSnapshot);
  assert.equal((await h.post({ ...baseSnapshot, water: 999 })).status, 409);
  const version = first.body.updatedAt;
  const [a, b] = await Promise.all([h.post({ ...baseSnapshot, expectedUpdatedAt: version, water: 100 }), h.post({ ...baseSnapshot, expectedUpdatedAt: version, water: 200 })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal(h.row().water, 100);
});
test('subscription collision only updates the authenticated owner, never reassigns another user', async () => {
  let updatePayload; const filters = {};
  const db = { from: () => ({ insert: async () => ({ error: { code: '23505' } }), update: (row) => {
    updatePayload = row;
    const q = { eq: (k, v) => { filters[k] = v; return q; }, select: async () => ({ data: [] }) }; return q;
  } }) };
  const validator = load('lib/push-server.ts');
  const route = load('app/api/push/subscribe/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => ({ status: init?.status ?? 200, body }) } },
    '@supabase/supabase-js': { createClient: (_u, key) => key === 'service' ? db : { auth: { getUser: async () => ({ data: { user: { id: 'caller' } } }) } } },
    '@/lib/server-rate-limit': { consumeRateLimit: async () => true },
    '@/lib/push-server': validator,
  });
  const sub = subscription();
  const response = await route.POST(new Request('http://localhost', { method: 'POST', headers: { authorization: 'Bearer test' }, body: JSON.stringify({ endpoint: sub.endpoint, subscription: sub }) }));
  assert.equal(response.status, 409);
  assert.equal(filters.user_id, 'caller');
  assert.equal(filters.endpoint, sub.endpoint);
  assert.equal(updatePayload.user_id, undefined);
});
test('meal upload rejects an account switch before creating an object', async () => {
  let uploads = 0;
  const mod = load('lib/meal-images.ts', { '@/lib/supabase/client': { createSupabaseBrowserClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'new-owner' } } }) },
    storage: { from: () => ({ upload: async () => { uploads++; return {}; } }) },
  }) } });
  await assert.rejects(mod.uploadMealImage({}, '2026-10-02', 'lunch', 'original-owner'), /Account changed/);
  assert.equal(uploads, 0);
});
