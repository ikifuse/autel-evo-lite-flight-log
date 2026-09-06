const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');

const sourcePath = process.argv[2] || 'dist/Code.gs';

function emptyGrid(rows, cols) {
  return Array.from({ length: rows }, () => Array(cols).fill(''));
}

class MockRange {
  constructor(sheet, row, col, numRows = 1, numCols = 1) {
    this.sheet = sheet; this.row = row; this.col = col; this.numRows = numRows; this.numCols = numCols;
  }
  getDisplayValue() { return String(this.sheet.data[this.row - 1][this.col - 1] ?? ''); }
  getDisplayValues() { return this.getValues().map(r => r.map(v => v instanceof Date ? v.toISOString() : String(v ?? ''))); }
  getValue() { return this.sheet.data[this.row - 1][this.col - 1]; }
  getFormula() { return this.sheet.formulas[`${this.row}|${this.col}`] || ''; }
  getSheet() { return this.sheet; }
  getRow() { return this.row; }
  getColumn() { return this.col; }
  getA1Notation() { return `R${this.row}C${this.col}`; }
  getValues() {
    return Array.from({ length: this.numRows }, (_, r) =>
      Array.from({ length: this.numCols }, (_, c) => this.sheet.data[this.row - 1 + r][this.col - 1 + c]));
  }
  setValue(value) {
    this.sheet.data[this.row - 1][this.col - 1] = value;
    const key = `${this.row}|${this.col}`;
    if (typeof value === 'string' && /^[\u0000-\u0020]*[=+\-@]/.test(value)) this.sheet.formulas[key] = value;
    else delete this.sheet.formulas[key];
    return this;
  }
  setValues(values) {
    values.forEach((line, r) => line.forEach((value, c) => {
      new MockRange(this.sheet, this.row + r, this.col + c).setValue(value);
    }));
    return this;
  }
  setRichTextValue(value) {
    this.sheet.data[this.row - 1][this.col - 1] = value.getText();
    delete this.sheet.formulas[`${this.row}|${this.col}`];
    return this;
  }
  getNumberFormat() { return this.sheet.formats[`${this.row}|${this.col}`] || ''; }
  setNumberFormat(format) { this.sheet.formats[`${this.row}|${this.col}`] = format; return this; }
  getFontSize() { return this.sheet.fontSizes[`${this.row}|${this.col}`] || 11; }
  setFontSize(size) { this.sheet.fontSizes[`${this.row}|${this.col}`] = size; return this; }
  getHorizontalAlignment() { return this.sheet.horizontalAlignments[`${this.row}|${this.col}`] || null; }
  setHorizontalAlignment(alignment) { this.sheet.horizontalAlignments[`${this.row}|${this.col}`] = alignment; return this; }
  getVerticalAlignment() { return this.sheet.verticalAlignments[`${this.row}|${this.col}`] || null; }
  setVerticalAlignment(alignment) { this.sheet.verticalAlignments[`${this.row}|${this.col}`] = alignment; return this; }
  getWrap() { return this.sheet.wraps[`${this.row}|${this.col}`] || false; }
  setWrap(wrap) { this.sheet.wraps[`${this.row}|${this.col}`] = !!wrap; return this; }
  addDeveloperMetadata(key, value) {
    this.sheet.metadata.push({ row:this.row, col:this.col, rows:this.numRows, cols:this.numCols, key, value });
    return this;
  }
  getDeveloperMetadata() {
    return this.sheet.metadata.filter(item => item.row === this.row && item.col === this.col && item.rows === this.numRows && item.cols === this.numCols)
      .map(item => ({ getKey:()=>item.key, getValue:()=>item.value }));
  }
  getMergedRanges() {
    return this.sheet.merges.filter(m => this.row >= m.row && this.row < m.row + m.rows && this.col >= m.col && this.col < m.col + m.cols)
      .map(m => new MockRange(this.sheet, m.row, m.col, m.rows, m.cols));
  }
  getColumn() { return this.col; }
  getNumColumns() { return this.numCols; }
}

class MockSheet {
  constructor(name, rows = 220, cols = 30) { this.name = name; this.data = emptyGrid(rows, cols); this.merges = []; this.formats = {}; this.fontSizes = {}; this.horizontalAlignments = {}; this.verticalAlignments = {}; this.wraps = {}; this.formulas = {}; this.metadata = []; this.ss = null; }
  getName() { return this.name; }
  setName(name) { delete this.ss.sheets[this.name]; this.name = name; this.ss.sheets[name] = this; return this; }
  getRange(row, col, numRows, numCols) { return new MockRange(this, row, col, numRows, numCols); }
  getDataRange() { return new MockRange(this, 1, 1, this.data.length, this.data[0].length); }
  getLastRow() { return this.data.length; }
  getMaxColumns() { return this.data[0].length; }
  copyTo(ss) {
    const copy = new MockSheet('Copy ' + Date.now() + Math.random(), this.data.length, this.data[0].length);
    copy.data = this.data.map(row => row.slice()); copy.merges = this.merges.map(m => ({...m})); copy.formats = {...this.formats}; copy.fontSizes = {...this.fontSizes}; copy.horizontalAlignments = {...this.horizontalAlignments}; copy.verticalAlignments = {...this.verticalAlignments}; copy.wraps = {...this.wraps}; copy.formulas = {...this.formulas}; copy.metadata = this.metadata.map(m => ({...m})); ss.add(copy); return copy;
  }
}

class MockSpreadsheet {
  constructor() { this.sheets = {}; }
  add(sheet) { sheet.ss = this; this.sheets[sheet.name] = sheet; return sheet; }
  getSheetByName(name) { return this.sheets[name] || null; }
  getSheets() { return Object.values(this.sheets); }
  deleteSheet(sheet) { delete this.sheets[sheet.getName()]; }
}

function set(sheet, row, col, value) { sheet.data[row - 1][col - 1] = value; }
function makeTemplate() {
  const sheet = new MockSheet('日常点検');
  for (const start of [3, 18]) {
    set(sheet, 4, start, '□  Autel Robotics Co., Ltd. / EVO Lite   / JU登録記号：JU3268805C02');
    set(sheet, 6, start, '□  Autel Robotics Co., Ltd. / EVO Lite+ / JU登録記号：JU3269B165D2');
    set(sheet, 9, start, '飛行・点検実施年月日：');
    set(sheet, 11, start, '飛行目的（飛行概要）');
    set(sheet, 12, start, '飛行経路・場所');
    set(sheet, 13, start, '飛行禁止空域・飛行方法');
    set(sheet, 11, start + 9, '操縦者・点検実施者');
    set(sheet, 12, start + 9, '技能証明書番号');
    const pre = ['機体全般','プロペラ・フレーム','通信系統','推進系統','電源系統','自動制御系統','バッテリー','操縦装置\n（プロポ）','灯火','カメラ','リモートID'];
    pre.forEach((name, i) => set(sheet, 19 + i, start, name));
    ['機体全般','プロペラ・フレーム','発熱','その他'].forEach((name, i) => set(sheet, 19 + i, start + 7, name));
    const headers = ['使用バッテリー','離陸場所','着陸場所','離陸時刻','着陸時刻','飛行時間','総飛行時間','安全に影響した事項','バッテリー異常・所感'];
    headers.forEach((name, i) => set(sheet, 32, start + i, name));
  }
  return sheet;
}

