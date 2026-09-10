// Behavior-preserving refactor contract against the approved B baseline.
// Run after building: node tests/refactor-compat.test.js [dist/Code.gs]
// This test reads Git and source files; all GAS/Spreadsheet changes stay in memory.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const BASELINE = 'b8e1ab6723784216b119c27d6bf9c2c540e5adb5';
const currentPath = path.resolve(ROOT, process.argv[2] || 'dist/Code.gs');
const baselineSource = execFileSync('git', ['show', `${BASELINE}:dist/Code.gs`], {
  cwd: ROOT, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024
});
const currentSource = fs.readFileSync(currentPath, 'utf8');
const regressionSource = fs.readFileSync(path.join(__dirname, 'regression.test.js'), 'utf8');
const harnessEnd = regressionSource.indexOf('\nfunction run() {');
assert(harnessEnd > 0, 'regression mock harness boundary is missing');

// Reuse the existing mock/fixture definitions without running or editing regression.
// A fixed clock also freezes new Date() inside writer code and persisted metadata.
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-09-09T03:00:00.000Z'])); }
  static now() { return Date.parse('2026-09-09T03:00:00.000Z'); }
}

function makeHarness(source) {
  const virtualPath = '/__refactor_compat_source__.gs';
  const sandbox = {
    require(name) {
      if (name === 'fs') return {
        ...fs,
        readFileSync(file, encoding) {
          return file === virtualPath ? source : fs.readFileSync(file, encoding);
        }
      };
      return require(name);
    },
    process: { argv: ['node', 'regression.test.js', virtualPath] },
    console: { log() {}, error() {} },
    Date: FixedDate,
    Buffer
  };
  vm.createContext(sandbox);
  vm.runInContext(regressionSource.slice(0, harnessEnd) + `
    globalThis.harness = {
      makeEnvironment, makeInput, snapshotBusiness, snapshotProperties,
      assertCommitComplete, installOneShotFault, clearFault, MockSheet, MockRange
    };
  `, sandbox, { filename: 'regression-mock-harness.js' });
  const harness = sandbox.harness;
  for (const method of [
    'setValue', 'setValues', 'setRichTextValue', 'setNumberFormat', 'setFontSize',
    'setHorizontalAlignment', 'setVerticalAlignment', 'setWrap'
  ]) {
    const original = harness.MockRange.prototype[method];
    harness.MockRange.prototype[method] = function(...args) {
      const trace = this.sheet.ss && this.sheet.ss.__compatTrace;
      if (trace) trace.push([
        'sheet.' + method, this.sheet.getName(), this.row, this.col,
        this.numRows, this.numCols,
        ...args.map(value => value && typeof value.getText === 'function' ? value.getText() : value)
      ]);
      return original.apply(this, args);
    };
  }
  return harness;
}

const baseline = makeHarness(baselineSource);
const current = makeHarness(currentSource);
const clone = value => JSON.parse(JSON.stringify(value));
const json = value => JSON.stringify(value);
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function traceEnvironment(environment) {
  const events = [];
  environment.ss.__compatTrace = events;
  const context = environment.context;
  const getProperties = context.PropertiesService.getScriptProperties;
  context.PropertiesService.getScriptProperties = function() {
    events.push(['properties.service']);
    const properties = getProperties();
    return Object.fromEntries(Object.entries(properties).map(([name, method]) => [name, function(...args) {
      // Hash large property values to keep failed assertions readable.
      events.push(['properties.' + name, ...args.map((value, index) =>
        name === 'setProperty' && index === 1 ? digest(value) : value)]);
      return method.apply(properties, args);
    }]));
  };
  const originalFlush = context.SpreadsheetApp.flush;
  context.SpreadsheetApp.flush = function() { events.push(['spreadsheet.flush']); return originalFlush(); };
  const originalLock = context.LockService.getScriptLock;
  context.LockService.getScriptLock = function() {
    events.push(['lock.service']);
    const lock = originalLock();
    return {
      waitLock(timeout) { events.push(['lock.wait', timeout]); return lock.waitLock(timeout); },
      releaseLock() { events.push(['lock.release']); return lock.releaseLock(); }
    };
  };
  environment.events = events;
  return environment;
}

function makeEnvironment(harness) {
  return traceEnvironment(harness.makeEnvironment('01:00', '02:00'));
}

