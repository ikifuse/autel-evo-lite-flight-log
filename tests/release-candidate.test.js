// RC safety probes: local mocks only; never access live GAS/Properties.
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(__dirname, 'regression.test.js'), 'utf8');
const sandbox = {require, process:{argv:['node','test',path.join(root,'dist/Code.gs')]}, console, Buffer};
vm.createContext(sandbox);
vm.runInContext(source.slice(0,source.indexOf('\nfunction run() {')) + '\nglobalThis.h={makeEnvironment,makeInput,snapshotBusiness,installOneShotFault,clearFault};',sandbox);
const h = sandbox.h;
for (const test of [false,true]) for (const zero of [false,true]) {
  for (const [row,col] of [[9,3],[11,3],[12,3],[13,3],[11,12],[19,3],[19,10],[21,10],...(!zero?[[32,4],[32,5],[32,10]]:[])]) {
    const e=h.makeEnvironment(), input=h.makeInput([{model:'EVO Lite',minutes:1}]);
    if(test) input.session.purpose='アプリテスト';
    if(zero) input.session.flights=[];
    e.ss.getSheetByName('日常点検').getRange(row,col).setValue('');
    assert.throws(()=>e.context.finishAircraft(input),/必須帳票欄/,'missing '+row+','+col);
    assert.equal(e.props.size,0,'invalid structure persisted a plan');
    assert.equal(e.context.aircraftTotalMinutes_('EVO Lite'),0);
    assert.equal(e.ss.getSheetByName('BAT_1').getRange(13,1).getValue(),'');
  }
}
// Existing fixed plans never invoke new-plan writers or reconstruct missing operations.
for (const complete of [false,true]) {
  const e=h.makeEnvironment(), input=h.makeInput([{model:'EVO Lite',minutes:1}]);
  if(!complete) h.installOneShotFault(e,'AFTER_BAT_1');
  if(complete)e.context.finishAircraft(input);else assert.throws(()=>e.context.finishAircraft(input),/injected/);
  h.clearFault(e);
  e.ss.getSheetByName('2026.9.6').getRange(12,3).setValue('');
  e.context.buildFixedCommitPlan_=()=>{throw Error('must not regenerate');};
  e.context.finishAircraft(input);
  assert.equal(e.context.aircraftTotalMinutes_('EVO Lite'),1);
  assert.equal(e.ss.getSheetByName('2026.9.6').getRange(12,3).getValue(),'');
}
console.log('RC mandatory headers / section-specific checks / TEST-production / zero-flight / pending-complete PASS');
const webSource=fs.readFileSync(path.join(__dirname,'web-compat.test.js'),'utf8');
const webContext={require,process:{argv:['node','test']},__dirname,console,Buffer};
vm.createContext(webContext);
vm.runInContext(webSource.slice(0,webSource.indexOf('async function run(){'))+'\nglobalThis.h={browser,currentSource,startPayload,DRAFT};',webContext);
const w=webContext.h;
for(const phase of ['PRE','READY','BATTERY_CHANGE','LANDING','POST_ALL']) {
  const e=w.browser(w.currentSource);e.context.callServer('startAircraft',w.startPayload);
  e.context.STATE.session.phase=phase;e.context.render();
  const id={PRE:'abnormalDetail',READY:'takeoffLocation',BATTERY_CHANGE:'changeBatteryCycle',LANDING:'batteryNote',POST_ALL:'post_0_defectDetail'}[phase];
  for(const event of ['input','change','pagehide']) {
    e.field(id,'未確定日本語 '+event);e.listeners[event]();
    assert(e.storage.get(w.DRAFT).includes('未確定日本語 '+event),phase+' '+event);
    const restored=w.browser(w.currentSource,{[w.DRAFT]:e.storage.get(w.DRAFT)});
    assert(JSON.stringify(restored.context.STATE.session).includes('未確定日本語 '+event));
  }
}
for(const storageThrows of [false,true]) {
  const e=w.browser(w.currentSource,{}, {storageThrows});e.context.callServer('startAircraft',w.startPayload);
  e.context.navigator.onLine=false;e.context.callServer('finishAircraft',{inspectionLocation:'圏外で入力'});
  assert.equal(e.pending.length,0);assert.equal(e.context.STATE.session.pendingPostflightInput.inspectionLocation,'圏外で入力');
  if(storageThrows){assert.equal(e.context.persistOperationDraft(),false);assert(!e.events.some(x=>x[0]==='alert'&&x[1].includes('端末に保存しました')));}
  else assert(e.storage.get(w.DRAFT).includes('圏外で入力'));
}
// setItem returning successfully is insufficient if the backend does not retain the value.
{
  const e=w.browser(w.currentSource);e.context.callServer('startAircraft',w.startPayload);
  e.context.localStorage.setItem=()=>{};e.context.STATE.session.route='new unsaved route';
  assert.equal(e.context.persistOperationDraft(),false);
}
for(const iso of ['2026-09-09T14:59:59Z','2026-09-09T15:10:00Z','2027-01-01T00:00:00Z']) {
  const e=w.browser(w.currentSource);e.context.Date.now=()=>Date.parse(iso);
  e.context.callServer('startAircraft',w.startPayload);
  const jst=new Date(Date.parse(iso)+9*3600000), expected=jst.getUTCFullYear()+'.'+(jst.getUTCMonth()+1)+'.'+jst.getUTCDate();
  assert.equal(e.context.STATE.session.operationDate,expected);
  e.context.Date.now=()=>Date.parse(iso)+3*86400000;e.context.callServer('startPostflight');
  assert.equal(e.context.STATE.session.operationDate,expected,'existing operation date changed');
}
console.log('RC autosave/reload/pagehide/offline/storage failure/readback/JST rollover PASS');
for(const test of [false,true]) for(const count of [0,1,7,8,14,28,30]) {
  const e=w.browser(w.currentSource), c=e.context;
  c.Date.now=()=>Date.parse('2026-09-09T03:00:00Z');
  const start={...w.startPayload,purpose:test?'アプリテスト':'操縦練習',weather:'晴',windSpeed:'2〜3m/s 穏やか',windDir:'北',route:'日本語試験場（北緯35.1234, 東経139.1234）'};
  c.saveLastOperation(start);c.applyLastOperation();
  // Actual start form -> workflow -> final RPC. No server fixture payload.
  e.field('purpose',start.purpose);e.field('route',start.route);e.field('inspectionLocation','点検場');e.field('pilot','試験者');
  e.field('weatherVal',start.weather);e.field('windSpeedVal',start.windSpeed);e.field('windDirVal',start.windDir);
  c.submitStartOperation();
  const normal=names=>Object.fromEntries(names.map(n=>[n,'正常']));
  c.callServer('savePreflight',{checks:normal(c.PRE_NAMES),battery:1});
  for(let i=0;i<count;i++) {
    if(i && i===Math.floor(count/2)) {c.callServer('switchAircraft',{targetModel:'EVO Lite+'});c.callServer('savePreflight',{checks:normal(c.PRE_NAMES),battery:1});}
    else if(i){c.callServer('continueFlight');c.callServer('confirmBatteryChange',{battery:Math.floor(i/2)%7+1});}
    c.callServer('startFlight',{takeoffLocation:'=日本語の離陸場所'});c.callServer('completeLanding');
    c.callServer('landFlight',{landingLocation:'+日本語の着陸場所',actualMinutes:'1',safetyIssue:true,safetyDetail:'@試験事項',batteryNote:'-異常なし'});
  }
  c.callServer('startPostflight');e.field('postLocation','最終点検場所');e.field('confirmer','確認者');
  Object.keys(c.STATE.session.aircrafts).filter(m=>c.STATE.session.aircrafts[m].used).forEach((m,i)=>c.POST_NAMES.forEach((_,j)=>e.field('post_'+i+'_'+j,'',true)));
  c.submitAllPostflight();
  const payload=e.pending.at(-1).args[0], gas=h.makeEnvironment();
  gas.context.finishAircraft(payload);
  const before=h.snapshotBusiness(gas);gas.context.finishAircraft(payload);assert.equal(h.snapshotBusiness(gas),before);
  assert.equal(gas.context.aircraftTotalMinutes_('EVO Lite')+gas.context.aircraftTotalMinutes_('EVO Lite+'),test?0:count);
  for(const sheet of Object.values(gas.ss.sheets)) assert.equal(Object.keys(sheet.formulas).length,0,'formula injected');
  console.log('RC form → Web → server '+(test?'TEST ':'production ')+count+' flights / sameBAT / rotation / weather / GPS / Japanese / formula / replay PASS');
}
for(const method of ['getProperty','getProperties']) {
  const e=h.makeEnvironment(), input=h.makeInput([{model:'EVO Lite',minutes:1}]);
  const service=e.context.PropertiesService.getScriptProperties;
  e.context.PropertiesService.getScriptProperties=()=>{const p=service();p[method]=()=>{throw Error('injected Properties read');};return p;};
  const before=h.snapshotBusiness(e);assert.throws(()=>e.context.finishAircraft(input),/injected/);assert.equal(h.snapshotBusiness(e),before);
  e.context.PropertiesService.getScriptProperties=service;e.context.finishAircraft(input);assert.equal(e.context.aircraftTotalMinutes_('EVO Lite'),1);
}
for(const nth of [1,2,3,4,5,6]) {
  const e=h.makeEnvironment(), input=h.makeInput([{model:'EVO Lite',minutes:1}]);
  let calls=0;const flush=e.context.SpreadsheetApp.flush;e.context.SpreadsheetApp.flush=()=>{if(++calls===nth)throw Error('injected flush');return flush();};
  assert.throws(()=>e.context.finishAircraft(input),/injected/);e.context.SpreadsheetApp.flush=flush;
  e.context.finishAircraft(input);assert.equal(e.context.aircraftTotalMinutes_('EVO Lite'),1);
  assert.equal(e.ss.getSheetByName('BAT_1').getRange(14,1).getValue(),'');
}
for(const [row,col] of [[4,3],[24,10],[25,12],[26,12],[27,10],[28,10],[43,6]]) {
  const e=h.makeEnvironment(), input=h.makeInput([{model:'EVO Lite',minutes:1}]);
  input.postflight.aircrafts['EVO Lite'].checks['発熱']='異常';
  input.postflight.aircrafts['EVO Lite'].defectDetail='発熱確認';
  e.ss.getSheetByName('日常点検').getRange(row,col).setValue('');
  assert.throws(()=>e.context.finishAircraft(input),/必須帳票欄/);assert.equal(e.props.size,0);
}
for(const zero of [false,true]) {
  const e=h.makeEnvironment(), input=h.makeInput([{model:'EVO Lite',minutes:1}]);if(zero)input.session.flights=[];
  e.ss.getSheetByName('BAT_1').getRange(12,7).setValue('');
  if(zero)e.context.finishAircraft(input);else assert.throws(()=>e.context.finishAircraft(input),/必須帳票欄/);
}
console.log('RC Properties get failures / all flush boundaries / conditional mandatory fields PASS');

