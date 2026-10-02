const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}, extra = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, require: id => id in mocks ? mocks[id] : require(id), Date, Intl, Set, Map, File, Blob, ...extra });
  return exports;
}
const report = load('lib/health-report.ts');
const options = { start: '2026-10-01', end: '2026-10-02', includeName: true, includeMedicines: true };
test('report validates real dates, inclusive period and portable filename', () => {
  assert.equal(report.validateReportRange('2026-10-01', '2026-10-01'), 1);
  for (const pair of [['2026-02-30','2026-03-01'], ['2026-10-02','2026-10-01'], ['2026-01-01','2026-06-01'], ['../bad','2026-10-01']]) assert.throws(() => report.validateReportRange(...pair));
  assert.equal(report.reportFilename(options), 'health-report-2026-10-01-to-2026-10-02.pdf');
});
test('report excludes deselected personal/medicine data and default uncompleted sleep, images and contacts', () => {
  const model = { options: { ...options, includeName: false, includeMedicines: false }, generatedAt: 'now', days: [{ date:'2026-10-01', profile:{name:'Private Name',email:'private@example.test'}, water:250, sleep:{hours:8,minutes:0}, sleep_check_completed:false, meals:[{type:'lunch',status:'logged',image:'https://secret-photo',description:'Rice'}] }], doses:[{medicine_id:'m', scheduled_date:'2026-10-01',status:'taken'}], medicines:[{id:'m', name:'Private Medicine'}] };
  const output=report.reportLines(model).join('\n');
  for(const secret of ['Private Name','private@example.test','Private Medicine','secret-photo','8h']) assert.equal(output.includes(secret), false);
  assert.ok(output.includes('Sleep: not recorded')); assert.ok(output.includes('Meals logged: 1')); assert.ok(output.includes('Rice'));
});
function database({ fail, switchUser = false, pageSize = 1 } = {}) {
  const calls=[]; let authCalls=0;
  const db = { auth:{getUser:async()=>({data:{user:{id:switchUser && ++authCalls > 1 ? 'other' : 'owner'}}})}, from(table) {
    const query = { filters: [], select(value){calls.push([table,'select',value]);return this;}, eq(k,v){this.filters.push([k,v]); calls.push([table,k,v]);return this;}, gte(){return this;}, lte(){return this;}, order(){return this;}, in(){return this;}, limit(){return this;}, range(from,to){this.offset=from;calls.push([table,'range',from,to]);return this;}, then(resolve){
      let data=[];
      if(table==='health_snapshots')data=[{date:'2026-10-01',profile:{},meals:[],water:0,sleep:{},sleep_check_completed:false}];
      if(table==='medicine_doses')data=this.offset===0 ? Array.from({length:pageSize},(_,i)=>({id:String(i),medicine_id:'m',scheduled_date:'2026-10-01',status:'taken'})) : [];
      if(table==='medicines')data=[{id:'m',name:'Example',dose_label:'one'}];
      return Promise.resolve({data,error:table===fail ? {message:'database failed'} : null}).then(resolve);
    }}; return query;
  }};
  const {loadHealthReport}=load('lib/health-report-data.ts', {'@/lib/supabase/client':{createSupabaseBrowserClient:()=>db}, '@/lib/health-report':report});
  return {loadHealthReport,calls};
}
test('report loads owned date-range data and paginates doses instead of silently truncating', async()=>{
  const h=database({pageSize:500});const result=await h.loadHealthReport(options);
  assert.equal(result.report.doses.length,500); assert.equal(result.owner,'owner');
  for(const table of ['health_snapshots','medicine_doses','medicines']) assert.ok(h.calls.some(c=>c[0]===table&&c[1]==='user_id'&&c[2]==='owner'));
  assert.ok(h.calls.some(c=>c[1]==='range'&&c[2]===500));
});
test('report aborts on data errors or account switch and does not fetch excluded medicines', async()=>{
  await assert.rejects(database({fail:'health_snapshots'}).loadHealthReport(options),/Could not load health/);
  await assert.rejects(database({fail:'medicine_doses'}).loadHealthReport(options),/Could not load medicine/);
  await assert.rejects(database({switchUser:true}).loadHealthReport(options),/account changed/);
  const h=database({fail:'medicine_doses'});await h.loadHealthReport({...options,includeMedicines:false});assert.equal(h.calls.some(c=>c[0]==='medicine_doses'),false);
});
test('native sharing receives the report file; unsupported and cancelled sharing are not success', async()=>{
  const {shareReportFile}=load('lib/report-sharing.ts'); const file=new File(['hello'],'report.pdf',{type:'application/pdf'});
  let received;
  assert.equal(await shareReportFile(file,{canShare:()=>true,share:async data=>{received=data;}}),'shared'); assert.equal(received.files[0],file);
  assert.equal(await shareReportFile(file,{}),'unsupported');
  assert.equal(await shareReportFile(file,{canShare:()=>false,share:async()=>{throw Error('should not send');}}),'unsupported');
  assert.equal(await shareReportFile(file,{canShare:()=>true,share:async()=>{throw {name:'AbortError'};}}),'cancelled');
  await assert.rejects(shareReportFile(file,{canShare:()=>true,share:async()=>{throw Error('denied');}}),/Download/);
});
test('PDF produces a real multi-page document for longer reports', async()=>{
  const context={font:'',measureText:s=>({width:s.length*6})};
  const {createHealthReportPdf}=load('lib/health-report-pdf.ts', {'@/lib/health-report':report}, {document:{createElement:()=>({getContext:()=>context})}});
  const days=Array.from({length:30},(_,i)=>({date:`2026-09-${String(i+1).padStart(2,'0')}`,profile:{name:'Example'},meals:[{type:'lunch',status:'logged',description:'A long description '.repeat(20)}],water:500,sleep:{hours:7,minutes:30},sleep_check_completed:true}));
  const blob=await createHealthReportPdf({options:{...options,start:'2026-09-01',end:'2026-09-30'},generatedAt:'now',days,doses:[],medicines:[]});
  const bytes=Buffer.from(await blob.arrayBuffer()).toString('latin1');
  assert.ok(bytes.startsWith('%PDF-')); assert.ok((bytes.match(/\/Type \/Page\b/g)||[]).length > 1);assert.equal(blob.type,'application/pdf');
});
