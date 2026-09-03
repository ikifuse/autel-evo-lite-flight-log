const SPREADSHEET_ID = '10PMEteELQRRWnqc5mVmF6tQCfxFEJEGe2LitpDhYqk8';
const TZ = 'Asia/Tokyo';
const MODELS = {
  'EVO Lite': { registration: 'JU3268805C02', settingRow: 3 },
  'EVO Lite+': { registration: 'JU3269B165D2', settingRow: 4 }
};

function doGet() {
  return HtmlService.createHtmlOutput(APP_HTML)
    .setTitle('ドローン運航記録テスト版')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1');
}

function ss_() { return SpreadsheetApp.openById(SPREADSHEET_ID); }
function now_() { return new Date(); }
function fmt_(d, pattern) { return Utilities.formatDate(new Date(d), TZ, pattern); }

function getState() {
  const ss = ss_();
  const active = activeSession_(ss);
  const totals = {};
  Object.keys(MODELS).forEach(model => totals[model] = aircraftTotal_(ss, model));
  if (!active) return { active: false, totals: totals };
  return {
    active: true,
    row: active.row,
    sessionId: active.v[0],
    date: displayDate_(active.v[1]),
    status: active.v[4],
    model: active.v[5] || active.v[13] || '',
    pilot: active.v[6] || '吉田公一',
    location: active.v[7] || '',
    purpose: active.v[8] || '操縦練習',
    note: active.v[9] || '',
    flightId: active.v[11] || '',
    phase: active.v[12] || 'READY',
    nextModel: active.v[13] || '',
    flightCount: sessionFlights_(ss, active.v[0]).length,
    totals: totals
  };
}

function startAircraft(p) {
  return locked_(function() {
    required_(p.model, '機体');
    required_(p.location, '点検場所');
    required_(p.pilot, '実施者');
    required_(p.purpose, '飛行目的');
    validateChecks_(p.checks, ['permission','weather','attachment','damage','motor','battery','systems','remoteId']);
    validateAbnormalNote_(p.checks, p.note);
    const ss = ss_();
    let active = activeSession_(ss);
    let sessionId;
    let row;
    if (!active) {
      sessionId = 'OP-' + fmt_(now_(), 'yyyyMMdd-HHmmss');
      const sh = ss.getSheetByName('運航セッション');
      sh.appendRow([sessionId, new Date(), now_(), '', '運航中', p.model, p.pilot, p.location, p.purpose, p.note || '', now_(), '', 'PRE_REQUIRED', '']);
      row = sh.getLastRow();
    } else {
      if (active.v[12] !== 'PRE_REQUIRED') throw new Error('現在の運航を先に完了してください。');
      if (active.v[13] && active.v[13] !== p.model) throw new Error('切替先の機体が一致しません。');
      sessionId = active.v[0];
      row = active.row;
    }
    const flightId = nextFlightId_(ss, sessionId, p.model);
    appendCheck_(ss, sessionId, flightId, p.model, '飛行前', p.location, p.pilot, p.checks, p.note || '');
    if (hasAbnormal_(p.checks)) {
      ss.getSheetByName('運航セッション').getRange(row, 6, 1, 9).setValues([[
        p.model, p.pilot, p.location, p.purpose, p.note || '', now_(), '', 'PRE_REQUIRED', p.model
      ]]);
      throw new Error('異常を記録しました。飛行は開始できません。点検・整備後に、もう一度「飛行前点検」を行ってください。');
    }
    ss.getSheetByName('運航セッション').getRange(row, 6, 1, 9).setValues([[
      p.model, p.pilot, p.location, p.purpose, p.note || '', now_(), flightId, 'READY', ''
    ]]);
    return getState();
  });
}

