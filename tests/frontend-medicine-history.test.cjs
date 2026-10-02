const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(path, requireMock = () => ({})) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: requireMock, Intl, Date });
  return exports;
}
test('dose history describes correction without rewriting the prior taken event', () => {
  const { describeMedicineDoseEvent } = load('lib/medicines.ts');
  const before = { status: 'taken', food_answer: true, taken_at: '2026-10-02T08:00:00Z', scheduled_date: '2026-10-02' };
  const after = { ...before, status: 'reminded', food_answer: null, taken_at: null };
  assert.equal(describeMedicineDoseEvent({ operation: 'UPDATE', previous_value: before, next_value: after }), 'Taken → Pending · Food: ate → not recorded · Recorded time changed');
  assert.equal(before.status, 'taken');
});
test('dose history read is owner filtered, newest first and bounded', async () => {
  const calls = [];
  const query = { select(columns) { calls.push(['select', columns]); return this; }, eq(key,value) { calls.push(['eq', key, value]); return this; }, order(key,options) { calls.push(['order', key, options.ascending]); return this; }, async limit(n) { calls.push(['limit', n]); return { data: [{ id: 'event' }], error: null }; } };
  const { loadMedicineDoseEvents } = load('lib/medicine-history.ts', () => ({ createSupabaseBrowserClient: () => ({ from(table) { calls.push(['from', table]); return query; } }) }));
  const rows = await loadMedicineDoseEvents('owner-id');
  assert.equal(rows[0].id, 'event'); assert.ok(calls.some(c => c[0] === 'eq' && c[1] === 'user_id' && c[2] === 'owner-id'));
  assert.ok(calls.some(c => c[0] === 'order' && c[1] === 'recorded_at' && c[2] === false)); assert.ok(calls.some(c => c[0] === 'limit' && c[1] === 100));
});