function makeMaster(name, total) {
  const sheet = new MockSheet(name, 20, 26);
  set(sheet, 6, 5, '点検時の総飛行時間');
  set(sheet, 6, 7, total);
  sheet.merges.push({ row: 6, col: 5, rows: 1, cols: 2 }, { row: 6, col: 7, rows: 1, cols: 2 });
  return sheet;
}

function makeBattery(number) {
  const sheet = new MockSheet('BAT_' + number);
  set(sheet, 12, 1, '日付');
  return sheet;
}

function makeEnvironment(lite = '00:00', plus = '00:00') {
  const ss = new MockSpreadsheet();
  ss.add(makeTemplate());
  ss.add(makeMaster('点検整備記録_EVO Lite_原本', lite));
  ss.add(makeMaster('点検整備記録_EVO Lite+_原本', plus));
  for (let i = 1; i <= 7; i++) ss.add(makeBattery(i));
  const cache = new Map(); const props = new Map();
  const controls = { cacheThrows:false, propertySetCount:0, propertyFailAt:0, failNextProperty:false };
  const context = {
    console, Date, Math, Number, String, Array, Object, JSON, Map, RegExp, Error, __controls:controls,
    SpreadsheetApp: {
      openById: () => ss,
      flush(){},
      newRichTextValue: () => {
        let text='';
        return { setText(value){ text=String(value); return this; }, build(){ return { getText:()=>text }; } };
      }
    },
    CacheService: { getScriptCache: () => ({
      get:k => { if(controls.cacheThrows) throw new Error('cache failure'); return cache.get(k) || null; },
      put:(k,v) => { if(controls.cacheThrows) throw new Error('cache failure'); cache.set(k,v); }
    }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty:k => props.get(k) || null,
      setProperty:(k,v) => {
        controls.propertySetCount++;
        if(controls.failNextProperty){ controls.failNextProperty=false; throw new Error('property failure'); }
        if(controls.propertyFailAt && controls.propertySetCount === controls.propertyFailAt) throw new Error('property failure');
        props.set(k,v);
      },
      deleteProperty:k => { props.delete(k); },
      getProperties:() => Object.fromEntries(props)
    }) },
    LockService: { getScriptLock: () => ({ waitLock(){}, releaseLock(){} }) },
    Utilities: {
      Charset: { UTF_8: 'UTF_8' }, DigestAlgorithm: { SHA_256: 'SHA_256' },
      computeDigest: (_alg, value) => Array.from(crypto.createHash('sha256').update(value).digest()),
      base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64url'),
      formatDate(value, _tz, pattern) {
        const d = new Date(value); const p = n => String(n).padStart(2, '0');
        if (pattern === 'yyyy.M.d') return `${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()}`;
        if (pattern === 'yyyy年M月d日') return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
        if (pattern === 'HH:mm') return `${p(d.getHours())}:${p(d.getMinutes())}`;
        throw new Error('Unexpected pattern ' + pattern);
      }
    }
  };
  vm.createContext(context);
  const source = fs.readFileSync(sourcePath, 'utf8').split('const APP_HTML =')[0];
  vm.runInContext(source, context);
  return { context, ss, cache, props, controls };
}

const PRE = ['機体全般','プロペラ・フレーム','通信系統','推進系統','電源系統','自動制御系統','バッテリー','操縦装置','灯火','カメラ','リモートID'];
const POST = ['機体全般','プロペラ・フレーム','発熱','その他'];
const checks = names => Object.fromEntries(names.map(n => [n, '正常']));

let seq = 0;
function makeInput(flights) {
  const used = [...new Set(flights.map(f => f.model))];
  const aircrafts = {};
  for (const model of ['EVO Lite','EVO Lite+']) aircrafts[model] = { model, used:used.includes(model), preflightChecks:checks(PRE) };
  return {
    session: {
      draftId:'op_00000000-0000-4000-8000-' + String(++seq).padStart(12,'0'), operationDate:'2026.9.6', model:flights[0].model, route:'試験場', pilot:'試験者', purpose:'操縦練習',
      category:'カテゴリーⅠ', method:'通常飛行（特定飛行なし）', cert:'', assistant:'', forceNewLocation:false,
      aircrafts, flights:flights.map((f,i) => ({ model:f.model, battery:f.battery || 1, actualMinutes:f.minutes,
        takeoffLocation:'A', landingLocation:'A', takeoffAt:`2026-09-06T00:${String(i).padStart(2,'0')}:00Z`, landingAt:`2026-09-06T00:${String(i+1).padStart(2,'0')}:00Z` }))
    },
    postflight:{ inspectionLocation:'A', confirmer:'試験者', aircrafts:Object.fromEntries(used.map(m => [m,{checks:checks(POST)}])) }
  };
}

function assert(condition, message) { if (!condition) throw new Error(message); }
function value(sheet, row, col) { return sheet.data[row - 1][col - 1]; }
function resultRows(sheet, startCol) { return sheet.data.slice(32,39).map(r => r.slice(startCol-1,startCol+8)); }
function markUsed(sheet, blockNo) { const start = blockNo === 1 ? 3 : 18; set(sheet, 19, start + 6, '☑'); }

function snapshotProperties(environment) {
  return JSON.stringify([...environment.props.entries()].sort((a,b) => a[0].localeCompare(b[0])));
}

function assertRejectedWithoutMutation(input, label, setup) {
  const environment=makeEnvironment();
  if (setup) setup(environment);
  const beforeBusiness=snapshotBusiness(environment);
  const beforeProperties=snapshotProperties(environment);
  let rejected=false;
  try { environment.context.finishAircraft(input); } catch (_) { rejected=true; }
  assert(rejected, `${label} was accepted`);
  assert(snapshotBusiness(environment)===beforeBusiness, `${label} changed spreadsheet data`);
  assert(snapshotProperties(environment)===beforeProperties, `${label} changed Properties`);
}

function snapshotBusiness(environment) {
  const normalize = value => value instanceof Date ? value.toISOString() : value;
  return JSON.stringify(Object.keys(environment.ss.sheets).sort().map(name => {
    const sheet = environment.ss.sheets[name];
    return {
      name,
      data:sheet.data.map(row => row.map(normalize)),
      formats:Object.entries(sheet.formats).sort(),
      fontSizes:Object.entries(sheet.fontSizes).sort(),
      horizontalAlignments:Object.entries(sheet.horizontalAlignments).sort(),
      verticalAlignments:Object.entries(sheet.verticalAlignments).sort(),
      wraps:Object.entries(sheet.wraps).sort(),
      formulas:Object.entries(sheet.formulas).sort(),
      metadata:sheet.metadata.map(item => ({...item})).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    };
  }));
}

