const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
test('admin snapshots bound queries, provide totals and batch only owned image paths', async () => {
  const calls = { order: [] };
  const rows = [{ client_id: 'a', user_id: 'a', date: '2026-10-02', meals: [{ image: 'meal-image:a/p.jpg' }, { image: 'meal-image:b/private.jpg' }] }];
  const q = { select: (_v, options) => { calls.select = options; return q; }, order: (key) => { calls.order.push(key); return q; }, range: async (start, end) => { calls.range = [start, end]; return { data: rows, count: 150 }; } };
  const db = { from: () => q, storage: { from: () => ({ createSignedUrls: async (paths) => { calls.paths = paths; return { data: paths.map((path) => ({ path, signedUrl: `https://example.test/${path}` })) }; } }) } };
  const exports = {};
  const mocks = {
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    '@supabase/supabase-js': { createClient: (_u, key) => key === 'service' ? db : { auth: { getUser: async () => ({ data: { user: { email: 'kanil977690@gmail.com' } } }) } } },
    '@/lib/meal-images': { mealImageBucket: 'meal-images', mealImagePath: (x) => x.startsWith('meal-image:') ? x.slice(11) : null },
  };
  const source = ts.transpileModule(fs.readFileSync('app/api/admin/snapshots/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { exports, require: (id) => mocks[id], URL, Set, Map, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'url', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public', SUPABASE_SERVICE_ROLE_KEY: 'service' } } });
  const result = await exports.GET(new Request('https://app.test/api/admin/snapshots?page=2', { headers: { authorization: 'Bearer token' } }));
  assert.equal(result.status, 200);
  assert.deepEqual(calls.range, [50, 99]);
  assert.deepEqual(calls.order, ['updated_at', 'id']);
  assert.equal(calls.select.count, 'exact');
  assert.deepEqual(Array.from(calls.paths), ['a/p.jpg']);
  assert.equal(result.body.total, 150); assert.equal(result.body.hasMore, true);
  assert.equal(result.body.snapshots[0].meals[1].image, '');
  const invalid = await exports.GET(new Request('https://app.test/api/admin/snapshots?pageSize=101', { headers: { authorization: 'Bearer token' } }));
  assert.equal(invalid.status, 400);
});
