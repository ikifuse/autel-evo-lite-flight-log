// Permanent complete evidence; all Properties/Spreadsheet mutations are in memory.
const fs=require('node:fs'), vm=require('node:vm'), path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(__dirname,'regression.test.js'),'utf8');
const sandbox={require,process:{argv:['node','test',path.join(root,'dist/Code.gs')]},console,Buffer};
vm.createContext(sandbox);
vm.runInContext(source.slice(0,source.indexOf('\nfunction run() {'))+'\nglobalThis.h={makeEnvironment,makeInput,installOneShotFault,clearFault,snapshotBusiness,snapshotProperties};',sandbox);
const h=sandbox.h;
const key=id=>'EVO_LITE_COMMIT_V2_'+id+'_META';
function age(e,id,days){const m=JSON.parse(e.props.get(key(id)));m.completedAt=new Date(Date.now()-days*86400000).toISOString();e.props.set(key(id),JSON.stringify(m));return m;}
for(const test of [false,true]) for(const days of [31,366,3660]) {
  const e=h.makeEnvironment(), input=h.makeInput([{model:'EVO Lite',minutes:1}]);
  if(test)input.session.purpose='アプリテスト';
  e.context.finishAircraft(input);const original=age(e,input.session.draftId,days);
  const before=h.snapshotBusiness(e);e.cache.clear();
  // No elapsed-time dependency and no rewriting business data, even if the cache is unavailable.
  e.controls.cacheThrows=true;e.context.finishAircraft(input);
  assert.equal(h.snapshotBusiness(e),before);
  const proof=JSON.parse(e.props.get(key(input.session.draftId)));
  assert.equal(proof.signature,original.signature);assert.equal(proof.state,'complete');
  assert.equal(proof.chunkCount,0);assert(!('planHash' in proof));
  assert.equal(e.context.aircraftTotalMinutes_('EVO Lite'),test?0:1);
  const props=h.snapshotProperties(e);e.context.cleanupCommitPlans_();assert.equal(h.snapshotProperties(e),props);
  // All human edits, including deleted output sheets, remain authoritative after complete.
  const date=e.ss.getSheetByName((test?'TEST_':'')+'2026.9.6');
  date.getRange(33,4).setValue('人間の訂正');date.getRange(33,4).setHorizontalAlignment('right');
  e.ss.getSheetByName('BAT_1').getRange(13,7).setValue('BAT訂正');
  e.ss.getSheetByName('点検整備記録_EVO Lite_原本').getRange(6,7).setValue('09:09');
  const edited=h.snapshotBusiness(e);e.context.finishAircraft(input);assert.equal(h.snapshotBusiness(e),edited);
  e.ss.deleteSheet(date);const deleted=h.snapshotBusiness(e);e.context.finishAircraft(input);assert.equal(h.snapshotBusiness(e),deleted);
  const changed=JSON.parse(JSON.stringify(input));changed.session.route='違う内容';
  assert.throws(()=>e.context.finishAircraft(changed),/送信内容が変更/);assert.equal(h.snapshotBusiness(e),deleted);
  assert.equal(e.context.recoverPendingCommitPlan(input.session.draftId).success,true);
  assert.throws(()=>e.context.discardPendingTestCommitPlan(input.session.draftId),/完了済み/);
  console.log('LONG TERM '+(test?'TEST':'production')+' '+days+' days replay/manual edit/deletion/signature OK');
}
for(const test of [false,true]) for(const point of ['BEFORE_COMPLETE','AFTER_COMPLETE_META','AFTER_COMPLETE_BEFORE_RESPONSE']) {
  const e=h.makeEnvironment(), input=h.makeInput([{model:'EVO Lite',minutes:1}]);
  if(test)input.session.purpose='アプリテスト';
  h.installOneShotFault(e,point);assert.throws(()=>e.context.finishAircraft(input),/injected/);h.clearFault(e);
  let meta=JSON.parse(e.props.get(key(input.session.draftId)));
  if(meta.state!=='complete'){
    const data=[...e.props].filter(([k])=>k.includes('_DATA_'));
    meta.createdAt='2020-01-01T00:00:00Z';meta.updatedAt=meta.createdAt;e.props.set(key(input.session.draftId),JSON.stringify(meta));
    e.context.cleanupCommitPlans_();assert.deepEqual([...e.props].filter(([k])=>k.includes('_DATA_')),data);
    e.context.recoverPendingCommitPlan(input.session.draftId);
  }
  age(e,input.session.draftId,400);e.cache.clear();const before=h.snapshotBusiness(e);
  e.context.finishAircraft(input);assert.equal(h.snapshotBusiness(e),before);assert.equal(e.context.aircraftTotalMinutes_('EVO Lite'),test?0:1);
  console.log('LONG TERM fault '+(test?'TEST ':'production ')+point+' and pending retention OK');
}
for(const after of [false,true]) {
  const e=h.makeEnvironment(), input=h.makeInput([{model:'EVO Lite',minutes:1}]);e.context.finishAircraft(input);age(e,input.session.draftId,400);
  const target=key(input.session.draftId),original=e.props.get(target),before=h.snapshotBusiness(e);
  const service=e.context.PropertiesService.getScriptProperties;let hit=false;
  e.context.PropertiesService.getScriptProperties=()=>{const p=service();const set=p.setProperty;p.setProperty=(k,v)=>{
    if(!hit&&k===target){hit=true;if(after)set(k,v);throw Error('compaction storage failure');}return set(k,v);};return p;};
  e.context.cleanupCommitPlans_();assert(hit);assert(e.props.has(target));if(!after)assert.equal(e.props.get(target),original);
  e.context.PropertiesService.getScriptProperties=service;e.cache.clear();e.context.finishAircraft(input);assert.equal(h.snapshotBusiness(e),before);
}
console.log('LONG TERM compaction failure before/after setProperty keeps complete evidence OK');
{
  // Use the actual Git baseline to create old persisted records, then switch runtime.
  const source=fs.readFileSync(path.join(__dirname,'refactor-compat.test.js'),'utf8');
  const context={require,process:{argv:['node','test']},__dirname,console,Buffer};
  vm.createContext(context);
  vm.runInContext(source.slice(0,source.indexOf("checkRpcBoundary(baselineSource, 'baseline');"))+
    '\nglobalThis.h={baseline,current,copyPersistedEnvironment,persistedPlan};',context);
  const old=context.h;
  for(const isPending of [false,true]) {
    const e=old.baseline.makeEnvironment(),input=old.baseline.makeInput([{model:'EVO Lite',minutes:1}]);
    if(isPending){old.baseline.installOneShotFault(e,'AFTER_BAT_1');assert.throws(()=>e.context.finishAircraft(input),/injected/);}
    else e.context.finishAircraft(input);
    const target=old.copyPersistedEnvironment(e,old.current);
    if(isPending){
      const plan=old.persistedPlan(target,input.session.draftId);
      target.context.recoverPendingCommitPlan(input.session.draftId);
      assert.equal(JSON.parse(target.props.get(key(input.session.draftId))).planHash,plan.meta.planHash);
    }
    age(target,input.session.draftId,400);target.cache.clear();const before=old.current.snapshotBusiness(target);
    target.context.finishAircraft(input);assert.equal(old.current.snapshotBusiness(target),before);
  }
}
console.log('LONG TERM Git baseline complete/pending → current recovery and aged replay OK');
{
  const e=h.makeEnvironment(),input=h.makeInput([{model:'EVO Lite',minutes:1}]);e.context.finishAircraft(input);age(e,input.session.draftId,400);e.context.cleanupCommitPlans_();
  const proof=e.props.get(key(input.session.draftId));
  // Fill the existing store using complete evidence, not giant unrealistic single properties.
  for(let i=1;e.context.propertyStorageBytes_()<399*1024;i++){
    const id='op_10000000-0000-4000-8000-'+String(i).padStart(12,'0');
    const p=JSON.parse(proof);p.draftId=id;e.props.set(key(id),JSON.stringify(p));
  }
  const bytes=e.context.propertyStorageBytes_(),before=h.snapshotBusiness(e),props=h.snapshotProperties(e);
  e.cache.clear();e.context.finishAircraft(input);assert.equal(h.snapshotBusiness(e),before);
  assert.throws(()=>e.context.finishAircraft(h.makeInput([{model:'EVO Lite',minutes:2}])),/空き容量/);
  assert.equal(h.snapshotBusiness(e),before);assert.equal(h.snapshotProperties(e),props);
  console.log('LONG TERM capacity '+bytes+' bytes: existing replay works, new save stops, no proof eviction OK');
  console.log('Permanent proof key+value bytes: '+(Buffer.byteLength(key(input.session.draftId))+Buffer.byteLength(proof)));
}
{
  const e=h.makeEnvironment(),input=h.makeInput([{model:'EVO Lite',minutes:1}]);
  e.ss.getSheetByName('日常点検').getRange(32,10).setValue('飛行の安全に影響のあった事項');
  input.session.flights[0].safetyIssue=true;input.session.flights[0].safetyDetail='安全事項の実原本別名';
  e.context.finishAircraft(input);
  assert.equal(e.ss.getSheetByName('2026.9.6').getRange(33,10).getValue(),'安全事項の実原本別名');
}
console.log('REAL HEADER safety alias records supplied detail OK');
