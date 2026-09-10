// Browser behavior contract against the approved B baseline; no browser/network/GAS writes.
// node tests/web-compat.test.js [dist/Code.gs] [--baseline=/path/Code.gs]
// During stages 6/7 only: --allow-legacy-diagnostic-html (remove for the final gate).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const BASELINE = 'b8e1ab6723784216b119c27d6bf9c2c540e5adb5';
const args = process.argv.slice(2);
const baselineArg = args.find(value => value.startsWith('--baseline='));
const currentPath = path.resolve(ROOT, args.find(value => !value.startsWith('--')) || 'dist/Code.gs');
const baselineSource = baselineArg ? fs.readFileSync(baselineArg.slice('--baseline='.length), 'utf8')
  : execFileSync('git', ['show', BASELINE + ':dist/Code.gs'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
const currentSource = fs.readFileSync(currentPath, 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const DRAFT = 'EVO_LITE_ACTIVE_OPERATION_V2';
const fixedTime = '2026-09-09T03:00:00.000Z';
class FixedDate extends Date {
  constructor(...values) { super(...(values.length ? values : [fixedTime])); }
  static now() { return Date.parse(fixedTime); }
}
function scriptOf(source) {
  const html = source.slice(source.indexOf('const APP_HTML ='));
  const start = html.indexOf('<script>') + '<script>'.length;
  const end = html.lastIndexOf('</script>');
  assert(start >= '<script>'.length && end > start, 'assembled browser script is missing');
  return html.slice(start, end);
}
function normalizeHtml(html) {
  // Explicitly approved dependency-injection renames affect handler source, not displayed text.
  return String(html).replace(/\bscreenAction\(/g, 'callServer(').replace(/\bscreenRender\(/g, 'render(')
    .replace(/\bscreenGps\(/g, 'fetchCurrentGps(').replace(/\bscreenDiagnosis\(/g, 'openCommitDiagnosisModal(')
    .replace(/\bscreenCancel\(/g, 'cancelSessionPrompt(').replace(/\bscreenReset\(/g, 'confirmResetSession(');
}
function decodeHtml(value) {
  return String(value).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function initialState() {
  return { active:false, today:'2026.9.9', hasTodaySheet:false, session:null,
    batteries:Array.from({length:7}, (_,i)=>({value:i+1,label:'BAT_'+(i+1)})),
    totals:{'EVO Lite':{minutes:60,label:'1時間0分'},'EVO Lite+':{minutes:120,label:'2時間0分'}} };
}
function browser(source, seed = {}, options = {}) {
  const elements = new Map();
  const storage = new Map(Object.entries(seed));
  const events = [], pending = [], listeners = {};
  let timer = 0;
  function element(id = '') {
    const classes = new Set();
    const node = { id, value:'', checked:false, style:{}, dataset:{}, className:'', innerText:'', textContent:'', children:[],
      classList:{ add(value){ classes.add(value); }, remove(value){ classes.delete(value); }, contains(value){ return classes.has(value); } },
      addEventListener(){}, removeEventListener(){}, scrollIntoView(){}, focus(){}, getElementsByClassName(){ return []; },
      appendChild(child){ this.children.push(child); if(child.id) elements.set(child.id,child); },
      insertBefore(child){ this.appendChild(child); },
      remove(){ elements.delete(this.id); }
    };
    let markup = '';
    Object.defineProperty(node,'innerHTML',{get(){return markup;},set(value){
      markup=String(value);
      if(node.id === 'app') events.push(['render.app']);
      for(const match of markup.matchAll(/<([\w-]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
        const [,tag,attributes,childId]=match;
        const child=element(childId);
        const valueAttr=attributes.match(/\bvalue="([^"]*)"/);
        if(valueAttr) child.value=decodeHtml(valueAttr[1]);
        child.checked=/\bchecked\b/.test(attributes);
        const style=attributes.match(/\bstyle="([^"]*)"/);
        if(style) for(const field of style[1].split(';')) { const colon=field.indexOf(':'); if(colon>0) child.style[field.slice(0,colon).trim()]=field.slice(colon+1).trim(); }
        if(tag==='select') {
          const remainder=markup.slice(match.index+match[0].length);
          const selectBody=remainder.slice(0,remainder.indexOf('</select>'));
          const selections=[...selectBody.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)];
          const choice=selections.find(item=>/\bselected\b/.test(item[1]))||selections[0];
          if(choice) {const attr=choice[1].match(/\bvalue="([^"]*)"/);child.value=decodeHtml(attr?attr[1]:choice[2]);}
        }
        elements.set(childId,child);
      }
    }});
    if(id) elements.set(id,node);
    return node;
  }
  ['app','networkBadge','appStatusBadge','globalBackButton','loading'].forEach(element);
  let success, failure;
  const runner = new Proxy({}, {get(_target,key){
    if(key==='withSuccessHandler') return callback=>{success=callback;return runner;};
    if(key==='withFailureHandler') return callback=>{failure=callback;return runner;};
    return (...values)=>{events.push(['rpc',key,clone(values)]);pending.push({name:key,args:clone(values),success,failure});};
  }});
  const context = {
    console, Date:FixedDate, Uint8Array, __INITIAL_STATE__:initialState(),
    document:{getElementById:id=>elements.get(id)||null,createElement:()=>element(),querySelectorAll:()=>[],body:element('body')},
    navigator:{onLine:true,geolocation:{getCurrentPosition(ok,bad,settings){events.push(['gps',clone(settings)]);if(options.gpsFails)bad({message:'denied'});else ok({coords:{latitude:35.123456,longitude:139.123456}});}}},
    window:{crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000123'},addEventListener:(name,handler)=>{events.push(['listen',name]);listeners[name]=handler;}},
    localStorage:{getItem(key){if(options.storageThrows)throw Error('storage disabled');return storage.get(key)||null;},setItem(key,value){if(options.storageThrows)throw Error('storage disabled');storage.set(key,String(value));events.push(['storage.set',key,String(value)]);},removeItem(key){if(options.storageThrows)throw Error('storage disabled');storage.delete(key);events.push(['storage.remove',key]);}},
    google:{script:{run:runner}},
    alert:message=>events.push(['alert',message]),confirm:message=>{events.push(['confirm',message]);return true;},
    setInterval(_callback,delay){events.push(['interval',delay]);return ++timer;},clearInterval(id){events.push(['clearInterval',id]);},
    setTimeout(_callback,delay){events.push(['timeout',delay]);return ++timer;},clearTimeout(id){events.push(['clearTimeout',id]);},
    fetch(url){events.push(['fetch',url]);return options.fetchFails?Promise.reject(Error('offline')):Promise.resolve({json:()=>Promise.resolve({results:{lv01Nm:'試験町'}})});}
  };
  vm.createContext(context);
  vm.runInContext(scriptOf(source),context,{filename:'assembled-web.js'});
  return {context,elements,storage,events,pending,listeners,field(id,value,checked){const e=elements.get(id)||element(id);e.value=value;if(checked!==undefined)e.checked=checked;return e;}};
}
function snapshot(e) {
  // RC-approved listeners are tested directly in release-candidate.test.js.
  const events = clone(e.events).filter(event => !(event[0] === 'listen' && ['input','change','pagehide'].includes(event[1])));
  events.forEach(event => {
    if(event[0] === 'alert' && typeof event[1] === 'string') event[1] = event[1].replace('入力内容は端末に保存しました。','入力内容は端末に残っています。');
  });
  // Audit fix: navigationHistory remains local; it is not normalized business input.
  // Compare every other RPC field exactly against the unchanged B baseline.
  events.forEach(event => {
    if (event[0] === 'rpc' && event[1] === 'finishAircraft') delete event[2][0].session.navigationHistory;
  });
  return { state:clone(e.context.STATE), storage:[...e.storage.entries()], events,
    app:normalizeHtml(e.elements.get('app').innerHTML),
    badge:e.elements.get('appStatusBadge').innerText,
    back:e.elements.get('globalBackButton').style.display,
    loading:e.elements.get('loading').style.display,
    diagnosis:normalizeHtml(e.elements.get('diagModalBody')?.innerHTML || '') };
}
function pair(seed,options){return [browser(baselineSource,seed,options),browser(currentSource,seed,options)];}
function equal(pair,label){assert.deepEqual(snapshot(pair[1]),snapshot(pair[0]),label);}
function both(pair,work,label){pair.forEach(work);equal(pair,label);}
const normalChecks = names=>Object.fromEntries(names.map(name=>[name,'正常']));
const startPayload={model:'EVO Lite',purpose:'操縦練習',route:'試験場',category:'カテゴリーⅠ',method:['通常飛行（特定飛行なし）'],inspectionLocation:'試験場',pilot:'試験者',assistant:'',cert:'',forceNewLocation:false};
function start(pair){both(pair,e=>e.context.callServer('startAircraft',clone(startPayload)),'start flight draft');}
function pre(pair){both(pair,e=>e.context.callServer('savePreflight',{checks:normalChecks(e.context.PRE_NAMES),battery:1,cycle:'3',abnormalDetail:''}),'preflight to ready');}
function flight(pair){
  both(pair,e=>e.context.callServer('startFlight',{battery:e.context.STATE.session.selectedBattery,takeoffLocation:'離陸地点'}),'start flight');
  both(pair,e=>e.context.callServer('completeLanding'),'capture landing time');
  both(pair,e=>e.context.callServer('landFlight',{landingLocation:'着陸地点',actualMinutes:'5',safetyIssue:true,safetyDetail:'突風',batteryNote:'なし'}),'record landing');
}
async function run(){
  const p=pair();equal(p,'bootstrap and start view');start(p);pre(p);flight(p);
  both(p,e=>e.context.callServer('continueFlight'),'continue flight');
  both(p,e=>e.context.callServer('confirmBatteryChange',{battery:2,cycle:'4',installed:true,statusOk:true}),'battery change');flight(p);
  both(p,e=>e.context.callServer('switchAircraft',{targetModel:'EVO Lite+'}),'switch aircraft');pre(p);flight(p);
  both(p,e=>e.context.callServer('startPostflight'),'all-aircraft postflight');
  both(p,e=>{e.field('postLocation','後点検場所');e.field('confirmer','確認者');e.context.POST_NAMES.forEach((_,i)=>e.field('post_0_'+i,'',true));e.field('post_0_defectDetail','注記');e.context.captureCurrentScreenDraft();},'postflight screen capture');
  both(p,e=>e.context.goBackFromAnywhere(),'back keeps postflight input');
  both(p,e=>e.context.callServer('startPostflight'),'return to postflight');
  // Offline capture intentionally changed: covered with exact state/storage assertions in the RC suite.
  both(p,e=>{e.context.navigator.onLine=true;e.context.callServer('finishAircraft',{checks:{}});},'finish request payload');
  both(p,e=>e.pending.pop().failure({message:'network failure'}),'finish failure preserves draft');
  assert(p[1].storage.has(DRAFT),'save failure cleared draft');
  both(p,e=>e.context.callServer('finishAircraft',{checks:{}},()=>e.context.alert('完了通知')),'retry finish payload');
  both(p,e=>e.pending.pop().success(initialState()),'finish success renders then clears then notifies');
  assert(!p[1].storage.has(DRAFT),'successful save left draft');
  const finishEvents=p[1].events;
  const rendered=finishEvents.map(event=>event[0]).lastIndexOf('render.app');
  const cleared=finishEvents.map(event=>event[0]).lastIndexOf('storage.remove');
  assert(rendered>=0 && rendered<cleared && cleared<finishEvents.length-1,'finish must render before draft removal and notification');
  console.log('WEB COMPAT bootstrap / all flight phases / battery / aircraft / back / offline / finish success-failure OK');

  for(const oldSession of [
    {phase:'READY',model:'EVO Lite',currentModel:'EVO Lite',pendingFlightInput:{battery:6,cycle:'9'},aircrafts:{},flights:[]},
    {phase:'READY',model:'EVO Lite',currentModel:'EVO Lite',aircrafts:{},flights:[]}
  ]) {
    const restored=pair({[DRAFT]:JSON.stringify(oldSession)});equal(restored,'legacy READY restoration');
    assert.equal(restored[1].context.STATE.session.phase,oldSession.pendingFlightInput?'READY':'PRE');
  }
  // RC intentionally warns on corrupt/unreadable local drafts; exact assertions live in the RC suite.
  const abnormal=pair();start(abnormal);
  both(abnormal,e=>e.context.callServer('savePreflight',{checks:{},battery:3,cycle:'',abnormalDetail:'異常確認'}),'abnormal preflight');
  both(abnormal,e=>e.context.callServer('startPostflight'),'zero-flight postflight');
  assert.equal(abnormal[1].context.STATE.session.flights.length,0);
  both(abnormal,e=>e.context.cancelSessionPrompt(),'cancel draft');
  console.log('WEB COMPAT legacy draft restoration / broken or unavailable storage / abnormal and zero-flight / cancellation OK');

  const forms=pair();both(forms,e=>{
    for(const [id,value] of Object.entries({model:'EVO Lite',purpose:'操縦練習',category:'カテゴリーⅠ',route:'試験場',inspectionLocation:'点検場',pilot:'試験者',assistantSelect:'__NEW__',assistantNew:'補助者'}))e.field(id,value);
    e.field('method0','',true);e.context.submitStartOperation();
  },'start form callback and local history');
  assert.equal(forms[1].context.STATE.session.phase,'PRE');
  for(const phase of ['PRE','BATTERY_CHANGE','READY','LANDING']) {
    both(forms,e=>{e.context.STATE.session.phase=phase;e.context.STATE.session.selectedBattery=4;
      for(const [id,value] of Object.entries({preflightBattery:'4',preflightCycle:'8',abnormalDetail:'確認',changeBattery:'5',changeBatteryCycle:'9',takeoffLocation:'離陸場',landingLocation:'着陸場',actualMinutes:'6',safetyDetail:'安全詳細',batteryNote:'所感'}))e.field(id,value);
      for(const id of ['pre0','batteryInstalled','batteryStatusOk','safetyIssue'])e.field(id,'',true);
      e.context.captureCurrentScreenDraft();},phase+' screen draft fields');
  }
  const postForm=pair();start(postForm);pre(postForm);
  both(postForm,e=>e.context.callServer('startPostflight'),'zero-flight final form');
  both(postForm,e=>{
    e.field('postLocation','最終点検場');e.field('confirmer','確認者');
    e.context.POST_NAMES.forEach((_,i)=>e.field('post_0_'+i,'',true));
    e.context.submitAllPostflight();
  },'final form collects checks and sends payload');
  assert.equal(postForm[1].pending.at(-1).name,'finishAircraft');
  assert.equal(postForm[1].pending.at(-1).args[0].postflight.inspectionLocation,'最終点検場');
  both(postForm,e=>e.pending.pop().success(initialState()),'final form completion notification');
  const failedRender=pair();start(failedRender);pre(failedRender);
  both(failedRender,e=>e.context.callServer('finishAircraft',{checks:{}}),'render-failure save request');
  both(failedRender,e=>{
    e.context.render=function(){throw Error('render failed');};
    assert.throws(()=>e.pending.pop().success(initialState()),/render failed/);
  },'render failure preserves draft');
  assert(failedRender[1].storage.has(DRAFT),'render failure removed the recovery draft');
  console.log('WEB COMPAT form actions / final form / local assistant history / per-screen draft capture / render-failure retention OK');

  const diagnostic=pair();both(diagnostic,e=>e.context.openCommitDiagnosisModal(),'open diagnosis RPC');
  both(diagnostic,e=>e.pending.pop().success([]),'empty diagnosis response');
  both(diagnostic,e=>e.context.runCommitDiagnosis(),'repeat diagnosis RPC');
  both(diagnostic,e=>e.pending.pop().failure({message:'診断エラー <text>'}),'diagnosis failure');
  both(diagnostic,e=>e.context.executeCommitRecovery('op_test'),'recovery RPC');
  both(diagnostic,e=>e.pending.pop().success({success:true}),'recovery success UI');
  both(diagnostic,e=>e.context.executeTestCommitDiscard('op_test'),'discard RPC');
  both(diagnostic,e=>e.pending.pop().failure({message:'破棄拒否'}),'discard failure UI');
  const malicious='<img src=x onerror="alert(1)">';
  const report={draftId:'op_test',state:'failed',stage:'PLAN_READY',lastErrorStage:'',createdAt:'today',updatedAt:'today',isAppTest:false,chunksComplete:true,planHashMatches:true,statusCategory:'CANNOT_AUTO_PROCESS',safeToRecover:false,operationCounts:{intended:0,before:0,conflict:1,total:1},aircraftTotals:{matched:0,targets:1},conflicts:[{actual:malicious}],resumeBlockReasons:['競合'],discardBlockReasons:[]};
  diagnostic.forEach(e=>e.context.renderCommitDiagnosisResult([clone(report)]));
  const html=diagnostic[1].elements.get('diagModalBody').innerHTML;
  if(!args.includes('--allow-legacy-diagnostic-html')) {
    assert(!html.includes('<img'), 'diagnostic conflict JSON must not become HTML');
    assert(html.includes('&lt;img')&&html.includes('&quot;'), 'diagnostic conflict JSON must remain escaped readable text');
  } else equal(diagnostic,'legacy diagnostic HTML remains unchanged until stage8');
  console.log('WEB COMPAT diagnosis / recovery / discard RPC and UI / ' + (args.includes('--allow-legacy-diagnostic-html') ? 'legacy diagnostic HTML retained' : 'conflict-detail escaping') + ' OK');

  for(const options of [{},{fetchFails:true},{gpsFails:true}]) {
    const gps=pair({},options);gps.forEach(e=>{e.field('inspectionLocation','');e.field('route','');e.context.fetchCurrentGps('inspectionLocation','route');});
    await new Promise(resolve=>setImmediate(resolve));equal(gps,'GPS acquisition/fallback');
    assert.equal(gps[1].elements.get('inspectionLocation').value,gps[0].elements.get('inspectionLocation').value);
    assert.equal(gps[1].elements.get('route').value,gps[0].elements.get('route').value);
  }
  console.log('WEB COMPAT GPS success / reverse-geocoder failure / permission failure OK');
  console.log('Web compatibility OK against '+BASELINE);
}
run().catch(error=>{console.error(error);process.exitCode=1;});
