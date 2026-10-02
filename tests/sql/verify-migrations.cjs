const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
(async () => {
 const db = new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon,authenticated,service_role;
 grant select on auth.users to service_role;
 insert into auth.users values('00000000-0000-0000-0000-000000000001','one@example.test',now()),('00000000-0000-0000-0000-000000000002','two@example.test',now());`);
 const base = ['schema.sql','auth_push_migration.sql','cron_reminders_migration.sql','morning_reminders_migration.sql','rescheduled_reminders_migration.sql','secure_snapshot_reads_migration.sql'];
 const files = [...base.map(f => 'supabase/'+f), ...fs.readdirSync(path.join(root,'supabase/migrations')).sort().map(f=>'supabase/migrations/'+f)];
 for (const f of files) {
   const sql=fs.readFileSync(path.join(root,f),'utf8').replace(/create extension if not exists pgcrypto;/g,'');
   if(!sql.trim()) { console.log('EMPTY',f); continue; }
   try { await db.exec(sql); console.log('APPLIED', f); } catch(e) { console.error('MIGRATION FAILED',f,e.message); throw e; }
 }
 await db.exec(`set role service_role;
 insert into public.health_snapshots(user_id,client_id,date,profile,meals,sleep,payload) values
 ('00000000-0000-0000-0000-000000000001','one','2026-10-02','{}','[]','{}','{}'),
 ('00000000-0000-0000-0000-000000000002','two','2026-10-02','{}','[]','{}','{}');
 insert into public.push_subscriptions(id,user_id,endpoint,subscription) values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','https://fcm.googleapis.com/test','{}');`);
 const bool = async (sql) => (await db.query(sql)).rows[0].ok;
 assert.equal(await bool(`select public.consume_rate_limit('test',2,60) as ok`),true);
 assert.equal(await bool(`select public.consume_rate_limit('test',2,60) as ok`),true);
 assert.equal(await bool(`select public.consume_rate_limit('test',2,60) as ok`),false);
 console.log('PASS rate counter limit');
 await db.query('select * from public.medicines');
 await db.query('select * from public.medicine_doses');
 console.log('PASS explicit service role medicine read grants');
 await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false)`);
 assert.equal((await db.query('select * from public.health_snapshots')).rows.length,1);
 for (const sql of [`insert into public.health_snapshots(client_id,date) values('bad','2026-10-02')`,`update public.push_subscriptions set endpoint='https://evil.test'`,`select public.consume_rate_limit('bad',2,60)`]) {
   await assert.rejects(db.exec(sql), /permission denied/);
 }
 console.log('PASS owner reads and client write/RPC denial');
 await db.exec('set role service_role');
 await assert.rejects(db.exec(`update public.health_snapshots set meals='{}' where client_id='one'`),/health_snapshot_shape/);
 const claim = `select public.claim_device_reminder('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','test','20000000-0000-0000-0000-000000000001') as ok`;
 assert.equal(await bool(claim),true); assert.equal(await bool(claim),false);
 await db.exec(`update public.device_reminder_deliveries set lease_until=now()-interval '1 minute'`);
 assert.equal(await bool(claim),true);
 console.log('PASS snapshot constraint and reminder lease reclaim');
 assert.equal((await db.query(`select public.enqueue_email_campaign('campaign') as n`)).rows[0].n,2);
 assert.equal((await db.query(`select public.enqueue_email_campaign('campaign') as n`)).rows[0].n,0);
 assert.equal((await db.query(`select * from public.claim_email_delivery('campaign','00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','{}')`)).rows.length,1);
 assert.equal((await db.query(`select * from public.claim_email_delivery('campaign','00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','{}')`)).rows.length,0);
 console.log('PASS email enqueue idempotence and claim exclusion');
 await db.exec(`insert into public.push_broadcast_campaigns(id,payload) values('campaign','{}')`);
 assert.equal(await bool(`select public.enqueue_push_broadcast('campaign') as ok`),true);
 assert.equal((await db.query(`select * from public.claim_push_broadcast('campaign','20000000-0000-0000-0000-000000000001')`)).rows.length,1);
 assert.equal((await db.query(`select * from public.claim_push_broadcast('campaign','20000000-0000-0000-0000-000000000002')`)).rows.length,0);
 console.log('PASS broadcast enqueue and claim exclusion');
 await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
 insert into public.medicines(id,user_id,name,dose_label,schedule_time,timezone,food_rule) values
 ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Example','1 tablet','09:00','UTC','none');
 insert into public.medicine_doses(id,medicine_id,user_id,scheduled_date,status) values
 ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','2026-10-02','taken');`);
 assert.equal((await db.query('select * from public.medicine_dose_events')).rows.length,1);
 await db.exec(`update public.medicine_doses set updated_at=now();`);
 assert.equal((await db.query('select * from public.medicine_dose_events')).rows.length,1);
 await db.exec(`update public.medicine_doses set status='skipped';`);
 assert.equal((await db.query('select * from public.medicine_dose_events')).rows.length,2);
 await assert.rejects(db.exec(`update public.medicine_dose_events set medicine_name='Changed'`),/permission denied/);
 await db.exec(`select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false)`);
 assert.equal((await db.query('select * from public.medicine_dose_events')).rows.length,0);
 await db.exec(`select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false); delete from public.medicines;`);
 assert.equal((await db.query('select * from public.medicine_dose_events')).rows.length,3);
 await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false); delete from auth.users where id='00000000-0000-0000-0000-000000000001'`);
 assert.equal((await db.query('select * from public.medicine_dose_events')).rows.length,0);
 console.log('PASS dose event insert/change/delete, no-op suppression, immutability, owner reads and account deletion');
 await db.close();
})().catch(e => { console.error(e.message); process.exitCode=1; });