function assertCommitComplete(environment, draftId) {
  const raw = environment.props.get(`EVO_LITE_COMMIT_V2_${draftId}_META`);
  assert(raw && JSON.parse(raw).state === 'complete', 'commit is not complete');
  assert(![...environment.props.keys()].some(key => key.startsWith(`EVO_LITE_COMMIT_V2_${draftId}_DATA_`)), 'commit data chunks remain');
  assert(![...environment.props.values()].some(value => {
    try { const parsed=JSON.parse(value); return parsed.draftId===draftId && parsed.state!=='complete'; } catch(_){ return false; }
  }), 'unfinished reservation remains');
}

function installOneShotFault(environment, point) {
  environment.context.__faultPoint = point;
  environment.context.__faultThrown = false;
  vm.runInContext(`COMMIT_FAULT_INJECTOR = function(point) {
    if (point === __faultPoint && !__faultThrown) {
      __faultThrown = true;
      throw new Error('injected:' + point);
    }
  };`, environment.context);
}

function clearFault(environment) {
  vm.runInContext('COMMIT_FAULT_INJECTOR = null;', environment.context);
}

function assertFaultRetryMatches(point, input, label) {
  const baseline = makeEnvironment();
  baseline.context.finishAircraft(JSON.parse(JSON.stringify(input)));
  const expected = snapshotBusiness(baseline);

  const retried = makeEnvironment();
  installOneShotFault(retried, point);
  let failed = false;
  try { retried.context.finishAircraft(JSON.parse(JSON.stringify(input))); } catch(error) { failed = true; }
  assert(failed, `${label} did not fail`);
  clearFault(retried);
  retried.context.finishAircraft(JSON.parse(JSON.stringify(input)));
  assert(snapshotBusiness(retried) === expected, `${label} retry differs from one successful save`);
  assertCommitComplete(retried, input.session.draftId);
}