function copyPersistedEnvironment(from, harness) {
  const target = harness.makeEnvironment('01:00', '02:00');
  target.ss.sheets = {};
  for (const sourceSheet of from.ss.getSheets()) {
    const sheet = new harness.MockSheet(sourceSheet.name, sourceSheet.data.length, sourceSheet.data[0].length);
    sheet.data = sourceSheet.data.map(row => row.slice());
    sheet.merges = sourceSheet.merges.map(merge => ({ ...merge }));
    for (const property of ['formats', 'fontSizes', 'horizontalAlignments', 'verticalAlignments', 'wraps', 'formulas']) {
      sheet[property] = { ...sourceSheet[property] };
    }
    target.ss.add(sheet);
  }
  for (const [key, value] of from.props) target.props.set(key, value);
  // Force the authoritative Script Properties path, independent of CacheService.
  target.cache.clear();
  return traceEnvironment(target);
}

function persistedPlan(environment, draftId) {
  const meta = JSON.parse(environment.props.get(`EVO_LITE_COMMIT_V2_${draftId}_META`));
  const chunks = Array.from({ length: meta.chunkCount }, (_, index) =>
    environment.props.get(`EVO_LITE_COMMIT_V2_${draftId}_DATA_${index}`));
  return { meta, chunks, text: chunks.join('') };
}

function compareEnvironments(left, right, label) {
  assert.equal(current.snapshotBusiness(right), baseline.snapshotBusiness(left), `${label}: business values/formats/formulas`);
  assert.equal(current.snapshotProperties(right), baseline.snapshotProperties(left), `${label}: persisted Properties`);
  assert.equal(json(right.events), json(left.events), `${label}: ordered cell writes / Properties / flush / Lock trace`);
}

function checkRpcBoundary(source, label) {
  const marker = source.indexOf('const APP_HTML =');
  assert(marker >= 0, `${label}: APP_HTML boundary missing`);
  const names = Array.from(source.slice(0, marker).matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm), match => match[1]);
  assert.equal(new Set(names).size, names.length, `${label}: duplicate top-level function declarations`);
  const publicNames = names.filter(name => !name.endsWith('_')).sort();
  assert.deepEqual(publicNames, [
    'diagnosePendingCommitPlans', 'discardPendingTestCommitPlan', 'doGet',
    'finishAircraft', 'getAppState', 'recoverPendingCommitPlan'
  ].sort(), `${label}: public RPC surface must stay at the six approved functions; internal functions end in _`);
}

checkRpcBoundary(baselineSource, 'baseline');
checkRpcBoundary(currentSource, 'current');
console.log('COMPAT public RPC surface and internal function suffix OK');

// Preserve the old setter arguments even for unusual persisted property values.
// Cell Date decoding must not leak into format/alignment/font/wrap operations.
{
  function setterArguments(harness, kind, value) {
    const environment = harness.makeEnvironment('01:00', '02:00');
    const calls = [];
    const range = {};
    for (const getter of ['getValue', 'getNumberFormat', 'getFontSize', 'getHorizontalAlignment', 'getVerticalAlignment', 'getWrap']) {
      range[getter] = () => 'before';
    }
    for (const setter of ['setValue', 'setRichTextValue', 'setNumberFormat', 'setFontSize', 'setHorizontalAlignment', 'setVerticalAlignment', 'setWrap']) {
      range[setter] = argument => calls.push([setter, argument && typeof argument.getText === 'function' ? argument.getText() : argument]);
    }
    const spreadsheet = { getSheetByName: () => ({ getRange: () => range }) };
    environment.context.applyCommitOperations_([{sheetName:'fixture', row:1, col:1, kind, before:'before', value}], false, spreadsheet);
    assert.equal(calls.length, 1, `adapter fixture must exercise a setter: ${kind}`);
    return json(calls);
  }
  for (const kind of ['value', 'text', 'format', 'fontSize', 'horizontalAlignment', 'verticalAlignment', 'wrap', 'unknown']) {
    for (const value of ['intended', {__commitDate:'2026-09-09T03:00:00.000Z'}]) {
      assert.equal(setterArguments(current, kind, clone(value)), setterArguments(baseline, kind, clone(value)), `adapter setter arguments: ${kind}`);
    }
  }
  console.log('COMPAT adapter setter arguments and Date decoding boundary OK');
}