for(const [seed,options] of [[{[w.DRAFT]:'{broken'},{}],[{},{storageThrows:true}]]) {
  const e=w.browser(w.currentSource,seed,options);
  assert(e.events.some(event=>event[0]==='alert'&&event[1].includes('下書きを読み込めません')));
  if(seed[w.DRAFT]) assert.equal(e.storage.get(w.DRAFT),seed[w.DRAFT]);
}
console.log('RC corrupt/unreadable local draft warns without removal PASS');
for(const extra of [0,1]) {
  const e=w.browser(w.currentSource), c=e.context;c.Date.now=()=>Date.parse('2026-09-09T03:00:00Z');
  c.callServer('startAircraft',{...w.startPayload,route:'場'.repeat(500+extra)});
  c.callServer('savePreflight',{checks:Object.fromEntries(c.PRE_NAMES.map(n=>[n,'正常'])),battery:1});
  c.callServer('startFlight',{takeoffLocation:'離'.repeat(500)});c.callServer('completeLanding');
  c.callServer('landFlight',{landingLocation:'着'.repeat(500),actualMinutes:'1',safetyIssue:true,safetyDetail:'詳'.repeat(2000),batteryNote:'所'.repeat(1000)});
  c.callServer('startPostflight');c.callServer('finishAircraft',{inspectionLocation:'点検場',confirmer:'確認者',aircrafts:{'EVO Lite':{checks:Object.fromEntries(c.POST_NAMES.map(n=>[n,'正常']))}}});
  const gas=h.makeEnvironment(), payload=e.pending.at(-1).args[0];
  if(extra){const before=h.snapshotBusiness(gas);assert.throws(()=>gas.context.finishAircraft(payload),/500|文字/);assert.equal(h.snapshotBusiness(gas),before);}
  else gas.context.finishAircraft(payload);
}
console.log('RC Web payload Japanese boundary 500/501 and 2000-detail/1000-note PASS');