function recordFlight(p) {
  return locked_(function() {
    const ss = ss_();
    const a = activeSession_(ss);
    if (!a || a.v[12] !== 'READY') throw new Error('飛行前点検が完了した機体がありません。');
    required_(p.takeoffTime, '離陸時刻');
    required_(p.landingTime, '着陸時刻');
    required_(p.takeoffLocation, '離陸場所');
    required_(p.landingLocation, '着陸場所');
    required_(p.route, '飛行経路');
    const methods = normalizeList_(p.method);
    if (!methods.length) throw new Error('飛行空域・方法を1つ以上選んでください。');
    if (methods.indexOf('通常飛行（特定飛行なし）') >= 0 && methods.some(x => x !== '通常飛行（特定飛行なし）' && x !== '屋内練習')) {
      throw new Error('「通常飛行（特定飛行なし）」と特定飛行の項目は同時に選べません。');
    }
    required_(p.safety, '安全に影響した事項');
    required_(p.malfunction, '不具合');
    required_(p.nextAction, '次の操作');
    if (p.safety === 'あり' && !p.safetyDetail) throw new Error('安全に影響した事項の内容と飛行前後の機体状況を入力してください。');
    if (p.malfunction === 'あり') {
      required_(p.malfunctionDate, '不具合の発生日');
      required_(p.malfunctionDetail, '不具合内容');
      required_(p.actionStatus, '不具合への対応状況');
      if (p.actionStatus === '処置済み') {
        required_(p.actionDate, '処置年月日');
        required_(p.actionDetail, '処置内容');
        required_(p.confirmer, '確認者');
      }
    }
    if (p.nextAction === 'continue' && p.changeStatus === '変化なし' && p.continueConfirm !== '確認済み') {
      throw new Error('同じ機体で続ける場合は、バッテリー装着・残量と機体／周辺状況の確認をしてください。');
    }

    const date = new Date(a.v[1]);
    const takeoff = timeOnDate_(date, p.takeoffTime);
    const landing = timeOnDate_(date, p.landingTime);
    if (landing < takeoff) landing.setDate(landing.getDate() + 1);
    const calculated = Math.max(0, Math.round((landing - takeoff) / 60000));
    const actual = p.actualMinutes === '' || p.actualMinutes == null ? '' : Number(p.actualMinutes);
    const used = actual === '' ? calculated : actual;
    if (!Number.isFinite(used) || used < 0) throw new Error('飛行時間を確認してください。');

    const model = a.v[5];
    const flightId = a.v[11];
    const totalBefore = aircraftTotal_(ss, model);
    const totalAfter = totalBefore.value == null ? '' : totalBefore.value + used;
    const cfg = ss.getSheetByName('設定');
    const cert = cfg.getRange('B7').getDisplayValue();
    const registration = MODELS[model].registration;
    const result = (p.safety === 'あり' || p.malfunction === 'あり') ? '要確認' : '正常';
    const malfunctionArticle = p.malfunction === 'あり'
      ? [
          '発生日: ' + p.malfunctionDate,
          '不具合: ' + p.malfunctionDetail,
          '対応状況: ' + p.actionStatus,
          p.actionStatus === '処置済み' ? '処置日: ' + p.actionDate : '',
          p.actionStatus === '処置済み' ? '処置内容: ' + p.actionDetail : '',
          p.actionStatus === '処置済み' ? '確認者: ' + p.confirmer : '',
          p.responseDetail ? '補足: ' + p.responseDetail : ''
        ].filter(Boolean).join(' / ')
      : 'なし';
    ss.getSheetByName('飛行記録').appendRow([
      a.v[0], flightId, new Date(a.v[1]), model, registration, a.v[6], cert,
      a.v[8], p.route, methods.join(' / '), p.takeoffLocation, takeoff, p.landingLocation, landing,
      actual, used, totalAfter,
      p.safety === 'あり' ? p.safetyDetail : 'なし',
      p.malfunction === 'あり' ? p.malfunctionDetail : 'なし',
      malfunctionArticle, result, now_()
    ]);

    let nextModel = '';
    if (p.nextAction === 'switch') nextModel = model === 'EVO Lite' ? 'EVO Lite+' : 'EVO Lite';
    if (p.nextAction === 'continue' && p.changeStatus === '変化なし' && p.safety === 'なし' && p.malfunction === 'なし') {
      const quick = quickNormalChecks_();
      appendCheck_(ss, a.v[0], flightId, model, '飛行後（継続）', p.landingLocation, a.v[6], quick, 'バッテリー交換時：異常・変化なし');
      const nextId = nextFlightId_(ss, a.v[0], model);
      appendCheck_(ss, a.v[0], nextId, model, '飛行前（継続確認）', p.takeoffLocation, a.v[6], quick, '前回から機体・周辺状況に変化なしを確認');
      ss.getSheetByName('運航セッション').getRange(a.row, 12, 1, 3).setValues([[nextId, 'READY', '']]);
    } else {
      if (p.nextAction === 'continue') nextModel = model;
      ss.getSheetByName('運航セッション').getRange(a.row, 13, 1, 2).setValues([['POST_REQUIRED', nextModel]]);
    }
    return getState();
  });
}

