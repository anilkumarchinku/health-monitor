const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function loadClient({ browser = true, configured = true } = {}) {
  const calls = [];
  const context = {
    exports: {},
    process: { env: configured ? { NEXT_PUBLIC_SUPABASE_URL: 'https://test.invalid', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-key' } : {} },
    ...(browser ? { window: {} } : {}),
    require: () => ({ createClient: (...args) => { const client = { args }; calls.push(client); return client; } }),
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/supabase/client.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { ...context.exports, calls };
}

test('browser consumers share one authentication client', () => {
  const { createSupabaseBrowserClient: create, calls } = loadClient();
  assert.equal(create(), create());
  assert.equal(calls.length, 1);
});

test('server renders do not share or persist authentication state', () => {
  const { createSupabaseBrowserClient: create, calls } = loadClient({ browser: false });
  assert.notEqual(create(), create());
  assert.equal(calls.length, 2);
  for (const client of calls) {
    assert.equal(client.args[2].auth.persistSession, false);
    assert.equal(client.args[2].auth.autoRefreshToken, false);
    assert.equal(client.args[2].auth.detectSessionInUrl, false);
  }
});

test('missing configuration does not construct an unusable client', () => {
  const { createSupabaseBrowserClient: create, calls } = loadClient({ configured: false });
  assert.equal(create(), null);
  assert.equal(calls.length, 0);
});
