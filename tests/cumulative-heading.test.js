// Generated headers and cumulative sample: local mocks only, no live Spreadsheet.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('tests/regression.test.js','utf8');
const sandbox={require,process:{argv:['node','test','dist/Code.gs']},console,Buffer};vm.createContext(sandbox);
vm.runInContext(source.slice(0,source.indexOf('\nfunction run() {'))+'\nglobalThis.h={makeEnvironment,makeInput,snapshotBusiness};',sandbox);
const h=sandbox.h, title='総飛行時間（HH:MM）';
for(const test of [false,true]){
 const e=h.makeEnvironment('12:35','04:10');const template=JSON.stringify(e.ss.getSheetByName('日常点検').data);
 const input=h.makeInput([{model:'EVO Lite',minutes:10,battery:1},{model:'EVO Lite',minutes:10,battery:2},{model:'EVO Lite+',minutes:10,battery:3},{model:'EVO Lite+',minutes:10,battery:4}]);
 if(test)input.session.purpose='アプリテスト';
 e.context.finishAircraft(input);const sheet=e.ss.getSheetByName((test?'TEST_':'')+'2026.9.6');
 for(const col of [9,24])assert.equal(sheet.getRange(32,col).getValue(),title);
 assert.equal(sheet.getRange(33,9).getValue(),'12:45');assert.equal(sheet.getRange(34,9).getValue(),'12:55');
 assert.equal(sheet.getRange(33,24).getValue(),'04:20');assert.equal(sheet.getRange(34,24).getValue(),'04:30');
 assert.equal(e.context.aircraftTotalMinutes_('EVO Lite'),test?755:775);assert.equal(e.context.aircraftTotalMinutes_('EVO Lite+'),test?250:270);
 const before=h.snapshotBusiness(e);e.context.finishAircraft(input);assert.equal(h.snapshotBusiness(e),before);
 const next=e.context.getOrCreateDateSheet_(e.ss,new Date('2026-09-06T00:00:00Z'),true,2,test);
 assert.equal(next.getName(),(test?'TEST_':'')+'2026.9.6_2');for(const col of [9,24])assert.equal(next.getRange(32,col).getValue(),title);
 assert.equal(JSON.stringify(e.ss.getSheetByName('日常点検').data),template);
}
for(const old of ['総飛行時間','総飛行時間（累計時間）',title]){
 const e=h.makeEnvironment('99:55');const existing=e.ss.getSheetByName('日常点検').copyTo(e.ss).setName('2026.9.6');
 for(const col of [9,24])existing.getRange(32,col).setValue(old);
 const input=h.makeInput([{model:'EVO Lite',minutes:10}]);e.context.finishAircraft(input);
 assert.equal(existing.getRange(33,9).getValue(),'100:05');assert.equal(e.context.aircraftTotalMinutes_('EVO Lite'),6005);
 for(const col of [9,24])assert.equal(existing.getRange(32,col).getValue(),old);
}
const e=h.makeEnvironment('23:55');e.context.finishAircraft(h.makeInput([{model:'EVO Lite',minutes:10}]));assert.equal(e.ss.getSheetByName('2026.9.6').getRange(33,9).getValue(),'24:05');
console.log('CUMULATIVE: 2 models / 4 flights / TEST / replay / 24h / 100h / new+sequence headers / old aliases / template unchanged PASS');
