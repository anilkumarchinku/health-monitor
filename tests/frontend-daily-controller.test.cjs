const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function moduleAt(path, dependencies = {}, extra = {}) {
  const context = { exports: {}, URL, URLSearchParams, Date, Intl, Error, ...extra, require: name => dependencies[name] ?? {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports;
}
function controller({ incomplete = false, loadError = false, date = '2026-10-02', offline = false } = {}) {
  let local = { date, profile: { name: 'Test', timezone: 'UTC' }, water: 500, onboardingCompleted: !incomplete };
  let status = 'idle'; let writes = 0;
  const state = [];
  const react = { useState(initial) { const index = state.length; state.push(initial); return [initial, value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; }, useRef: value => ({ current: value }), useCallback: fn => fn, useEffect() {} };
  const location = { pathname: '/meals', search: '?meal=dinner', hash: '', href: '' };
  const sync = {
    isSupabaseConfigured: () => true, getLocalDateForState: () => '2026-10-02', getSyncStatus: () => status,
    readLocalState: () => local,
    hydrateHealthState: async () => { if (loadError) throw new Error('Account load failed'); return local; },
    saveHealthStateWithHistory: async next => { writes++; local = { ...next, syncPending: offline }; status = offline ? 'failed' : 'saved'; return !offline; },
  };
  const api = moduleAt('components/use-daily-health.ts', {
    react, '@/lib/auth': { requireSignedInUser: async () => ({ id: 'user-a' }) },
    '@/lib/health-sync': sync,
    '@/lib/daily-health': moduleAt('lib/daily-health.ts'), '@/lib/return-path': moduleAt('lib/return-path.ts'),
  }, { window: { location }, localStorage: { getItem: () => 'user-a' } }).useDailyHealth();
  return { api, state, location, get writes() { return writes; }, get local() { return local; }, conflict() { status = 'conflict'; } };
}

test('daily controller carries the intended meal through required onboarding', async () => {
  const h = controller({ incomplete: true }); await h.api.reload();
  assert.equal(h.location.href, '/onboarding?next=%2Fmeals%3Fmeal%3Ddinner');
  assert.equal(h.writes, 0);
});
test('daily controller surfaces a failed load without redirecting to onboarding', async () => {
  const h = controller({ loadError: true }); await h.api.reload();
  assert.equal(h.state[1], 'Account load failed'); assert.equal(h.location.href, '');
});
test('daily controller rejects a stale day before any save', async () => {
  const h = controller({ date: '2026-10-01' }); await h.api.reload();
  assert.equal(await h.api.update({ water: 700 }), false); assert.equal(h.writes, 0);
  assert.match(h.state[1], /new day/);
});
test('daily controller preserves all other daily fields and pending cloud state on a local save', async () => {
  const h = controller({ offline: true }); await h.api.reload();
  assert.equal(await h.api.update({ water: 700 }), true);
  assert.equal(h.state[0].water, 700); assert.equal(h.state[0].syncPending, true);
  assert.equal(h.state[0].profile.name, 'Test'); assert.equal(h.state[0].meals.length, 3);
});
test('daily controller blocks editing during a cloud conflict', async () => {
  const h = controller(); await h.api.reload(); h.conflict();
  assert.equal(await h.api.update({ water: 700 }), false); assert.equal(h.writes, 0);
});
test('daily controller permits only one concurrent save', async () => {
  const h = controller(); await h.api.reload();
  const first = h.api.update({ water: 700 }); const duplicate = h.api.update({ water: 900 });
  assert.equal(await first, true); assert.equal(await duplicate, false);
  assert.equal(h.writes, 1); assert.equal(h.local.water, 700);
});
