const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const source = ts.transpileModule(fs.readFileSync('lib/reminder-delivery.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const context = { exports: {}, crypto, Date, Intl, Buffer, Error };
vm.runInNewContext(source, context);
const { dueMedicineDate, claimDeviceReminder, finishDeviceReminder } = context.exports;

test('medicine midnight catch-up uses previous local date', () => {
  assert.equal(dueMedicineDate(new Date('2026-10-02T18:35:00Z'), 'Asia/Kolkata', '23:55:00', 30), '2026-10-02');
  assert.equal(dueMedicineDate(new Date('2026-10-02T19:10:00Z'), 'Asia/Kolkata', '23:55:00', 30), null);
});
test('medicine future times stay future and current due window is inclusive', () => {
  assert.equal(dueMedicineDate(new Date('2026-10-02T03:30:00Z'), 'Asia/Kolkata', '10:00:00', 30), null);
  assert.equal(dueMedicineDate(new Date('2026-10-02T05:00:00Z'), 'Asia/Kolkata', '10:00:00', 30), '2026-10-02');
  assert.equal(dueMedicineDate(new Date(), 'UTC', '25:00', 30), null);
});
test('invalid medicine timezone fails visibly', () => {
  assert.throws(() => dueMedicineDate(new Date(), 'Invalid/Zone', '08:00', 30));
});
test('duplicate claim skips send while database failures throw', async () => {
  assert.equal(await claimDeviceReminder({ rpc: async () => ({ data: false }) }, 'u','s','k'), null);
  await assert.rejects(claimDeviceReminder({ rpc: async () => ({ error: { message: 'permission denied' } }) }, 'u','s','k'), /permission denied/);
  const token = await claimDeviceReminder({ rpc: async (_name, args) => { assert.equal(args.p_subscription_id, 'device'); return { data: true }; } }, 'u','device','k');
  assert.match(token, /^[0-9a-f-]{36}$/);
});
test('completion requires an owned lease and surfaces write failures', async () => {
  const db = (result) => ({ from: () => ({ update: () => { const q = { eq: () => q, select: async () => result }; return q; } }) });
  await assert.rejects(finishDeviceReminder(db({ data: [] }), 's','k','t'), /lease no longer owned/);
  await assert.rejects(finishDeviceReminder(db({ error: { message: 'offline' } }), 's','k','t'), /offline/);
  await finishDeviceReminder(db({ data: [{ subscription_id: 's' }] }), 's','k','t');
});

function loadCron({ failDevice = false, failHeartbeat = false, snoozed = false, snoozeDue = false, invalidMedicine = false } = {}) {
  const now = new Date();
  const time = now.toISOString().slice(11, 16);
  const updates = [];
  const finishes = [];
  const sends = [];
  const db = {
    rpc: async () => ({ data: [{ user_id: 'user', date: now.toISOString().slice(0,10), profile: { timezone: 'UTC', breakfastTime: time }, meals: snoozed ? [{ type: "breakfast", plannedTime: time, status: "snoozed" }] : [] }] }),
    from(table) {
      let operation = 'read';
      let payload;
      const result = () => {
        if (operation === 'insert' && failHeartbeat) return { error: { message: 'heartbeat unavailable' } };
        if (operation === 'update') updates.push({ table, ...payload });
        if (operation !== 'read') return { data: [] };
        if (table === 'push_subscriptions') return { data: [{ id: 'one', user_id: 'user', subscription: { endpoint: 'one' } }, { id: 'two', user_id: 'user', subscription: { endpoint: 'two' } }] };
        if (table === 'medicines' && invalidMedicine) return { data: [{ id: 'bad', user_id: 'user', timezone: 'Invalid/Zone', schedule_time: time }, { id: 'good', user_id: 'user', timezone: 'UTC', schedule_time: time }] };
        if (table === 'medicine_doses') return { data: null };
        if (table === 'reminder_snoozes' && snoozeDue) return { data: [{ id: 'snooze', user_id: 'user', meal_type: 'breakfast', due_at: now.toISOString() }] };
        return { data: [] };
      };
      const q = { insert(p) { operation='insert';payload=p;return q; }, update(p) {operation='update';payload=p;return q;}, delete() {operation='delete';return q;}, select(){return q;}, maybeSingle(){return q;}, order(){return q;}, range(){return q;}, limit(){return q;}, eq(){return q;}, gte(){return q;}, lte(){return q;}, lt(){return q;}, then(resolve,reject){return Promise.resolve(result()).then(resolve,reject);} };
      return q;
    },
  };
  const compiled = ts.transpileModule(fs.readFileSync('app/api/cron/send-reminders/route.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const c = { exports: {}, crypto, Date, Intl, Error, process: { env: { CRON_SECRET:'test',NEXT_PUBLIC_SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'test',NEXT_PUBLIC_VAPID_PUBLIC_KEY:'test',VAPID_PRIVATE_KEY:'test' } }, require(name) {
    if (name === 'next/server') return { NextResponse: { json: (body, init) => Response.json(body,init) } };
    if (name === '@supabase/supabase-js') return { createClient: () => db };
    if (name === 'web-push') return { setVapidDetails(){} };
    if (name === '@/lib/reminder-preferences') { const pref = { exports: {}, Date }; vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/reminder-preferences.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, pref); return pref.exports; }
    if (name === '@/lib/morning-quotes') return { getMorningQuoteText: () => 'morning' };
    if (name === '@/lib/reminder-delivery') return { dueMedicineDate, claimDeviceReminder: async () => 'lease', finishDeviceReminder: async (_db, sub, key, token, error) => finishes.push({sub,error}) };
    if (name === '@/lib/push-server') return { sendSafePushNotification: async (sub, payload) => { sends.push({ device: sub.endpoint, ...JSON.parse(payload) }); if (failDevice && sub.endpoint === 'one') throw new Error('offline'); } };
    throw new Error(name);
  }};
  vm.runInNewContext(compiled,c);
  return { GET:c.exports.GET, updates, finishes, sends };
}
test('cron records device successes independently and reports retryable failure', async () => {
  const { GET, updates, finishes } = loadCron({failDevice:true});
  const response = await GET(new Request('https://test.invalid', {headers:{authorization:'Bearer test'}}));
  assert.equal(response.status,503);
  assert.equal(finishes.length,2);
  assert.ok(finishes.find(x => x.sub === 'one').error);
  assert.equal(finishes.find(x => x.sub === 'two').error,undefined);
  assert.equal(updates.at(-1).status,'failed');
});
test('cron refuses to run without a durable heartbeat', async () => {
  const { GET, finishes } = loadCron({failHeartbeat:true});
  const response = await GET(new Request('https://test.invalid', {headers:{authorization:'Bearer test'}}));
  assert.equal(response.status,503);
  assert.equal(finishes.length,0);
});
test('unauthorized cron does not touch delivery state', async () => {
  const { GET, finishes, updates } = loadCron();
  const response = await GET(new Request('https://test.invalid'));
  assert.equal(response.status,401);
  assert.equal(finishes.length,0);
  assert.equal(updates.length,0);
});

for (const snoozeDue of [false, true]) {
  test(`snoozed meal sends only via persisted snooze (due=${snoozeDue})`, async () => {
    const { GET, sends } = loadCron({ snoozed: true, snoozeDue });
    const response = await GET(new Request('https://test.invalid', { headers: { authorization: 'Bearer test' } }));
    assert.equal(response.status, 200);
    assert.equal(sends.length, snoozeDue ? 2 : 0);
    assert.ok(sends.every(send => send.tag.startsWith('snooze-')));
    assert.equal(new Set(sends.map(send => send.device)).size, snoozeDue ? 2 : 0);
  });
}
test('invalid medicine schedule reports failure but does not block valid medicines or snoozes', async () => {
  const { GET, sends } = loadCron({ invalidMedicine: true, snoozed: true, snoozeDue: true });
  const response = await GET(new Request('https://test.invalid', { headers: { authorization: 'Bearer test' } }));
  assert.equal(response.status, 503);
  const result = await response.json();
  assert.match(result.failures[0], /Medicine bad: invalid schedule/);
  assert.equal(sends.filter(send => send.tag.endsWith('-good-medicine')).length, 2);
  assert.equal(sends.filter(send => send.tag.startsWith('snooze-')).length, 2);
  assert.equal(sends.length, 4);
});