function submitPostflight(p) {
  return locked_(function() {
    const ss = ss_();
    const a = activeSession_(ss);
    if (!a || a.v[12] !== 'POST_REQUIRED') throw new Error('飛行後点検待ちの機体がありません。');
    required_(p.location, '点検場所');
    required_(p.pilot, '実施者');
    validateChecks_(p.checks, ['attachment','damage','debris','heat','flightAnomaly']);
    validateAbnormalNote_(p.checks, p.note);
    appendCheck_(ss, a.v[0], a.v[11], a.v[5], '飛行後', p.location, p.pilot, p.checks, p.note || '');
    const sh = ss.getSheetByName('運航セッション');
    const nextModel = a.v[13] || '';
    if (nextModel) {
      sh.getRange(a.row, 6).setValue('');
      sh.getRange(a.row, 12, 1, 3).setValues([['', 'PRE_REQUIRED', nextModel]]);
    } else {
      sh.getRange(a.row, 4, 1, 3).setValues([[now_(), '完了', '']]);
      sh.getRange(a.row, 12, 1, 3).setValues([['', 'DONE', '']]);
      createDailyReport_(ss, a.v[0]);
    }
    return getState();
  });
}

function addBatteryRecord(p) {
  return locked_(function() {
    const n = Number(p.battery);
    if (!Number.isInteger(n) || n < 1 || n > 7) throw new Error('バッテリーを選んでください。');
    const sh = ss_().getSheetByName('BAT_' + n);
    let row = 13;
    while (row <= 212 && sh.getRange(row, 1).getValue() !== '') row++;
    if (row > 212) throw new Error('このバッテリーシートの入力行が上限です。');
    const date = p.date ? new Date(p.date + 'T00:00:00') : now_();
    sh.getRange(row, 1, 1, 8).setValues([[
      date, p.model || '', p.purpose || '', numberOrBlank_(p.minutes), numberOrBlank_(p.cycle),
      p.condition || '', p.location || '', p.note || ''
    ]]);
    return { ok: true, battery: n, row: row };
  });
}

function addMaintenanceRecord(p) {
  return locked_(function() {
    required_(p.model, '機体'); required_(p.type, '区分'); required_(p.reason, '実施理由');
    required_(p.content, '実施内容'); required_(p.person, '実施者'); required_(p.location, '実施場所');
    const ss = ss_();
    const total = aircraftTotal_(ss, p.model);
    if (total.value == null) throw new Error('総飛行時間の初期値が未設定です。設定シートを確認してください。');
    const legalContent = '【実施時総飛行時間】' + total.label + '\n【実施内容】' + p.content;
    ss.getSheetByName('点検整備記録').appendRow([
      p.date ? new Date(p.date + 'T00:00:00') : now_(), p.model, MODELS[p.model].registration,
      p.location, p.person, p.type, p.reason, legalContent, p.parts || '', p.result || '',
      p.next || '', p.note || '', now_()
    ]);
    return { ok: true, total: total.label };
  });
}

function activeSession_(ss) {
  const sh = ss.getSheetByName('運航セッション');
  const last = sh.getLastRow();
  if (last < 2) return null;
  const vals = sh.getRange(2, 1, last - 1, 14).getValues();
  for (let i = vals.length - 1; i >= 0; i--) if (vals[i][4] === '運航中') return { row: i + 2, v: vals[i] };
  return null;
}

function appendCheck_(ss, sessionId, flightId, model, type, location, pilot, checks, note) {
  const keys = ['permission','weather','attachment','damage','motor','battery','systems','remoteId','debris','heat','flightAnomaly'];
  const vals = keys.map(k => checks && checks[k] ? checks[k] : '');
  const overall = vals.indexOf('異常') >= 0 ? '異常あり' : '正常';
  ss.getSheetByName('点検記録').appendRow([
    sessionId, flightId, now_(), model, MODELS[model].registration, type, location, pilot
  ].concat(vals).concat([overall, note || '']));
}

function quickNormalChecks_() {
  return { permission:'正常', weather:'正常', attachment:'正常', damage:'正常', motor:'正常', battery:'正常', systems:'正常', remoteId:'正常', debris:'正常', heat:'正常', flightAnomaly:'正常' };
}

function nextFlightId_(ss, sessionId, model) {
  const n = sessionFlights_(ss, sessionId).length + 1;
  const tag = model === 'EVO Lite' ? 'LITE' : 'LITEPLUS';
  return sessionId.replace('OP-', '') + '-' + tag + '-' + ('00' + n).slice(-3);
}

