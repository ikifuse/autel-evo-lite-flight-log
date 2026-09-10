// Focused post-split audit: real entrypoints, in-memory GAS and browser fixtures.
// No external data is accessed. Run after build: node tests/audit-safety.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
function fixture(file, boundary, exports) {
  const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
  assert(source.includes(boundary));
  const context = {require, process:{argv:['node','test',path.join(root,'dist/Code.gs')]}, __dirname, console, Buffer};
  vm.createContext(context);
  vm.runInContext(source.slice(0,source.indexOf(boundary)) + '\nglobalThis.fixture={' + exports + '};', context);
  return context.fixture;
}
const server = fixture('regression.test.js','\nfunction run() {','makeEnvironment,makeInput,installOneShotFault,snapshotBusiness,snapshotProperties');
const web = fixture('web-compat.test.js','async function run(){','browser,currentSource,startPayload');
const clone = x => JSON.parse(JSON.stringify(x));
const metaKey = id => 'EVO_LITE_COMMIT_V2_' + id + '_META';
function pending() {
  const e = server.makeEnvironment();
  const input = server.makeInput([{model:'EVO Lite',minutes:1}]);
  server.installOneShotFault(e,'AFTER_PLAN_PERSISTED');
  assert.throws(()=>e.context.finishAircraft(input),/injected/);
  e.context.COMMIT_FAULT_INJECTOR = null;
  vm.runInContext('COMMIT_FAULT_INJECTOR=null',e.context);
  return {e,input};
}
for (const corruption of ['{broken','null',JSON.stringify({draftId:'wrong',state:'failed'})]) {
  const {e,input} = pending();
  e.props.set(metaKey(input.session.draftId),corruption);
  const before = server.snapshotProperties(e);
  e.context.cleanupCommitPlans_();
  assert.equal(server.snapshotProperties(e),before,'corrupt META must retain all DATA');
  assert.throws(()=>e.context.diagnosePendingCommitPlans(),/META/,'corruption must not report no pending');
  const business = server.snapshotBusiness(e);
  assert.throws(()=>e.context.finishAircraft(server.makeInput([{model:'EVO Lite',minutes:1}])),/META/);
  assert.equal(server.snapshotBusiness(e),business,'new save must stop before writes');
}
{
  const e=server.makeEnvironment();
  e.props.set(metaKey('orphan').replace('_META','_DATA_0'),'orphan');
  e.context.cleanupCommitPlans_();
  assert.equal(e.props.size,0,'genuine orphan cleanup is preserved');
}
console.log('AUDIT corrupt META retains DATA, diagnosis/new save stop, genuine orphan cleanup OK');
{
  const {e,input}=pending();
  const target=metaKey(input.session.draftId).replace('_META','_DATA_0');
  e.props.set(metaKey('op_00000000-0000-4000-8000-000000009999'),JSON.stringify({
    version:2,draftId:input.session.draftId,state:'complete',chunkCount:2
  }));
  const data=e.props.get(target);
  e.context.cleanupCommitPlans_();
  assert.equal(e.props.get(target),data,'mismatched complete META must not delete another plan');
}
for (const name of ['recoverPendingCommitPlan','discardPendingTestCommitPlan']) {
  for(const id of ['invalid',{},['invalid'],'op_'+'x'.repeat(5000)]) {
    const e=server.makeEnvironment();
    e.context.LockService.getScriptLock=()=>{throw Error('must not lock');};
    assert.throws(()=>e.context[name](id),/運航下書きID/);
    assert.equal(e.props.size,0);
  }
}
{
  const {e,input}=pending();
  const meta=JSON.parse(e.props.get(metaKey(input.session.draftId)));meta.version=999;
  e.props.set(metaKey(input.session.draftId),JSON.stringify(meta));
  const reports=e.context.diagnosePendingCommitPlans();
  assert.equal(reports[0].safeToRecover,false);assert.equal(reports[0].safeToDiscardTest,false);
  assert.throws(()=>e.context.recoverPendingCommitPlan(input.session.draftId),/安全条件/);
}
console.log('AUDIT recovery/discard UUID validation before Lock, unknown version safely rejected OK');
for(const category of ['SAFE_TO_RECOVER','SAFE_TO_DISCARD_TEST']) {
  const e=web.browser(web.currentSource), w=e.context;
  w.openCommitDiagnosisModal();
  const id="x');globalThis.INJECTED=true;//\"<img src=x onerror=alert(1)>";
  w.renderCommitDiagnosisResult([{draftId:id,state:'failed',stage:'PLAN_READY',statusCategory:category,
    chunksComplete:true,planHashMatches:true,safeToRecover:category==='SAFE_TO_RECOVER',
    operationCounts:{before:0,intended:0,conflict:0,total:0},aircraftTotals:{matched:0,targets:0}}]);
  const html=e.elements.get('diagModalBody').innerHTML;
  assert(!html.includes('<img'));
  const handler=html.match(/onclick="(execute(?:CommitRecovery|TestCommitDiscard)[^"]+)"/)[1];
  let received;
  w.executeCommitRecovery=w.executeTestCommitDiscard=value=>{received=value;};
  w.testButton={dataset:{draftId:id}};
  vm.runInContext('(function(){'+handler+'}).call(testButton)',w);
  assert.equal(received,id);assert.equal(w.INJECTED,undefined);
}
console.log('AUDIT diagnosis action handlers treat malicious draftId as data OK');
for(const count of [0,1,7,8,14,28,30]) {
  const e=web.browser(web.currentSource),w=e.context;
  w.callServer('startAircraft',clone(web.startPayload));
  w.callServer('savePreflight',{checks:Object.fromEntries(w.PRE_NAMES.map(n=>[n,'正常'])),battery:1});
  for(let i=0;i<count;i++) {
    w.callServer('startFlight',{battery:1,takeoffLocation:'A'});
    w.callServer('completeLanding');
    w.callServer('landFlight',{landingLocation:'A',actualMinutes:'1'});
    if(i<count-1){w.callServer('continueFlight');w.callServer('confirmBatteryChange',{battery:1});}
  }
  w.callServer('startPostflight');
  const post={inspectionLocation:'A',confirmer:'試験者',aircrafts:{'EVO Lite':{checks:Object.fromEntries(w.POST_NAMES.map(n=>[n,'正常'])),abnormal:false}}};
  w.callServer('finishAircraft',post);
  const payload=e.pending.at(-1).args[0];
  assert(!('navigationHistory' in payload.session));
  assert(w.STATE.session.navigationHistory.length>0);
  const saved=JSON.parse(e.storage.get('EVO_LITE_ACTIVE_OPERATION_V2'));
  assert(saved.navigationHistory.length>0,'local back history must remain intact');
  const gas=server.makeEnvironment();
  const oldPayload={session:saved,postflight:post};
  const normalized=gas.context.normalizedCommitInput_(payload);
  assert.equal(gas.context.canonicalJson_(normalized),gas.context.canonicalJson_(gas.context.normalizedCommitInput_(oldPayload)));
  gas.context.assertInputComplexity_(payload,{maxBytes:512*1024,maxProperties:5000,maxDepth:8,maxArrayItems:100},'送信データ');
  gas.context.assertInputComplexity_(normalized,{maxBytes:128*1024,maxProperties:500,maxDepth:8,maxArrayItems:100},'保存データ');
  gas.context.validateCommitBusinessInput_(normalized);
  gas.context.finishAircraft(payload);
  assert.equal(JSON.parse(gas.props.get(metaKey(payload.session.draftId))).state,'complete');
  console.log('AUDIT Web → server '+count+' flights: input bounds, exact normalized input, complete OK');
}
