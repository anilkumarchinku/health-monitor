const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function harness({ remote = null, remoteError = null, responses = [], switchUserDuringAuth = false, onUpload = null } = {}) {
  const store = new Map([['daily-health-current-user', 'user-a']]);
  const calls = [];
  let directWrites = 0;
  const query = { select() { return this; }, eq() { return this; }, order() { return this; }, async limit() { return { data: remote ? [remote] : [], error: remoteError }; }, upsert() { directWrites++; throw new Error('Direct writes prohibited'); } };
  const client = { from() { return query; }, auth: { async getUser() { if (switchUserDuringAuth) store.set('daily-health-current-user', 'user-b'); return { data: { user: { id: switchUserDuringAuth ? 'user-b' : 'user-a' } } }; }, async getSession() { return { data: { session: { access_token: 'test' } } }; } } };
  const exports = {};
  const context = { exports, console: { error() {} }, Intl, Date, Event, window: { dispatchEvent() {} }, localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) }, require: name => name.includes('supabase') ? { createSupabaseBrowserClient: () => client, isSupabaseConfigured: () => true } : { stripEmbeddedMealImages: s => s, uploadMealImage: async () => { if (onUpload) await onUpload(); return "stored/path"; } }, fetch: async (_url, options) => { if (_url.startsWith("data:")) return { blob: async () => ({}) }; calls.push(JSON.parse(options.body)); const response = responses.shift() ?? { status: 200, body: { updatedAt: `version-${calls.length}` } }; return { ok: response.status === 200, status: response.status, json: async () => response.body }; } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/health-sync.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { api: exports, store, calls, get directWrites() { return directWrites; } };
}
const profile = { name: 'Test', timezone: 'Asia/Kolkata', waterGoal: 2500, wakeTime: '07:00', breakfastTime: '08:00', lunchTime: '13:00', dinnerTime: '20:00', sleepReminder: '22:00' };

test('morning rolls previous date BEFORE applying new completion and feedback', async () => {
  const { api, store } = harness();
  const today = api.rollHealthStateForward({ date: '2000-01-01', profile, water: 500, sleepCheckCompleted: true, quoteFeedback: 'old' });
  await api.saveHealthStateWithHistory({ ...today, sleepCheckCompleted: true, quoteFeedback: 'liked' });
  const saved = JSON.parse(store.get(api.storageKey));
  assert.equal(saved.sleepCheckCompleted, true); assert.equal(saved.quoteFeedback, 'liked'); assert.equal(saved.water, 0);
});

test('failed API does not fall back to database writes and retains pending local changes', async () => {
  const h = harness({ responses: [{ status: 500, body: { error: 'offline' } }] });
  assert.equal(await h.api.saveHealthStateWithHistory({ profile, water: 700 }), false);
  assert.equal(h.directWrites, 0); assert.equal(JSON.parse(h.store.get(h.api.storageKey)).syncPending, true); assert.equal(h.api.getSyncStatus(), 'failed');
});

test('queued saves use acknowledged server version in order', async () => {
  const h = harness();
  await Promise.all([h.api.saveHealthStateWithHistory({ profile, water: 100 }), h.api.saveHealthStateWithHistory({ profile, water: 200 })]);
  assert.equal(h.calls[0].expectedUpdatedAt, null); assert.equal(h.calls[1].expectedUpdatedAt, 'version-1');
  assert.equal(JSON.parse(h.store.get(h.api.storageKey)).water, 200);
});

test('conflict remains visible and never bypasses API validation', async () => {
  const h = harness({ responses: [{ status: 409, body: { error: 'conflict' } }] });
  assert.equal(await h.api.saveHealthStateWithHistory({ profile, water: 900 }), false);
  assert.equal(h.api.getSyncStatus(), 'conflict'); assert.equal(h.directWrites, 0); assert.equal(JSON.parse(h.store.get(h.api.storageKey)).water, 900);
});

test('hydration with missing local data recovers cloud profile instead of defaults', async () => {
  const h = harness({ remote: { date: '2000-01-01', profile, meals: [], water: 800, user_id: 'user-a', updated_at: 'remote-version', onboarding_completed: true } });
  const hydrated = await h.api.hydrateHealthState('user-a');
  assert.equal(hydrated.profile.name, 'Test'); assert.equal(hydrated.onboardingCompleted, true); assert.equal(h.calls.length, 0);
});