function run() {
  const reports = [];
  {
    const e=makeEnvironment(); e.context.finishAircraft(makeInput([{model:'EVO Lite',minutes:10}]));
    assert(value(e.ss.getSheetByName('2026.9.6'),33,9)==='00:10','T1 day'); assert(e.context.aircraftTotalMinutes_('EVO Lite')===10,'T1 master'); reports.push('TEST 1 OK');
  }
  {
    const e=makeEnvironment('12:35'); e.context.finishAircraft(makeInput([8,12,10].map(minutes=>({model:'EVO Lite',minutes}))));
    const s=e.ss.getSheetByName('2026.9.6'); assert([33,34,35].map(r=>value(s,r,9)).join(',')==='12:43,12:55,13:05','T2 rows'); assert(e.context.aircraftTotalMinutes_('EVO Lite')===785,'T2 master'); reports.push('TEST 2 OK');
  }
  {
    const e=makeEnvironment('12:35','04:10'); e.context.finishAircraft(makeInput([{model:'EVO Lite',minutes:20},{model:'EVO Lite+',minutes:15}]));
    assert(e.context.aircraftTotalMinutes_('EVO Lite')===775 && e.context.aircraftTotalMinutes_('EVO Lite+')===265,'T3 totals'); reports.push('TEST 3 OK');
  }
  {
    const e=makeEnvironment(); const existing=makeTemplate(); existing.name='2026.9.6'; e.ss.add(existing); markUsed(existing,1);
    e.context.finishAircraft(makeInput([{model:'EVO Lite',minutes:5}])); assert(value(existing,33,24)==='00:05','T4 right'); reports.push('TEST 4 OK');
  }
  {
    const e=makeEnvironment(); e.context.finishAircraft(makeInput(Array.from({length:8},()=>({model:'EVO Lite',minutes:1}))));
    const s=e.ss.getSheetByName('2026.9.6'); assert(value(s,39,9)==='00:07' && value(s,33,24)==='00:08','T5 blocks'); reports.push('TEST 5 OK');
  }
  {
    const e=makeEnvironment('01:00'); const existing=makeTemplate(); existing.name='2026.9.6'; e.ss.add(existing); markUsed(existing,1); markUsed(existing,2);
    e.context.finishAircraft(makeInput([{model:'EVO Lite',minutes:5}])); assert(value(e.ss.getSheetByName('2026.9.6_2'),33,9)==='01:05','T6 seq'); reports.push('TEST 6 OK');
  }
  {
    const e=makeEnvironment('12:50'); const existing=makeTemplate(); existing.name='2026.9.6'; e.ss.add(existing); const input=makeInput([{model:'EVO Lite',minutes:8}]); input.session.forceNewLocation=true;
    e.context.finishAircraft(input); assert(value(e.ss.getSheetByName('2026.9.6_2'),33,9)==='12:58','T7 location'); reports.push('TEST 7 OK');
  }
  {
    const e=makeEnvironment(); e.context.finishAircraft(makeInput([{model:'EVO Lite',minutes:2,battery:1},{model:'EVO Lite',minutes:3,battery:2},{model:'EVO Lite',minutes:4,battery:3}]));
    assert(e.context.aircraftTotalMinutes_('EVO Lite')===9,'T8 total'); for(let n=1;n<=3;n++) assert(value(e.ss.getSheetByName('BAT_'+n),13,4)===n+1,'T8 bat '+n); reports.push('TEST 8 OK');
  }
  {
    const e=makeEnvironment(); assert(e.context.formatHoursMinutes_(e.context.parseHoursMinutes_('23:58')+5)==='24:03','T9a'); assert(e.context.formatHoursMinutes_(e.context.parseHoursMinutes_('99:55')+10)==='100:05','T9b');
    let failed=false; try{e.context.parseHoursMinutes_('24:60');}catch(_){failed=true;} assert(failed,'T9 invalid'); reports.push('TEST 9 OK');
  }
  {
    const e=makeEnvironment(); const input=makeInput([{model:'EVO Lite',minutes:10}]); e.context.finishAircraft(input); e.cache.clear(); e.context.finishAircraft(input);
    assert(e.context.aircraftTotalMinutes_('EVO Lite')===10,'T10 total'); assert(value(e.ss.getSheetByName('BAT_1'),14,1)==='','T10 duplicate BAT'); reports.push('TEST 10 OK');
    const interrupted=makeEnvironment(); const plan={startingByModel:{'EVO Lite':0},finalByModel:{'EVO Lite':10}};
    interrupted.context.applyAircraftTotals_(plan); interrupted.context.applyAircraftTotals_(plan);
    assert(interrupted.context.aircraftTotalMinutes_('EVO Lite')===10,'T10 interrupted retry');
  }
  {
    const e=makeEnvironment(); const s=makeTemplate(); s.name='old'; e.ss.add(s); e.context.writeFlightFields_(s,{blockNo:1,row:33},{'総飛行時間':'01:00'}); assert(value(s,33,9)==='01:00','T11'); reports.push('TEST 11 OK');
  }
  {
    const e=makeEnvironment(); const s=makeTemplate(); s.name='new'; set(s,32,9,'総飛行時間（累計時間）'); e.ss.add(s); e.context.writeFlightFields_(s,{blockNo:1,row:33},{'総飛行時間':'01:00'}); assert(value(s,33,9)==='01:00','T12'); reports.push('TEST 12 OK');
  }
  {
    const e=makeEnvironment(); e.context.finishAircraft(makeInput([{model:'EVO Lite',minutes:6,battery:4}])); assert(value(e.ss.getSheetByName('BAT_4'),13,2)==='EVO Lite' && value(e.ss.getSheetByName('BAT_4'),13,4)===6,'T13'); reports.push('TEST 13 OK');
  }
  {
    const e=makeEnvironment(); e.context.finishAircraft(makeInput([{model:'EVO Lite',minutes:2}])); const s=e.ss.getSheetByName('2026.9.6'); assert(value(s,26,9)==='☑','T14 pre controller'); assert(value(s,19,15)==='☑','T14 post'); reports.push('TEST 14 OK');
  }
  {
    const legacy=fs.readFileSync('Code.gs','utf8'); const current=fs.readFileSync(sourcePath,'utf8');
    const legacyApp=legacy.slice(legacy.indexOf('const APP_HTML ='));
    let currentApp=current.slice(current.indexOf('const APP_HTML ='));
    const uuidStart=currentApp.indexOf('function createOperationDraftId(){');
    const uuidEnd=currentApp.indexOf('function persistOperationDraft(){');
    assert(uuidStart>=0 && uuidEnd>uuidStart,'T15 UUID helper markers');
    currentApp=currentApp.slice(0,uuidStart)+currentApp.slice(uuidEnd);
    currentApp=currentApp.replace('draftId:createOperationDraftId()', "draftId:'op_' + Date.now()");
    const withoutFavoriteChanges = app => app
      .replace(",'アプリテスト'];", '];')
      .replace('LocalStorage 管理（下書き・直前履歴・お気に入り）', 'LocalStorage 管理（下書き・直前履歴）')
      .replace("var STORAGE_KEY_FAVORITES = 'EVO_LITE_FAVORITES';\n", '')
      .replace(/    \.(?:preset-bar|favorite-list) \{[\s\S]*?(?=    \.input-error \{)/, '')
      .replace(/function loadFavorites\(\)\{[\s\S]*?(?=\/\/ ----------------------------------------------------\n\/\/ GPS自動取得)/, '')
      .replace(/\n  var favs = loadFavorites\(\);/, '')
      .replace(/\n  var favHtml = [\s\S]*?(?=\n\n  (?:var sessionNoticeHtml|div\.innerHTML =))\n/, '')
      .replace(/\n+      (?:\(favHtml \?|'<div id="favoriteSection")[\s\S]*?\n+(?=      '<div class="status-box">)/, '\n')
      .replace(/\n\n      '<div class="flex-row"[^\n]*\n        '<button[^\n]*onclick="saveCurrentAsFavorite\(\)"[^\n]*\n      '<\/div>' \+\n\n/, '\n')
      .replace(/function (?:favoriteDisplayName_|applyFavorite)\(.*?[\s\S]*?(?=function submitStartOperation\(\))/, '');
    assert(withoutFavoriteChanges(currentApp)===withoutFavoriteChanges(legacyApp),'T15 UI or client flow changed outside authorized favorite management, app-test purpose and internal UUID generation');
    reports.push('TEST 15 OK');
  }

  {
    const current=fs.readFileSync(sourcePath,'utf8');
    const app=current.slice(current.indexOf('const APP_HTML ='));
    [
      'STORAGE_KEY_FAVORITES', 'loadFavorites', 'findFavoriteSpotIndex_', 'storeFavorites_',
      'saveFavoriteSpot', 'renameFavoriteSpot_', 'deleteFavoriteSpot_', 'favoriteDisplayName_',
      'favoriteListHtml_', 'refreshFavoriteList_', 'applyFavorite(', 'renameFavorite(',
      'deleteFavorite(', 'saveCurrentAsFavorite(', '登録済みのお気に入り現場',
      'この場所をお気に入りに登録', 'favorite-list', 'favorite-item', 'favorite-action-btn'
    ].forEach(function(fragment){
      assert(!app.includes(fragment), 'favorite feature remains: ' + fragment);
    });
    assert(app.includes('前回と同じ条件で引用') && app.includes('function applyLastOperation(){'), 'last operation reuse was removed');
    assert(app.includes('GPSから現在地を取得') && app.includes('function fetchCurrentGps('), 'GPS feature was removed');
    assert(app.includes('ACTIVE_OPERATION_DRAFT_KEY') && app.includes('STORAGE_KEY_LAST'), 'draft or last-operation storage was removed');
    reports.push('TEST 24 OK');
  }

  const retrySingle = makeInput([{model:'EVO Lite',minutes:2,battery:1},{model:'EVO Lite',minutes:3,battery:2}]);
  assertFaultRetryMatches('AFTER_DATE_RECORDS', retrySingle, 'T16'); reports.push('TEST 16 OK');
  assertFaultRetryMatches('AFTER_BAT_1', retrySingle, 'T17'); reports.push('TEST 17 OK');
  assertFaultRetryMatches('AFTER_BAT_2', retrySingle, 'T18'); reports.push('TEST 18 OK');
  assertFaultRetryMatches('AFTER_POSTFLIGHT', retrySingle, 'T19'); reports.push('TEST 19 OK');
  const retryTwoModels = makeInput([{model:'EVO Lite',minutes:4,battery:1},{model:'EVO Lite+',minutes:5,battery:2}]);
  assertFaultRetryMatches('BETWEEN_AIRCRAFT_TOTALS', retryTwoModels, 'T20'); reports.push('TEST 20 OK');
  assertFaultRetryMatches('BEFORE_FINAL_FLUSH', retrySingle, 'T21'); reports.push('TEST 21 OK');
  assertFaultRetryMatches('BEFORE_COMPLETE', retrySingle, 'T22'); reports.push('TEST 22 OK');
  assertFaultRetryMatches('AFTER_COMPLETE_BEFORE_RESPONSE', retrySingle, 'T23'); reports.push('TEST 23 OK');
  assertFaultRetryMatches('AFTER_COMPLETE_META', retrySingle, 'complete compaction'); reports.push('EXTRA complete-before-compaction retry OK');

  assertFaultRetryMatches('AFTER_SHEET_COPY', makeInput([{model:'EVO Lite',minutes:3}]), 'sheet copy'); reports.push('EXTRA sheet-copy retry OK');
  assertFaultRetryMatches('AFTER_DATE_OP_0', makeInput([{model:'EVO Lite',minutes:3}]), 'No.1 partial'); reports.push('EXTRA No.1 partial retry OK');
  {
    const input=makeInput([{model:'EVO Lite',minutes:3}]);
    const baseline=makeEnvironment(); baseline.context.finishAircraft(JSON.parse(JSON.stringify(input))); const expected=snapshotBusiness(baseline);
    const retried=makeEnvironment(); const existing=makeTemplate(); existing.name='2026.9.6'; retried.ss.add(existing); markUsed(existing,1);
    const expectedEnv=makeEnvironment(); const expectedExisting=makeTemplate(); expectedExisting.name='2026.9.6'; expectedEnv.ss.add(expectedExisting); markUsed(expectedExisting,1); expectedEnv.context.finishAircraft(JSON.parse(JSON.stringify(input)));
    installOneShotFault(retried,'AFTER_DATE_OP_0'); let failed=false; try{retried.context.finishAircraft(JSON.parse(JSON.stringify(input)));}catch(_){failed=true;} assert(failed,'No.2 did not fail');
    clearFault(retried); retried.context.finishAircraft(JSON.parse(JSON.stringify(input)));
    assert(snapshotBusiness(retried)===snapshotBusiness(expectedEnv),'No.2 retry differs'); reports.push('EXTRA No.2 partial retry OK');
  }
  {
    const e=makeEnvironment(); e.controls.cacheThrows=true; const input=makeInput([{model:'EVO Lite',minutes:3}]); e.context.finishAircraft(input); assertCommitComplete(e,input.session.draftId); reports.push('EXTRA CacheService failure OK');
  }
  {
    const input=makeInput([{model:'EVO Lite',minutes:3}]); const baseline=makeEnvironment(); baseline.context.finishAircraft(JSON.parse(JSON.stringify(input)));
    const e=makeEnvironment(); e.context.__propertyArmed=false;
    vm.runInContext(`COMMIT_FAULT_INJECTOR=function(point){ if(point==='AFTER_DATE_RECORDS'&&!__propertyArmed){__propertyArmed=true;__controls.failNextProperty=true;} };`,e.context);
    let failed=false; try{e.context.finishAircraft(JSON.parse(JSON.stringify(input)));}catch(_){failed=true;} assert(failed,'property progress failure did not fail');
    clearFault(e); e.context.finishAircraft(JSON.parse(JSON.stringify(input)));
    assert(snapshotBusiness(e)===snapshotBusiness(baseline),'property progress retry differs'); reports.push('EXTRA Properties progress failure retry OK');
  }
  {
    const e=makeEnvironment(); const input=makeInput([{model:'EVO Lite',minutes:3}]); installOneShotFault(e,'AFTER_DATE_RECORDS'); try{e.context.finishAircraft(input);}catch(_){} clearFault(e);
    const changed=JSON.parse(JSON.stringify(input)); changed.session.route='改変'; let rejected=false; try{e.context.finishAircraft(changed);}catch(_){rejected=true;} assert(rejected,'pending alteration accepted'); reports.push('EXTRA pending signature rejection OK');
  }
  {
    const e=makeEnvironment(); const input=makeInput([{model:'EVO Lite',minutes:3}]); e.context.finishAircraft(input);
    const changed=JSON.parse(JSON.stringify(input)); changed.session.route='改変'; let rejected=false; try{e.context.finishAircraft(changed);}catch(_){rejected=true;} assert(rejected,'complete alteration accepted'); reports.push('EXTRA complete signature rejection OK');
  }
  {
    const e=makeEnvironment(); const input=makeInput([{model:'EVO Lite',minutes:3}]); installOneShotFault(e,'AFTER_DATE_RECORDS'); try{e.context.finishAircraft(input);}catch(_){} clearFault(e);
    const meta=JSON.parse(e.props.get(`EVO_LITE_COMMIT_V2_${input.session.draftId}_META`)); e.props.delete(`EVO_LITE_COMMIT_V2_${input.session.draftId}_DATA_0`);
    let rejected=false; try{e.context.finishAircraft(input);}catch(_){rejected=true;} assert(rejected && meta.chunkCount>0,'missing chunk accepted'); reports.push('EXTRA missing chunk rejection OK');
  }
  {
    const input=makeInput([{model:'EVO Lite',minutes:3}]); const baseline=makeEnvironment(); baseline.context.finishAircraft(JSON.parse(JSON.stringify(input)));
    const e=makeEnvironment(); e.controls.propertyFailAt=2; let failed=false; try{e.context.finishAircraft(JSON.parse(JSON.stringify(input)));}catch(_){failed=true;} assert(failed,'partial plan property write did not fail');
    e.controls.propertyFailAt=0; e.context.finishAircraft(JSON.parse(JSON.stringify(input)));
    assert(snapshotBusiness(e)===snapshotBusiness(baseline),'orphan plan chunk retry differs'); reports.push('EXTRA incomplete plan chunk recovery OK');
  }
  {
    const e=makeEnvironment(); const input=makeInput(Array.from({length:15},(_,i)=>({model:'EVO Lite',minutes:1,battery:(i%7)+1})));
    installOneShotFault(e,'AFTER_PLAN_PERSISTED'); try{e.context.finishAircraft(input);}catch(_){} clearFault(e);
    const chunks=[...e.props.entries()].filter(([key])=>key.startsWith(`EVO_LITE_COMMIT_V2_${input.session.draftId}_DATA_`));
    assert(chunks.length>1 && chunks.every(([,value])=>Buffer.byteLength(value,'utf8')<=7000),'commit chunks exceed size limit');
    const stats=e.context.getCommitStorageStats_(); assert(stats.propertyCount===chunks.length+1 && stats.approximateBytes>0,'storage stats invalid');
    e.context.finishAircraft(input); assertCommitComplete(e,input.session.draftId); reports.push('EXTRA chunk size and storage stats OK');
  }
  {
    const e=makeEnvironment(); const input=makeInput([{model:'EVO Lite',minutes:3}]); installOneShotFault(e,'AFTER_DATE_RECORDS'); try{e.context.finishAircraft(input);}catch(_){} clearFault(e);
    const meta=JSON.parse(e.props.get(`EVO_LITE_COMMIT_V2_${input.session.draftId}_META`));
    const plan=JSON.parse(Array.from({length:meta.chunkCount},(_,i)=>e.props.get(`EVO_LITE_COMMIT_V2_${input.session.draftId}_DATA_${i}`)).join(''));
    const op=plan.operations.date.find(item=>item.kind==='value'); e.ss.getSheetByName(op.sheetName).getRange(op.row,op.col).setValue('第三者変更');
    let rejected=false; try{e.context.finishAircraft(input);}catch(_){rejected=true;} assert(rejected,'manual conflict accepted'); reports.push('EXTRA manual conflict rejection OK');
  }
  {
    const e=makeEnvironment(); const first=makeInput([{model:'EVO Lite',minutes:2}]); const second=makeInput([{model:'EVO Lite',minutes:3}]);
    installOneShotFault(e,'AFTER_PLAN_PERSISTED'); try{e.context.finishAircraft(first);}catch(_){} clearFault(e);
    let blocked=false; try{e.context.finishAircraft(second);}catch(_){blocked=true;} assert(blocked,'second draft was not blocked by unfinished draft');
    e.context.finishAircraft(first); e.context.finishAircraft(second);
    assertCommitComplete(e,first.session.draftId); assertCommitComplete(e,second.session.draftId); reports.push('EXTRA different draft reservation isolation OK');
  }
  {
    const e=makeEnvironment(); const oldInput=makeInput([{model:'EVO Lite',minutes:2}]); installOneShotFault(e,'AFTER_PLAN_PERSISTED'); try{e.context.finishAircraft(oldInput);}catch(_){} clearFault(e);
    const key=`EVO_LITE_COMMIT_V2_${oldInput.session.draftId}_META`; const meta=JSON.parse(e.props.get(key)); meta.updatedAt=new Date(Date.now()-8*86400000).toISOString(); e.props.set(key,JSON.stringify(meta));
    const next=makeInput([{model:'EVO Lite',minutes:3}]); e.context.finishAircraft(next);
    assert(!e.props.has(key),'stale untouched plan not removed'); reports.push('EXTRA stale untouched cleanup OK');
  }
  {
    const e=makeEnvironment(); const oldInput=makeInput([{model:'EVO Lite',minutes:2}]); installOneShotFault(e,'BEFORE_COMPLETE'); try{e.context.finishAircraft(oldInput);}catch(_){} clearFault(e);
    const key=`EVO_LITE_COMMIT_V2_${oldInput.session.draftId}_META`; const meta=JSON.parse(e.props.get(key)); meta.updatedAt=new Date(Date.now()-8*86400000).toISOString(); e.props.set(key,JSON.stringify(meta));
    e.context.finishAircraft(makeInput([{model:'EVO Lite',minutes:3}])); assertCommitComplete(e,oldInput.session.draftId); reports.push('EXTRA stale fully-written recovery OK');
  }
  {
    const input=makeInput([{model:'EVO Lite',minutes:2}]); const baseline=makeEnvironment(); baseline.context.finishAircraft(JSON.parse(JSON.stringify(input)));
    const e=makeEnvironment(); installOneShotFault(e,'AFTER_DATE_RECORDS'); try{e.context.finishAircraft(input);}catch(_){} clearFault(e);
    const key=`EVO_LITE_COMMIT_V2_${input.session.draftId}_META`; const meta=JSON.parse(e.props.get(key)); meta.updatedAt=new Date(Date.now()-8*86400000).toISOString(); e.props.set(key,JSON.stringify(meta));
    e.context.finishAircraft(input); assert(snapshotBusiness(e)===snapshotBusiness(baseline),'stale partial roll-forward differs'); reports.push('EXTRA stale partial recovery OK');
  }
  {
    const e=makeEnvironment(); const input=makeInput([{model:'EVO Lite',minutes:2}]); installOneShotFault(e,'AFTER_DATE_RECORDS'); try{e.context.finishAircraft(input);}catch(_){} clearFault(e);
    const key=`EVO_LITE_COMMIT_V2_${input.session.draftId}_META`; const meta=JSON.parse(e.props.get(key)); const plan=JSON.parse(Array.from({length:meta.chunkCount},(_,i)=>e.props.get(`EVO_LITE_COMMIT_V2_${input.session.draftId}_DATA_${i}`)).join(''));
    const op=plan.operations.date.find(item=>item.kind==='value'); e.ss.getSheetByName(op.sheetName).getRange(op.row,op.col).setValue('競合'); meta.updatedAt=new Date(Date.now()-8*86400000).toISOString(); e.props.set(key,JSON.stringify(meta));
    let rejected=false; try{e.context.finishAircraft(input);}catch(_){rejected=true;} assert(rejected,'stale conflict accepted'); reports.push('EXTRA stale conflict rejection OK');
  }
  {
    const e=makeEnvironment(); const oldInput=makeInput([{model:'EVO Lite',minutes:2}]); e.context.finishAircraft(oldInput);
    const key=`EVO_LITE_COMMIT_V2_${oldInput.session.draftId}_META`; const meta=JSON.parse(e.props.get(key)); meta.completedAt=new Date(Date.now()-31*86400000).toISOString(); e.props.set(key,JSON.stringify(meta));
    e.context.finishAircraft(makeInput([{model:'EVO Lite',minutes:3}])); assert(!e.props.has(key),'expired complete proof remains'); reports.push('EXTRA complete proof retention cleanup OK');
  }

  {
    const e=makeEnvironment();
    const input=makeInput([{model:'EVO Lite',minutes:3,battery:1}]);
    input.session.route='=SUM(A1:A10)';
    input.session.pilot='+CMD';
    input.session.assistant='-1+1';
    input.session.cert='@TEST';
    input.session.purpose='その他：=SUM(A1:A10)';
    input.session.flights[0].takeoffLocation='  =SUM(A1:A10)';
    input.session.flights[0].landingLocation='\t@TEST';
    input.session.flights[0].safetyIssue=true;
    input.session.flights[0].safetyDetail='-1+1';
    input.session.flights[0].batteryNote='+CMD';
    const post=input.postflight.aircrafts['EVO Lite'];
    post.checks['その他']='異常';
    post.defectLocation=' @TEST';
    post.defectDetail='=SUM(A1:A10)';
    post.actionDetail='\t+CMD';
    input.postflight.confirmer='@TEST';
    e.context.finishAircraft(JSON.parse(JSON.stringify(input)));
    const day=e.ss.getSheetByName('2026.9.6');
    const cells=[
      [day,12,4,'=SUM(A1:A10)'], [day,11,13,'+CMD（補助者: -1+1）'], [day,12,13,'@TEST'],
      [day,33,4,'  =SUM(A1:A10)'], [day,33,5,'\t@TEST'], [day,33,10,'-1+1'], [day,33,11,'+CMD'],
      [day,44,6,'=SUM(A1:A10)'], [day,44,12,'\t+CMD'], [day,44,15,'@TEST'],
      [e.ss.getSheetByName('BAT_1'),13,6,'+CMD'], [e.ss.getSheetByName('BAT_1'),13,7,'=SUM(A1:A10)']
    ];
    cells.forEach(([sheet,row,col,expected]) => {
      const range=sheet.getRange(row,col);
      assert(range.getValue()===expected, `formula-safe display changed at ${sheet.getName()} ${row}:${col}`);
      assert(range.getFormula()==='', `formula remained at ${sheet.getName()} ${row}:${col}`);
    });
    const before=snapshotBusiness(e);
    e.cache.clear();
    e.context.finishAircraft(JSON.parse(JSON.stringify(input)));
    assert(snapshotBusiness(e)===before,'formula-safe retry changed or double-converted values');
    const normal=e.ss.getSheetByName('日常点検').getRange(1,1);
    e.context.trackedSetUserText_(normal,'通常日本語');
    assert(normal.getValue()==='通常日本語' && normal.getFormula()==='','normal Japanese text changed');
    reports.push('SECURITY Formula Injection and idempotent retry OK');
  }

  {
    const cases=[];
    let input=makeInput([{model:'EVO Lite',minutes:1}]); input.session.model='Unknown'; cases.push(['invalid model',input]);
    for (const battery of [0,8,1.5,'1']) { input=makeInput([{model:'EVO Lite',minutes:1}]); input.session.flights[0].battery=battery; cases.push([`invalid battery ${battery}`,input]); }
    input=makeInput([{model:'EVO Lite',minutes:1}]); input.session.draftId='invalid'; cases.push(['invalid draftId',input]);
    input=makeInput([{model:'EVO Lite',minutes:1}]); input.session.draftId='test_security'; cases.push(['test draftId',input]);
    for (const date of ['2026.2.30','2026.13.1','1900.1.1','2200.1.1']) { input=makeInput([{model:'EVO Lite',minutes:1}]); input.session.operationDate=date; cases.push([`invalid date ${date}`,input]); }
    for (const minutes of [0,-1,1.5,241]) { input=makeInput([{model:'EVO Lite',minutes:1}]); input.session.flights[0].actualMinutes=minutes; cases.push([`invalid minutes ${minutes}`,input]); }
    input=makeInput([{model:'EVO Lite',minutes:1}]); input.session.flights[0].landingAt='2026-09-05T23:59:00Z'; cases.push(['landing before takeoff',input]);
    input=makeInput([{model:'EVO Lite',minutes:1}]); input.session.flights[0].takeoffAt='2099-01-01T00:00:00Z'; input.session.flights[0].landingAt='2099-01-01T00:01:00Z'; cases.push(['timestamp far from operation date',input]);
    input=makeInput(Array.from({length:31},()=>({model:'EVO Lite',minutes:1}))); cases.push(['flight count overflow',input]);
    input=makeInput(Array.from({length:30},()=>({model:'EVO Lite',minutes:50}))); cases.push(['total minutes overflow',input]);
    input=makeInput([{model:'EVO Lite',minutes:1}]); input.session.route='あ'.repeat(501); cases.push(['text length overflow',input]);
    input=makeInput([{model:'EVO Lite',minutes:1}]); input.session.aircrafts['EVO Lite'].preflightChecks['機体全般']='確認済み'; cases.push(['invalid inspection value',input]);
    input=makeInput([{model:'EVO Lite',minutes:1}]); input.postflight.checks={その他:'確認済み'}; cases.push(['invalid top-level inspection value',input]);
    input=makeInput([{model:'EVO Lite',minutes:1}]); input.session.forceNewLocation='false'; cases.push(['invalid boolean',input]);
    input=makeInput([{model:'EVO Lite',minutes:1}]); input.session.flights[0].cycle={value:'1'}; cases.push(['invalid optional field type',input]);
    cases.forEach(([label,badInput]) => assertRejectedWithoutMutation(badInput,label));
    reports.push('SECURITY model, BAT, UUID, date, time, count, text and check validation OK');
  }

  {
    let input=makeInput([{model:'EVO Lite',minutes:1}]);
    input.unused='x'.repeat(513*1024);
    assertRejectedWithoutMutation(input,'raw JSON size overflow');

    input=makeInput([{model:'EVO Lite',minutes:1}]);
    let deep=input;
    for(let i=0;i<10;i++){ deep.deep={}; deep=deep.deep; }
    assertRejectedWithoutMutation(input,'object depth overflow');

    input=makeInput([{model:'EVO Lite',minutes:1}]);
    input.extra={};
    for(let i=0;i<5001;i++) input.extra['p'+i]=i;
    assertRejectedWithoutMutation(input,'property count overflow');
    reports.push('SECURITY JSON size, depth and property count limits OK');
  }

  {
    const input=makeInput(Array.from({length:30},()=>({model:'EVO Lite',minutes:48,battery:1})));
    const e=makeEnvironment();
    e.context.finishAircraft(input);
    assert(e.context.aircraftTotalMinutes_('EVO Lite')===1440,'upper-bound total did not save');
    assertCommitComplete(e,input.session.draftId);
    reports.push('SECURITY upper-bound normal save OK');
  }

  {
    const input=makeInput([{model:'EVO Lite',minutes:1}]);
    assertRejectedWithoutMutation(input,'Properties capacity overflow',environment => {
      environment.props.set('UNRELATED_LARGE_PROPERTY','x'.repeat(400*1024));
    });
    reports.push('SECURITY Properties capacity safe-stop OK');
  }

  {
    const input=makeInput(Array.from({length:30},()=>({model:'EVO Lite',minutes:1,battery:1})));
    input.session.flights.forEach(flight => { flight.safetyDetail='s'.repeat(1000); flight.batteryNote='b'.repeat(1000); });
    assertRejectedWithoutMutation(input,'commit plan estimate overflow');
    reports.push('SECURITY commit plan capacity safe-stop OK');
  }

  {
    const e=makeEnvironment();
    const first=makeInput([{model:'EVO Lite',minutes:2}]);
    e.context.finishAircraft(first); e.cache.clear(); e.context.finishAircraft(first);
    assert(e.context.aircraftTotalMinutes_('EVO Lite')===2 && value(e.ss.getSheetByName('BAT_1'),14,1)==='', 'same UUID saved twice');
    const second=makeInput([{model:'EVO Lite',minutes:3}]);
    installOneShotFault(e,'AFTER_PLAN_PERSISTED'); let failed=false;
    try { e.context.finishAircraft(second); } catch (_) { failed=true; }
    clearFault(e); assert(failed,'different UUID fault setup did not fail');
    const third=makeInput([{model:'EVO Lite',minutes:4}]);
    let blocked=false; try { e.context.finishAircraft(third); } catch (_) { blocked=true; }
    assert(blocked,'different UUID was not blocked by active reservation');
    e.context.finishAircraft(second); e.context.finishAircraft(third);
    assert(e.context.aircraftTotalMinutes_('EVO Lite')===9,'UUID retry/competition total mismatch');
    reports.push('SECURITY same UUID idempotency and different UUID reservation OK');
  }

  {
    const e=makeEnvironment('12:30');
    const input=makeInput([{model:'EVO Lite',minutes:10,battery:1},{model:'EVO Lite',minutes:15,battery:1}]);
    input.session.purpose='アプリテスト';
    e.context.finishAircraft(input);
    const sheet=e.ss.getSheetByName('TEST_2026.9.6');
    assert(sheet && value(sheet,33,9)==='12:40' && value(sheet,34,9)==='12:55','app test sheet cumulative totals');
    assert(e.context.aircraftTotalMinutes_('EVO Lite')===750,'app test changed official aircraft total');
    assert(value(e.ss.getSheetByName('BAT_1'),13,3)==='アプリテスト' && value(e.ss.getSheetByName('BAT_1'),14,3)==='アプリテスト','app test BAT history missing');
    assert(!e.ss.getSheetByName('2026.9.6'),'app test created a normal date sheet');
    reports.push('APP TEST sheet cumulative without official total update OK');
  }

  {
    const e=makeEnvironment('12:30');
    const input=makeInput([{model:'EVO Lite',minutes:5}]);
    input.session.purpose='アプリテスト [気象: 晴 / 風速2〜3m/s 穏やか 北東]';
    e.context.finishAircraft(input);
    assert(e.ss.getSheetByName('TEST_2026.9.6') && !e.ss.getSheetByName('2026.9.6'),'weather-tagged app test was not isolated');
    assert(e.context.aircraftTotalMinutes_('EVO Lite')===750,'weather-tagged app test changed official total');
    reports.push('APP TEST weather-tag classification OK');
  }
  {
    const e=makeEnvironment('12:30','04:10');
    const input=makeInput([{model:'EVO Lite',minutes:10,battery:1},{model:'EVO Lite+',minutes:15,battery:2}]);
    input.session.purpose='アプリテスト';
    e.context.finishAircraft(input);
    const sheet=e.ss.getSheetByName('TEST_2026.9.6');
    assert(value(sheet,33,9)==='12:40' && value(sheet,33,24)==='04:25','app test aircraft-switch sheet totals mismatch');
    assert(e.context.aircraftTotalMinutes_('EVO Lite')===750 && e.context.aircraftTotalMinutes_('EVO Lite+')===250,'app test aircraft switch changed official totals');
    reports.push('APP TEST aircraft-switch independent cumulative totals OK');
  }

  {
    const e=makeEnvironment('12:30');
    const input=makeInput([{model:'EVO Lite',minutes:10},{model:'EVO Lite',minutes:15}]);
    input.session.purpose='操縦練習';
    e.context.finishAircraft(input);
    const sheet=e.ss.getSheetByName('2026.9.6');
    assert(value(sheet,33,9)==='12:40' && value(sheet,34,9)==='12:55','normal sheet cumulative totals');
    assert(e.context.aircraftTotalMinutes_('EVO Lite')===775,'normal operation did not update official total');
    reports.push('APP TEST comparison: normal operation official total update OK');
  }

  for (const purpose of ['整備後確認飛行','修理後確認飛行']) {
    const e=makeEnvironment('12:30');
    const input=makeInput([{model:'EVO Lite',minutes:10}]); input.session.purpose=purpose;
    e.context.finishAircraft(input);
    assert(e.context.aircraftTotalMinutes_('EVO Lite')===760,`${purpose} did not update official total`);
  }
  reports.push('APP TEST comparison: maintenance and repair confirmation totals OK');

  {
    const e=makeEnvironment('12:30');
    const input=makeInput([{model:'EVO Lite',minutes:10,battery:2}]); input.session.purpose='アプリテスト';
    e.context.finishAircraft(input); e.cache.clear(); e.context.finishAircraft(input);
    assert(e.context.aircraftTotalMinutes_('EVO Lite')===750,'app test retry changed official total');
    assert(value(e.ss.getSheetByName('BAT_2'),13,3)==='アプリテスト' && value(e.ss.getSheetByName('BAT_2'),14,1)==='','app test UUID retry duplicated BAT history');
    reports.push('APP TEST same UUID idempotency OK');
  }

  {
    const e=makeEnvironment('12:30');
    const normal=makeInput([{model:'EVO Lite',minutes:5}]); normal.session.purpose='操縦練習';
    e.context.finishAircraft(normal);
    const normalSheet=e.ss.getSheetByName('2026.9.6');
    const before=JSON.stringify(normalSheet.data);
    const appTest=makeInput([{model:'EVO Lite',minutes:10}]); appTest.session.purpose='アプリテスト';
    e.context.finishAircraft(appTest);
    assert(JSON.stringify(normalSheet.data)===before,'app test modified the normal date sheet');
    assert(e.ss.getSheetByName('TEST_2026.9.6'),'mixed operation did not create TEST sheet');
    assert(e.context.aircraftTotalMinutes_('EVO Lite')===755,'mixed app test changed official total');
    reports.push('APP TEST and normal date-sheet isolation OK');
  }

  {
    const e=makeEnvironment('12:30');
    const first=makeInput([{model:'EVO Lite',minutes:5}]); first.session.purpose='アプリテスト';
    e.context.finishAircraft(first);
    e.ss.deleteSheet(e.ss.getSheetByName('TEST_2026.9.6'));
    const second=makeInput([{model:'EVO Lite',minutes:6}]); second.session.purpose='アプリテスト';
    e.context.finishAircraft(second);
    const recreated=e.ss.getSheetByName('TEST_2026.9.6');
    assert(recreated && value(recreated,33,8)==='00:06','deleted TEST sheet was not recreated for a new UUID');
    assert(e.context.aircraftTotalMinutes_('EVO Lite')===750,'TEST sheet recreation changed official total');
    reports.push('APP TEST deleted sheet recreation OK');
  }

  {
    const e=makeEnvironment('12:30');
    const first=makeInput([{model:'EVO Lite',minutes:5}]); first.session.purpose='アプリテスト';
    e.context.finishAircraft(first);
    e.ss.getSheetByName('TEST_2026.9.6').data=emptyGrid(220,30);
    const second=makeInput([{model:'EVO Lite',minutes:6}]); second.session.purpose='アプリテスト';
    e.context.finishAircraft(second);
    const fallback=e.ss.getSheetByName('TEST_2026.9.6_2');
    assert(fallback && value(fallback,33,8)==='00:06','cleared TEST sheet structure did not fall forward safely');
    assert(e.context.aircraftTotalMinutes_('EVO Lite')===750,'cleared TEST sheet recovery changed official total');
    reports.push('APP TEST cleared sheet structure safe fallback OK');
  }

  {
    const e=makeEnvironment('12:30');
    const first=makeInput([{model:'EVO Lite',minutes:5,battery:3}]); first.session.purpose='アプリテスト';
    e.context.finishAircraft(first);
    const batterySheet=e.ss.getSheetByName('BAT_3');
    const oldMetadata=batterySheet.getRange(13,1,1,8).getDeveloperMetadata().map(item=>item.getValue());
    batterySheet.getRange(13,1,1,8).setValues([Array(8).fill('')]);
    const second=makeInput([{model:'EVO Lite',minutes:6,battery:3}]); second.session.purpose='アプリテスト';
    e.context.finishAircraft(second);
    const metadata=batterySheet.getRange(13,1,1,8).getDeveloperMetadata().map(item=>item.getValue());
    assert(value(batterySheet,13,3)==='アプリテスト' && value(batterySheet,13,4)===6,'cleared BAT row was not reused');
    assert(oldMetadata.length===1 && metadata.includes(oldMetadata[0]) && metadata.includes(second.session.draftId+':0'),'Developer Metadata blocked safe BAT row reuse');
    assert(e.context.aircraftTotalMinutes_('EVO Lite')===750,'BAT row reuse changed official total');
    reports.push('APP TEST cleared BAT row reuse with Developer Metadata OK');
  }
  {
    const e=makeEnvironment('12:30');
    const input=makeInput(Array.from({length:15},(_,i)=>({model:'EVO Lite',minutes:1,battery:(i%7)+1})));
    input.session.purpose='アプリテスト';
    e.context.finishAircraft(input);
    assert(e.ss.getSheetByName('TEST_2026.9.6') && e.ss.getSheetByName('TEST_2026.9.6_2'),'app test sequence sheet was not created');
    assert(value(e.ss.getSheetByName('TEST_2026.9.6'),39,9)==='12:37','app test No.1 seven-flight cumulative mismatch');
    assert(value(e.ss.getSheetByName('TEST_2026.9.6'),39,24)==='12:44','app test No.2 seven-flight cumulative mismatch');
    assert(value(e.ss.getSheetByName('TEST_2026.9.6_2'),33,9)==='12:45','app test sequence No.1 cumulative mismatch');
    assert(e.context.aircraftTotalMinutes_('EVO Lite')===750,'multi-sheet app test changed official total');
    reports.push('APP TEST No.1, No.2 and sequence-sheet allocation OK');
  }
  {
    const input=makeInput([{model:'EVO Lite',minutes:5,battery:1}]); input.session.purpose='アプリテスト';
    assertFaultRetryMatches('AFTER_BAT_1',input,'app test BAT roll-forward');
    reports.push('APP TEST roll-forward retry OK');
  }
  console.log(reports.join('\n'));
}

run();
