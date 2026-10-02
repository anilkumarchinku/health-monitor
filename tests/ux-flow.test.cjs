const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(path, extra = {}) {
  const context = { exports: {}, URL, URLSearchParams, Date, Intl, ...extra };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports;
}
const paths = load('lib/return-path.ts');
const prefs = load('lib/reminder-preferences.ts');
const daily = load('lib/daily-health.ts');
test('sign-in returns to a specific meal or medicine screen without allowing external redirects', () => {
  assert.equal(paths.safeReturnPath('/meals?meal=dinner&reminderSound=1'), '/meals?meal=dinner&reminderSound=1');
  assert.equal(paths.safeReturnPath('/medicines'), '/medicines');
  for (const unsafe of ['https://evil.example', '//evil.example', '/\\evil.example', '/auth?next=//evil', '/onboarding', '/unknown', '/%2f%2fevil.example', '\n/medicines']) assert.equal(paths.safeReturnPath(unsafe), '/');
});
test('legacy profiles retain reminders and explicitly disabled kinds do not leak through', () => {
  assert.equal(prefs.reminderEnabled(undefined, 'breakfast', '2026-10-02'), true);
  assert.equal(prefs.reminderEnabled({ meals: false }, 'dinner', '2026-10-02'), false);
  assert.equal(prefs.reminderEnabled({ medicines: false }, 'medicine', '2026-10-02'), false);
  assert.equal(prefs.reminderEnabled({ sleep: false }, 'sleep', '2026-10-02'), false);
  assert.equal(prefs.reminderEnabled({}, 'unknown', '2026-10-02'), false);
});
test('Monday can be enabled independently from other morning messages', () => {
  assert.equal(prefs.reminderEnabled({ morning: false, monday: true }, 'morning', '2026-10-05'), true);
  assert.equal(prefs.reminderEnabled({ morning: false, monday: true }, 'morning', '2026-10-06'), false);
  assert.equal(prefs.reminderEnabled({ morning: false, monday: false }, 'morning', '2026-10-05'), false);
  assert.equal(prefs.reminderEnabled({ morning: true, monday: false }, 'morning', '2026-10-05'), true);
});
test('normalising a day preserves preferences and logged meals without manufacturing sleep', () => {
  const day = daily.normaliseDay({ profile: { name: 'Test', reminderPreferences: { meals: false } }, meals: [{ type: 'lunch', status: 'logged', description: 'Rice' }] });
  assert.equal(day.profile.reminderPreferences.meals, false);
  assert.equal(day.meals[1].description, 'Rice'); assert.equal(day.meals.length, 3);
  assert.equal(day.sleep.hours, 0); assert.equal(day.sleep.sleptAt, '');
});
test('next action ignores completed and skipped meals and follows moved reminders', () => {
  const day = daily.normaliseDay({ meals: [{ type: 'breakfast', status: 'logged' }, { type: 'lunch', status: 'snoozed', plannedTime: '14:30' }] });
  assert.equal(daily.nextMeal(day).type, 'lunch');
  day.meals[1].status = 'skipped'; assert.equal(daily.nextMeal(day).type, 'dinner');
  day.meals[2].status = 'logged'; assert.equal(daily.nextMeal(day), null);
});
test('sleep duration handles overnight sleep and missing times', () => {
  assert.equal(daily.sleepDuration('23:30', '07:15').hours, 7);
  assert.equal(daily.sleepDuration('23:30', '07:15').minutes, 45);
  assert.equal(daily.sleepDuration('', '07:15'), null);
  assert.equal(daily.sleepDuration('24:10', '07:15'), null);
  assert.equal(daily.sleepDuration('23:60', '07:15'), null);
});
// Exercise actual scheduler candidate generation, not a copied preference filter.
function scheduler(path) {
  const source = fs.readFileSync(path, 'utf8') + '\nexport { getReminderCandidates };';
  const context = { exports: {}, Date, Intl, process: { env: {} }, require(name) {
    if (name === '@/lib/reminder-preferences') return prefs;
    if (name === '@/lib/morning-quotes') return { getMorningQuoteText: () => 'Daily quote' };
    return {};
  }};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports.getReminderCandidates;
}
for (const path of ['app/api/cron/send-reminders/route.ts', 'app/api/notifications/doctor/route.ts']) {
  test(`${path}: respects preferences and links to the exact meal`, () => {
    const candidates = scheduler(path);
    const snapshot = { date: '2026-10-05', profile: { timezone: 'Asia/Kolkata', wakeTime: '07:00', breakfastTime: '08:00', lunchTime: '13:00', dinnerTime: '20:00', sleepReminder: '22:00' }, meals: [] };
    const now = new Date('2026-10-05T01:30:00Z');
    const result = candidates(snapshot, now); const all = result.candidates ?? result.reminders;
    assert.equal(all.find(x => x.kind === 'lunch').url, '/meals?meal=lunch');
    assert.equal(all.find(x => x.kind === 'morning').title, 'Monday health check-in');
    snapshot.profile.reminderPreferences = { meals:false, morning:false, monday:false, sleep:false };
    const disabled = candidates(snapshot, now); assert.equal((disabled.candidates ?? disabled.reminders).length, 0);
    snapshot.profile.reminderPreferences = { morning:true, monday:false };
    const normal = candidates(snapshot, now); assert.equal((normal.candidates ?? normal.reminders).find(x => x.kind === 'morning').body, 'Daily quote');
  });
}
