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
    lastFlightMinutes: lastSessionFlightMinutes_(ss, active.v[0]),
    batteryStepAction: active.v[13] || '',
    route: active.v[14] || '練習区域内',
    methods: active.v[15] || '',
    operationStart: active.v[16] ? new Date(active.v[16]).toISOString() : '',
    accumulatedMinutes: Number(active.v[17]) || 0,
    segmentStart: active.v[18] ? new Date(active.v[18]).toISOString() : '',
    totals: totals
  };
}

function startAircraft(p) {
  return locked_(function() {
    required_(p.model, '機体');
    required_(p.location, '点検場所');
    required_(p.pilot, '実施者');
    required_(p.purpose, '飛行目的');
    required_(p.route, '飛行経路');
    const startMethods = normalizeList_(p.method);
    if (!startMethods.length) throw new Error('飛行空域・方法を1つ以上選んでください。');
    if (startMethods.indexOf('通常飛行（特定飛行なし）') >= 0 && startMethods.some(x => x !== '通常飛行（特定飛行なし）' && x !== '屋内練習')) {
      throw new Error('「通常飛行（特定飛行なし）」と特定飛行の項目は同時に選べません。');
    }
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
    writeDailyPreflight_(ss, new Date(), p.model, p);
    ss.getSheetByName('運航セッション').getRange(row, 6, 1, 14).setValues([[
      p.model, p.pilot, p.location, p.purpose, p.note || '', now_(), flightId, 'READY_START', '',
      p.route, startMethods.join(' / '), '', 0, ''
    ]]);
    return getState();
  });
}


function startOperationFlight() {
  return locked_(function() {
    const ss = ss_();
    const a = activeSession_(ss);
    if (!a || a.v[12] !== 'READY_START') throw new Error('飛行開始待ちではありません。');
    const t = now_();
    // Q=一連運航の最初の離陸時刻、R=実飛行時間累計、S=現在バッテリーの飛行開始時刻
    ss.getSheetByName('運航セッション').getRange(a.row, 17, 1, 3)
      .setValues([[t, 0, t]]);
    ss.getSheetByName('運航セッション').getRange(a.row, 13).setValue('FLYING');
    return getState();
  });
}

function chooseAfterBattery(p) {
  return locked_(function() {
    const ss = ss_();
    const a = activeSession_(ss);
    if (!a || a.v[12] !== 'BATTERY_ACTION') throw new Error('バッテリー記録後の操作待ちではありません。');
    required_(p.action, '次の操作');

    if (p.action === 'continue') {
      const t = now_();
      // 次のバッテリーで離陸する直前に押す。ここから次区間の飛行時間を計る。
      ss.getSheetByName('運航セッション').getRange(a.row, 13).setValue('FLYING');
      ss.getSheetByName('運航セッション').getRange(a.row, 19).setValue(t);
      return getState();
    }

    let nextModel = '';
    if (p.action === 'switch') nextModel = a.v[5] === 'EVO Lite' ? 'EVO Lite+' : 'EVO Lite';
    if (p.action === 'condition') nextModel = a.v[5];

    ss.getSheetByName('運航セッション').getRange(a.row, 13, 1, 2)
      .setValues([['FLIGHT_CLOSE', nextModel]]);
    return getState();
  });
}


function undoFlightCloseChoice() {
  return locked_(function() {
    const ss = ss_();
    const a = activeSession_(ss);
    if (!a || a.v[12] !== 'FLIGHT_CLOSE') throw new Error('戻せる終了選択がありません。');
    // 飛行記録を確定する前なので、保存済みBAT記録は残したまま、
    // 「次にどうするか」の選択だけを取り消す。
    ss.getSheetByName('運航セッション').getRange(a.row, 13, 1, 2)
      .setValues([['BATTERY_ACTION', '']]);
    return getState();
  });
}

function closeOperationFlight(p) {
  return locked_(function() {
    const ss = ss_();
    const a = activeSession_(ss);
    if (!a || a.v[12] !== 'FLIGHT_CLOSE') throw new Error('一連の飛行の終了処理待ちではありません。');

    required_(p.landingLocation, '最終着陸場所');
    required_(p.safety, '安全に影響した事項');
    required_(p.malfunction, '不具合');
    if (p.safety === 'あり' && !p.safetyDetail) {
      throw new Error('安全に影響した事項の内容と飛行前後の機体状況を入力してください。');
    }
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

    const model = a.v[5];
    const flightId = a.v[11];
    const takeoff = a.v[16] ? new Date(a.v[16]) : new Date(a.v[1]);
    const landing = now_();
    let used = Number(a.v[17]) || 0;
    if (!used && p.actualMinutes !== '' && p.actualMinutes != null) used = Number(p.actualMinutes);
    if (!Number.isFinite(used) || used <= 0) {
      throw new Error('実飛行時間がまだ0分です。バッテリー記録の飛行時間、またはここで実飛行時間を入力してください。');
    }

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
      a.v[8], a.v[14] || '', a.v[15] || '', a.v[7], takeoff, p.landingLocation, landing,
      '', used, totalAfter,
      p.safety === 'あり' ? p.safetyDetail : 'なし',
      p.malfunction === 'あり' ? p.malfunctionDetail : 'なし',
      malfunctionArticle, result, now_()
    ]);

    ss.getSheetByName('運航セッション').getRange(a.row, 13).setValue('POST_REQUIRED');
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

    // その日・その機体の「飛行後」記録は1枚だけ。
    // その日の複数飛行は集約して同じシートへ反映する。
    writeDailyPostflight_(ss, new Date(a.v[1]), a.v[5], p);

    const sh = ss.getSheetByName('運航セッション');
    const nextModel = a.v[13] || '';
    if (nextModel) {
      sh.getRange(a.row, 6).setValue('');
      sh.getRange(a.row, 12, 1, 8).setValues([['', 'PRE_REQUIRED', nextModel, '', '', '', 0, '']]);
    } else {
      sh.getRange(a.row, 4, 1, 3).setValues([[now_(), '完了', '']]);
      sh.getRange(a.row, 12, 1, 3).setValues([['', 'DONE', '']]);
    }
    return getState();
  });
}