const single = baseline.makeInput([{ model: 'EVO Lite', minutes: 5, battery: 1 }]);
const multiBlock = baseline.makeInput(Array.from({ length: 8 }, (_, index) => ({
  model: 'EVO Lite', minutes: 1, battery: index % 7 + 1
})));
const alternating = baseline.makeInput([
  { model: 'EVO Lite', minutes: 3, battery: 1 },
  { model: 'EVO Lite+', minutes: 4, battery: 2 },
  { model: 'EVO Lite', minutes: 5, battery: 3 },
  { model: 'EVO Lite+', minutes: 6, battery: 4 }
]);
const appTest = clone(single);
appTest.session.draftId = 'op_00000000-0000-4000-8000-000000004001';
appTest.session.purpose = 'アプリテスト [気象: 晴 / 風速2〜3m/s 穏やか 北東]';
const zeroFlight = clone(single);
zeroFlight.session.draftId = 'op_00000000-0000-4000-8000-000000004002';
zeroFlight.session.flights = [];
const zeroFlightTest = clone(zeroFlight);
zeroFlightTest.session.draftId = 'op_00000000-0000-4000-8000-000000004004';
zeroFlightTest.session.purpose = 'アプリテスト';
const formulaText = clone(single);
formulaText.session.draftId = 'op_00000000-0000-4000-8000-000000004003';
formulaText.session.route = '=SUM(A1:A10)';
formulaText.session.flights[0].takeoffLocation = '試験場（北緯35.1234, 東経139.1234）';
formulaText.session.flights[0].landingLocation = '\t@TEST';
formulaText.session.flights[0].batteryNote = '+CMD';
formulaText.postflight.aircrafts['EVO Lite'] = {
  checks: { ...formulaText.postflight.aircrafts['EVO Lite'].checks, その他: '異常' },
  abnormal: true, defectLocation: '@TEST', defectDetail: '=SUM(A1:A10)', actionDetail: '-1+1'
};

for (const [label, input] of Object.entries({ single, multiBlock, alternating, appTest, zeroFlight, zeroFlightTest, formulaText })) {
  const left = makeEnvironment(baseline);
  const right = makeEnvironment(current);
  for (const [harness, environment] of [[baseline, left], [current, right]]) {
    harness.installOneShotFault(environment, 'AFTER_PLAN_PERSISTED');
    assert.throws(() => environment.context.finishAircraft(clone(input)), /injected:AFTER_PLAN_PERSISTED/);
    harness.clearFault(environment);
  }
  const oldPlan = persistedPlan(left, input.session.draftId);
  const newPlan = persistedPlan(right, input.session.draftId);
  assert.equal(newPlan.text, oldPlan.text, `${label}: exact plan JSON and operation order`);
  assert.equal(json(newPlan.chunks), json(oldPlan.chunks), `${label}: exact UTF-8 chunk boundaries`);
  assert.equal(newPlan.meta.planHash, oldPlan.meta.planHash, `${label}: planHash`);
  assert.equal(newPlan.meta.signature, oldPlan.meta.signature, `${label}: normalized input signature`);
  compareEnvironments(left, right, label + ' persisted');
  left.events.length = 0;
  right.events.length = 0;
  const oldResult = left.context.finishAircraft(clone(input));
  const newResult = right.context.finishAircraft(clone(input));
  assert.equal(json(newResult), json(oldResult), `${label}: finish response`);
  baseline.assertCommitComplete(left, input.session.draftId);
  current.assertCommitComplete(right, input.session.draftId);
  compareEnvironments(left, right, label + ' complete');
  console.log(`COMPAT ${label}: plan JSON/hash/chunks, write order, Properties, flush and Lock OK`);
}

for (const [label, input] of Object.entries({ alternating, appTest })) {
  const left = makeEnvironment(baseline);
  const right = makeEnvironment(current);
  assert.equal(json(right.context.finishAircraft(clone(input))), json(left.context.finishAircraft(clone(input))));
  compareEnvironments(left, right, label + ' uninterrupted save');
  console.log(`COMPAT ${label}: uninterrupted save including final flush/Lock order OK`);
}