function sessionFlights_(ss, sessionId) {
  const sh = ss.getSheetByName('飛行記録');
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 22).getValues().filter(r => r[0] === sessionId);
}

function aircraftTotal_(ss, model) {
  const row = MODELS[model].settingRow;
  const initial = ss.getSheetByName('設定').getRange(row, 3).getValue();
  let sum = 0;
  const sh = ss.getSheetByName('飛行記録');
  if (sh.getLastRow() >= 2) {
    sh.getRange(2, 4, sh.getLastRow() - 1, 13).getValues().forEach(r => {
      if (r[0] === model && r[12] !== '') sum += Number(r[12]) || 0;
    });
  }
  return { value: initial === '' ? null : Number(initial) + sum, label: initial === '' ? '初期値未設定' : minutesLabel_(Number(initial) + sum) };
}

function createDailyReport_(ss, sessionId) {
  const sessionSh = ss.getSheetByName('運航セッション');
  const rows = sessionSh.getRange(2, 1, sessionSh.getLastRow() - 1, 14).getValues();
  const s = rows.find(r => r[0] === sessionId);
  if (!s) return;
  const template = ss.getSheetByName('日報テンプレート');
  const name = uniqueSheetName_(ss, '日報_' + fmt_(s[1], 'yyyyMMdd'));
  const out = template.copyTo(ss).setName(name);
  const flights = sessionFlights_(ss, sessionId);
  const models = [...new Set(flights.map(r => r[3]))].join(' / ');
  const minutes = flights.reduce((a, r) => a + (Number(r[15]) || 0), 0);
  const abnormal = flights.some(r => r[20] !== '正常') ? 'あり' : 'なし';
  out.getRange('B3').setValue(s[1]); out.getRange('D3').setValue(sessionId); out.getRange('F3').setValue(s[6]); out.getRange('H3').setValue('完了');
  out.getRange('B4').setValue(models); out.getRange('D4').setValue(s[7]); out.getRange('F4').setValue(s[8]); out.getRange('H4').setValue(flights.length);
  out.getRange('B5').setValue(s[2]); out.getRange('D5').setValue(now_()); out.getRange('F5').setValue(minutes); out.getRange('H5').setValue(abnormal);
  out.getRange('B6:H6').merge().setValue(s[9] || '');
  if (flights.length) {
    const reportRows = flights.slice(0, 20).map(r => [r[1],r[3],r[11],r[13],r[15],r[16],r[20],'飛行記録シート参照']);
    out.getRange(9, 1, reportRows.length, 8).setValues(reportRows);
  }
  out.getRange('B3').setNumberFormat('yyyy-mm-dd'); out.getRange('B5:D5').setNumberFormat('yyyy-mm-dd hh:mm');
  out.getRange('C9:D28').setNumberFormat('hh:mm');
  ss.setActiveSheet(out); ss.moveActiveSheet(2);
}

function uniqueSheetName_(ss, base) { let n=1, name=base; while(ss.getSheetByName(name)) name=base+'_'+(++n); return name; }
function timeOnDate_(date, hm) { const parts=hm.split(':').map(Number); const d=new Date(date); d.setHours(parts[0],parts[1],0,0); return d; }
function displayDate_(v) { return v ? fmt_(v,'yyyy-MM-dd') : ''; }
function minutesLabel_(m) { return Math.floor(m/60)+'時間'+(m%60)+'分'; }
function numberOrBlank_(v) { return v === '' || v == null ? '' : Number(v); }
function required_(v, label) {
  if (v == null || (Array.isArray(v) ? v.length === 0 : String(v).trim() === '')) throw new Error(label+'は必須です。');
}
function validateChecks_(checks, keys) { keys.forEach(k => required_(checks && checks[k], '点検結果')); }
function hasAbnormal_(checks) {
  return Object.keys(checks || {}).some(k => checks[k] === '異常');
}
function validateAbnormalNote_(checks, note) {
  if (hasAbnormal_(checks) && (!note || String(note).trim() === '')) throw new Error('「異常」がある場合は、特記事項に内容を入力してください。');
}
function normalizeList_(v) {
  if (v == null || v === '') return [];
  return Array.isArray(v) ? v.filter(Boolean) : [v];
}
function locked_(fn) { const lock=LockService.getScriptLock(); lock.waitLock(20000); try { return fn(); } finally { lock.releaseLock(); } }