test('hydration fails closed on backend read failure', async () => {
  const h = harness({ remoteError: { message: 'offline' } });
  await assert.rejects(h.api.hydrateHealthState('user-a'), /Could not load/); assert.equal(h.calls.length, 0);
});

test('changing account clears old health cache before hydration', () => {
  const h = harness(); h.store.set(h.api.storageKey, JSON.stringify({ profile: { name: 'private' } })); h.store.set(h.api.historyKey, '[1]');
  h.api.prepareLocalUserSession('user-b'); assert.equal(h.store.has(h.api.storageKey), false); assert.equal(h.store.has(h.api.historyKey), false);
});

test('profile rejects invalid timezone, water target and reminder times', () => {
  const { api } = harness(); assert.equal(api.validateHealthProfile(profile), null);
  assert.match(api.validateHealthProfile({ ...profile, timezone: 'not-a-zone' }), /timezone/);
  for (const waterGoal of [0, NaN, Infinity, 10001]) assert.match(api.validateHealthProfile({ ...profile, waterGoal }), /water goal/);
  assert.match(api.validateHealthProfile({ ...profile, wakeTime: '25:00' }), /time/);
});

test('corrupt local cache does not crash reads', () => {
  const h = harness(); h.store.set(h.api.storageKey, '{bad'); h.store.set(h.api.historyKey, '{bad');
  assert.equal(h.api.readLocalState(), null); assert.equal(h.api.readLocalHistory().length, 0);
});


test('later failed queued write remains pending after prior acknowledgement', async () => {
  const h = harness({ responses: [{ status: 200, body: { updatedAt: 'ack-one' } }, { status: 500, body: {} }] });
  await Promise.all([h.api.saveHealthStateWithHistory({ profile, water: 100 }), h.api.saveHealthStateWithHistory({ profile, water: 200 })]);
  const saved = JSON.parse(h.store.get(h.api.storageKey));
  assert.equal(saved.water, 200); assert.equal(saved.syncPending, true); assert.equal(saved.serverUpdatedAt, 'ack-one');
});

test('unsent changes conflict with a newer cloud version during hydration', async () => {
  const h = harness(); const date = h.api.getLocalDateForState({ profile });
  const remote = { date, profile, meals: [], user_id: 'user-a', updated_at: 'new-version', onboarding_completed: true };
  const other = harness({ remote });
  other.store.set(other.api.storageKey, JSON.stringify({ date, profile, syncPending: true, serverUpdatedAt: 'old-version' }));
  await assert.rejects(other.api.hydrateHealthState('user-a'), /another device/);
  assert.equal(other.api.getSyncStatus(), 'conflict'); assert.equal(other.calls.length, 0);
});


test('an old page cannot save after another tab switches accounts', async () => {
  const h = harness(); h.api.prepareLocalUserSession('user-a');
  h.store.set('daily-health-current-user', 'user-b');
  assert.equal(await h.api.saveHealthStateWithHistory({ profile, water: 500 }), false);
  assert.equal(h.calls.length, 0); assert.equal(h.store.has(h.api.storageKey), false);
});


test('pending previous-day edits sync with original date before hydration rolls forward', async () => {
  const h = harness();
  h.store.set(h.api.storageKey, JSON.stringify({ date: '2000-01-01', profile, water: 850, syncPending: true, serverUpdatedAt: null }));
  const result = await h.api.hydrateHealthState('user-a');
  assert.equal(h.calls[0].date, '2000-01-01'); assert.equal(h.calls[0].water, 850);
  assert.notEqual(result.date, '2000-01-01'); assert.equal(result.water, 0);
  assert.equal(h.api.readLocalHistory()[0].syncPending, false);
});

test('failed previous-day replay keeps dated unsent edits and blocks rollover', async () => {
  const h = harness({ responses: [{ status: 500, body: {} }] });
  h.store.set(h.api.storageKey, JSON.stringify({ date: '2000-01-01', profile, water: 850, syncPending: true, serverUpdatedAt: null }));
  await assert.rejects(h.api.hydrateHealthState('user-a'), /previous day/);
  const pending = h.api.readLocalState(); assert.equal(pending.date, '2000-01-01'); assert.equal(pending.water, 850); assert.equal(pending.syncPending, true);
  await h.api.syncCurrentLocalStateToSupabase(); assert.equal(h.calls[1].date, '2000-01-01'); assert.equal(h.calls[1].water, 850);
});