// Persist with the baseline, then resume the exact stored plan with the new code.
const recoveryCases = [
  'AFTER_PLAN_PERSISTED', 'AFTER_DATE_OP_0', 'AFTER_DATE_RECORDS', 'AFTER_BAT_1',
  'AFTER_POSTFLIGHT', 'BETWEEN_AIRCRAFT_TOTALS', 'BEFORE_COMPLETE'
].map(point => ({ point, input: alternating, label: point }));
recoveryCases.push(
  { point: 'AFTER_BAT_1', input: appTest, label: 'TEST AFTER_BAT_1' },
  { point: 'AFTER_POSTFLIGHT', input: zeroFlightTest, label: 'TEST zero-flight AFTER_POSTFLIGHT' }
);
for (const { point, input, label } of recoveryCases) {
  const stored = makeEnvironment(baseline);
  baseline.installOneShotFault(stored, point);
  assert.throws(() => stored.context.finishAircraft(clone(input)), new RegExp('injected:' + point));
  const before = persistedPlan(stored, input.session.draftId);
  const left = copyPersistedEnvironment(stored, baseline);
  const right = copyPersistedEnvironment(stored, current);
  assert.equal(persistedPlan(right, input.session.draftId).text, before.text, `${label}: imported plan unchanged`);
  assert.equal(
    json(right.context.recoverPendingCommitPlan(input.session.draftId)),
    json(left.context.recoverPendingCommitPlan(input.session.draftId)),
    `${label}: recovery response`
  );
  current.assertCommitComplete(right, input.session.draftId);
  assert.equal(persistedPlan(right, input.session.draftId).meta.planHash, before.meta.planHash, `${label}: original hash retained`);
  compareEnvironments(left, right, label + ' cross-version recovery');
  console.log(`COMPAT baseline pending → current roll-forward: ${label} OK`);
}

// Complete is authoritative even after human edits; same UUID never restores cells.
{
  const stored = makeEnvironment(baseline);
  stored.context.finishAircraft(clone(single));
  stored.ss.getSheetByName('2026.9.6').getRange(33, 4).setValue('保存後の手動訂正');
  stored.ss.getSheetByName('2026.9.6').getRange(33, 4).setHorizontalAlignment('right');
  stored.ss.getSheetByName('BAT_1').getRange(13, 7).setValue('BAT備考を手動訂正');
  stored.ss.getSheetByName('点検整備記録_EVO Lite_原本').getRange(6, 7).setValue('09:09');
  const left = copyPersistedEnvironment(stored, baseline);
  const right = copyPersistedEnvironment(stored, current);
  const before = current.snapshotBusiness(right);
  assert.equal(json(right.context.finishAircraft(clone(single))), json(left.context.finishAircraft(clone(single))));
  assert.equal(current.snapshotBusiness(right), before, 'complete resend must preserve every manually edited value/format');
  assert(!right.events.some(event => event[0].startsWith('sheet.set')), 'complete resend must not write any business cell');
  compareEnvironments(left, right, 'complete resend after manual editing');
  console.log('COMPAT baseline complete → current same-UUID resend preserves manual edits OK');
}

// A true third value remains a conflict when loading a pending plan from baseline.
{
  const stored = makeEnvironment(baseline);
  baseline.installOneShotFault(stored, 'AFTER_DATE_RECORDS');
  assert.throws(() => stored.context.finishAircraft(clone(single)), /injected:AFTER_DATE_RECORDS/);
  stored.ss.getSheetByName('2026.9.6').getRange(33, 4).setValue('pending中の第三者変更');
  const left = copyPersistedEnvironment(stored, baseline);
  const right = copyPersistedEnvironment(stored, current);
  const before = current.snapshotBusiness(right);
  assert.throws(() => left.context.recoverPendingCommitPlan(single.session.draftId), /安全条件を満たさない/);
  assert.throws(() => right.context.recoverPendingCommitPlan(single.session.draftId), /安全条件を満たさない/);
  assert.equal(current.snapshotBusiness(right), before, 'conflict rejection must not overwrite business cells');
  compareEnvironments(left, right, 'cross-version conflict rejection');
  console.log('COMPAT baseline pending conflict safely rejected by current code OK');
}

console.log(`Refactor compatibility OK against ${BASELINE}`);
