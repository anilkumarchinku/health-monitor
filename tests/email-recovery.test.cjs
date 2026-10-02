const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');

const user = '11111111-1111-4111-8111-111111111111';
function load(file, imports = {}, env = {}, fetchImpl = async () => Response.json({ id: 'sent' })) {
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const ctx = { exports: {}, process: { env }, crypto, Buffer, Date, URL, Error, Response, Request, AbortSignal, fetch: fetchImpl, setTimeout: (cb) => cb(), require(name) {
    if (name === 'server-only') return {};
    if (name === 'node:crypto') return crypto;
    if (name in imports) return imports[name];
    throw new Error(`Unexpected module: ${name}`);
  }};
  vm.runInNewContext(compiled, ctx, { filename: file });
  return ctx.exports;
}
function email(env = {}, fetchImpl) {
  return load('lib/email-announcements.ts', {}, { EMAIL_UNSUBSCRIBE_SECRET: 'a'.repeat(32), EMAIL_PUBLIC_URL: 'https://health.example', EMAIL_FROM: 'Health <hello@health.example>', RESEND_API_KEY: 'test', ...env }, fetchImpl);
}

test('unsubscribe signatures survive independent cron rotation and previous email secret rotation', () => {
  const old = email({ CRON_SECRET: 'old' });
  const token = old.makeUnsubscribeToken(user);
  assert.ok(email({ CRON_SECRET: 'new' }).validUnsubscribeToken(user, token));
  assert.ok(email({ EMAIL_UNSUBSCRIBE_SECRET: 'b'.repeat(32), EMAIL_UNSUBSCRIBE_PREVIOUS_SECRET: 'a'.repeat(32) }).validUnsubscribeToken(user, token));
  assert.equal(email({ EMAIL_UNSUBSCRIBE_SECRET: 'b'.repeat(32) }).validUnsubscribeToken(user, token), false);
  assert.equal(old.validUnsubscribeToken('22222222-2222-4222-8222-222222222222', token), false);
  assert.equal(old.validUnsubscribeToken(user, 'v1.invalid'), false);
  assert.throws(() => email({ EMAIL_UNSUBSCRIBE_SECRET: 'short' }).makeUnsubscribeToken(user), /at least 32/);
});

test('provider classifies rate limits, server errors, authentication errors and ambiguous success', async () => {
  for (const [status, body, retryable] of [[429,{message:'rate limited'},true],[503,{message:'offline'},true],[401,{message:'invalid key'},false],[200,{},true]]) {
    const api = email({}, async () => Response.json(body, { status, headers: { 'retry-after': '120' } }));
    await assert.rejects(api.sendResendEmail({ payload: {}, idempotencyKey: 'same' }), err => err instanceof api.EmailSendError && err.retryable === retryable && err.retryAfterSeconds === 120);
  }
  const api = email({}, async () => { throw new Error('connection lost'); });
  await assert.rejects(api.sendResendEmail({payload:{},idempotencyKey:'same'}), err => err.retryable === true);
});

test('provider sends the supplied stable payload and key exactly', async () => {
  let captured;
  const api = email({}, async (url, options) => { captured = {url,options}; return Response.json({id:'accepted'}); });
  const payload = { from:'old@health.example', to:['old@example.test'], subject:'Stored subject', text:'Original body', html:'<p>Original body</p>' };
  assert.equal(await api.sendResendEmail({payload,idempotencyKey:'campaign-user'}),'accepted');
  assert.equal(captured.options.headers['Idempotency-Key'],'campaign-user');
  assert.deepEqual(JSON.parse(captured.options.body),payload);
  assert.ok(captured.options.signal instanceof AbortSignal);
});

function unsubscribe(api, dbError = null) {
  let writes = 0;
  const handlers = load('app/api/email/unsubscribe/route.ts', {
    'next/server': { NextResponse: Response },
    '@supabase/supabase-js': { createClient: () => ({ from: () => ({ upsert: async body => { assert.equal(body.user_id,user); writes++; return {error:dbError}; } }) }) },
    '@/lib/email-announcements': api,
  }, { NEXT_PUBLIC_SUPABASE_URL:'https://db.example', SUPABASE_SERVICE_ROLE_KEY:'test' });
  return {...handlers,writes:()=>writes};
}
test('unsubscribe GET is read-only; POST requires a valid signed user link', async () => {
  const api = email();
  const route = unsubscribe(api);
  const url = `https://health.example/api/email/unsubscribe?user=${user}&token=${api.makeUnsubscribeToken(user)}`;
  const get = await route.GET(new Request(url));
  assert.equal(get.status,200);
  assert.match(await get.text(),/<form method="post">/);
  assert.equal(route.writes(),0);
  assert.equal((await route.POST(new Request(url.replace(/token=.*/, 'token=bad'), {method:'POST'}))).status,400);
  assert.equal(route.writes(),0);
  assert.equal((await route.POST(new Request(url,{method:'POST'}))).status,200);
  assert.equal(route.writes(),1);
});
test('unsubscribe storage outage is retryable and does not report success', async () => {
  const api=email(); const route=unsubscribe(api,{message:'offline'});
  const res=await route.POST(new Request(`https://health.example/api/email/unsubscribe?user=${user}&token=${api.makeUnsubscribeToken(user)}`,{method:'POST'}));
  assert.equal(res.status,503);
});