const APP_HTML = `<!doctype html>
<html lang="ja"><head><base target="_top"><meta charset="utf-8">
<style>
*{box-sizing:border-box}body{margin:0;background:#f3f6f9;color:#1f2937;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue","Yu Gothic",sans-serif}.wrap{max-width:680px;margin:auto;padding:14px}.hero{background:#1f4e78;color:white;padding:18px;border-radius:16px;margin-bottom:12px}.hero h1{font-size:21px;margin:0 0 5px}.hero p{font-size:13px;margin:0;opacity:.9}.card{background:white;border-radius:14px;padding:16px;margin:11px 0;box-shadow:0 2px 9px rgba(0,0,0,.07)}h2{font-size:18px;margin:0 0 12px}.status{border-left:6px solid #5b9bd5}.ok{border-left-color:#548235}.warn{border-left-color:#d97706}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.btn{border:0;border-radius:12px;padding:15px 12px;font-weight:700;font-size:16px;width:100%;background:#1f4e78;color:white}.btn.green{background:#548235}.btn.orange{background:#c66a11}.btn.gray{background:#64748b}.btn.light{background:#e5eef7;color:#163a5c}.btn:disabled{opacity:.5}.field{margin:12px 0}.field label{font-weight:700;display:block;margin-bottom:6px}.req{color:#b91c1c;font-size:12px}input,select,textarea{width:100%;font-size:16px;padding:11px;border:1px solid #cbd5e1;border-radius:9px;background:white}textarea{min-height:74px}.check{display:grid;grid-template-columns:1fr 120px;gap:8px;align-items:center;padding:9px 0;border-bottom:1px solid #edf2f7}.check span{font-size:14px}.note{font-size:13px;color:#64748b}.error{background:#fee2e2;color:#991b1b;padding:11px;border-radius:9px;margin:10px 0}.success{background:#dcfce7;color:#166534;padding:11px;border-radius:9px;margin:10px 0}.loading{text-align:center;padding:30px}.totals{display:flex;gap:8px}.pill{background:#eef5fb;border-radius:10px;padding:9px;flex:1;font-size:13px}.hidden{display:none}.mini{font-size:12px;color:#64748b}.quickbar{display:flex;gap:8px;margin:8px 0 4px}.quickbar .btn{padding:10px;font-size:14px}.multi{display:grid;grid-template-columns:1fr 1fr;gap:8px}.tick{display:flex;align-items:center;gap:8px;border:1px solid #cbd5e1;border-radius:9px;padding:10px;background:#fff}.tick input{width:auto}.confirmbox{background:#eef7ee;border:1px solid #b7d7b7;border-radius:10px;padding:11px;margin:10px 0}.confirmbox input{width:auto}@media(max-width:480px){.grid,.multi{grid-template-columns:1fr}.check{grid-template-columns:1fr 112px}.wrap{padding:10px}.btn{padding:14px 10px}}
</style></head><body><div class="wrap"><div class="hero"><h1>ドローン運航記録</h1><p>テスト版｜必要な操作だけを順番に表示します</p></div><div id="msg"></div><div id="app" class="loading">読み込み中…</div></div>
<script>
var state=null;
function call(name,data,ok){showMsg('');document.getElementById('app').style.opacity='.55';google.script.run.withSuccessHandler(function(r){document.getElementById('app').style.opacity='1';ok?ok(r):render(r)}).withFailureHandler(function(e){document.getElementById('app').style.opacity='1';showMsg(e.message||String(e),true)} )[name](data);}
function load(){google.script.run.withSuccessHandler(render).withFailureHandler(function(e){showMsg(e.message,true)}).getState()}
function render(s){state=s;var a=document.getElementById('app');a.className='';var h=totalsHtml(s.totals);if(!s.active){h+=startChoice();a.innerHTML=h;return}h+=statusHtml(s);if(s.phase==='PRE_REQUIRED')h+=preForm(s.model||s.nextModel,s);else if(s.phase==='READY')h+=flightForm(s);else if(s.phase==='POST_REQUIRED')h+=postForm(s);a.innerHTML=h}
function totalsHtml(t){return '<div class="totals"><div class="pill"><b>Lite 累計</b><br>'+esc(t['EVO Lite'].label)+'</div><div class="pill"><b>Lite+ 累計</b><br>'+esc(t['EVO Lite+'].label)+'</div></div>'}
function statusHtml(s){return '<div class="card status"><b>運航日：</b>'+esc(s.date)+'<br><b>状態：</b>'+esc(s.phase)+'<br><b>使用機体：</b>'+esc(s.model||'切替準備中')+'<br><b>記録済み飛行：</b>'+s.flightCount+'回</div>'}
function startChoice(){return '<div class="card"><h2>使用する機体を選択</h2><div class="grid"><button class="btn" onclick="showPre(&quot;EVO Lite&quot;)">EVO Liteを使用開始</button><button class="btn green" onclick="showPre(&quot;EVO Lite+&quot;)">EVO Lite+を使用開始</button></div></div>'+utilityButtons()}
function utilityButtons(){return '<div class="card"><h2>任意記録</h2><div class="grid"><button class="btn light" onclick="showBattery()">バッテリーを記録</button><button class="btn light" onclick="showMaintenance()">点検・整備を記録</button></div></div>'}
function preForm(model,s){return formCard('飛行前点検｜'+model,'pre',commonFields(s)+checkFields(['permission','weather','attachment','damage','motor','battery','systems','remoteId'])+'<div class="field"><label>特記事項 <span class="mini">（任意。異常時のみ必須）</span></label><textarea name="note" placeholder="分からなければ空欄でOK。異常を選んだ場合だけ内容を記入"></textarea></div><button class="btn" type="submit">飛行前点検を完了</button>','submitPre(event,&quot;'+model+'&quot;)')+utilityButtons()}
function showPre(model){document.getElementById('app').innerHTML=totalsHtml(state.totals)+preForm(model,{pilot:'吉田公一',location:'',purpose:'操縦練習'})}
function commonFields(s){return pilotFields(s.pilot||'吉田公一')+field('location','点検・飛行場所','text',s.location||'',true)+field('purpose','飛行目的','text',s.purpose||'操縦練習',true)}
function flightForm(s){var now=hm();return '<div class="card ok"><h2>短い飛行記録｜'+esc(s.model)+'</h2><div class="note">必須だけ答えればOK。任意欄は分からなければ空欄のままで保存できます。</div><form onsubmit="submitFlight(event)" onchange="toggleConditional(this)">'+field('takeoffLocation','離陸場所','text',s.location,true)+field('landingLocation','着陸場所','text',s.location,true)+'<div class="grid">'+field('takeoffTime','離陸時刻','time','',true)+field('landingTime','着陸時刻','time',now,true)+'</div>'+field('actualMinutes','実機記録時間（分）','number','',false,'空欄なら離陸・着陸時刻から自動計算')+field('route','飛行経路','text','練習区域内',true)+methodFields()+selectField('safety','安全に影響した事項',['なし','あり'],true)+conditionalText('safetyBox','safetyDetail','内容＋飛行前後の機体状況','安全に影響した事項が「あり」の時だけ入力')+selectField('malfunction','不具合',['なし','あり'],true)+malfunctionFields()+selectField('nextAction','この後',['同じ機体で続ける','機種を変更する','今日の運航を終了'],true,'continue,switch,end')+'<div id="continueBox" class="hidden">'+selectField('changeStatus','機体・周辺状況の変化',['変化なし','変化あり'],true)+'<div id="continueConfirmBox" class="hidden confirmbox"><label><input type="checkbox" name="continueConfirm" value="確認済み"> バッテリーの装着・残量と、機体／周辺状況に変化がないことを確認した</label></div></div><button class="btn green" type="submit">この飛行を記録</button></form></div>'+utilityButtons()}
function postForm(s){return formCard('飛行後点検｜'+s.model,'post',pilotFields(s.pilot||'吉田公一')+field('location','点検場所','text',s.location,true)+checkFields(['attachment','damage','debris','heat','flightAnomaly'])+'<div class="field"><label>特記事項 <span class="mini">（任意。異常時のみ必須）</span></label><textarea name="note" placeholder="分からなければ空欄でOK。異常を選んだ場合だけ内容を記入"></textarea></div><button class="btn orange" type="submit">飛行後点検を完了</button>','submitPost(event)')}
function formCard(title,id,inside,submit){return '<div class="card"><h2>'+esc(title)+'</h2><div class="note">必須項目はすべて入力してください。</div><form id="'+id+'" onsubmit="'+submit+'">'+inside+'</form></div>'}
var labels={permission:'許可・承認、空域、飛行計画等',weather:'天候・風・周辺の安全',attachment:'各機器の取付状態',damage:'プロペラ・フレームの損傷／ゆがみ',motor:'モーターの異音',battery:'バッテリー残量・取付状態',systems:'通信・推進・電源・自動制御',remoteId:'リモートID等',debris:'機体へのゴミ等の付着',heat:'各機器の異常発熱',flightAnomaly:'飛行中の異常'};
function pilotFields(current){var isDefault=!current||current==='吉田公一';return '<div class="field"><label>操縦者 <span class="req">必須</span></label><select name="pilotChoice" onchange="togglePilot(this)"><option value="吉田公一" '+(isDefault?'selected':'')+'>吉田公一</option><option value="other" '+(!isDefault?'selected':'')+'>その他の操縦者</option></select></div><div id="pilotOtherBox" class="'+(isDefault?'hidden':'')+'">'+field('pilotOther','操縦者名','text',isDefault?'':current,true,'修理・点検・貸出し等で別の人が飛ばした場合だけ入力')+'</div>'}
function togglePilot(sel){var box=sel.closest('form')?sel.closest('form').querySelector('#pilotOtherBox'):document.getElementById('pilotOtherBox');if(box)box.classList.toggle('hidden',sel.value!=='other')}
function resolvePilot_(p){if(p.pilotChoice==='other'){required_(p.pilotOther,'操縦者名');return String(p.pilotOther).trim()}return p.pilotChoice||'吉田公一'}
function checkFields(keys){return '<div class="field"><label>点検結果 <span class="req">必須</span></label><div class="quickbar"><button class="btn light" type="button" onclick="allNormal(this)">全部「正常」にする</button></div>'+keys.map(function(k){return '<div class="check"><span>'+labels[k]+'</span><select name="check_'+k+'" required><option value="">選択</option><option>正常</option><option>異常</option><option>該当なし</option></select></div>'}).join('')+'</div>'}
function field(name,label,type,value,req,hint){return '<div class="field"><label>'+label+(req?' <span class="req">必須</span>':' <span class="mini">（任意）</span>')+'</label>'+(hint?'<div class="mini">'+esc(hint)+'</div>':'')+'<input name="'+name+'" type="'+type+'" value="'+esc(value||'')+'" '+(req?'required':'')+'></div>'}
function selectField(name,label,opts,req,values){var vs=values?values.split(','):opts;return '<div class="field"><label>'+label+(req?' <span class="req">必須</span>':' <span class="mini">（任意）</span>')+'</label><select name="'+name+'" '+(req?'required':'')+'><option value="">選択</option>'+opts.map(function(o,i){return '<option value="'+esc(vs[i])+'">'+esc(o)+'</option>'}).join('')+'</select></div>'}
function methodFields(){var opts=['屋内練習','通常飛行（特定飛行なし）','空港等周辺','150m以上','DID','夜間','目視外','30m未満','催し場所上空','危険物輸送','物件投下','その他'];return '<div class="field"><label>飛行空域・方法 <span class="req">必須・複数選択可</span></label><div class="multi">'+opts.map(function(o){return '<label class="tick"><input type="checkbox" name="method" value="'+esc(o)+'"> '+esc(o)+'</label>'}).join('')+'</div></div>'}
function conditionalText(id,name,label,hint){return '<div id="'+id+'" class="hidden">'+field(name,label,'text','',false,hint)+'</div>'}
function malfunctionFields(){return '<div id="malfunctionBox" class="hidden">'+field('malfunctionDate','不具合の発生日','date',today(),true)+field('malfunctionDetail','不具合内容','text','',true)+selectField('actionStatus','対応状況',['未処置（後で点検整備記録へ）','処置済み'],true,'未処置,処置済み')+'<div id="actionDoneBox" class="hidden">'+field('actionDate','処置年月日','date',today(),false)+field('actionDetail','処置内容','text','',false)+field('confirmer','確認者','text','吉田公一',false)+'</div>'+field('responseDetail','補足','text','',false,'分からなければ空欄でOK')+'</div>'}
function data(form){var o={checks:{}};new FormData(form).forEach(function(v,k){if(k.indexOf('check_')===0)o.checks[k.slice(6)]=v;else if(o[k]!==undefined)o[k]=Array.isArray(o[k])?o[k].concat([v]):[o[k],v];else o[k]=v});return o}
function submitPre(e,model){e.preventDefault();var p=data(e.target);p.pilot=resolvePilot_(p);p.model=model;call('startAircraft',p,function(r){showMsg('飛行前点検を記録しました。');render(r)})}
function submitFlight(e){e.preventDefault();var p=data(e.target);if(!p.method){showMsg('飛行空域・方法を1つ以上選んでください。',true);return}if(p.nextAction==='continue'&&!p.changeStatus){showMsg('同じ機体で続ける場合は、変化の有無を選んでください。',true);return}if(p.nextAction==='continue'&&p.changeStatus==='変化なし'&&p.continueConfirm!=='確認済み'){showMsg('バッテリー装着・残量と機体／周辺状況を確認して、チェックを入れてください。',true);return}call('recordFlight',p,function(r){showMsg('飛行記録を保存しました。');render(r)})}
function submitPost(e){e.preventDefault();var p=data(e.target);p.pilot=resolvePilot_(p);call('submitPostflight',p,function(r){showMsg(r.active?'飛行後点検を記録しました。次の機体の飛行前点検へ進みます。':'本日の運航記録を完了し、日報シートを作成しました。');render(r)})}
function showBattery(){var buttons='';for(var i=1;i<=7;i++)buttons+='<button class="btn light" type="button" onclick="batteryForm('+i+')">BAT_'+i+'</button>';document.getElementById('app').innerHTML='<div class="card"><h2>バッテリーを選択</h2><div class="grid">'+buttons+'</div><br><button class="btn gray" onclick="render(state)">戻る</button></div>'}
function batteryForm(n){document.getElementById('app').innerHTML='<div class="card"><h2>BAT_'+n+' 任意記録</h2><div class="note">バッテリー番号以外はすべて任意です。分からない項目は空欄でOKです。</div><form onsubmit="submitBattery(event,'+n+')">'+field('date','日付','date',today(),false)+selectField('model','使用機体',['EVO Lite','EVO Lite+'],false)+field('purpose','用途','text','',false)+field('minutes','飛行／稼働時間（分）','number','',false)+field('cycle','使用後サイクル数','number','',false)+field('condition','異常・所感','text','',false)+field('location','場所／備考','text','',false)+field('note','その他メモ','text','',false)+'<button class="btn green">保存</button></form></div>'}
function submitBattery(e,n){e.preventDefault();var p=data(e.target);p.battery=n;call('addBatteryRecord',p,function(){showMsg('BAT_'+n+'へ1行追加しました。');render(state)})}
function showMaintenance(){document.getElementById('app').innerHTML='<div class="card"><h2>点検・整備記録</h2><div class="note">総飛行時間は自動で記録します。任意欄は分からなければ空欄でOKです。</div><form onsubmit="submitMaintenance(event)">'+field('date','実施日','date',today(),true)+selectField('model','機体',['EVO Lite','EVO Lite+'],true)+field('person','実施者','text','吉田公一',true)+field('location','実施場所','text','',true)+selectField('type','区分',['点検','整備','修理','部品交換','改造'],true)+field('reason','実施理由','text','',true)+field('content','実施内容','text','',true)+field('parts','交換部品','text','',false)+field('result','確認結果','text','',false)+field('next','次回予定','text','',false)+field('note','特記事項','text','',false)+'<button class="btn green">保存</button></form></div>'}
function submitMaintenance(e){e.preventDefault();call('addMaintenanceRecord',data(e.target),function(r){showMsg('点検・整備記録を保存しました。総飛行時間 '+r.total+' も自動記録しました。');render(state)})}
function allNormal(btn){var form=btn.closest('form');if(!form)return;form.querySelectorAll('select[name^="check_"]').forEach(function(s){s.value='正常'})}
function toggleConditional(form){
  var safety=form.elements['safety']; var malfunction=form.elements['malfunction']; var next=form.elements['nextAction']; var change=form.elements['changeStatus']; var action=form.elements['actionStatus'];
  toggle('safetyBox',safety&&safety.value==='あり');
  toggle('malfunctionBox',malfunction&&malfunction.value==='あり');
  toggle('actionDoneBox',malfunction&&malfunction.value==='あり'&&action&&action.value==='処置済み');
  toggle('continueBox',next&&next.value==='continue');
  toggle('continueConfirmBox',next&&next.value==='continue'&&change&&change.value==='変化なし');
}
function toggle(id,on){var el=document.getElementById(id);if(el)el.classList.toggle('hidden',!on)}
function showMsg(m,bad){document.getElementById('msg').innerHTML=m?'<div class="'+(bad?'error':'success')+'">'+esc(m)+'</div>':'';window.scrollTo(0,0)}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function today(){var d=new Date();return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2)}
function hm(){var d=new Date();return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2)}
load();
</script></body></html>`;
