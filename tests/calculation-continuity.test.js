// Spreadsheet API mocks: tests edit handling, actual generated display expressions,
// migration/retry and fault boundaries. Google FILTER/LOOKUP need live verification.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const path = 'src/26_sheet_calculation_continuity.gs';
class Range {
  constructor(sheet, r, c, rows=1, cols=1) { Object.assign(this,{sheet,r,c,rows,cols}); }
  getSheet(){return this.sheet;} getRow(){return this.r;} getColumn(){return this.c;}
  getLastRow(){return this.r+this.rows-1;} getLastColumn(){return this.c+this.cols-1;}
  getFormula(){return this.sheet.formulas[this.r+','+this.c]||'';}
  getValue(){
    const key=this.r+','+this.c, formula=this.getFormula();
    if(!formula)return this.sheet.values[key]??'';
    if(this.sheet.name==='_計算継続管理'&&this.c===10)return this.sheet.ss.keys[this.r]??'';
    if(this.sheet.name==='_計算継続管理'&&this.c===4)return this.sheet.ss.raw[this.r]??0;
    if(formula.includes("'_計算継続管理'!"))return this.sheet.ss.evaluate(formula);
    return this.sheet.values[key]??'';
  }
  getDisplayValue(){const v=this.getValue();return v instanceof Date?v.toISOString().slice(0,10):String(v);}
  setValue(v){return this.setValues([[v]]);}
  setValues(values){values.forEach((row,ri)=>row.forEach((v,ci)=>{
    const key=(this.r+ri)+','+(this.c+ci); this.sheet.values[key]=typeof v==='string'&&v.startsWith("'")?v.slice(1):v;
    delete this.sheet.formulas[key];
  }));return this;}
  setFormula(f){
    if(this.sheet.ss.failFormula){const fail=this.sheet.ss.failFormula(this,f);if(fail)throw Error('injected');}
    this.sheet.formulas[this.r+','+this.c]=f;return this;
  }
}
class Sheet {
  constructor(ss,name){Object.assign(this,{ss,name,values:{},formulas:{}});}
  getName(){return this.name;}getSheetId(){return Object.keys(this.ss.sheets).indexOf(this.name);}
  getRange(r,c,rows,cols){if(typeof r==='string'){const m=r.match(/^([A-Z]+)(\d+)$/);c=[...m[1]].reduce((a,x)=>a*26+x.charCodeAt(0)-64,0);r=+m[2];}return new Range(this,r,c,rows,cols);}
  hideSheet(){this.hidden=true;}
}
function environment(){
  const ss={sheets:{},raw:{},keys:{},getId:()=> 'fixture',getSheetByName(n){return this.sheets[n]||null;},insertSheet(n){return this.sheets[n]=new Sheet(this,n);}};
  ss.evaluate=function(formula){
    const helper=this.getSheetByName('_計算継続管理');
    const expression=formula.slice(1).replace(/'_計算継続管理'!([DEFJK])(\d+)/g,(_,c,r)=>JSON.stringify(helper.getRange(c+r).getValue())).replace(/(?<![<>])=(?!=)/g,'===').replace(/&/g,'+');
    return Function('IF','TEXT','INT','MOD','return '+expression)((x,y,z)=>x?y:z,(n)=>String(n).padStart(2,'0'),Math.floor,(a,b)=>a%b);
  };
  const triggers=[];
  const context={SPREADSHEET_ID:'fixture',Date,Number,SpreadsheetApp:{flush(){}},ScriptApp:{getProjectTriggers:()=>triggers,newTrigger(handler){return{forSpreadsheet(){return this;},onEdit(){return this;},create(){triggers.push({getHandlerFunction:()=>handler,getTriggerSourceId:()=>ss.getId()});}};}},spreadsheet_:()=>ss,locked_:f=>f(),isFormulaLikeUserText_:s=>/^[=+\-@]/.test(s)};
  vm.createContext(context);vm.runInContext(fs.readFileSync(path,'utf8'),context);
  const specs=context.calculationSpecs_();
  for(const spec of specs){const sh=ss.getSheetByName(spec.sheet)||ss.insertSheet(spec.sheet),c=sh.getRange(spec.cell);c.setValue(spec.mode==='duration'?'01:00':spec.mode==='number'?3:7);c.setFormula('=original');}
  for(const alias of context.calculationAliases_()){ss.getSheetByName(alias.sheet).getRange(alias.cell).setFormula('=reference');}
  for(let i=0;i<specs.length;i++)ss.raw[i+2]=specs[i].mode==='duration'?40:3;
  function edit(sheet,cell,value){const range=ss.getSheetByName(sheet).getRange(cell);range.setValue(value);context.continueCalculationsAfterEdit_({source:ss,range});return range;}
  return {ss,context,edit,triggers,specs};
}
const e=environment();e.context.installCalculationContinuity_();
assert.equal(e.specs.length,33);assert.equal(e.context.calculationAliases_().length,35);
assert.equal(e.ss.getSheetByName('BAT_1').getRange('B7').getValue(),'01:00');
e.ss.raw[2]=50;assert.equal(e.ss.getSheetByName('BAT_1').getRange('B7').getValue(),'01:10');
e.edit('BAT_1','B7','00:25');assert.equal(e.ss.getSheetByName('BAT_1').getRange('B7').getValue(),'00:25');
e.ss.raw[2]=60;assert.equal(e.ss.getSheetByName('BAT_1').getRange('B7').getValue(),'00:35');
e.edit('バッテリー台帳','G5','100:05');e.ss.raw[2]=70;
assert.equal(e.ss.getSheetByName('BAT_1').getRange('B7').getValue(),'100:15');
assert(e.ss.getSheetByName('バッテリー台帳').getRange('G5').getFormula().includes("'BAT_1'!B7"));
e.edit('BAT_1','B8',12);e.ss.raw[3]=4;assert.equal(e.ss.getSheetByName('BAT_1').getRange('B8').getValue(),13);
e.edit('BAT_1','B9',20);assert.equal(e.ss.getSheetByName('BAT_1').getRange('B9').getValue(),20);e.ss.raw[4]=21;e.ss.keys[4]="new record";assert.equal(e.ss.getSheetByName('BAT_1').getRange('B9').getValue(),21);
e.edit('バッテリー台帳','J5','なし');assert.equal(e.ss.getSheetByName('BAT_1').getRange('E4').getValue(),'なし');
e.context.installCalculationContinuity_();assert.equal(e.triggers.length,1);assert.equal(e.ss.getSheetByName('BAT_1').getRange('B7').getValue(),'100:15');
assert.throws(()=>e.edit('BAT_1','B7','invalid'));assert.equal(e.ss.getSheetByName('BAT_1').getRange('B7').getValue(),'invalid');
assert.throws(()=>e.edit('BAT_1','B8',-1));assert.throws(()=>e.context.calculationAnchor_('999999999999999999999:00','', 'duration'));
const date=new Date('2026-09-11T15:00:00Z');assert.equal(e.context.calculationAnchor_(date,'','latest').getTime(),date.getTime());
const unrelated=e.ss.insertSheet('日付記録').getRange('A1').setValue('手動訂正');e.context.continueCalculationsAfterEdit_({source:e.ss,range:unrelated});assert.equal(unrelated.getValue(),'手動訂正');
const f=environment();let fired=false;f.ss.failFormula=(r)=>{if(r.sheet.name==='BAT_2'&&!fired){fired=true;return true;}};
assert.throws(()=>f.context.installCalculationContinuity_(),/injected/);f.ss.failFormula=null;f.context.installCalculationContinuity_();assert.equal(f.ss.getSheetByName('_計算継続管理').getRange('K1').getValue(),'READY');assert.equal(f.triggers.length,1);
const foreign=environment();foreign.ss.insertSheet('_計算継続管理').getRange('A1').setValue('user data');assert.throws(()=>foreign.context.installCalculationContinuity_());assert.equal(foreign.ss.getSheetByName('_計算継続管理').getRange('A1').getValue(),'user data');
// Separate batteries and every ledger alias must not cross-write.
const all=environment();all.context.installCalculationContinuity_();
for(let b=1;b<=7;b++){
  all.edit('バッテリー台帳','G'+(b+4),'0'+b+':00');
  assert.equal(all.ss.getSheetByName('BAT_'+b).getRange('B7').getValue(),'0'+b+':00');
}
for(let b=1;b<=7;b++)assert.equal(all.ss.getSheetByName('BAT_'+b).getRange('B7').getValue(),'0'+b+':00');
all.edit('バッテリー台帳','P2',10);all.ss.raw[30]++;
assert.equal(all.ss.getSheetByName('バッテリー台帳').getRange('P2').getValue(),11);
// A new latest record with the SAME measured cycle value still ends the override.
all.edit('BAT_1','B9',25);all.ss.keys[4]='different row, same cycle';
assert.equal(all.ss.getSheetByName('BAT_1').getRange('B9').getValue(),3);
// Repeated delivery of an edit after the formula was restored must be a no-op.
const ready=JSON.stringify(all.ss.getSheetByName('_計算継続管理').values);
all.context.continueCalculationsAfterEdit_({source:all.ss,range:all.ss.getSheetByName('BAT_1').getRange('B7')});
assert.equal(JSON.stringify(all.ss.getSheetByName('_計算継続管理').values),ready);
// Multi-cell paste with one invalid entry keeps every user entry intact.
const bad=all.ss.getSheetByName('BAT_2');bad.getRange('B7').setValue('00:30');bad.getRange('B8').setValue('invalid');
assert.throws(()=>all.context.continueCalculationsAfterEdit_({source:all.ss,range:bad.getRange(7,2,2,1)}));
assert.equal(bad.getRange('B7').getValue(),'00:30');assert.equal(bad.getRange('B7').getFormula(),'');
// Missing source / formula error does not silently reset the corrected total.
all.ss.raw[2]='#REF!';assert.throws(()=>all.edit('BAT_1','B7','00:15'));assert.equal(all.ss.getSheetByName('BAT_1').getRange('B7').getValue(),'00:15');
console.log('CONTINUITY PASS: 68 mappings, baseline preserved, repeated edits, ledger aliases, counts/latest, 100h, invalid input, date preservation, installation retry, no duplicate trigger, unrelated data unchanged');
