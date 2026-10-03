const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(path, dependencies = {}, extra = {}) {
  const context = { exports: {}, Date, Intl, URLSearchParams, Error, ...extra, require(name) {
    if (name in dependencies) return dependencies[name];
    if (name.endsWith('.module.css')) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.startsWith('@/')) return load(name.replace('@/', '') + '.tsx', dependencies, extra);
    return require(name);
  }};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  return context.exports;
}
const daily = load('lib/daily-health.ts');
const model = load('lib/onboarding.ts', { '@/lib/daily-health': daily });
const dependencies = { '@/lib/onboarding': model, '@/lib/utils': { cn: (...args) => args.filter(x => typeof x === 'string').join(' ') } };
const answers = Object.fromEntries(model.onboardingSteps.map(step => [step.id, { values: [step.options[0].value], text: '', other: '' }]));
const json = value => JSON.parse(JSON.stringify(value));

test('actual onboarding question and completion components render accessible controls', () => {
  const ui = load('components/onboarding/onboarding-question.tsx', dependencies);
  const html = renderToStaticMarkup(React.createElement(ui.OnboardingQuestion, { step: model.onboardingSteps[0], answer: answers.role, disabled: false, onSelect() {}, onText() {} }));
  assert.match(html, /What describes you best/); assert.equal((html.match(/aria-pressed=/g) || []).length, 6);
  assert.match(html, /aria-pressed="true"/); assert.match(html, /aria-labelledby="onboarding-question"/);
  assert.match(renderToStaticMarkup(React.createElement(ui.OnboardingComplete, { editing: false })), /You&#x27;re all set/);
  const text = renderToStaticMarkup(React.createElement(ui.OnboardingQuestion, { step: { id: 'name', type: 'text', question: 'Your name?', maxLength: 60 }, answer: model.emptyAnswer(), disabled: false, onText() {} }));
  assert.match(text, /aria-label="Your name\?"/); assert.match(text, /maxLength="60"/);
});
test('single and multiple choices store values; next and back retain answers', () => {
  let state = { step: 0, answers: {}, completed: false };
  const answer = model.chooseAnswer(model.onboardingSteps[0], model.emptyAnswer(), 'Developer');
  state = model.onboardingReducer(state, { type: 'answer', id: 'role', answer });
  state = model.onboardingReducer(state, { type: 'move', step: 1 });
  assert.equal(model.onboardingSteps[state.step].id, 'useCase');
  state = model.onboardingReducer(state, { type: 'move', step: 0 });
  assert.deepEqual(json(state.answers.role.values), ['Developer']);
  let multi = model.chooseAnswer(model.onboardingSteps[3], model.emptyAnswer(), 'Hydration');
  multi = model.chooseAnswer(model.onboardingSteps[3], multi, 'Better sleep');
  assert.deepEqual(json(multi.values), ['Hydration', 'Better sleep']);
  assert.deepEqual(json(model.chooseAnswer(model.onboardingSteps[3], multi, 'Hydration').values), ['Better sleep']);
});
test('invalid drafts cannot skip unanswered steps and Other text is bounded', () => {
  const restored = model.restoreOnboardingState(null, JSON.stringify({ version: 1, step: 4, answers: { role: answers.role } }));
  assert.equal(restored.step, 1);
  assert.equal(model.restoreOnboardingState(null, 'bad json').step, 0);
  const other = model.chooseAnswer(model.onboardingSteps[0], { values: ['Other'], text: '', other: 'Writer' }, 'Developer');
  assert.equal(other.other, '');
  assert.equal(model.validAnswer({ type: 'text', maxLength: 3 }, { text: 'long', values: [], other: '' }), false);
});
test('completion preserves health records and stores answers in the existing profile', () => {
  const base = { profile: { name: 'Sam', wakeTime: '06:15', waterGoal: 1800, timezone: 'Asia/Kolkata', reminderPreferences: { meals: false } }, meals: [{ type: 'lunch', status: 'logged', description: 'Test meal' }], water: 800, sleep: { hours: 7 }, serverUpdatedAt: 'version-1' };
  const result = model.buildOnboardingSnapshot(base, answers, 'UTC');
  assert.equal(result.onboardingCompleted, true); assert.equal(result.profile.name, 'Sam'); assert.equal(result.profile.wakeTime, '06:15');
  assert.equal(result.profile.reminderPreferences.meals, false); assert.equal(result.water, 800); assert.equal(result.sleep.hours, 7);
  assert.equal(result.meals[1].description, 'Test meal'); assert.equal(result.serverUpdatedAt, 'version-1');
  assert.deepEqual(json(result.profile.onboarding.answers), answers);
  assert.throws(() => model.buildOnboardingSnapshot(base, {}, 'UTC'), /Answer each question/);
});
test('completed users bypass, while revisits and unconfirmed cloud saves remain in onboarding', () => {
  assert.equal(model.bypassOnboarding({ onboardingCompleted: true }, false), true);
  assert.equal(model.bypassOnboarding({ onboardingCompleted: true }, true), false);
  assert.equal(model.bypassOnboarding({ onboardingCompleted: true, syncPending: true }, false), false);
  assert.equal(model.bypassOnboarding(null, false), false);
});
test('keyboard chooses 1–6 but never hijacks text entry or Escape', () => {
  for (let i = 1; i <= 6; i++) assert.equal(model.onboardingKeyAction(String(i), false).index, i - 1);
  assert.equal(model.onboardingKeyAction('1', true), null);
  assert.equal(model.onboardingKeyAction('Escape', false), null);
  assert.equal(model.onboardingKeyAction('1', false, true), null);
  assert.equal(model.onboardingKeyAction('Enter', true).type, 'continue');
});
test('persistence uses authenticated snapshot save and rejects failures/account changes', async () => {
  let saved, calls = 0, sameAccount = true, succeed = true;
  const persistence = load('lib/onboarding-persistence.ts', {
    '@/lib/onboarding': model,
    '@/lib/supabase/client': { createSupabaseBrowserClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: sameAccount ? 'owner' : 'other' } } }) } }) },
    '@/lib/health-sync': { getBrowserTimezone: () => 'UTC', hydrateHealthState: async () => ({ water: 300 }), validateHealthProfile: () => null, saveHealthStateWithHistory: async state => { calls++; saved = state; return succeed; } },
  });
  await persistence.saveOnboardingResponses('owner', answers);
  assert.equal(saved.onboardingCompleted, true); assert.equal(saved.water, 300);
  succeed = false; await assert.rejects(persistence.saveOnboardingResponses('owner', answers), /cloud save/);
  sameAccount = false; await assert.rejects(persistence.saveOnboardingResponses('owner', answers), /account changed/);
  assert.equal(calls, 2);
});

