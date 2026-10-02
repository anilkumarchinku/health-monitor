const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const crypto=require('node:crypto');

function fixture({devices=1,failCode=0,loseSave=false,audienceComplete=true}={}) {
  const campaigns=new Map();const deliveries=new Map();const sends=[];
  const subs=Array.from({length:devices},(_,i)=>({subscription_id:`device-${i}`,subscription:{endpoint:`https://push.example/${i}`},attempts:0,status:'pending'}));
  const db={
    async rpc(name,args) {
      if(name==='enqueue_push_broadcast') {if(!deliveries.has(args.p_campaign_id))deliveries.set(args.p_campaign_id,subs.map(x=>({...x})));return {data:audienceComplete};}
      if(name==='claim_push_broadcast') {const rows=deliveries.get(args.p_campaign_id).filter(x=>x.status==='pending'||x.status==='retry').slice(0,10);for(const row of rows){row.status='sending';row.attempts++;row.lease_token=args.p_token;}return {data:rows.map(x=>({...x}))};}
      throw new Error(name);
    },
    from(table) {
      let operation='read';let payload;let count=false;const filters=[];
      const q={select(_c,opts){count=Boolean(opts?.count);return q;},insert(p){operation='insert';payload=p;return q;},update(p){operation='update';payload=p;return q;},delete(){operation='delete';return q;},eq(k,v){filters.push([k,v]);return q;},in(k,v){filters.push([k,v]);return q;},single(){return q;},maybeSingle(){return q;},then(resolve,reject){return Promise.resolve().then(()=>{
        const id=filters.find(([key])=>key==='id'||key==='campaign_id')?.[1];
        if(table==='push_broadcast_campaigns') {
          if(operation==='insert'){campaigns.set(payload.id,{payload:payload.payload});return {data:null};}
          return {data:campaigns.get(id)||null};
        }
        if(table==='push_subscriptions')return {data:null};
        let rows=deliveries.get(id)||[];
        rows=rows.filter(row=>filters.every(([k,v])=>k==='campaign_id'||(Array.isArray(v)?v.includes(row[k]):row[k]===v)));
        if(operation==='update'){if(loseSave)return {data:null};for(const row of rows)Object.assign(row,payload);return {data:rows[0]||null};}
        return count?{count:rows.length}:{data:rows};
      }).then(resolve,reject);}};
      return q;
    },
  };
  const code=ts.transpileModule(fs.readFileSync('app/api/push/broadcast/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const ctx={exports:{},Buffer,crypto,Date,Error,process:{env:{CRON_SECRET:'secret',NEXT_PUBLIC_SUPABASE_URL:'https://db.example',SUPABASE_SERVICE_ROLE_KEY:'key',NEXT_PUBLIC_VAPID_PUBLIC_KEY:'key',VAPID_PRIVATE_KEY:'key'}},require(name){
    if(name==='next/server')return {NextResponse:{json:(data,opts)=>Response.json(data,opts)}};
    if(name==='@supabase/supabase-js')return {createClient:()=>db};
    if(name==='web-push')return {setVapidDetails(){}};
    if(name==='@/lib/server-rate-limit')return {consumeRateLimit:async()=>true};
    if(name==='@/lib/push-server')return {sendSafePushNotification:async(sub,payload)=>{sends.push({sub,payload});if(failCode)throw Object.assign(new Error('provider failed'),{statusCode:failCode});}};
    throw new Error(name);
  }};
  vm.runInNewContext(code,ctx);
  const call=(body={})=>ctx.exports.POST(new Request('https://app.example/api/push/broadcast',{method:'POST',headers:{authorization:'Bearer secret'},body:JSON.stringify(body)}));
  return {call,sends,campaigns,deliveries};
}
test('repeated default campaign never resends accepted devices',async()=>{
  const f=fixture();const first=await f.call();assert.equal(first.status,200);assert.equal((await first.json()).sent,1);
  const second=await f.call();assert.equal((await second.json()).sent,0);assert.equal(f.sends.length,1);
  assert.equal(f.campaigns.size,1);
});
test('concurrent continuation cannot claim an already leased device',async()=>{
  const f=fixture();await Promise.all([f.call(),f.call()]);assert.equal(f.sends.length,1);
});
test('custom campaign requires identity and rejects payload changes while continuation reuses original',async()=>{
  const f=fixture();assert.equal((await f.call({title:'Custom'})).status,400);
  assert.equal((await f.call({campaignId:'notice-one',title:'Custom',body:'Original'})).status,200);
  assert.equal((await f.call({campaignId:'notice-one',title:'Changed',body:'Original'})).status,409);
  assert.equal((await f.call({campaignId:'notice-one'})).status,200);
  assert.equal(f.sends.length,1);assert.equal(JSON.parse(f.sends[0].payload).title,'Custom');
});
test('bounded batch leaves pending count and does not claim audience completion',async()=>{
  const f=fixture({devices:12,audienceComplete:false});const body=await (await f.call()).json();
  assert.equal(body.sent,10);assert.equal(body.pending,2);assert.equal(body.mayHaveMore,true);assert.equal(body.audienceComplete,false);
});
test('transient failures retry but fifth attempt becomes terminal',async()=>{
  const f=fixture({failCode:503});for(let i=0;i<5;i++)await f.call();
  const row=[...f.deliveries.values()][0][0];assert.equal(row.status,'failed');assert.equal(row.attempts,5);
  await f.call();assert.equal(f.sends.length,5);
});
test('failed completion returns recoverable failure without marking campaign complete',async()=>{
  const f=fixture({loseSave:true});const result=await f.call();const body=await result.json();
  assert.equal(result.status,503);assert.equal(body.mayHaveMore,true);assert.equal([...f.deliveries.values()][0][0].status,'sending');
});