function addBatteryRecord(p) {
  return locked_(function() {
    const n = Number(p.battery);
    if (!Number.isInteger(n) || n < 1 || n > 7) throw new Error('バッテリーを選んでください。');

    const ss = ss_();
    const active = activeSession_(ss);
    if (p.fromFlight === 'yes' && (!active || active.v[12] !== 'FLYING')) {
      throw new Error('このバッテリー記録は既に処理済みか、現在は飛行中ではありません。画面を再読み込みしてください。');
    }
    const sh = ss.getSheetByName('BAT_' + n);
    let row = 13;
    while (row <= 212 && sh.getRange(row, 1).getValue() !== '') row++;
    if (row > 212) throw new Error('このバッテリーシートの入力行が上限です。');

    const date = active ? new Date(active.v[1]) : (p.date ? new Date(p.date + 'T00:00:00') : now_());
    const model = active && active.v[5] ? active.v[5] : (p.model || '');
    const purpose = active && active.v[8] ? active.v[8] : (p.purpose || '');

    let minutes = numberOrBlank_(p.minutes);
    // 運航中は、飛行時間は法規上の実質飛行時間管理にも使う。
    if (active && active.v[12] === 'FLYING' && minutes === '') {
      const seg = active.v[18] ? new Date(active.v[18]) : null;
      if (seg) minutes = Math.max(1, Math.round((now_() - seg) / 60000));
    }

    sh.getRange(row, 1, 1, 8).setValues([[
      date, model, purpose, minutes, numberOrBlank_(p.cycle),
      p.condition || '', p.location || '', p.note || ''
    ]]);

    updateDailyBatteryLabels_(ss, date, model);

    if (active && active.v[12] === 'FLYING') {
      const add = Number(minutes) || 0;
      const total = (Number(active.v[17]) || 0) + add;
      ss.getSheetByName('運航セッション').getRange(active.row, 18, 1, 2)
        .setValues([[total, '']]);
      ss.getSheetByName('運航セッション').getRange(active.row, 13).setValue('BATTERY_ACTION');
      return { ok: true, battery: n, row: row, state: getState() };
    }

    return { ok: true, battery: n, row: row, state: getState() };
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

function setInitialFlightTime(p) {
  return locked_(function() {
    required_(p.model, '機体');
    const hours = Number(p.hours || 0);
    const minutes = Number(p.minutes || 0);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || minutes < 0 || minutes >= 60) {
      throw new Error('初期飛行時間を確認してください。分は0〜59で入力してください。');
    }
    const totalMinutes = Math.round(hours * 60 + minutes);
    const row = MODELS[p.model].settingRow;
    ss_().getSheetByName('設定').getRange(row, 3).setValue(totalMinutes);
    return { ok: true, model: p.model, total: minutesLabel_(totalMinutes) };
  });
}


function dailySheetName_(date, model, phase) {
  const tag = model === 'EVO Lite' ? 'Lite' : 'Lite+';
  return fmt_(date, 'yyyy-MM-dd') + '_' + tag + '_' + phase;
}

function getOrCreateDailySheet_(ss, date, model, phase) {
  const name = dailySheetName_(date, model, phase);
  let sh = ss.getSheetByName(name);
  if (sh) return sh;
  const tag = model === 'EVO Lite' ? 'Lite' : 'Lite+';
  const template = ss.getSheetByName(tag + '_' + phase);
  if (!template) throw new Error(tag + '_' + phase + ' のテンプレートが見つかりません。');
  sh = template.copyTo(ss).setName(name);
  ss.setActiveSheet(sh);
  ss.moveActiveSheet(2);
  return sh;
}

function writeDailyPreflight_(ss, date, model, p) {
  const sh = getOrCreateDailySheet_(ss, date, model, '飛行前');
  sh.getRange('B4').setValue(date).setNumberFormat('yyyy-mm-dd');
  sh.getRange('E4').setValue(p.location || '');
  sh.getRange('B5').setValue(p.pilot || '');
  sh.getRange('B6').setValue(p.purpose || '');
  sh.getRange('E7').setValue(fmt_(now_(), 'HH:mm'));
  sh.getRange('C8').setValue(hasAbnormal_(p.checks) ? '異常あり' : '正常');

  // スマホで答えた確認項目を、詳細テンプレートへ対応づけて反映。
  const c = p.checks || {};
  const map = {
    10:c.permission, 11:c.permission, 12:c.permission, 13:c.permission,
    14:c.permission, 15:c.weather, 16:c.permission,
    17:c.attachment, 18:c.damage, 19:c.motor, 20:c.battery,
    21:c.attachment, 22:c.systems, 23:c.systems, 24:c.systems,
    25:c.remoteId, 26:c.systems, 27:c.systems, 28:c.systems,
    29:c.systems, 30:c.systems, 31:c.weather
  };
  Object.keys(map).forEach(r => { if (map[r]) sh.getRange('E' + r).setValue(map[r]); });
  if (p.note) sh.getRange('F10').setValue(p.note);
  updateDailyBatteryLabels_(ss, date, model);
}

function dailyModelFlights_(ss, date, model) {
  const key = fmt_(date, 'yyyy-MM-dd');
  const sh = ss.getSheetByName('飛行記録');
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 22).getValues().filter(r =>
    r[2] && fmt_(r[2], 'yyyy-MM-dd') === key && r[3] === model
  );
}

function writeDailyPostflight_(ss, date, model, p) {
  const sh = getOrCreateDailySheet_(ss, date, model, '飛行後');
  const flights = dailyModelFlights_(ss, date, model);
  const totalMinutes = flights.reduce((a, r) => a + (Number(r[15]) || 0), 0);
  const firstTakeoff = flights.length ? flights[0][11] : '';
  const lastLanding = flights.length ? flights[flights.length - 1][13] : '';
  const routes = [...new Set(flights.map(r => r[8]).filter(Boolean))].join(' / ');
  const methods = [...new Set(flights.map(r => r[9]).filter(Boolean))].join(' / ');
  const pilot = flights.length ? flights[0][5] : (p.pilot || '');

  sh.getRange('B4').setValue(date).setNumberFormat('yyyy-mm-dd');
  sh.getRange('E4').setValue(p.location || '');
  sh.getRange('B5').setValue(pilot);
  sh.getRange('B6').setValue(
    (firstTakeoff ? fmt_(firstTakeoff, 'HH:mm') : '') +
    ((firstTakeoff || lastLanding) ? ' ～ ' : '') +
    (lastLanding ? fmt_(lastLanding, 'HH:mm') : '')
  );
  sh.getRange('E6').setValue(totalMinutes);
  sh.getRange('B7').setValue(routes);
  sh.getRange('E7').setValue((methods ? methods + ' / ' : '') + '総飛行時間 ' + minutesLabel_(totalMinutes));
  sh.getRange('C8').setValue(hasAbnormal_(p.checks) ? '異常あり' : '正常');

  const c = p.checks || {};
  const map = {
    11:c.attachment, 12:c.damage, 13:c.damage, 14:c.heat,
    15:c.attachment, 16:c.damage, 17:c.debris, 18:c.attachment,
    19:c.flightAnomaly, 20:c.flightAnomaly, 21:c.flightAnomaly,
    22:c.flightAnomaly, 23:c.flightAnomaly, 24:c.flightAnomaly
  };
  Object.keys(map).forEach(r => { if (map[r]) sh.getRange('E' + r).setValue(map[r]); });
  if (p.note) sh.getRange('F11').setValue(p.note);
  updateDailyBatteryLabels_(ss, date, model);
}

function dailyBatteryLabels_(ss, date, model) {
  if (!model) return [];
  const key = fmt_(date, 'yyyy-MM-dd');
  const out = [];
  for (let n = 1; n <= 7; n++) {
    const sh = ss.getSheetByName('BAT_' + n);
    const last = sh.getLastRow();
    if (last < 13) continue;
    const vals = sh.getRange(13, 1, last - 12, 2).getValues();
    if (vals.some(r => r[0] && fmt_(r[0], 'yyyy-MM-dd') === key && r[1] === model)) out.push('BAT_' + n);
  }
  return out;
}

function updateDailyBatteryLabels_(ss, date, model) {
  if (!model) return;
  const labels = dailyBatteryLabels_(ss, date, model).join(' / ');
  ['飛行前','飛行後'].forEach(phase => {
    const sh = ss.getSheetByName(dailySheetName_(date, model, phase));
    if (sh) sh.getRange('E5').setValue(labels);
  });
}

function lastSessionFlightMinutes_(ss, sessionId) {
  const flights = sessionFlights_(ss, sessionId);
  if (!flights.length) return '';
  const v = flights[flights.length - 1][15];
  return v === '' || v == null ? '' : Number(v);
}




function diaryEntry_(sh, model, phase) {
  const base = 'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID;
  const gid = sh.getSheetId();
  return {model:model, phase:phase, name:sh.getName(),
    sheetUrl:base + '/edit#gid=' + gid,
    pdfUrl:base + '/export?format=pdf&gid=' + gid + '&size=A4&portrait=true&fitw=true&sheetnames=false&printtitle=false&pagenumbers=false&gridlines=false&fzr=false'};
}
function searchFlightDiaries(p) {
  const ss=ss_(), date=String((p&&p.date)||'').trim(), model=String((p&&p.model)||'').trim(), out=[];
  const rx=/^(\d{4}-\d{2}-\d{2})_(Lite\+|Lite)_(飛行前|飛行後)$/;
  ss.getSheets().forEach(sh=>{const m=sh.getName().match(rx);if(!m)return;const d=m[1],mdl=m[2]==='Lite+'?'EVO Lite+':'EVO Lite',phase=m[3];if(date&&d!==date)return;if(model&&mdl!==model)return;out.push(Object.assign({date:d},diaryEntry_(sh,mdl,phase)));});
  out.sort((a,b)=>(b.date+b.model+b.phase).localeCompare(a.date+a.model+a.phase));return out.slice(0,100);
}
function ensureCorrectionLog_(ss){let sh=ss.getSheetByName('訂正履歴');if(!sh){sh=ss.insertSheet('訂正履歴');sh.appendRow(['訂正日時','種別','対象ID','対象シート','対象行','訂正者','訂正理由','訂正前','訂正後']);sh.setFrozenRows(1);}return sh;}
function correctionLog_(ss,type,id,sheetName,row,reason,beforeObj,afterObj){ensureCorrectionLog_(ss).appendRow([now_(),type,id,sheetName,row,'吉田公一',reason,JSON.stringify(beforeObj),JSON.stringify(afterObj)]);}
function listCorrectionTargets(p){
  const ss=ss_(),type=String((p&&p.type)||'flight'),out=[];
  if(type==='flight'){const sh=ss.getSheetByName('飛行記録'),last=sh.getLastRow();if(last<2)return out;const start=Math.max(2,last-49),vals=sh.getRange(start,1,last-start+1,22).getValues();vals.forEach((r,i)=>out.push({type:'flight',row:start+i,id:r[1],date:r[2]?fmt_(r[2],'yyyy-MM-dd'):'',model:r[3],summary:(r[7]||'')+' / '+(r[8]||''),minutes:r[15]||''}));}
  else{for(let n=1;n<=7;n++){const sh=ss.getSheetByName('BAT_'+n),last=sh.getLastRow();if(last<13)continue;const start=Math.max(13,last-9),vals=sh.getRange(start,1,last-start+1,8).getValues();vals.forEach((r,i)=>{if(!r[0])return;out.push({type:'battery',battery:n,row:start+i,id:'BAT_'+n+'#'+(start+i),date:fmt_(r[0],'yyyy-MM-dd'),model:r[1],summary:r[2]||'',minutes:r[3]||''});});}}
  out.reverse();return out.slice(0,50);
}
function getCorrectionRecord(p){
  const ss=ss_(),type=String(p.type||''),row=Number(p.row);if(!Number.isInteger(row)||row<2)throw new Error('訂正対象が不正です。');
  if(type==='flight'){const r=ss.getSheetByName('飛行記録').getRange(row,1,1,22).getValues()[0];if(!r[1])throw new Error('飛行記録が見つかりません。');return {type:'flight',row:row,id:r[1],date:r[2]?fmt_(r[2],'yyyy-MM-dd'):'',model:r[3],pilot:r[5]||'',purpose:r[7]||'',route:r[8]||'',method:r[9]||'',takeoffLocation:r[10]||'',takeoffTime:r[11]?fmt_(r[11],'HH:mm'):'',landingLocation:r[12]||'',landingTime:r[13]?fmt_(r[13],'HH:mm'):'',minutes:r[15]||'',safety:r[17]||'なし',malfunction:r[18]||'なし'};}
  if(type==='battery'){const n=Number(p.battery);if(!Number.isInteger(n)||n<1||n>7||row<13)throw new Error('バッテリー訂正対象が不正です。');const r=ss.getSheetByName('BAT_'+n).getRange(row,1,1,8).getValues()[0];if(!r[0])throw new Error('バッテリー記録が見つかりません。');return {type:'battery',battery:n,row:row,id:'BAT_'+n+'#'+row,date:fmt_(r[0],'yyyy-MM-dd'),model:r[1]||'',purpose:r[2]||'',minutes:r[3]||'',cycle:r[4]||'',condition:r[5]||'',location:r[6]||'',note:r[7]||''};}
  throw new Error('訂正種別が不正です。');
}
function recalcFlightTotals_(ss,model){const sh=ss.getSheetByName('飛行記録'),last=sh.getLastRow();if(last<2)return;const initial=Number(ss.getSheetByName('設定').getRange(MODELS[model].settingRow,3).getValue())||0,vals=sh.getRange(2,1,last-1,22).getValues();let total=initial;vals.forEach((r,i)=>{if(r[3]!==model)return;total+=Number(r[15])||0;sh.getRange(i+2,17).setValue(total);});}
function refreshDailyFlightSummary_(ss,date,model){const sh=ss.getSheetByName(dailySheetName_(date,model,'飛行後'));if(!sh)return;const flights=dailyModelFlights_(ss,date,model);if(!flights.length)return;const total=flights.reduce((a,r)=>a+(Number(r[15])||0),0),first=flights[0][11],last=flights[flights.length-1][13],routes=[...new Set(flights.map(r=>r[8]).filter(Boolean))].join(' / '),methods=[...new Set(flights.map(r=>r[9]).filter(Boolean))].join(' / ');sh.getRange('B5').setValue(flights[0][5]||'');sh.getRange('B6').setValue((first?fmt_(first,'HH:mm'):'')+' ～ '+(last?fmt_(last,'HH:mm'):''));sh.getRange('E6').setValue(total);sh.getRange('B7').setValue(routes);sh.getRange('E7').setValue((methods?methods+' / ':'')+'総飛行時間 '+minutesLabel_(total));}
function correctSavedRecord(p){return locked_(function(){required_(p.reason,'訂正理由');const ss=ss_(),type=String(p.type||''),row=Number(p.row);
  if(type==='flight'){const sh=ss.getSheetByName('飛行記録'),old=sh.getRange(row,1,1,22).getValues()[0];if(!old[1])throw new Error('訂正対象の飛行記録が見つかりません。');const date=new Date(old[2]),takeoff=p.takeoffTime?timeOnDate_(date,p.takeoffTime):old[11];let landing=p.landingTime?timeOnDate_(date,p.landingTime):old[13];if(landing&&takeoff&&landing<takeoff){landing=new Date(landing);landing.setDate(landing.getDate()+1);}const minutes=Number(p.minutes);if(!Number.isFinite(minutes)||minutes<0)throw new Error('飛行時間を確認してください。');const before={pilot:old[5],purpose:old[7],route:old[8],method:old[9],takeoffLocation:old[10],takeoffTime:old[11]?fmt_(old[11],'HH:mm'):'',landingLocation:old[12],landingTime:old[13]?fmt_(old[13],'HH:mm'):'',minutes:old[15],safety:old[17],malfunction:old[18]},after={pilot:p.pilot||'',purpose:p.purpose||'',route:p.route||'',method:p.method||'',takeoffLocation:p.takeoffLocation||'',takeoffTime:p.takeoffTime||'',landingLocation:p.landingLocation||'',landingTime:p.landingTime||'',minutes:minutes,safety:p.safety||'なし',malfunction:p.malfunction||'なし'};sh.getRange(row,6).setValue(after.pilot);sh.getRange(row,8,1,3).setValues([[after.purpose,after.route,after.method]]);sh.getRange(row,11).setValue(after.takeoffLocation);sh.getRange(row,12).setValue(takeoff);sh.getRange(row,13).setValue(after.landingLocation);sh.getRange(row,14).setValue(landing);sh.getRange(row,16).setValue(minutes);sh.getRange(row,18).setValue(after.safety);sh.getRange(row,19).setValue(after.malfunction);sh.getRange(row,21).setValue((after.safety!=='なし'||after.malfunction!=='なし')?'要確認':'正常');sh.getRange(row,22).setValue(now_());recalcFlightTotals_(ss,old[3]);refreshDailyFlightSummary_(ss,date,old[3]);correctionLog_(ss,'飛行記録',old[1],'飛行記録',row,p.reason,before,after);return {ok:true};}
  if(type==='battery'){const n=Number(p.battery),sh=ss.getSheetByName('BAT_'+n),old=sh.getRange(row,1,1,8).getValues()[0];if(!old[0])throw new Error('訂正対象のバッテリー記録が見つかりません。');const before={minutes:old[3],cycle:old[4],condition:old[5],location:old[6],note:old[7]},after={minutes:numberOrBlank_(p.minutes),cycle:numberOrBlank_(p.cycle),condition:p.condition||'',location:p.location||'',note:p.note||''};sh.getRange(row,4,1,5).setValues([[after.minutes,after.cycle,after.condition,after.location,after.note]]);correctionLog_(ss,'バッテリー記録','BAT_'+n+'#'+row,'BAT_'+n,row,p.reason,before,after);return {ok:true};}
  throw new Error('訂正種別が不正です。');});}

function getTodayDiaryLinks() {
  const ss=ss_(),date=now_(),out=[];
  Object.keys(MODELS).forEach(model=>['飛行前','飛行後'].forEach(phase=>{const sh=ss.getSheetByName(dailySheetName_(date,model,phase));if(sh)out.push(Object.assign({date:fmt_(date,'yyyy-MM-dd')},diaryEntry_(sh,model,phase)));}));
  return out;
}

function activeSession_(ss) {
  const sh = ss.getSheetByName('運航セッション');
  const last = sh.getLastRow();
  if (last < 2) return null;
  const vals = sh.getRange(2, 1, last - 1, 19).getValues();
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
</style></head><body><div class="wrap"><div class="hero"><h1>ドローン運航記録</h1><p>テスト版 v11｜訂正・下書き・PDF・履歴検索対応</p></div><div id="msg"></div><div id="app" class="loading">読み込み中…</div></div>
<script>
var state=null;
var appBusy=false;
function call(name,data,ok){
  if(appBusy){showMsg('処理中です。少し待ってください。');return}
  appBusy=true;showMsg('');
  var app=document.getElementById('app');app.style.opacity='.55';app.style.pointerEvents='none';
  google.script.run.withSuccessHandler(function(r){
    appBusy=false;app.style.opacity='1';app.style.pointerEvents='auto';
    ok?ok(r):render(r)
  }).withFailureHandler(function(e){
    appBusy=false;app.style.opacity='1';app.style.pointerEvents='auto';
    showMsg((e.message||String(e))+'　保存状態を再確認します。',true);
    setTimeout(load,800)
  })[name](data);
}
function load(){google.script.run.withSuccessHandler(render).withFailureHandler(function(e){showMsg(e.message,true)}).getState()}
function render(s){state=s;var a=document.getElementById('app');a.className='';var h=totalsHtml(s.totals);if(!s.active){h+=startChoice();a.innerHTML=h;setTimeout(initDrafts,0);return}h+=statusHtml(s);if(s.phase==='PRE_REQUIRED')h+=preForm(s.model||s.nextModel,s);else if(s.phase==='READY_START')h+=readyStartForm(s);else if(s.phase==='FLYING')h+=flyingForm(s);else if(s.phase==='BATTERY_ACTION')h+=afterBatteryForm(s);else if(s.phase==='FLIGHT_CLOSE')h+=closeFlightForm(s);else if(s.phase==='POST_REQUIRED')h+=postForm(s);a.innerHTML=h;setTimeout(initDrafts,0)}
function totalsHtml(t){return '<div class="totals"><div class="pill"><b>Lite 累計</b><br>'+esc(t['EVO Lite'].label)+'</div><div class="pill"><b>Lite+ 累計</b><br>'+esc(t['EVO Lite+'].label)+'</div></div>'}
function statusHtml(s){var pn={PRE_REQUIRED:'飛行前点検待ち',READY_START:'飛行開始待ち',FLYING:'飛行中',BATTERY_ACTION:'バッテリー交換後の選択待ち',FLIGHT_CLOSE:'一連の飛行記録 確定待ち',POST_REQUIRED:'飛行後点検待ち',DONE:'完了'}[s.phase]||s.phase;return '<div class="card status"><b>運航日：</b>'+esc(s.date)+'<br><b>状態：</b>'+esc(pn)+'<br><b>使用機体：</b>'+esc(s.model||'切替準備中')+'<br><b>記録済み飛行：</b>'+s.flightCount+'回</div>'}
function startChoice(){return '<div class="card"><h2>使用する機体を選択</h2><div class="grid"><button class="btn" onclick="showPre(&quot;EVO Lite&quot;)">EVO Liteを使用開始</button><button class="btn green" onclick="showPre(&quot;EVO Lite+&quot;)">EVO Lite+を使用開始</button></div></div>'+utilityButtons()}
// アプリ内の誤操作復帰。ブラウザの「戻る」ではなく、現在の保存済み運航状態へ戻す。
function appBackButton(){return '<button class="btn gray" type="button" onclick="render(state)">戻る</button>'}
function utilityButtons(mode){
  if(mode==='flying')return '<div class="card"><h2>運航中メニュー</h2><button class="btn gray" onclick="showTodayDiary()">今日の飛行日誌を表示</button></div>';
  return '<div class="card"><h2>記録メニュー</h2><div class="grid"><button class="btn light" onclick="showBattery()">バッテリーを記録</button><button class="btn light" onclick="showMaintenance()">点検・整備を記録</button></div><div class="grid" style="margin-top:10px"><button class="btn gray" onclick="showTodayDiary()">今日の飛行日誌</button><button class="btn gray" onclick="showDiarySearch()">過去の飛行日誌</button></div><div style="margin-top:10px"><button class="btn light" onclick="showCorrectionMenu()">保存済み記録を訂正</button></div></div>';
}
function preForm(model,s){return formCard('飛行前点検｜'+model,'pre',commonFields(s)+field('route','飛行経路','text',s.route||'練習区域内',true)+methodFields()+checkFields(['permission','weather','attachment','damage','motor','battery','systems','remoteId'])+'<div class="field"><label>特記事項 <span class="mini">（任意。異常時のみ必須）</span></label><textarea name="note" placeholder="分からなければ空欄でOK。異常を選んだ場合だけ内容を記入"></textarea></div><button class="btn" type="submit">飛行前点検を完了</button><div style="margin-top:10px">'+appBackButton()+'</div>','submitPre(event,&quot;'+model+'&quot;)')+utilityButtons()}
function showPre(model){document.getElementById('app').innerHTML=totalsHtml(state.totals)+preForm(model,{pilot:'吉田公一',location:'',purpose:'操縦練習'});setTimeout(initDrafts,0)}
function commonFields(s){return pilotFields(s.pilot||'吉田公一')+locationField('location','点検・飛行場所',s.location||'',true,'地名・施設名または緯度,経度')+field('purpose','飛行目的','text',s.purpose||'操縦練習',true)}
function readyStartForm(s){
  return '<div class="card ok"><h2>飛行開始待ち｜'+esc(s.model)+'</h2>'+
    '<div class="note">飛行前点検は保存済みです。実際に離陸する直前にこのボタンを押してください。ここから一連の運航を開始します。</div>'+
    '<button class="btn green" type="button" onclick="startOperationNow()">飛行開始</button></div>'+utilityButtons('flying')
}
function startOperationNow(){call('startOperationFlight',{},function(r){showMsg('飛行開始時刻を記録しました。');render(r)})}

function flyingForm(s){
  var mins=elapsedMinutes(s.segmentStart);
  return '<div class="card ok"><h2>飛行中｜'+esc(s.model)+'</h2>'+
    '<div class="note">飛行中はアプリを触る必要はありません。35分・40分空いても問題ありません。着陸してバッテリーを交換する時に、使ったBAT番号だけ選んでください。</div>'+
    '<div class="bigstat">現在区間：約 '+mins+' 分</div>'+
    '<button class="btn orange" type="button" onclick="showBattery()">着陸・バッテリー交換を記録</button></div>'+utilityButtons('flying')
}

function afterBatteryForm(s){
  return '<div class="card"><h2>バッテリー記録 完了</h2>'+
    '<div class="note">同じ場所・同じ目的・同じ飛行条件で続けるなら、飛行日誌は一連の運航としてまとめます。</div>'+
    '<button class="btn green" type="button" onclick="afterBatteryAction(&quot;continue&quot;)">次のバッテリーで飛行開始</button>'+
    '<button class="btn light" type="button" onclick="afterBatteryAction(&quot;condition&quot;)">飛行条件・場所を変更する</button>'+
    '<button class="btn light" type="button" onclick="afterBatteryAction(&quot;switch&quot;)">機種を変更する</button>'+
    '<button class="btn gray" type="button" onclick="afterBatteryAction(&quot;end&quot;)">この機体の運航を終了</button></div>'
}
function afterBatteryAction(action){call('chooseAfterBattery',{action:action},function(r){render(r)})}

function closeFlightForm(s){
  var auto=s.accumulatedMinutes||0;
  return '<div class="card"><h2>一連の飛行記録を確定｜'+esc(s.model)+'</h2>'+
    '<div class="note">バッテリー交換を挟んだ同一条件の連続飛行を1つの飛行実績としてまとめます。実飛行時間は各BAT記録の合計です。</div>'+
    '<form onsubmit="submitCloseFlight(event)" onchange="toggleConditional(this)">'+
    locationField('landingLocation','最終着陸場所',s.location,true,'飛行前と同じならそのままでOK')+
    field('actualMinutes','実飛行時間 合計（分）','number',auto||'',false,'BAT記録の合計が入っています。必要な場合だけ修正')+
    selectField('safety','安全に影響した事項',['なし','あり'],true)+
    conditionalText('safetyBox','safetyDetail','内容＋飛行前後の機体状況','「あり」の時だけ入力')+
    selectField('malfunction','不具合',['なし','あり'],true)+malfunctionFields()+
    '<button class="btn orange" type="submit">飛行記録を確定して飛行後点検へ</button></form>'+
    '<div style="margin-top:10px"><button class="btn gray" type="button" onclick="undoFlightClose()">前の選択に戻る</button></div></div>'
}
function undoFlightClose(){call('undoFlightCloseChoice',{},function(r){showMsg('終了・変更の選択を取り消しました。');render(r)})}
function submitCloseFlight(e){e.preventDefault();var p=data(e.target);call('closeOperationFlight',p,function(r){showMsg('一連の飛行記録を保存しました。');render(r)})}

function postForm(s){return formCard('飛行後点検｜'+s.model,'post',pilotFields(s.pilot||'吉田公一')+locationField('location','点検場所',s.location,true,'飛行場所と同じならそのままでOK')+checkFields(['attachment','damage','debris','heat','flightAnomaly'])+'<div class="field"><label>特記事項 <span class="mini">（任意。異常時のみ必須）</span></label><textarea name="note" placeholder="分からなければ空欄でOK。異常を選んだ場合だけ内容を記入"></textarea></div><button class="btn orange" type="submit">飛行後点検を完了</button>','submitPost(event)')}
function formCard(title,id,inside,submit){return '<div class="card"><h2>'+esc(title)+'</h2><div class="note">必須項目はすべて入力してください。</div><form id="'+id+'" onsubmit="'+submit+'">'+inside+'</form></div>'}
var labels={permission:'許可・承認、空域、飛行計画等',weather:'天候・風・周辺の安全',attachment:'各機器の取付状態',damage:'プロペラ・フレームの損傷／ゆがみ',motor:'モーターの異音',battery:'バッテリー残量・取付状態',systems:'通信・推進・電源・自動制御',remoteId:'リモートID等',debris:'機体へのゴミ等の付着',heat:'各機器の異常発熱',flightAnomaly:'飛行中の異常'};
function pilotFields(current){var isDefault=!current||current==='吉田公一';return '<div class="field"><label>操縦者 <span class="req">必須</span></label><select name="pilotChoice" onchange="togglePilot(this)"><option value="吉田公一" '+(isDefault?'selected':'')+'>吉田公一</option><option value="other" '+(!isDefault?'selected':'')+'>その他の操縦者</option></select></div><div id="pilotOtherBox" class="'+(isDefault?'hidden':'')+'">'+field('pilotOther','操縦者名','text',isDefault?'':current,true,'修理・点検・貸出し等で別の人が飛ばした場合だけ入力')+'</div>'}
function togglePilot(sel){var box=sel.closest('form')?sel.closest('form').querySelector('#pilotOtherBox'):document.getElementById('pilotOtherBox');if(box)box.classList.toggle('hidden',sel.value!=='other')}
function resolvePilot_(p){if(p.pilotChoice==='other'){var n=String(p.pilotOther||'').trim();if(!n)throw new Error('操縦者名を入力してください。');return n}return p.pilotChoice||'吉田公一'}
function checkFields(keys){return '<div class="field"><label>点検結果 <span class="req">必須</span></label><div class="quickbar"><button class="btn light" type="button" onclick="allNormal(this)">全部「正常」にする</button></div>'+keys.map(function(k){return '<div class="check"><span>'+labels[k]+'</span><select name="check_'+k+'" required><option value="">選択</option><option>正常</option><option>異常</option><option>該当なし</option></select></div>'}).join('')+'</div>'}
function locationField(name,label,value,req,hint){return '<div class="field"><label>'+label+(req?' <span class="req">必須</span>':' <span class="mini">（任意）</span>')+'</label>'+(hint?'<div class="mini">'+esc(hint)+'</div>':'')+'<div class="grid"><input name="'+name+'" type="text" value="'+esc(value||'')+'" '+(req?'required':'')+'><button class="btn light" type="button" onclick="fillGps(this,&quot;'+name+'&quot;)">現在地</button></div></div>'}
function fillGps(btn,name){if(!navigator.geolocation){showMsg('この端末では位置情報を取得できません。手入力してください。',true);return}btn.disabled=true;var old=btn.textContent;btn.textContent='取得中…';navigator.geolocation.getCurrentPosition(function(pos){var form=btn.closest('form');var input=form?form.elements[name]:document.querySelector('[name="'+name+'"]');if(input)input.value=pos.coords.latitude.toFixed(6)+','+pos.coords.longitude.toFixed(6);btn.disabled=false;btn.textContent=old},function(){btn.disabled=false;btn.textContent=old;showMsg('現在地を取得できませんでした。場所は手入力できます。',true)},{enableHighAccuracy:true,timeout:10000,maximumAge:30000})}
function field(name,label,type,value,req,hint){return '<div class="field"><label>'+label+(req?' <span class="req">必須</span>':' <span class="mini">（任意）</span>')+'</label>'+(hint?'<div class="mini">'+esc(hint)+'</div>':'')+'<input name="'+name+'" type="'+type+'" value="'+esc(value||'')+'" '+(req?'required':'')+'></div>'}
function selectField(name,label,opts,req,values){var vs=values?values.split(','):opts;return '<div class="field"><label>'+label+(req?' <span class="req">必須</span>':' <span class="mini">（任意）</span>')+'</label><select name="'+name+'" '+(req?'required':'')+'><option value="">選択</option>'+opts.map(function(o,i){return '<option value="'+esc(vs[i])+'">'+esc(o)+'</option>'}).join('')+'</select></div>'}
function methodFields(){var opts=['屋内練習','通常飛行（特定飛行なし）','空港等周辺','150m以上','DID','夜間','目視外','30m未満','催し場所上空','危険物輸送','物件投下','その他'];return '<div class="field"><label>飛行空域・方法 <span class="req">必須・複数選択可</span></label><div class="multi">'+opts.map(function(o){return '<label class="tick"><input type="checkbox" name="method" value="'+esc(o)+'"> '+esc(o)+'</label>'}).join('')+'</div></div>'}
function conditionalText(id,name,label,hint){return '<div id="'+id+'" class="hidden">'+field(name,label,'text','',false,hint)+'</div>'}
function malfunctionFields(){return '<div id="malfunctionBox" class="hidden">'+field('malfunctionDate','不具合の発生日','date',today(),true)+field('malfunctionDetail','不具合内容','text','',true)+selectField('actionStatus','対応状況',['未処置（後で点検整備記録へ）','処置済み'],true,'未処置,処置済み')+'<div id="actionDoneBox" class="hidden">'+field('actionDate','処置年月日','date',today(),false)+field('actionDetail','処置内容','text','',false)+field('confirmer','確認者','text','吉田公一',false)+'</div>'+field('responseDetail','補足','text','',false,'分からなければ空欄でOK')+'</div>'}

function draftKey(form){var title=(document.querySelector('#app h2')||{}).textContent||'form',sid=(state&&state.sessionId)||'new',mdl=(state&&(state.model||state.nextModel))||title;return 'droneDraft:v11:'+sid+':'+mdl+':'+(form.id||title)}
function saveDraft(form){try{var obj={};new FormData(form).forEach(function(v,k){if(obj[k]!==undefined)obj[k]=Array.isArray(obj[k])?obj[k].concat([v]):[obj[k],v];else obj[k]=v});localStorage.setItem(draftKey(form),JSON.stringify(obj))}catch(e){}}
function restoreDraft(form){try{var raw=localStorage.getItem(draftKey(form));if(!raw)return;var obj=JSON.parse(raw);Object.keys(obj).forEach(function(k){var els=form.querySelectorAll('[name="'+k.replace(/"/g,'\\"')+'"]');if(!els.length)return;var vals=Array.isArray(obj[k])?obj[k]:[obj[k]];els.forEach(function(el){if(el.type==='checkbox'||el.type==='radio')el.checked=vals.indexOf(el.value)>=0;else el.value=vals[0];el.dispatchEvent(new Event('change',{bubbles:true}))})});var note=document.createElement('div');note.className='success';note.textContent='入力途中の下書きを復元しました。';form.prepend(note)}catch(e){}}
function clearDraft(form){try{localStorage.removeItem(draftKey(form))}catch(e){}}
function initDrafts(){document.querySelectorAll('#app form').forEach(function(form){if(form.dataset.draftReady)return;form.dataset.draftReady='1';restoreDraft(form);form.addEventListener('input',function(){saveDraft(form)});form.addEventListener('change',function(){saveDraft(form)})})}

function data(form){var o={checks:{}};new FormData(form).forEach(function(v,k){if(k.indexOf('check_')===0)o.checks[k.slice(6)]=v;else if(o[k]!==undefined)o[k]=Array.isArray(o[k])?o[k].concat([v]):[o[k],v];else o[k]=v});return o}
function submitPre(e,model){e.preventDefault();var f=e.target,p=data(f);p.pilot=resolvePilot_(p);p.model=model;call('startAircraft',p,function(r){clearDraft(f);showMsg('飛行前点検を記録しました。');render(r)})}
function submitPost(e){e.preventDefault();var f=e.target,p=data(f);p.pilot=resolvePilot_(p);call('submitPostflight',p,function(r){clearDraft(f);showMsg(r.active?'飛行後点検を記録しました。次の機体の飛行前点検へ進みます。':'本日の運航記録を完了しました。');render(r)})}
function showBattery(){var s=state||{};document.getElementById('app').innerHTML=batteryExchangeChoice(s)}
function batteryExchangeChoice(s){var buttons='';for(var i=1;i<=7;i++)buttons+='<button class="btn light" type="button" onclick="batteryForm('+i+')">BAT_'+i+'</button>';var activeUse=s&&s.phase==='FLYING';var title=activeUse?'今使ったバッテリーを選択':'バッテリーを選択';var note=activeUse?'機体に貼った管理ラベルと同じ番号を1回押してください。日付・使用機体・用途は自動です。':'管理ラベルと同じBAT番号を選んでください。';return '<div class="card"><h2>'+title+'</h2><div class="note">'+note+'</div><div class="grid">'+buttons+'</div><br>'+appBackButton()+'</div>'}
function batteryForm(n){var s=state||{};var mins=s.phase==='FLYING'?elapsedMinutes(s.segmentStart):'';var loc=s.location||'';document.getElementById('app').innerHTML='<div class="card"><h2>BAT_'+n+' 使用記録</h2><div class="note">日付・機体・用途は自動です。飛行時間も離陸時刻から概算表示します。必要なら直してください。その他は分からなければ空欄でOKです。</div><form onsubmit="submitBattery(event,'+n+')">'+field('minutes','飛行／稼働時間（分）','number',mins,false)+field('cycle','使用後サイクル数','number','',false)+field('condition','異常・所感','text','',false)+field('location','場所／備考','text',loc,false)+field('note','その他メモ','text','',false)+'<button class="btn green">BAT_'+n+' に1行追加</button></form><div style="margin-top:10px">'+appBackButton()+'</div></div>';setTimeout(initDrafts,0)}
function submitBattery(e,n){e.preventDefault();var f=e.target,p=data(f);p.battery=n;p.fromFlight=(state&&state.phase==='FLYING')?'yes':'no';call('addBatteryRecord',p,function(r){clearDraft(f);showMsg('BAT_'+n+' に1行追加しました。');if(r&&r.state)render(r.state);else load()})}



var correctionTargets=[];
function diaryCards(list){if(!list||!list.length)return '<p>該当する飛行日誌はありません。</p>';return list.map(function(x){return '<div class="card" style="box-shadow:none;border:1px solid #e2e8f0"><b>'+esc((x.date?x.date+'｜':'')+x.model+'｜'+x.phase)+'</b><div class="grid" style="margin-top:8px"><a class="btn light" style="text-decoration:none;text-align:center" target="_blank" href="'+esc(x.sheetUrl)+'">シート表示</a><a class="btn green" style="text-decoration:none;text-align:center" target="_blank" href="'+esc(x.pdfUrl)+'">PDF表示</a></div></div>'}).join('')}
function showTodayDiary(){call('getTodayDiaryLinks',{},function(list){document.getElementById('app').innerHTML='<div class="card"><h2>今日の飛行日誌</h2><div class="note">確認・提示では「PDF表示」を押すとA4形式でその場で開けます。</div>'+diaryCards(list)+appBackButton()+'</div>'})}
function showDiarySearch(){document.getElementById('app').innerHTML='<div class="card"><h2>過去の飛行日誌を検索</h2><form id="diarySearch" onsubmit="searchDiaries(event)">'+field('date','日付','date','',false,'空欄なら全日付から検索')+selectField('model','機体',['EVO Lite','EVO Lite+'],false)+'<button class="btn green" type="submit">検索</button></form><div id="diaryResults"></div><div style="margin-top:10px">'+appBackButton()+'</div></div>';setTimeout(initDrafts,0)}
function searchDiaries(e){e.preventDefault();call('searchFlightDiaries',data(e.target),function(list){document.getElementById('diaryResults').innerHTML=diaryCards(list)})}
function showCorrectionMenu(){document.getElementById('app').innerHTML='<div class="card"><h2>保存済み記録を訂正</h2><div class="note">訂正前・訂正後・訂正理由は「訂正履歴」へ残します。</div><div class="grid"><button class="btn light" onclick="loadCorrectionTargets(&quot;flight&quot;)">飛行記録</button><button class="btn light" onclick="loadCorrectionTargets(&quot;battery&quot;)">バッテリー履歴</button></div><div id="correctionList"></div><div style="margin-top:10px">'+appBackButton()+'</div></div>'}
function loadCorrectionTargets(type){call('listCorrectionTargets',{type:type},function(list){correctionTargets=list||[];var h='';if(!correctionTargets.length)h='<p>訂正できる記録がありません。</p>';correctionTargets.forEach(function(x,i){h+='<button class="btn gray" style="margin-top:8px;text-align:left" onclick="openCorrectionByIndex('+i+')">'+esc(x.date+'｜'+(x.model||'')+'｜'+(x.id||'')+'｜'+(x.minutes!==''?x.minutes+'分':''))+'</button>'});document.getElementById('correctionList').innerHTML=h})}
function openCorrectionByIndex(i){var x=correctionTargets[i];if(!x)return;call('getCorrectionRecord',x,function(r){var h='<div class="card"><h2>記録を訂正</h2><div class="note">'+esc(r.id)+'｜'+esc(r.date)+'｜'+esc(r.model||'')+'</div>';if(r.type==='flight'){h+='<form id="correctionForm" onsubmit="submitCorrection(event)"><input type="hidden" name="type" value="flight"><input type="hidden" name="row" value="'+r.row+'">'+field('pilot','操縦者','text',r.pilot,true)+field('purpose','飛行目的','text',r.purpose,true)+field('route','飛行経路','text',r.route,true)+field('method','飛行空域・方法','text',r.method,true)+locationField('takeoffLocation','離陸場所',r.takeoffLocation,true,'')+field('takeoffTime','離陸時刻','time',r.takeoffTime,true)+locationField('landingLocation','着陸場所',r.landingLocation,true,'')+field('landingTime','着陸時刻','time',r.landingTime,true)+field('minutes','実飛行時間（分）','number',r.minutes,true)+field('safety','安全影響事項','text',r.safety,false)+field('malfunction','不具合','text',r.malfunction,false)+field('reason','訂正理由','text','',true,'訂正履歴に残ります')+'<button class="btn orange" type="submit">訂正を保存</button></form>'}else{h+='<form id="correctionForm" onsubmit="submitCorrection(event)"><input type="hidden" name="type" value="battery"><input type="hidden" name="battery" value="'+r.battery+'"><input type="hidden" name="row" value="'+r.row+'">'+field('minutes','飛行／稼働時間（分）','number',r.minutes,false)+field('cycle','使用後サイクル数','number',r.cycle,false)+field('condition','異常・所感','text',r.condition,false)+field('location','場所／備考','text',r.location,false)+field('note','その他メモ','text',r.note,false)+field('reason','訂正理由','text','',true,'訂正履歴に残ります')+'<button class="btn orange" type="submit">訂正を保存</button></form>'}h+='<div style="margin-top:10px"><button class="btn gray" onclick="showCorrectionMenu()">訂正一覧へ戻る</button></div></div>';document.getElementById('app').innerHTML=h;setTimeout(initDrafts,0)})}
function submitCorrection(e){e.preventDefault();var f=e.target;call('correctSavedRecord',data(f),function(){clearDraft(f);showMsg('訂正を保存し、訂正履歴にも記録しました。');showCorrectionMenu()})}

function showMaintenance(){document.getElementById('app').innerHTML='<div class="card"><h2>点検・整備記録</h2><div class="note">総飛行時間は自動で記録します。任意欄は分からなければ空欄でOKです。</div><form onsubmit="submitMaintenance(event)">'+field('date','実施日','date',today(),true)+selectField('model','機体',['EVO Lite','EVO Lite+'],true)+field('person','実施者','text','吉田公一',true)+field('location','実施場所','text','',true)+selectField('type','区分',['点検','整備','修理','部品交換','改造'],true)+field('reason','実施理由','text','',true)+field('content','実施内容','text','',true)+field('parts','交換部品','text','',false)+field('result','確認結果','text','',false)+field('next','次回予定','text','',false)+field('note','特記事項','text','',false)+'<button class="btn green">保存</button></form><div style="margin-top:10px">'+appBackButton()+'</div></div>';setTimeout(initDrafts,0)}
function submitMaintenance(e){e.preventDefault();var f=e.target;call('addMaintenanceRecord',data(f),function(r){clearDraft(f);showMsg('点検・整備記録を保存しました。総飛行時間 '+r.total+' も自動記録しました。');render(state)})}
function allNormal(btn){var form=btn.closest('form');if(!form)return;form.querySelectorAll('select[name^="check_"]').forEach(function(s){s.value='正常'})}
function toggleConditional(form){
  var safety=form.elements['safety']; var malfunction=form.elements['malfunction']; var action=form.elements['actionStatus'];
  toggle('safetyBox',safety&&safety.value==='あり');
  toggle('malfunctionBox',malfunction&&malfunction.value==='あり');
  toggle('actionDoneBox',malfunction&&malfunction.value==='あり'&&action&&action.value==='処置済み');
}
function toggle(id,on){var el=document.getElementById(id);if(el)el.classList.toggle('hidden',!on)}
function showMsg(m,bad){document.getElementById('msg').innerHTML=m?'<div class="'+(bad?'error':'success')+'">'+esc(m)+'</div>':'';window.scrollTo(0,0)}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function today(){var d=new Date();return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2)}
function elapsedMinutes(iso){if(!iso)return 0;var ms=Date.now()-new Date(iso).getTime();return Math.max(1,Math.round(ms/60000))}
function hm(){var d=new Date();return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2)}
load();
</script></body></html>`;