// Drive the actual hook with deterministic timers, including reduced motion.
function hookHarness(reducedMotion) {
  const slots = [], effects = [], timers = new Map(); let cursor = 0, timerId = 0, clock = 0, flow, destination = '', persistCalls = 0, failedSave = false;
  const draft = new Map();
  const react = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useReducer(reducer, initial) { const [state, set] = react.useState(initial); return [state, action => set(previous => reducer(previous, action))]; },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useCallback(fn) { cursor++; return fn; },
    useEffect(fn, deps) { const index = cursor++; const previous = slots[index]; if (!previous || deps.some((x, i) => x !== previous[i])) { slots[index] = deps; if (effects.length < 2) effects.push(fn); } },
  };
  const api = load('components/onboarding/use-onboarding.ts', {
    react, '@/lib/onboarding': model, '@/lib/auth': { requireSignedInUser: async () => ({ id: 'owner' }) },
    '@/lib/health-sync': { hydrateHealthState: async () => null }, '@/lib/return-path': { signInDestination: () => '/medicines' },
    '@/lib/onboarding-persistence': { saveOnboardingResponses: async () => { persistCalls++; if (failedSave) throw new Error('Cloud unavailable'); } },
  }, { window: { location: { search: '', replace: url => { destination = url; } }, matchMedia: () => ({ matches: reducedMotion, addEventListener() {}, removeEventListener() {} }) }, sessionStorage: { getItem: key => draft.get(key), setItem: (key, value) => draft.set(key, value), removeItem: key => draft.delete(key) }, setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, due: clock + delay }); return id; }, clearTimeout: id => timers.delete(id) });
  function render() { cursor = 0; flow = api.useOnboarding(); return flow; }
  return {
    async mount() { render(); effects[0](); await new Promise(resolve => setImmediate(resolve)); render(); effects[1](); return flow; },
    get flow() { return flow; }, render,
    tick(ms) { const until = clock + ms; while (true) { const next = [...timers.entries()].filter(([, t]) => t.due <= until).sort((a, b) => a[1].due - b[1].due)[0]; if (!next) break; clock = next[1].due; timers.delete(next[0]); next[1].fn(); render(); } clock = until; return flow; },
    failSave() { failedSave = true; }, get destination() { return destination; }, get persistCalls() { return persistCalls; },
  };
}
for (const reduced of [false, true]) test(`actual hook advances, goes back and saves without animation events (reduced motion: ${reduced})`, async () => {
  const h = hookHarness(reduced); await h.mount(); assert.equal(h.flow.ready, true);
  h.flow.select('Developer'); h.render(); assert.equal(h.flow.answer.values[0], 'Developer');
  h.tick(319); assert.equal(h.flow.state.step, 0); h.tick(441); assert.equal(h.flow.state.step, 1);
  h.flow.back(); h.tick(440); assert.equal(h.flow.state.step, 0); assert.equal(h.flow.answer.values[0], 'Developer');
  h.flow.next(); h.tick(440); h.flow.select('Work'); h.tick(760); h.flow.select('Just me'); h.tick(760);
  h.flow.select('Hydration'); h.render(); h.flow.select('Better sleep'); h.render(); h.tick(1000); assert.equal(h.flow.state.step, 3);
  h.flow.next(); h.tick(440); assert.equal(h.flow.state.step, 4);
  await h.flow.finish(); h.render(); assert.equal(h.persistCalls, 1); assert.equal(h.flow.state.completed, true); assert.equal(h.destination, '/medicines');
});
test('Other does not auto-advance; failed saves remain retryable with answers intact', async () => {
  const h = hookHarness(true); await h.mount(); h.flow.select('Other'); h.render(); h.flow.setText('other', 'Writer'); h.render(); h.tick(1000);
  assert.equal(h.flow.state.step, 0); assert.equal(h.flow.answer.other, 'Writer');
  h.flow.next(); h.tick(1); h.flow.select('Work'); h.tick(321); h.flow.select('Just me'); h.tick(321); h.flow.select('Hydration'); h.render(); h.flow.next(); h.tick(1);
  h.failSave(); await h.flow.finish(); h.render(); assert.equal(h.flow.state.completed, false); assert.equal(h.flow.error, 'Cloud unavailable'); assert.equal(h.destination, ''); assert.equal(h.flow.saving, false);
});

test('pending water edits do not reopen setup after confirmed cloud completion', async () => {
  assert.equal(model.bypassOnboarding({ onboardingCompleted: true, syncPending: true }, false, true), true);
  assert.equal(model.bypassOnboarding({ onboardingCompleted: true, syncPending: true }, true, true), false);
  let complete = true, queryError = null, ownerFilter;
  const query = { select() { return query; }, eq(field, value) { ownerFilter = [field, value]; return query; }, order() { return query; }, limit: async () => ({ data: [{ onboarding_completed: complete }], error: queryError }) };
  const persistence = load('lib/onboarding-persistence.ts', { '@/lib/onboarding': model, '@/lib/health-sync': {}, '@/lib/supabase/client': { createSupabaseBrowserClient: () => ({ from: name => { assert.equal(name, 'health_snapshots'); return query; } }) } });
  assert.equal(await persistence.hasSavedOnboarding('owner'), true); assert.deepEqual(ownerFilter, ['user_id', 'owner']);
  complete = false; assert.equal(await persistence.hasSavedOnboarding('owner'), false);
  queryError = new Error('unavailable'); await assert.rejects(persistence.hasSavedOnboarding('owner'), /confirm your saved setup/);
});