function queueFixture({ denied=false, lostClaim=false, saveLost=false, sendError=null, optedOut=false, attempts=2 } = {}) {
  const savedPayload = {from:'stored@example.test',to:['recipient@example.test'],subject:'Original',text:'original',html:'original'};
  const candidate = {user_id:user,recipient_email:'recipient@example.test',attempts:attempts-1,request_payload:savedPayload};
  const sent=[]; const writes=[]; const claims=[];
  const api=email();
  const send=async args => {sent.push(args); if(sendError) throw new api.EmailSendError('provider failed',sendError.retryable,sendError.retryAfter ?? 60);return 'provider-id';};
  const db={
    rpc:async (name,args) => {claims.push({name,args});return {data:lostClaim?[]:[{...candidate,attempts,request_payload:savedPayload}]};},
    from(table) {
      let op='select';let payload;let count=false;const filters=[];
      const result=()=> {
        if(op==='update') {writes.push({payload,filters});return {data:saveLost?null:{user_id:user}};}
        if(table==='email_announcement_opt_outs') return {data:optedOut?{user_id:user}:null};
        if(count)return {count:0};
        return {data:[candidate]};
      };
      const q={update(p){op='update';payload=p;return q;},select(_c,opts){count=Boolean(opts?.count);return q;},eq(...a){filters.push(a);return q;},in(){return q;},or(){return q;},lte(){return q;},order(){return q;},limit(){return q;},maybeSingle(){return q;},then(resolve,reject){return Promise.resolve(result()).then(resolve,reject);}};
      return q;
    },
  };
  const queueModule=load('lib/email-queue.ts',{'@/lib/email-announcements':{...api,sendResendEmail:send},'@/lib/server-rate-limit':{consumeRateLimit:async()=>!denied}});
  return {run:()=>queueModule.processEmailQueue(db),sent,writes,claims,savedPayload};
}
test('queue keeps stored request and campaign/user key across retry attempts', async () => {
  const first=queueFixture({attempts:2});await first.run();
  const second=queueFixture({attempts:3});await second.run();
  assert.deepEqual(first.sent[0].payload,first.savedPayload);
  assert.equal(first.sent[0].idempotencyKey,second.sent[0].idempotencyKey);
  const completion=first.writes.find(x=>x.payload.provider_id);
  assert.equal(completion.payload.status,'accepted');
  assert.ok(completion.filters.some(([key,val])=>key==='lease_token'&&val===first.claims[0].args.p_lease_token));
});
test('queue sends nothing if another worker owns claim or dispatch rate limit is exhausted', async () => {
  for(const options of [{lostClaim:true},{denied:true}]) {const fixture=queueFixture(options);await fixture.run();assert.equal(fixture.sent.length,0);}
});
test('retryable failure receives backoff; terminal errors and exhausted attempts require review',async()=>{
  for(const [options,status] of [[{sendError:{retryable:true,retryAfter:300}},'failed'],[{sendError:{retryable:false}},'review'],[{attempts:5,sendError:{retryable:true}},'review']]) {
    const fixture=queueFixture(options);await fixture.run();
    const completion=fixture.writes.find(x=>x.payload.lease_token===null);
    assert.equal(completion.payload.status,status);
    if(status==='failed')assert.ok(Date.parse(completion.payload.next_attempt_at)-Date.now()>295000);
  }
});
test('lost completion lease is surfaced without blindly creating another send',async()=>{
  const fixture=queueFixture({saveLost:true});
  await assert.rejects(fixture.run(),/lease expires/);
  assert.equal(fixture.sent.length,1);
});
test('opted out queued user is cancelled without provider contact',async()=>{
  const fixture=queueFixture({optedOut:true});await fixture.run();
  assert.equal(fixture.sent.length,0);
  assert.ok(fixture.writes.some(x=>x.payload.status==='cancelled'));
});
