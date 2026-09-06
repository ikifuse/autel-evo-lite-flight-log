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
  getValues() {
    return Array.from({ length: this.numRows }, (_, r) =>
      Array.from({ length: this.numCols }, (_, c) => this.sheet.data[this.row - 1 + r][this.col - 1 + c]));
  }
  setValue(value) { this.sheet.data[this.row - 1][this.col - 1] = value; return this; }
  setValues(values) {
    values.forEach((line, r) => line.forEach((value, c) => { this.sheet.data[this.row - 1 + r][this.col - 1 + c] = value; }));
    return this;
  }
  setNumberFormat() { return this; }
  getMergedRanges() {
    return this.sheet.merges.filter(m => this.row >= m.row && this.row < m.row + m.rows && this.col >= m.col && this.col < m.col + m.cols)
      .map(m => new MockRange(this.sheet, m.row, m.col, m.rows, m.cols));
  }
  getColumn() { return this.col; }
  getNumColumns() { return this.numCols; }
}

class MockSheet {
  constructor(name, rows = 220, cols = 30) { this.name = name; this.data = emptyGrid(rows, cols); this.merges = []; this.ss = null; }
  getName() { return this.name; }
  setName(name) { delete this.ss.sheets[this.name]; this.name = name; this.ss.sheets[name] = this; return this; }
  getRange(row, col, numRows, numCols) { return new MockRange(this, row, col, numRows, numCols); }
  getDataRange() { return new MockRange(this, 1, 1, this.data.length, this.data[0].length); }
  getLastRow() { return this.data.length; }
  getMaxColumns() { return this.data[0].length; }
  copyTo(ss) {
    const copy = new MockSheet('Copy ' + Date.now() + Math.random(), this.data.length, this.data[0].length);
    copy.data = this.data.map(row => row.slice()); copy.merges = this.merges.map(m => ({...m})); ss.add(copy); return copy;
  }
}

class MockSpreadsheet {
  constructor() { this.sheets = {}; }
  add(sheet) { sheet.ss = this; this.sheets[sheet.name] = sheet; return sheet; }
  getSheetByName(name) { return this.sheets[name] || null; }
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
  const context = {
    console, Date, Math, Number, String, Array, Object, JSON, Map, RegExp, Error,
    SpreadsheetApp: { openById: () => ss },
    CacheService: { getScriptCache: () => ({ get:k => cache.get(k) || null, put:(k,v) => cache.set(k,v) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty:k => props.get(k) || null, setProperty:(k,v) => props.set(k,v) }) },
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
  return { context, ss, cache, props };
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
      draftId:'test_' + (++seq), operationDate:'2026.9.6', model:flights[0].model, route:'試験場', pilot:'試験者', purpose:'試験',
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
  reports.push('TEST 15 checked separately by source diff (no UI-flow code changes)');
  console.log(reports.join('\n'));
}

run();