test('switch during awaited authentication cannot send prior owner data as new account', async () => {
  const h = harness({ switchUserDuringAuth: true });
  assert.equal(await h.api.saveHealthStateWithHistory({ profile, water: 550 }), false);
  assert.equal(h.calls.length, 0);
});


test('embedded image migration cannot overwrite a newer local edit during upload', async () => {
  let releaseUpload; let enteredUpload;
  const entered = new Promise(resolve => { enteredUpload = resolve; });
  const blocked = new Promise(resolve => { releaseUpload = resolve; });
  const h = harness({ onUpload: async () => { enteredUpload(); await blocked; } });
  const first = h.api.saveHealthStateWithHistory({ profile, water: 100, meals: [{ type: 'breakfast', image: 'data:image/jpeg;base64,abc' }] });
  await entered;
  const second = h.api.saveHealthStateWithHistory({ profile, water: 200, meals: [] });
  releaseUpload(); await Promise.all([first, second]);
  assert.equal(h.api.readLocalState().water, 200);
  assert.equal(h.api.readLocalHistory()[0].water, 200);
});


test('a saved UTC timezone is preserved rather than replaced with the device timezone', async () => {
  const h = harness();
  await h.api.saveHealthStateWithHistory({ profile: { ...profile, timezone: 'UTC' }, water: 250 });
  assert.equal(h.calls[0].profile.timezone, 'UTC');
  assert.equal(h.api.readLocalState().profile.timezone, 'UTC');
});

test('a new day restores the meal routine instead of repeating yesterday snooze', () => {
  const h = harness();
  const next = h.api.rollHealthStateForward({ date: '2000-01-01', profile, meals: [{ type: 'lunch', plannedTime: '14:30', actualTime: '14:40', status: 'snoozed', description: 'old' }] });
  assert.equal(next.meals[0].plannedTime, '13:00');
  assert.equal(next.meals[0].actualTime, '13:00');
  assert.equal(next.meals[0].status, 'pending');
  assert.equal(next.meals[0].description, '');
});

test('history cloud failure is visible and does not replace cached records with an empty result', async () => {
  const h = harness({ remoteError: { message: 'offline' } });
  const cached = JSON.stringify([{ date: '2026-10-01', water: 900 }]);
  h.store.set(h.api.historyKey, cached);
  await assert.rejects(h.api.loadSyncedHistory(), /Could not load your history/);
  assert.equal(h.store.get(h.api.historyKey), cached);
});

test('history does not merge old account records after an account switch during its read', async () => {
  const h = harness({ switchUserDuringAuth: true });
  h.store.set(h.api.historyKey, JSON.stringify([{ date: '2026-10-01', water: 900 }]));
  await assert.rejects(h.api.loadSyncedHistory(), /account changed/);
});

function accountRestorer(h) {
  const paths = { exports: {}, URL, URLSearchParams };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/return-path.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, paths);
  const context = { exports: {}, require: name => name.endsWith('health-sync') ? h.api : paths.exports };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/account-restore.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports.restoreAccountDestination;
}

test('sign-in restoration keeps same-day unsynced edits and returns to the requested meal', async () => {
  const h = harness();
  const date = h.api.getLocalDateForState({ profile });
  h.store.set(h.api.storageKey, JSON.stringify({ date, profile, onboardingCompleted: true, water: 850, syncPending: true, serverUpdatedAt: null }));
  assert.equal(await accountRestorer(h)('user-a', '/meals?meal=dinner'), '/meals?meal=dinner');
  assert.equal(h.api.readLocalState().water, 850);
  assert.equal(h.api.readLocalState().syncPending, true);
});

test('sign-in cloud errors do not send an existing user to new-account onboarding', async () => {
  const h = harness({ remoteError: { message: 'offline' } });
  await assert.rejects(accountRestorer(h)('user-a', '/medicines'), /Could not load/);
});

test('new-account restoration carries a safe notification destination through onboarding', async () => {
  const h = harness();
  assert.equal(await accountRestorer(h)('user-a', '/medicines'), '/onboarding?next=%2Fmedicines');
  assert.equal(await accountRestorer(h)('user-a', '//evil.example'), '/onboarding?next=%2F');
});
