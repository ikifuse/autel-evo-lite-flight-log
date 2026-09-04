/**
 * ============================================================================
 * ドローン運航記録システム（Google Apps Script 単一ファイル完全版）
 * ============================================================================
 * 
 * 【全体構成マップ（目次）】
 * ----------------------------------------------------------------------------
 * 1. 基本設定・定数（機体型式、登録記号、法令点検項目）         : 40行付近〜
 * 2. サーバー側ロジック（スプレッドシート書き込み・セッション管理）: 100行付近〜
 *    - 運航開始（同日複数現場の連番シート対応）
 *    - 飛行前点検（ワンタップ全て正常）
 *    - 離陸・着陸・バッテリー個別履歴記録
 *    - 機体交代（Lite ↔ Lite+）
 *    - 夕方の飛行後点検まとめ（本日使用機体のみ）
 *    - 様式3（点検整備記録）および訂正履歴管理
 * 3. 画面構造（HTMLテンプレート）                                : 730行付近〜
 * 4. 画面スタイル（モバイル最適化・CSSデザイン）                 : 750行付近〜
 * 5. 画面操作スクリプト（Vanilla JavaScript）                   : 1200行付近〜
 * ----------------------------------------------------------------------------
 */

// ============================================================================
// 1. 基本設定・定数
// ============================================================================
const SPREADSHEET_ID = '10PMEteELQRRWnqc5mVmF6tQCfxFEJEGe2LitpDhYqk8';
const TZ = 'Asia/Tokyo';
const SESSION_KEY = 'EVO_LITE_FLIGHT_SESSION';
const TEMPLATE_NAME = '日常点検';
const BATTERY_SHEET_PREFIX = 'BAT_';
const BATTERY_FIRST_ROW = 13;
const BATTERY_LAST_ROW = 212;
const MAINTENANCE_SHEET_NAME = '点検整備記録';
const CORRECTION_SHEET_NAME = '訂正履歴';

const MODELS = {
  'EVO Lite': 'JU3268805C02',
  'EVO Lite+': 'JU3269B165D2'
};

const BLOCKS = {
  1: { startCol: 3, endCol: 15 },
  2: { startCol: 18, endCol: 30 }
};

const FLIGHT_PURPOSES = [
  '空撮','報道取材','警備','農林水産業','測量','環境調査','設備メンテナンス',
  'インフラ点検・保守','資材管理','輸送・宅配','自然観測','事故・災害対応等',
  '趣味','研究開発','その他','操縦練習','整備後確認飛行','修理後確認飛行'
];

const SPECIAL_FLIGHT_METHODS = [
  '空港等周辺','150m以上','DID','夜間','目視外','30m未満',
  '催し場所上空','危険物輸送','物件投下'
];

const PRE_CHECK_NAMES = [
  '機体全般','プロペラ・フレーム','通信系統','推進系統','電源系統',
  '自動制御系統','バッテリー','操縦装置','灯火','カメラ','リモートID'
];

const POST_CHECK_NAMES = ['機体全般','プロペラ・フレーム','発熱','その他'];

const MAINTENANCE_TYPES = ['定期点検','修理','改造','整備','部品交換','ファームウェア更新','点検'];

// ============================================================================
// 2. サーバー側ロジック（スプレッドシート書き込み・セッション管理）
// ============================================================================
function doGet() {
  const initialState = JSON.stringify(getAppState())
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return HtmlService.createHtmlOutput(APP_HTML.replace('__INITIAL_STATE__', initialState))
    .setTitle('ドローン運航記録')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}

function spreadsheet_() { return SpreadsheetApp.openById(SPREADSHEET_ID); }
function now_() { return new Date(); }
function format_(value, pattern) { return Utilities.formatDate(new Date(value), TZ, pattern); }
function documentProperties_() { return PropertiesService.getScriptProperties(); }
function sheetUrl_(spreadsheet, sheet) {
  if (!sheet) return '';
  return spreadsheet.getUrl() + '#gid=' + sheet.getSheetId();
}

function readSession_() {
  const text = documentProperties_().getProperty(SESSION_KEY);
  return text ? JSON.parse(text) : null;
}
function writeSession_(session) { documentProperties_().setProperty(SESSION_KEY, JSON.stringify(session)); }
function clearSession_() { documentProperties_().deleteProperty(SESSION_KEY); }

function required_(value, label) {
  if (value == null || String(value).trim() === '') throw new Error(label + 'は必須です。');
}

function normalizeList_(value) {
  if (Array.isArray(value)) return value.map(String).map(item => item.trim()).filter(Boolean);
  return value == null || String(value).trim() === '' ? [] : [String(value).trim()];
}

function validateOperationSelection_(input) {
  if (FLIGHT_PURPOSES.indexOf(input.purpose) < 0) throw new Error('飛行目的を選択してください。');
  if (input.purpose === 'その他') required_(input.purposeOther, 'その他の飛行目的');

  const methods = normalizeList_(input.method);
  if (!methods.length) throw new Error('飛行禁止空域・飛行方法を1つ以上選択してください。');
  const allowedMethods = ['通常飛行（特定飛行なし）','屋内練習'].concat(SPECIAL_FLIGHT_METHODS);
  methods.forEach(method => {
    if (allowedMethods.indexOf(method) < 0) throw new Error('飛行禁止空域・飛行方法の選択を確認してください。');
  });

  const category = String(input.category || '');
  if (['カテゴリーⅠ','カテゴリーⅡ','カテゴリーⅢ'].indexOf(category) < 0) {
    throw new Error('飛行カテゴリーを選択してください。');
  }
  const special = methods.filter(method => SPECIAL_FLIGHT_METHODS.indexOf(method) >= 0);
  if (methods.indexOf('通常飛行（特定飛行なし）') >= 0 && methods.length > 1) {
    throw new Error('「通常飛行（特定飛行なし）」は他の飛行方法と同時に選択できません。');
  }
  if (methods.indexOf('屋内練習') >= 0 && methods.length > 1) {
    throw new Error('「屋内練習」は他の飛行方法と同時に選択できません。');
  }
  if (category === 'カテゴリーⅠ' && special.length) {
    throw new Error('特定飛行を選択した場合はカテゴリーⅡまたはⅢです。');
  }
  if ((category === 'カテゴリーⅡ' || category === 'カテゴリーⅢ') && !special.length) {
    throw new Error(category + 'には特定飛行の選択が必要です。');
  }
  return {
    purpose: input.purpose === 'その他' ? 'その他：' + String(input.purposeOther).trim() : input.purpose,
    methods: methods,
    category: category
  };
}

function locked_(work) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return work(); } finally { lock.releaseLock(); }
}

function getAppState() {
  const session = readSession_();
  const today = format_(now_(), 'yyyy.M.d');
  const ss = spreadsheet_();
  const todaySheet = ss.getSheetByName(today);
  const totalLite = aircraftTotalMinutes_('EVO Lite');
  const totalLitePlus = aircraftTotalMinutes_('EVO Lite+');

  return {
    active: !!session,
    today: today,
    hasTodaySheet: !!todaySheet,
    todaySheetUrl: todaySheet ? sheetUrl_(ss, todaySheet) : '',
    spreadsheetUrl: ss.getUrl(),
    batteries: Array.from({ length: 7 }, (_, index) => ({ value: index + 1, label: 'BAT_' + (index + 1) })),
    totals: {
      'EVO Lite': { minutes: totalLite, label: minutesLabel_(totalLite) },
      'EVO Lite+': { minutes: totalLitePlus, label: minutesLabel_(totalLitePlus) }
    },
    session: session
  };
}

function resetSession() {
  return locked_(function() {
    clearSession_();
    return getAppState();
  });
}

function startAircraft(input) {
  return locked_(function() {
    const existing = readSession_();
    if (existing) {
      const phaseNames = {
        'PRE': '飛行前点検の途中',
        'READY': '離陸待機中',
        'FLYING': '飛行中（着陸未記録）',
        'AFTER_LANDING': '着陸後（次フライト選択中）',
        'POST_ALL': '飛行後点検中'
      };
      const phaseStr = phaseNames[existing.phase] || existing.phase;
      throw new Error('SESSION_EXISTS::' + JSON.stringify({
        model: existing.model,
        dateSheet: existing.dateSheet,
        blockNo: existing.blockNo,
        phase: existing.phase,
        phaseName: phaseStr,
        route: existing.route,
        pilot: existing.pilot
      }));
    }
    required_(input.model, '機体');
    if (!MODELS[input.model]) throw new Error('機体の選択を確認してください。');
    required_(input.route, '飛行経路・場所');
    required_(input.inspectionLocation, '点検実施場所');
    required_(input.pilot, '操縦者（機長）氏名');
    const selection = validateOperationSelection_(input);
    const ss = spreadsheet_();
    const sheet = getOrCreateDateSheet_(ss, now_(), !!input.forceNewLocation);
    const blockNo = chooseAvailableBlock_(sheet);
    if (!blockNo) throw new Error('本日のNo.1 / No.2は両方使用済みです。');

    let methodText = selection.methods.join(' / ');
    if (input.permitNo) {
      methodText += ' [許可承認: ' + String(input.permitNo).trim() + ']';
    }

    const otherModel = input.model === 'EVO Lite' ? 'EVO Lite+' : 'EVO Lite';
    const aircrafts = {};
    aircrafts[input.model] = {
      model: input.model,
      blockNo: blockNo,
      used: true,
      preflightDone: false,
      flightCount: 0,
      totalMinutes: 0,
      preflightChecks: null
    };
    aircrafts[otherModel] = {
      model: otherModel,
      blockNo: 0,
      used: false,
      preflightDone: false,
      flightCount: 0,
      totalMinutes: 0,
      preflightChecks: null
    };

    const session = {
      dateSheet: sheet.getName(),
      currentModel: input.model,
      model: input.model,
      purpose: selection.purpose,
      route: input.route,
      method: methodText,
      category: selection.category,
      permitNo: input.permitNo || '',
      inspectionLocation: input.inspectionLocation,
      pilot: input.pilot,
      assistant: input.assistant || '',
      cert: input.cert || '',
      phase: 'PRE',
      blockNo: blockNo,
      flightIndex: 0,
      currentRow: 0,
      currentBattery: 0,
      startedAt: '',
      totalMinutes: 0,
      preflightChecks: null,
      aircrafts: aircrafts
    };
    writeHeaderFields_(sheet, session, blockNo);
    writeSession_(session);
    return getAppState();
  });
}

function savePreflight(input) {
  return locked_(function() {
    const session = activeSession_('飛行前点検');
    if (session.phase !== 'PRE') throw new Error('飛行前点検は完了済みです。');
    const checks = input.checks || {};
    const missing = PRE_CHECK_NAMES.filter(name => !checks[name]);
    if (missing.length) throw new Error('未点検の項目があります：' + missing.join('、'));
    
    const abnormal = PRE_CHECK_NAMES.some(name => checks[name] !== '正常');
    const ss = spreadsheet_();
    const sheet = ss.getSheetByName(session.dateSheet);
    writeCheckResults_(sheet, checks, '飛行前点検', session.blockNo);

    if (session.aircrafts && session.aircrafts[session.currentModel]) {
      session.aircrafts[session.currentModel].preflightChecks = checks;
      session.aircrafts[session.currentModel].preflightDone = true;
    }
    session.preflightChecks = checks;

    if (abnormal) {
      required_(input.abnormalDetail, '異常がある場合の特記事項');
      setAfterLabelInBlock_(sheet, session.blockNo, ['事象等の内容：','事象等の内容','不具合内容'], input.abnormalDetail);
      session.abnormalPreflight = true;
      session.phase = 'PRE_ABNORMAL';
      writeSession_(session);
      throw new Error('飛行前点検で異常が記録されました。教則・法令に基づき点検整備を完了するまで飛行開始できません。');
    }

    session.phase = 'READY';
    writeSession_(session);
    return getAppState();
  });
}

function startFlight(input) {
  return locked_(function() {
    const session = activeSession_('飛行開始');
    if (session.phase !== 'READY') throw new Error('飛行開始できる状態ではありません。');
    const battery = Number(input.battery);
    if (!Number.isInteger(battery) || battery < 1 || battery > 7) throw new Error('使用バッテリーを選択してください。');
    required_(input.takeoffLocation, '離陸場所');
    const sheet = spreadsheet_().getSheetByName(session.dateSheet);
    const slot = nextFlightSlot_(sheet, session.blockNo);
    if (slot.blockNo !== session.blockNo) {
      writeHeaderFields_(sheet, session, slot.blockNo);
      writeCheckResults_(sheet, session.preflightChecks || {}, '飛行前点検', slot.blockNo);
    }
    const startedAt = now_();
    writeFlightFields_(sheet, slot, {
      '使用バッテリー': 'BAT_' + battery,
      '離陸場所': input.takeoffLocation,
      '離陸時刻': startedAt
    });
    session.phase = 'FLYING';
    session.blockNo = slot.blockNo;
    session.flightIndex = slot.index;
    session.currentRow = slot.row;
    session.currentBattery = battery;
    session.startedAt = startedAt.toISOString();

    if (session.aircrafts && session.aircrafts[session.currentModel]) {
      session.aircrafts[session.currentModel].flightCount = slot.index;
    }

    writeSession_(session);
    return getAppState();
  });
}

function landFlight(input) {
  return locked_(function() {
    const session = activeSession_('着陸記録');
    if (session.phase !== 'FLYING') throw new Error('飛行中の記録がありません。');
    required_(input.landingLocation, '着陸場所');
    const landingTime = now_();
    const minutes = input.actualMinutes === '' || input.actualMinutes == null
      ? Math.max(1, Math.round((landingTime - new Date(session.startedAt)) / 60000))
      : Number(input.actualMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) throw new Error('実飛行時間を確認してください。');
    const sheet = spreadsheet_().getSheetByName(session.dateSheet);
    const totalMinutes = aircraftTotalMinutes_(session.model) + minutes;
    writeFlightFields_(sheet, { blockNo: session.blockNo, row: session.currentRow }, {
      '着陸場所': input.landingLocation, '着陸時刻': landingTime, '飛行時間': minutes,
      '総飛行時間': minutesLabel_(totalMinutes),
      '安全に影響した事項': input.safetyIssue ? (input.safetyDetail || 'あり') : 'なし',
      'バッテリー異常・所感': input.batteryNote || ''
    });
    appendBatteryHistory_(session, minutes, input);
    session.phase = 'AFTER_LANDING';
    session.totalMinutes += minutes;
    session.currentBattery = 0;
    session.startedAt = '';

    if (session.aircrafts && session.aircrafts[session.currentModel]) {
      session.aircrafts[session.currentModel].totalMinutes += minutes;
    }

    writeSession_(session);
    return getAppState();
  });
}

function continueFlight() {
  return locked_(function() {
    const session = activeSession_('継続飛行');
    if (session.phase !== 'AFTER_LANDING') throw new Error('継続飛行できる状態ではありません。');
    session.phase = 'READY';
    writeSession_(session);
    return getAppState();
  });
}

function switchAircraft(input) {
  return locked_(function() {
    const session = activeSession_('機体交代');
    if (session.phase !== 'AFTER_LANDING' && session.phase !== 'READY') {
      throw new Error('飛行中または点検中は機体を交代できません。');
    }
    const currentModel = session.currentModel || session.model;
    const targetModel = (input && input.targetModel) ? input.targetModel : (currentModel === 'EVO Lite' ? 'EVO Lite+' : 'EVO Lite');
    if (!MODELS[targetModel]) throw new Error('対象機体が見つかりません：' + targetModel);
    if (targetModel === currentModel) return getAppState();

    if (!session.aircrafts) session.aircrafts = {};
    let targetAc = session.aircrafts[targetModel];
    const sheet = spreadsheet_().getSheetByName(session.dateSheet);

    if (!targetAc || !targetAc.blockNo) {
      const newBlock = chooseAvailableBlock_(sheet);
      if (!newBlock) throw new Error('本日のシート（No.1/No.2）に空きブロックがありません。');
      targetAc = {
        model: targetModel,
        blockNo: newBlock,
        used: true,
        preflightDone: false,
        flightCount: 0,
        totalMinutes: 0,
        preflightChecks: null
      };
      session.aircrafts[targetModel] = targetAc;
      const tempSessionForHeader = Object.assign({}, session, { model: targetModel });
      writeHeaderFields_(sheet, tempSessionForHeader, newBlock);
    } else {
      targetAc.used = true;
    }

    session.currentModel = targetModel;
    session.model = targetModel;
    session.blockNo = targetAc.blockNo;
    session.totalMinutes = targetAc.totalMinutes;
    session.flightIndex = targetAc.flightCount;

    if (!targetAc.preflightDone) {
      session.phase = 'PRE';
      session.preflightChecks = null;
    } else {
      session.phase = 'READY';
      session.preflightChecks = targetAc.preflightChecks;
    }

    writeSession_(session);
    return getAppState();
  });
}

function startPostflight() {
  return locked_(function() {
    const session = activeSession_('飛行後点検開始');
    session.phase = 'POST_ALL';
    writeSession_(session);
    return getAppState();
  });
}

function finishAircraft(input) {
  return locked_(function() {
    const session = activeSession_('飛行後点検');
    const sheet = spreadsheet_().getSheetByName(session.dateSheet);

    const aircraftDataMap = input.aircrafts || {};
    const usedModels = Object.keys(session.aircrafts || {}).filter(function(m) {
      return session.aircrafts[m] && session.aircrafts[m].used;
    });
    const modelsToProcess = usedModels.length ? usedModels : [session.model];

    modelsToProcess.forEach(function(model) {
      const ac = (session.aircrafts && session.aircrafts[model]) ? session.aircrafts[model] : { blockNo: session.blockNo };
      const blockNo = ac.blockNo || session.blockNo;
      if (!blockNo) return;

      const acInput = aircraftDataMap[model] || input;
      const checks = acInput.checks || input.checks || {};
      const abnormal = POST_CHECK_NAMES.some(function(name) { return checks[name] !== '正常'; });

      writeCheckResults_(sheet, checks, '飛行後点検', blockNo);
      writeOptionalFields_(sheet, {
        inspectionLocation: input.inspectionLocation || session.inspectionLocation,
        defectLocation: acInput.defectLocation || '',
        defectDetail: acInput.defectDetail || '',
        actionDetail: acInput.actionDetail || '',
        confirmer: input.confirmer || session.pilot
      }, blockNo, abnormal);
    });

    clearSession_();
    return getAppState();
  });
}

function cancelCurrentSession() { clearSession_(); return getAppState(); }
function activeSession_(action) {
  const session = readSession_();
  if (!session) throw new Error(action + 'のセッションがありません。');
  return session;
}

function getOrCreateDateSheet_(spreadsheet, date, forceNew) {
  const baseName = format_(date, 'yyyy.M.d');
  let name = baseName;
  let index = 1;
  while (true) {
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) {
      const template = spreadsheet.getSheetByName(TEMPLATE_NAME);
      if (!template) throw new Error('日常点検シートが見つかりません。');
      sheet = template.copyTo(spreadsheet).setName(name);
      return sheet;
    }
    // forceNewが指定されていない場合、かつ空きブロック（No.1またはNo.2）があればこのシートを使用
    if (!forceNew && (!blockUsed_(sheet, 1) || !blockUsed_(sheet, 2))) {
      return sheet;
    }
    // 両ブロック使用済み、または別現場（forceNew）の場合は自動で次の連番シート（例: 2026.9.4_2）を探す
    index++;
    name = baseName + '_' + index;
  }
}

function sheetValues_(sheet) { return sheet.getDataRange().getDisplayValues(); }

function findInBlock_(sheet, blockNo, labels, contains) {
  const block = block_(blockNo);
  const values = sheetValues_(sheet);
  for (let row = 0; row < values.length; row++) {
    for (let col = block.startCol - 1; col < block.endCol; col++) {
      const value = String((values[row] || [])[col] || '').trim();
      if (labels.some(label => contains ? value.indexOf(label) >= 0 : value === label)) {
        return { row: row + 1, col: col + 1 };
      }
    }
  }
  return null;
}

function block_(blockNo) {
  const block = BLOCKS[blockNo];
  if (!block) throw new Error('No.' + blockNo + ' の帳票範囲を確認できません。');
  return block;
}

function blockUsed_(sheet, blockNo) {
  const block = block_(blockNo);
  const values = sheet.getRange(6, block.startCol, 35, block.endCol - block.startCol + 1).getDisplayValues();
  return values.some(row => row.some(value => {
    const text = String(value || '').trim();
    return /^[☑✓]/.test(text) || /^BAT_[1-7]$/.test(text);
  }));
}

function chooseAvailableBlock_(sheet) {
  if (!blockUsed_(sheet, 1)) return 1;
  if (!blockUsed_(sheet, 2)) return 2;
  return 0;
}

function labelColumn_(sheet, row, startCol, endCol, labels) {
  const values = sheetValues_(sheet)[row - 1] || [];
  for (let col = startCol; col <= endCol; col++) {
    if (labels.indexOf(String(values[col - 1] || '').trim()) >= 0) return col;
  }
  return 0;
}

function setAfterLabelInBlock_(sheet, blockNo, labels, value) {
  const cell = findInBlock_(sheet, blockNo, labels, false);
  if (!cell) return false;
  const merged = sheet.getRange(cell.row, cell.col).getMergedRanges();
  const labelRange = merged.length ? merged[0] : sheet.getRange(cell.row, cell.col);
  const targetCol = labelRange.getColumn() + labelRange.getNumColumns();
  if (targetCol > block_(blockNo).endCol) return false;
  sheet.getRange(cell.row, targetCol).setValue(value == null ? '' : value);
  return true;
}

function writeHeaderFields_(sheet, session, blockNo) {
  const block = block_(blockNo);
  [6, 7].forEach(row => {
    const cell = sheet.getRange(row, block.startCol);
    const current = String(cell.getDisplayValue() || '').replace(/^[□☑✓]\s*/, '').trim();
    if (current.indexOf('Autel Robotics Co., Ltd.') >= 0) {
      const selected = current.indexOf('/ ' + session.model + ' /') >= 0;
      cell.setValue((selected ? '☑ ' : '□ ') + current);
    }
  });

  const dateCell = findInBlock_(sheet, blockNo, ['飛行・点検実施年月日'], true);
  if (dateCell) {
    const date = new Date(String(session.dateSheet).replace(/\./g, '-'));
    sheet.getRange(dateCell.row, dateCell.col)
      .setValue('飛行・点検実施年月日：' + format_(date, 'yyyy年M月d日'));
  }
  setAfterLabelInBlock_(sheet, blockNo, ['飛行目的（飛行概要）','飛行目的'], session.purpose);
  setAfterLabelInBlock_(sheet, blockNo, ['飛行経路・場所','飛行経路'], session.route);
  setAfterLabelInBlock_(sheet, blockNo, ['飛行禁止空域・飛行方法','飛行空域・方法'], session.category + ' / ' + session.method);
  
  let pilotDisplay = session.pilot;
  if (session.assistant) {
    pilotDisplay += '（補助者: ' + session.assistant + '）';
  }
  setAfterLabelInBlock_(sheet, blockNo, ['操縦者・点検実施者','操縦者'], pilotDisplay);

  const certLabel = findInBlock_(sheet, blockNo, ['技能証明書番号','技能証明番号'], false);
  if (certLabel && String(sheet.getRange(certLabel.row, certLabel.col).getDisplayValue()).trim() === '技能証明番号') {
    sheet.getRange(certLabel.row, certLabel.col).setValue('技能証明書番号');
  }
  setAfterLabelInBlock_(sheet, blockNo, ['技能証明書番号','技能証明番号'], session.cert);
}

function writeCheckResults_(sheet, checks, section, blockNo) {
  const names = section === '飛行前点検' ? PRE_CHECK_NAMES : POST_CHECK_NAMES;
  const checkCol = block_(blockNo).startCol + (section === '飛行前点検' ? 6 : 12);
  names.forEach(name => {
    const label = findInBlock_(sheet, blockNo, [name], false);
    if (label) sheet.getRange(label.row, checkCol).setValue(checks[name] === '正常' ? '☑' : '□');
  });
}

function flightBlocks_(sheet) {
  return [1, 2].map(blockNo => {
    const header = findInBlock_(sheet, blockNo, ['使用バッテリー'], false);
    if (!header) throw new Error('No.' + blockNo + ' の飛行記録欄を確認できません。');
    const block = block_(blockNo);
    return { blockNo: blockNo, headerRow: header.row, startCol: block.startCol,
      endCol: block.endCol, startRow: header.row + 1, endRow: header.row + 7 };
  });
}

function flightColumn_(sheet, block, labels) {
  return labelColumn_(sheet, block.headerRow, block.startCol, block.endCol, labels);
}

function nextFlightSlot_(sheet, preferredBlockNo) {
  const values = sheetValues_(sheet);
  const allBlocks = flightBlocks_(sheet);
  const order = Number(preferredBlockNo) === 2 ? [2] : [1, 2];
  for (const blockNo of order) {
    const block = allBlocks.filter(item => item.blockNo === blockNo)[0];
    if (!block) continue;
    if (blockNo !== Number(preferredBlockNo) && blockUsed_(sheet, blockNo)) continue;
    const batteryCol = flightColumn_(sheet, block, ['使用バッテリー']);
    if (!batteryCol) continue;
    for (let row = block.startRow; row <= block.endRow; row++) {
      if (!String((values[row - 1] || [])[batteryCol - 1] || '').trim()) {
        return { blockNo: block.blockNo, row: row, index: row - block.startRow + 1 };
      }
    }
  }
  throw new Error('No.1 / No.2 の飛行記録欄がすべて使用済みです。');
}

function writeFlightFields_(sheet, slot, fields) {
  const block = flightBlocks_(sheet).filter(item => item.blockNo === slot.blockNo)[0];
  if (!block) throw new Error('飛行記録ブロックを確認できません。');
  const aliases = {
    '使用バッテリー':['使用バッテリー'], '離陸場所':['離陸場所'], '着陸場所':['着陸場所'],
    '離陸時刻':['離陸時刻'], '着陸時刻':['着陸時刻'], '飛行時間':['飛行時間'],
    '総飛行時間':['総飛行時間'],
    '安全に影響した事項':['安全に影響した事項','飛行の安全に影響した事項'],
    'バッテリー異常・所感':['バッテリー異常・所感']
  };
  Object.keys(fields).forEach(key => {
    const col = flightColumn_(sheet, block, aliases[key] || [key]);
    if (col) sheet.getRange(slot.row, col).setValue(fields[key]);
  });
}

function writeOptionalFields_(sheet, input, blockNo, abnormal) {
  setAfterLabelInBlock_(sheet, blockNo, ['点検実施場所','点検場所'], input.inspectionLocation || '');
  setAfterLabelInBlock_(sheet, blockNo, ['不具合箇所：','不具合箇所'], input.defectLocation || '');
  setAfterLabelInBlock_(sheet, blockNo, ['事象等の内容：','事象等の内容','不具合内容'], input.defectDetail || '');

  const normalCell = findInBlock_(sheet, blockNo, ['□ 異常なし','☑ 異常なし'], false);
  const defectCell = findInBlock_(sheet, blockNo, ['□ 不具合あり','☑ 不具合あり'], false);
  if (normalCell) sheet.getRange(normalCell.row, normalCell.col).setValue(abnormal ? '□ 異常なし' : '☑ 異常なし');
  if (defectCell) sheet.getRange(defectCell.row, defectCell.col).setValue(abnormal ? '☑ 不具合あり' : '□ 不具合あり');

  if (abnormal || String(input.actionDetail || '').trim()) {
    const offset = block_(blockNo).startCol - 3;
    sheet.getRange(44, 4 + offset).setValue(new Date());
    sheet.getRange(44, 6 + offset).setValue(input.defectDetail || input.defectLocation || '');
    if (String(input.actionDetail || '').trim()) sheet.getRange(44, 10 + offset).setValue(new Date());
    sheet.getRange(44, 12 + offset).setValue(input.actionDetail || '');
    sheet.getRange(44, 15 + offset).setValue(input.confirmer || '');
  }
}

function aircraftTotalMinutes_(model) {
  let total = 0;
  for (let number = 1; number <= 7; number++) {
    const sheet = spreadsheet_().getSheetByName(BATTERY_SHEET_PREFIX + number);
    if (!sheet) continue;
    const count = BATTERY_LAST_ROW - BATTERY_FIRST_ROW + 1;
    sheet.getRange(BATTERY_FIRST_ROW, 2, count, 3).getValues().forEach(row => {
      if (String(row[0] || '').trim() === model) total += Number(row[2]) || 0;
    });
  }
  return total;
}

function minutesLabel_(minutes) {
  const value = Math.max(0, Math.round(Number(minutes) || 0));
  return Math.floor(value / 60) + '時間' + (value % 60) + '分';
}

function appendBatteryHistory_(session, minutes, input) {
  const sheet = spreadsheet_().getSheetByName(BATTERY_SHEET_PREFIX + session.currentBattery);
  if (!sheet) throw new Error('BAT_' + session.currentBattery + ' シートが見つかりません。');
  const values = sheetValues_(sheet);
  let row = BATTERY_FIRST_ROW;
  while (row <= BATTERY_LAST_ROW && String((values[row - 1] || [])[0] || '').trim()) row++;
  if (row > BATTERY_LAST_ROW) throw new Error(sheet.getName() + ' の履歴入力欄が上限に達しています。');
  sheet.getRange(row, 1, 1, 8).setValues([[
    new Date(session.dateSheet.replace(/\./g, '-')), session.model, session.purpose, minutes,
    input.cycle || '', input.batteryNote || '', session.route, ''
  ]]);
}

// ----------------------------------------------------
// 様式3：点検整備記録
// ----------------------------------------------------
function getOrCreateMaintenanceSheet_(ss) {
  let sheet = ss.getSheetByName(MAINTENANCE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(MAINTENANCE_SHEET_NAME);
    sheet.appendRow([
      '実施年月日', '機体型式', '登録記号', '総飛行時間', '点検等実施場所',
      '実施者氏名', '作業区分', '実施理由', '作業内容・詳細',
      '交換部品名', '確認結果（合否判定）', '次回予定・備考'
    ]);
    sheet.getRange(1, 1, 1, 12).setBackground('#e8eef8').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function addMaintenanceRecord(input) {
  return locked_(function() {
    required_(input.model, '機体型式');
    required_(input.type, '作業区分');
    required_(input.reason, '実施理由');
    required_(input.detail, '作業内容・詳細');
    required_(input.pilot, '実施者氏名');
    required_(input.location, '点検等実施場所');

    const ss = spreadsheet_();
    const sheet = getOrCreateMaintenanceSheet_(ss);
    const date = input.date ? new Date(input.date) : now_();
    const totalMinutes = aircraftTotalMinutes_(input.model);
    const totalLabel = minutesLabel_(totalMinutes);
    const registration = MODELS[input.model] || '';

    sheet.appendRow([
      date,
      input.model,
      registration,
      totalLabel,
      input.location,
      input.pilot,
      input.type,
      input.reason,
      input.detail,
      input.parts || 'なし',
      input.result || '適合（異常なし）',
      input.note || ''
    ]);

    return {
      success: true,
      model: input.model,
      totalMinutes: totalMinutes,
      totalLabel: totalLabel
    };
  });
}

// ----------------------------------------------------
// 記録訂正機能と訂正履歴シート
// ----------------------------------------------------
function getOrCreateCorrectionSheet_(ss) {
  let sheet = ss.getSheetByName(CORRECTION_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CORRECTION_SHEET_NAME);
    sheet.appendRow(['訂正日時', '訂正対象', 'キー/日付', '項目名', '訂正前', '訂正後', '訂正理由', '操作者']);
    sheet.getRange(1, 1, 1, 8).setBackground('#fce8e6').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function logCorrection_(ss, target, key, field, beforeVal, afterVal, reason, operator) {
  const sheet = getOrCreateCorrectionSheet_(ss);
  sheet.appendRow([now_(), target, key, field, String(beforeVal), String(afterVal), reason, operator || '']);
}

function correctSavedRecord(input) {
  return locked_(function() {
    required_(input.target, '訂正対象');
    required_(input.field, '訂正項目名');
    required_(input.reason, '訂正理由');
    required_(input.newValue, '新しい値');

    const ss = spreadsheet_();
    if (input.target === 'flight') {
      const sheet = ss.getSheetByName(input.dateSheet);
      if (!sheet) throw new Error('シート ' + input.dateSheet + ' が見つかりません。');
      const row = Number(input.row);
      const col = Number(input.col);
      const cell = sheet.getRange(row, col);
      const before = cell.getDisplayValue();
      cell.setValue(input.newValue);
      logCorrection_(ss, '飛行記録', input.dateSheet + ' R' + row + 'C' + col, input.field, before, input.newValue, input.reason, input.operator);
    } else if (input.target === 'battery') {
      const sheet = ss.getSheetByName(BATTERY_SHEET_PREFIX + input.batteryNo);
      if (!sheet) throw new Error('バッテリーシートが見つかりません。');
      const row = Number(input.row);
      const col = Number(input.col);
      const cell = sheet.getRange(row, col);
      const before = cell.getDisplayValue();
      cell.setValue(input.newValue);
      logCorrection_(ss, 'バッテリー履歴', 'BAT_' + input.batteryNo + ' R' + row + 'C' + col, input.field, before, input.newValue, input.reason, input.operator);
    } else {
      throw new Error('未知の訂正対象です。');
    }
    return { success: true };
  });
}

// ----------------------------------------------------
// PDF出力・過去日誌検索
// ----------------------------------------------------
function getPdfUrl(dateStr) {
  const date = dateStr ? String(dateStr).trim() : format_(now_(), 'yyyy.M.d');
  const ss = spreadsheet_();
  const sheet = ss.getSheetByName(date);
  if (!sheet) throw new Error('日付シート「' + date + '」が見つかりません。');

  const sheetId = sheet.getSheetId();
  const url = 'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '/export?' +
    'exportFormat=pdf&format=pdf' +
    '&size=A4' +
    '&portrait=false' +
    '&fitw=true' +
    '&gridlines=true' +
    '&printtitle=false' +
    '&sheetnames=false' +
    '&fzr=false' +
    '&gid=' + sheetId;
  return { date: date, pdfUrl: url, sheetUrl: sheetUrl_(ss, sheet) };
}

function searchFlightLogs(query) {
  const ss = spreadsheet_();
  const sheets = ss.getSheets();
  const results = [];
  const q = String(query || '').trim();

  sheets.forEach(sh => {
    const name = sh.getName();
    if (/^\d{4}\.\d{1,2}\.\d{1,2}$/.test(name)) {
      if (!q || name.indexOf(q) >= 0) {
        results.push({
          date: name,
          sheetUrl: sheetUrl_(ss, sh)
        });
      }
    }
  });
  return results.sort((a, b) => b.date.localeCompare(a.date));
}

// ============================================================================
// 3. 画面構造（HTML）＆ モバイルデザインスタイル（CSS）
// ============================================================================
const APP_HTML = String.raw`<!doctype html>
<html lang="ja">
<head>
  <base target="_top">
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <title>ドローン運航記録</title>
  <style>
    :root {
      --primary: #1976d2;
      --primary-dark: #115293;
      --bg: #f4f6f9;
      --card-bg: #ffffff;
      --text: #212529;
      --muted: #6c757d;
      --border: #ced4da;
      --success: #28a745;
      --warning: #e65100;
      --danger: #dc3545;
      --tag-bg: #eef2f6;
      --tag-border: #cbd5e1;
    }
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 0;
      line-height: 1.5;
    }
    .wrap {
      max-width: 640px;
      margin: 0 auto;
      padding: 10px 14px 40px;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0 10px;
      border-bottom: 2px solid #e2e8f0;
      margin-bottom: 10px;
    }
    h1 {
      font-size: 19px;
      margin: 0;
      color: #1a202c;
      font-weight: 700;
    }
    .badge {
      display: inline-block;
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 600;
      border-radius: 6px;
      background: #e2e8f0;
      color: #4a5568;
    }
    .badge.active { background: #ebf8ff; color: #2b6cb0; }
    .card {
      background: var(--card-bg);
      border-radius: 12px;
      padding: 14px 16px;
      margin-bottom: 12px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.05);
      border: 1px solid #edf2f7;
    }
    h2 {
      font-size: 16px;
      margin: 0 0 10px;
      font-weight: 700;
      color: #2d3748;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .nav-tabs {
      display: flex;
      gap: 6px;
      margin-bottom: 10px;
      overflow-x: auto;
    }
    .nav-tab {
      flex: 1;
      text-align: center;
      padding: 8px 4px;
      font-size: 13px;
      font-weight: 600;
      border-radius: 8px;
      background: #edf2f7;
      color: #4a5568;
      border: none;
      cursor: pointer;
      white-space: nowrap;
    }
    .nav-tab.active {
      background: var(--primary);
      color: #fff;
    }
    label {
      display: block;
      margin: 9px 0 3px;
      font-size: 13px;
      font-weight: 600;
      color: #4a5568;
    }
    .required { color: var(--danger); margin-left: 2px; }
    input[type="text"], input[type="number"], input[type="date"], select, textarea {
      width: 100%;
      font-size: 15px;
      padding: 9px 11px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #fff;
      color: var(--text);
      outline: none;
      transition: border-color .15s;
    }
    input:focus, select:focus, textarea:focus {
      border-color: var(--primary);
    }
    textarea { min-height: 64px; resize: vertical; }
    .btn {
      display: block;
      width: 100%;
      padding: 11px 13px;
      font-size: 15px;
      font-weight: 700;
      text-align: center;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      margin-top: 10px;
      transition: opacity .15s, transform .05s;
    }
    .btn:active { transform: scale(0.99); opacity: .9; }
    .btn-primary { background: var(--primary); color: #fff; }
    .btn-secondary { background: #e2e8f0; color: #2d3748; }
    .btn-success { background: var(--success); color: #fff; }
    .btn-warning { background: var(--warning); color: #fff; }
    .btn-danger { background: var(--danger); color: #fff; }
    .btn-outline {
      background: #fff;
      color: var(--primary);
      border: 1px solid var(--primary);
      padding: 6px 10px;
      font-size: 12px;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      width: auto;
      margin: 0;
      display: inline-block;
    }
    .btn-sm { padding: 5px 9px; font-size: 12px; width: auto; margin: 0; display: inline-block; }
    .check-list {
      display: grid;
      gap: 5px;
      margin: 6px 0;
    }
    .check-item {
      display: flex;
      align-items: center;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 7px;
      padding: 7px 9px;
      cursor: pointer;
      font-size: 13.5px;
    }
    .check-item input {
      width: 19px;
      height: 19px;
      margin-right: 9px;
      accent-color: var(--primary);
    }
    .status-box {
      background: #ebf8ff;
      border-left: 4px solid var(--primary);
      padding: 9px 11px;
      border-radius: 6px;
      font-size: 13px;
      margin-bottom: 10px;
      color: #2b6cb0;
    }
    .warn-box {
      background: #fffaf0;
      border-left: 4px solid var(--warning);
      padding: 9px 11px;
      border-radius: 6px;
      font-size: 13px;
      margin-bottom: 10px;
      color: #7c2d12;
    }
    .error-box {
      background: #fff5f5;
      border-left: 4px solid var(--danger);
      padding: 11px;
      border-radius: 6px;
      font-size: 13px;
      color: #9b2c2c;
      margin-bottom: 10px;
    }
    .alert-pill {
      background: #fed7d7;
      color: #9b2c2c;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      margin-left: 6px;
    }
    .flex-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .flex-between {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .text-sm { font-size: 12px; color: var(--muted); }
    .tags-container {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin: 6px 0;
    }
    .tag-chip {
      background: var(--tag-bg);
      border: 1px solid var(--tag-border);
      border-radius: 14px;
      padding: 4px 10px;
      font-size: 12px;
      color: #334155;
      cursor: pointer;
      user-select: none;
      transition: background .15s;
    }
    .tag-chip:active { background: #cbd5e1; }
    .timer-display {
      font-size: 32px;
      font-weight: 800;
      font-family: monospace, sans-serif;
      text-align: center;
      color: #1a202c;
      padding: 8px;
      background: #edf2f7;
      border-radius: 8px;
      margin: 8px 0;
      letter-spacing: 2px;
    }
    .preset-bar {
      display: flex;
      gap: 6px;
      overflow-x: auto;
      padding: 4px 0 8px;
    }
    .preset-btn {
      background: #f1f5f9;
      border: 1px dashed #94a3b8;
      border-radius: 6px;
      padding: 5px 9px;
      font-size: 12px;
      color: #334155;
      white-space: nowrap;
      cursor: pointer;
    }
    .input-error {
      border: 2px solid #ef4444 !important;
      background-color: #fef2f2 !important;
    }
    .error-banner {
      background: #fef2f2;
      border: 1px solid #fca5a5;
      border-left: 5px solid #ef4444;
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 14px;
      color: #991b1b;
      font-size: 13px;
      line-height: 1.5;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .error-banner strong {
      display: block;
      font-size: 14px;
      margin-bottom: 6px;
      color: #7f1d1d;
    }
    .error-banner ul {
      margin: 4px 0 0 18px;
      padding: 0;
    }
    .error-banner li {
      margin-bottom: 4px;
      font-weight: 600;
    }
    #loading {
      position: fixed;
      inset: 0;
      background: rgba(255,255,255,0.85);
      display: none;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      font-weight: 700;
      color: var(--primary);
      z-index: 9999;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <div>
        <h1>ドローン運航記録</h1>
        <div class="text-sm">EVO Lite / Lite+ プロ仕様・法令適合</div>
      </div>
      <span id="appStatusBadge" class="badge">確認中</span>
    </header>

    <div class="nav-tabs" id="navTabs">
      <button class="nav-tab active" onclick="switchTab('flight')">✈ 運航記録</button>
      <button class="nav-tab" onclick="switchTab('maintenance')">🛠 点検整備（様式3）</button>
      <button class="nav-tab" onclick="switchTab('pdf')">📄 日誌PDF・検索</button>
    </div>

    <div id="app">
      <div class="card">読み込み中...</div>
    </div>
  </div>

  <div id="loading">処理中...</div>

<script>
// ============================================================================
// 4. 画面操作スクリプト（Vanilla JavaScript）
// ============================================================================
var STATE = __INITIAL_STATE__;
var CURRENT_TAB = 'flight';

var PRE_NAMES = ['機体全般','プロペラ・フレーム','通信系統','推進系統','電源系統','自動制御系統','バッテリー','操縦装置','灯火','カメラ','リモートID'];
var POST_NAMES = ['機体全般','プロペラ・フレーム','発熱','その他'];
var PURPOSE_NAMES = ['空撮','報道取材','警備','農林水産業','測量','環境調査','設備メンテナンス','インフラ点検・保守','資材管理','輸送・宅配','自然観測','事故・災害対応等','趣味','研究開発','その他','操縦練習','整備後確認飛行','修理後確認飛行'];
var METHOD_NAMES = ['通常飛行（特定飛行なし）','屋内練習','空港等周辺','150m以上','DID','夜間','目視外','30m未満','催し場所上空','危険物輸送','物件投下'];
var SPECIAL_METHODS = ['空港等周辺','150m以上','DID','夜間','目視外','30m未満','催し場所上空','危険物輸送','物件投下'];
var MAINTENANCE_TYPES = ['定期点検','修理','改造','整備','部品交換','ファームウェア更新','点検'];

var SAFETY_TAGS = [
  '突風による一時ホバリング',
  '鳥類の異常接近・回避',
  'カラスの威嚇',
  '電波干渉/警告表示',
  'GPS捕捉数低下',
  '一般人の接近・一時待機',
  '映像伝送の一時途絶',
  'バッテリー温度警告',
  '周辺草木の巻き込み注意'
];

var TIMER_INTERVAL = null;

// ----------------------------------------------------
// 共通ユーティリティ
// ----------------------------------------------------
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function el(id){return document.getElementById(id)}
function val(id){var x=el(id);return x?String(x.value).trim():''}
function isChecked(id){var x=el(id);return !!(x&&x.checked)}
function busy(b){el('loading').style.display=b?'flex':'none'}

function callServer(name, arg, onSuccess){
  busy(true);
  var r = google.script.run
    .withSuccessHandler(function(res){
      busy(false);
      if(onSuccess) onSuccess(res);
      else {
        STATE = res;
        render();
      }
    })
    .withFailureHandler(function(err){
      busy(false);
      renderError(err && err.message ? err.message : String(err));
    });
  if(arg===undefined) r[name]();
  else r[name](arg);
}

function clearFormErrors(containerId){
  var banner = el(containerId + '_errorBanner');
  if(banner) banner.remove();
  var errInputs = document.querySelectorAll('.input-error');
  for(var i=0; i<errInputs.length; i++){
    errInputs[i].classList.remove('input-error');
  }
}

function showFormErrors(containerId, errorItems){
  clearFormErrors(containerId);
  if(!errorItems || errorItems.length === 0) return true;

  var container = el(containerId);
  var banner = document.createElement('div');
  banner.id = containerId + '_errorBanner';
  banner.className = 'error-banner';

  var html = '<strong>⚠️ 未入力または確認が必要な項目があります</strong><ul>';
  for(var i=0; i<errorItems.length; i++){
    var item = errorItems[i];
    html += '<li>【' + esc(item.label) + '】 ' + esc(item.message || '入力してください。') + '</li>';
    if(item.id){
      var elem = el(item.id);
      if(elem){
        elem.classList.add('input-error');
        (function(targetElem){
          var removeErr = function(){
            targetElem.classList.remove('input-error');
            targetElem.removeEventListener('input', removeErr);
            targetElem.removeEventListener('change', removeErr);
          };
          targetElem.addEventListener('input', removeErr);
          targetElem.addEventListener('change', removeErr);
        })(elem);
      }
    }
  }
  html += '</ul>';
  banner.innerHTML = html;

  if(container){
    container.insertBefore(banner, container.firstChild);
  }

  var firstElem = errorItems[0].id ? el(errorItems[0].id) : null;
  if(firstElem){
    firstElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    try{ firstElem.focus(); }catch(e){}
  } else if(banner) {
    banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return false;
}

function renderError(msg){
  if(typeof msg === 'string' && msg.indexOf('SESSION_EXISTS::') >= 0){
    var sess = {};
    try { sess = JSON.parse(msg.split('SESSION_EXISTS::')[1]); }catch(e){}
    el('app').innerHTML =
      '<div class="card" style="border-left:5px solid #f59e0b; background:#fffbeb;">' +
        '<h2 style="color:#b45309; margin-top:0;">⚠️ 前回の運航記録が中断されたまま残っています</h2>' +
        '<div style="color:#78350f; font-size:14px; line-height:1.7; margin:12px 0; background:rgba(255,255,255,0.7); padding:10px 14px; border-radius:6px; border:1px solid #fde68a;">' +
          '前回の記録が正常に完了していません。新しく開始する前にどちらかを選択してください。<br>' +
          '・<strong>対象機体:</strong> ' + esc(sess.model || '未設定') + '<br>' +
          '・<strong>飛行枠:</strong> ' + esc(sess.dateSheet || '') + ' No.' + esc(sess.blockNo || '') + '<br>' +
          '・<strong>中断時点の進捗:</strong> <span class="badge active" style="font-size:12px;background:#b45309;">' + esc(sess.phaseName || sess.phase || '進行中') + '</span><br>' +
          '・<strong>操縦者:</strong> ' + esc(sess.pilot || '未設定') + '<br>' +
          '・<strong>飛行場所:</strong> ' + esc(sess.route || '未設定') +
        '</div>' +
        '<div style="color:#92400e; font-size:13px; margin-bottom:14px;">' +
          '※続きから日誌を完成させる場合は<strong>「続きから再開する」</strong>を、前回分を取り消して最初から新しく入力し直す場合は<strong>「破棄して新規開始」</strong>を押してください。' +
        '</div>' +
        '<div style="display:flex; flex-direction:column; gap:10px;">' +
          '<button class="btn btn-primary" style="font-size:15px; padding:12px;" onclick="callServer(\'getAppState\')">▶ 前回の続きから再開する</button>' +
          '<button class="btn btn-danger btn-sm" onclick="confirmResetSession()">🗑 前回の記録を破棄して新しく開始する</button>' +
        '</div>' +
      '</div>';
    return;
  }
  el('app').innerHTML =
    '<div class="card error-box">' +
      '<h3>エラー</h3>' +
      '<div style="margin:10px 0; font-size:14px; line-height:1.6;">' + esc(msg) + '</div>' +
      '<button class="btn btn-secondary" onclick="render()">戻る</button>' +
    '</div>';
}

function confirmResetSession(){
  if(confirm('本当に前回の運航記録を破棄して、新しく開始しますか？\n（中断されていたデータはクリアされます）')){
    callServer('cancelCurrentSession');
  }
}

function switchTab(tab){
  CURRENT_TAB = tab;
  var btns = el('navTabs').getElementsByClassName('nav-tab');
  btns[0].className = tab==='flight' ? 'nav-tab active' : 'nav-tab';
  btns[1].className = tab==='maintenance' ? 'nav-tab active' : 'nav-tab';
  btns[2].className = tab==='pdf' ? 'nav-tab active' : 'nav-tab';
  render();
}

// ----------------------------------------------------
// LocalStorage 管理（下書き・直前履歴・お気に入り）
// ----------------------------------------------------
var STORAGE_KEY_LAST = 'EVO_LITE_LAST_OPERATION';
var STORAGE_KEY_FAVORITES = 'EVO_LITE_FAVORITES';

function saveLastOperation(data){
  try{ localStorage.setItem(STORAGE_KEY_LAST, JSON.stringify(data)); }catch(e){}
}
function loadLastOperation(){
  try{ var d = localStorage.getItem(STORAGE_KEY_LAST); return d ? JSON.parse(d) : null; }catch(e){ return null; }
}
function loadFavorites(){
  try{ var d = localStorage.getItem(STORAGE_KEY_FAVORITES); return d ? JSON.parse(d) : []; }catch(e){ return []; }
}
function saveFavoriteSpot(name, location, route){
  try{
    var list = loadFavorites();
    list.unshift({ name: name, location: location, route: route });
    if(list.length > 8) list.pop();
    localStorage.setItem(STORAGE_KEY_FAVORITES, JSON.stringify(list));
  }catch(e){}
}

// ----------------------------------------------------
// GPS自動取得＆逆ジオコーディング（手打ちゼロ）
// ----------------------------------------------------
function fetchCurrentGps(targetId, targetRouteId){
  if(!navigator.geolocation){
    alert('お使いのブラウザはGPS位置情報に対応していません。');
    return;
  }
  busy(true);
  navigator.geolocation.getCurrentPosition(function(pos){
    var lat = pos.coords.latitude.toFixed(6);
    var lng = pos.coords.longitude.toFixed(6);
    var latLabel = (pos.coords.latitude >= 0 ? '北緯' : '南緯') + Math.abs(pos.coords.latitude).toFixed(4);
    var lngLabel = (pos.coords.longitude >= 0 ? '東経' : '西経') + Math.abs(pos.coords.longitude).toFixed(4);
    var coordStr = '（' + latLabel + ', ' + lngLabel + '）';

    var gsiUrl = 'https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=' + lat + '&lon=' + lng;
    fetch(gsiUrl)
      .then(function(res){ return res.json(); })
      .then(function(data){
        busy(false);
        var addr = '';
        if(data && data.results && data.results.lv01Nm){
          addr = data.results.lv01Nm;
        }
        var fullLocation = (addr ? addr + ' ' : '') + coordStr;
        if(el(targetId)) el(targetId).value = fullLocation;
        if(targetRouteId && el(targetRouteId) && !el(targetRouteId).value){
          el(targetRouteId).value = (addr || '離陸地点') + '周辺 半径100m以内';
        }
      })
      .catch(function(){
        busy(false);
        var fullLocation = '現地 ' + coordStr;
        if(el(targetId)) el(targetId).value = fullLocation;
        if(targetRouteId && el(targetRouteId) && !el(targetRouteId).value){
          el(targetRouteId).value = '離陸地点周辺 半径100m以内';
        }
      });
  }, function(err){
    busy(false);
    alert('GPS位置情報を取得できませんでした：' + err.message);
  }, { enableHighAccuracy: true, timeout: 8000 });
}

// ----------------------------------------------------
// メイン描画ディスパッチャ
// ----------------------------------------------------
function render(){
  var appDiv = el('app');
  var badge = el('appStatusBadge');

  if(TIMER_INTERVAL){ clearInterval(TIMER_INTERVAL); TIMER_INTERVAL = null; }

  if(CURRENT_TAB === 'maintenance'){
    badge.className = 'badge';
    badge.innerText = '様式3 整備記録';
    renderMaintenanceView(appDiv);
    return;
  }
  if(CURRENT_TAB === 'pdf'){
    badge.className = 'badge';
    badge.innerText = '日誌・PDF';
    renderPdfView(appDiv);
    return;
  }

  // CURRENT_TAB === 'flight'
  if(!STATE){
    badge.className = 'badge';
    badge.innerText = '接続中';
    appDiv.innerHTML = '<div class="card">接続中...</div>';
    return;
  }

  if(!STATE.active){
    badge.className = 'badge';
    badge.innerText = '待機中';
    renderStartView(appDiv);
  } else {
    badge.className = 'badge active';
    badge.innerText = '運航中';
    var phase = STATE.session.phase;
    if(phase === 'PRE') renderPreView(appDiv);
    else if(phase === 'READY') renderReadyView(appDiv);
    else if(phase === 'FLYING') renderFlyingView(appDiv);
    else if(phase === 'POST_ALL') renderPostView(appDiv);
    else renderAfterLandingView(appDiv);
  }
}

// ----------------------------------------------------
// 1. 運航開始画面（トップ）
// ----------------------------------------------------
function renderStartView(div){
  var last = loadLastOperation() || {};
  var favs = loadFavorites();

  var sessionNoticeHtml = '';
  if(STATE && STATE.session){
    var s = STATE.session;
    var phaseNames = {
      'PRE': '飛行前点検',
      'READY': '離陸待機中',
      'FLYING': '飛行中',
      'AFTER_LANDING': '着陸後'
    };
    sessionNoticeHtml =
      '<div class="warn-box" style="margin-bottom:12px; border-left:5px solid #f59e0b; background:#fffbeb;">' +
        '<div style="font-weight:700; color:#b45309; font-size:14px;">⚠️ 前回の記録が途中で中断されています</div>' +
        '<div class="text-sm" style="color:#78350f; margin:4px 0 8px;">' +
          '機体: <strong>' + esc(s.model) + '</strong> ｜ 進捗: <strong>' + esc(phaseNames[s.phase] || s.phase) + '</strong>' +
        '</div>' +
        '<div class="flex-row">' +
          '<button type="button" class="btn btn-primary btn-sm" onclick="render()">▶ 続きから再開</button>' +
          '<button type="button" class="btn btn-danger btn-sm" onclick="confirmResetSession()">🗑 破棄して新規開始</button>' +
        '</div>' +
      '</div>';
  }

  var purposes = '<option value="">選択してください</option>' + PURPOSE_NAMES.map(function(n){
    var sel = (last.purpose || '空撮') === n ? ' selected' : '';
    return '<option value="'+esc(n)+'"'+sel+'>'+esc(n)+'</option>';
  }).join('');

  var selMethods = last.method || ['通常飛行（特定飛行なし）'];
  var methods = METHOD_NAMES.map(function(name, i){
    var chk = selMethods.indexOf(name) >= 0 ? ' checked' : '';
    return '<label class="check-item"><input type="checkbox" id="method'+i+'"'+chk+' onchange="onMethodChanged('+i+')"><span>'+esc(name)+'</span></label>';
  }).join('');

  var favHtml = '';
  if(favs.length > 0){
    favHtml = '<div class="preset-bar">' + favs.map(function(f, idx){
      return '<button type="button" class="preset-btn" onclick="applyFavorite(' + idx + ')">📍 ' + esc(f.name) + '</button>';
    }).join('') + '</div>';
  }

  div.innerHTML =
    sessionNoticeHtml +
    '<div class="card" id="startCard">' +
      '<div class="flex-between" style="margin-bottom:8px;">' +
        '<h2>本日の運航を開始</h2>' +
        '<button type="button" class="btn-outline" onclick="applyLastOperation()">🔄 前回と同じ条件で引用</button>' +
      '</div>' +

      (favHtml ? '<div style="margin-bottom:8px;"><div class="text-sm">登録済みのお気に入り現場：</div>' + favHtml + '</div>' : '') +

      '<div class="status-box">' +
        '本日：<strong>' + esc(STATE.today) + '</strong> ' +
        (STATE.hasTodaySheet ? '（日付シート作成済み）' : '（開始時に自動作成）') +
      '</div>' +
      (STATE.hasTodaySheet ? '<label class="check-item" style="margin:8px 0;background:#eff6ff;padding:6px 10px;border-radius:8px;border:1px solid #bfdbfe;"><input type="checkbox" id="forceNewLocation"><span style="font-size:13px;font-weight:600;color:#1e40af;">🏢 本日別の新しい現場として連番シート（' + esc(STATE.today) + '_2 等）で開始する</span></label>' : '') +

      '<label>機体選択<span class="required">*</span></label>' +
      '<select id="model">' +
        '<option value="EVO Lite"' + (last.model==='EVO Lite'?' selected':'') + '>EVO Lite（JU3268805C02）</option>' +
        '<option value="EVO Lite+"' + (last.model==='EVO Lite+'?' selected':'') + '>EVO Lite+（JU3269B165D2）</option>' +
      '</select>' +

      '<div class="flex-between">' +
        '<label>飛行経路・場所<span class="required">*</span></label>' +
        '<button type="button" class="btn-outline" onclick="fetchCurrentGps(\'inspectionLocation\', \'route\')">📍 GPSから現在地を取得</button>' +
      '</div>' +
      '<input type="text" id="route" placeholder="例：〇〇海岸周辺 半径100m、△△グラウンド等" value="' + esc(last.route || '') + '">' +

      '<label>飛行目的（飛行概要）<span class="required">*</span></label>' +
      '<select id="purpose" onchange="onPurposeChanged()">' + purposes + '</select>' +
      '<div id="purposeOtherBox" style="display:' + (last.purpose==='その他'?'block':'none') + ';">' +
        '<label>その他の飛行目的詳細</label>' +
        '<input type="text" id="purposeOther" value="' + esc(last.purposeOther || '') + '">' +
      '</div>' +

      '<label>飛行カテゴリー<span class="required">*</span></label>' +
      '<select id="category" onchange="onCategoryChanged()">' +
        '<option value="カテゴリーⅠ"' + (last.category==='カテゴリーⅠ'?' selected':'') + '>カテゴリーⅠ（特定飛行なし）</option>' +
        '<option value="カテゴリーⅡ"' + (last.category==='カテゴリーⅡ'?' selected':'') + '>カテゴリーⅡ（許可承認・特定飛行）</option>' +
        '<option value="カテゴリーⅢ"' + (last.category==='カテゴリーⅢ'?' selected':'') + '>カテゴリーⅢ（第三者上空・一等）</option>' +
      '</select>' +

      '<div id="permitBox" style="display:' + (last.category==='カテゴリーⅡ'||last.category==='カテゴリーⅢ'?'block':'none') + ';" class="warn-box">' +
        '<div class="flex-between">' +
          '<strong>国交省 許可・承認情報</strong>' +
          '<span id="permitExpireBadge"></span>' +
        '</div>' +
        '<div class="grid-2" style="margin-top:6px;">' +
          '<div>' +
            '<label>許可・承認書番号</label>' +
            '<input type="text" id="permitNo" placeholder="例：東空運第12345号" value="' + esc(last.permitNo || '') + '" oninput="checkPermitExpiry()">' +
          '</div>' +
          '<div>' +
            '<label>有効期限</label>' +
            '<input type="date" id="permitExpire" value="' + esc(last.permitExpire || '') + '" onchange="checkPermitExpiry()">' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<label>飛行禁止空域・飛行の方法（複数選択可）<span class="required">*</span></label>' +
      '<div class="check-list" id="methodListCard">' + methods + '</div>' +

      '<label>点検実施場所<span class="required">*</span></label>' +
      '<input type="text" id="inspectionLocation" placeholder="例：〇〇市〇〇町（北緯35.XXXX, 東経139.YYYY）" value="' + esc(last.inspectionLocation || last.route || '') + '">' +

      '<div class="grid-2">' +
        '<div>' +
          '<label>機長（操縦者・点検者）<span class="required">*</span></label>' +
          '<input type="text" id="pilot" value="' + esc(last.pilot || '吉田 公一（ YOSHIDA KOUICHI）') + '">' +
        '</div>' +
        '<div>' +
          '<label>安全運航管理者 / 補助者</label>' +
          '<input type="text" id="assistant" placeholder="補助者氏名（任意）" value="' + esc(last.assistant || '') + '">' +
        '</div>' +
      '</div>' +

      '<label>技能証明書番号</label>' +
      '<input type="text" id="cert" placeholder="未所持または技能証明番号" value="' + esc(last.cert || '') + '">' +

      '<div class="flex-row" style="margin-top:8px;">' +
        '<button type="button" class="btn-outline btn-sm" onclick="saveCurrentAsFavorite()">⭐ この場所をお気に入りに登録</button>' +
      '</div>' +

      '<button class="btn btn-primary" style="font-size:16px;padding:13px;" onclick="submitStartOperation()">次へ：飛行前点検を開始</button>' +
    '</div>';

  checkPermitExpiry();
}

function onPurposeChanged(){
  el('purposeOtherBox').style.display = val('purpose') === 'その他' ? 'block' : 'none';
}

function onCategoryChanged(){
  var cat = val('category');
  el('permitBox').style.display = (cat === 'カテゴリーⅡ' || cat === 'カテゴリーⅢ') ? 'block' : 'none';
  checkPermitExpiry();
}

function checkPermitExpiry(){
  var badge = el('permitExpireBadge');
  if(!badge) return;
  var exp = val('permitExpire');
  if(!exp){ badge.innerHTML = ''; return; }
  var today = new Date().toISOString().slice(0, 10);
  if(exp < today){
    badge.innerHTML = '<span class="alert-pill">⚠ 許可証の期限が切れています！</span>';
  } else {
    var diffDays = Math.round((new Date(exp) - new Date(today)) / (1000 * 60 * 60 * 24));
    if(diffDays <= 30){
      badge.innerHTML = '<span style="color:#d97706;font-size:11px;font-weight:700;">⚠ 残り' + diffDays + '日で期限切れ</span>';
    } else {
      badge.innerHTML = '<span style="color:#16a34a;font-size:11px;font-weight:700;">✓ 有効期間内</span>';
    }
  }
}

function onMethodChanged(changedIdx){
  var changedName = METHOD_NAMES[changedIdx];
  if(changedName === '通常飛行（特定飛行なし）' && isChecked('method' + changedIdx)){
    for(var i=1; i<METHOD_NAMES.length; i++) el('method' + i).checked = false;
  } else if(isChecked('method' + changedIdx)) {
    el('method0').checked = false;
  }
  syncCategoryAuto();
}

function getSelectedMethods(){
  var list = [];
  for(var i=0; i<METHOD_NAMES.length; i++){
    if(isChecked('method' + i)) list.push(METHOD_NAMES[i]);
  }
  return list;
}

function syncCategoryAuto(){
  var methods = getSelectedMethods();
  var hasSpecial = methods.some(function(m){ return SPECIAL_METHODS.indexOf(m) >= 0; });
  var cat = el('category');
  if(hasSpecial && cat.value === 'カテゴリーⅠ') {
    cat.value = 'カテゴリーⅡ';
  } else if(!hasSpecial && methods.length > 0 && cat.value !== 'カテゴリーⅠ') {
    cat.value = 'カテゴリーⅠ';
  }
  onCategoryChanged();
}

function applyLastOperation(){
  var last = loadLastOperation();
  if(!last){ alert('前回の記録履歴がありません。'); return; }
  renderStartView(el('app'));
}

function applyFavorite(idx){
  var favs = loadFavorites();
  var f = favs[idx];
  if(!f) return;
  if(el('route')) el('route').value = f.route;
  if(el('inspectionLocation')) el('inspectionLocation').value = f.location;
}

function saveCurrentAsFavorite(){
  var loc = val('inspectionLocation');
  var r = val('route');
  if(!loc && !r){ alert('場所または経路を入力してください。'); return; }
  var name = prompt('この現場の表示名を入力してください（例：〇〇海岸、自宅横）：', r.slice(0, 12) || 'お気に入り現場');
  if(name){
    saveFavoriteSpot(name, loc, r);
    alert('お気に入り現場に登録しました。');
    renderStartView(el('app'));
  }
}

function submitStartOperation(){
  clearFormErrors('startCard');
  var errors = [];

  var model = val('model');
  if(!model) errors.push({ id: 'model', label: '機体', message: '機体を選択してください。' });

  var purpose = val('purpose');
  if(!purpose) errors.push({ id: 'purpose', label: '飛行目的', message: '飛行目的を選択してください。' });
  else if(purpose === 'その他' && !val('purposeOther')) {
    errors.push({ id: 'purposeOther', label: 'その他の飛行目的詳細', message: '「その他」の内容を入力してください。' });
  }

  var methods = getSelectedMethods();
  if(!methods.length){
    errors.push({ id: 'methodListCard', label: '飛行禁止空域・飛行方法', message: '1つ以上チェックしてください。' });
  }

  var category = val('category');
  if(!category) errors.push({ id: 'category', label: '飛行カテゴリー', message: '飛行カテゴリーを選択してください。' });

  var hasSpecial = methods.some(function(m){ return SPECIAL_METHODS.indexOf(m) >= 0; });
  if(category === 'カテゴリーⅠ' && hasSpecial){
    errors.push({ id: 'category', label: '飛行カテゴリー不整合', message: '特定飛行（DID・夜間・目視外等）を行う場合は「カテゴリーⅡ」または「カテゴリーⅢ」を選択してください。' });
  }
  if((category === 'カテゴリーⅡ' || category === 'カテゴリーⅢ') && !hasSpecial){
    errors.push({ id: 'category', label: '飛行カテゴリー不整合', message: 'カテゴリーⅡ/Ⅲは特定飛行を行う区分です。該当する特定飛行にチェックを入れてください。' });
  }

  var route = val('route');
  if(!route) errors.push({ id: 'route', label: '飛行経路・場所', message: '飛行する場所または経路を入力してください。（GPS取得ボタンも利用可能）' });

  var inspectionLocation = val('inspectionLocation');
  if(!inspectionLocation) errors.push({ id: 'inspectionLocation', label: '点検実施場所', message: '点検を実施した場所を入力してください。' });

  var pilot = val('pilot');
  if(!pilot) errors.push({ id: 'pilot', label: '機長（操縦者・点検者）', message: '操縦者氏名を入力してください。' });

  if(errors.length > 0){
    showFormErrors('startCard', errors);
    return;
  }

  var payload = {
    model: model,
    purpose: purpose,
    purposeOther: val('purposeOther'),
    route: route,
    category: category,
    permitNo: val('permitNo'),
    permitExpire: val('permitExpire'),
    method: methods,
    inspectionLocation: inspectionLocation,
    pilot: pilot,
    assistant: val('assistant'),
    cert: val('cert'),
    forceNewLocation: isChecked('forceNewLocation')
  };

  saveLastOperation(payload);

  callServer('startAircraft', payload, function(res){
    STATE = res;
    render();
  });
}

// ----------------------------------------------------
// セッションヘッダー
// ----------------------------------------------------
function sessionHeaderHtml(){
  var s = STATE.session;
  return '<div class="card status-box" style="margin-bottom:8px;">' +
    '<div class="flex-between">' +
      '<div><strong>' + esc(s.dateSheet) + ' No.' + s.blockNo + '</strong> ｜ ' + esc(s.model) + '</div>' +
      '<div class="flex-row" style="gap:6px;align-items:center;">' +
        '<span class="badge active">' + esc(s.category) + '</span>' +
        '<button type="button" class="btn btn-secondary btn-sm" style="padding:2px 8px;font-size:11px;" onclick="cancelSessionPrompt()">↩ 運航中止</button>' +
      '</div>' +
    '</div>' +
    '<div class="text-sm" style="margin-top:4px;">' + esc(s.route) + ' / ' + esc(s.purpose) + '</div>' +
  '</div>';
}

// ----------------------------------------------------
// 2. 飛行前点検画面（様式2）
// ----------------------------------------------------
function renderPreView(div){
  var checksHtml = PRE_NAMES.map(function(name, i){
    return '<label class="check-item"><input type="checkbox" id="pre' + i + '" checked onchange="onPreCheckChanged()"><span>' + esc(name) + '</span></label>';
  }).join('');

  div.innerHTML = sessionHeaderHtml() +
    '<div class="card" id="preCard">' +
      '<h2>飛行前点検（様式2）</h2>' +
      '<div class="text-sm" style="margin-bottom:8px;">飛行前点検11項目を確認し、良否を判定してください。</div>' +
      '<div class="check-list">' + checksHtml + '</div>' +

      '<div class="flex-row" style="margin:8px 0;">' +
        '<button type="button" class="btn btn-secondary btn-sm" onclick="setAllChecks(\'pre\', ' + PRE_NAMES.length + ', true)">全て正常（ワンタップ）</button>' +
        '<button type="button" class="btn btn-secondary btn-sm" onclick="setAllChecks(\'pre\', ' + PRE_NAMES.length + ', false)">全て解除</button>' +
      '</div>' +

      '<div id="preAbnormalBox" style="display:none;" class="warn-box">' +
        '<strong>⚠ 異常箇所の特記事項</strong>' +
        '<div class="text-sm">異常がある場合、航空法および教則に基づき飛行を中止し、整備を行う必要があります。</div>' +
        '<textarea id="abnormalDetail" placeholder="異常の内容・部位を具体的に記載してください"></textarea>' +
      '</div>' +

      '<button class="btn btn-primary" onclick="submitPreflight()">飛行前点検を完了して離陸準備へ</button>' +
      '<button class="btn btn-danger btn-sm" style="margin-top:12px;" onclick="cancelSessionPrompt()">この運航入力を中止</button>' +
    '</div>';
}

function setAllChecks(prefix, count, val){
  for(var i=0; i<count; i++){
    var c = el(prefix + i);
    if(c) c.checked = val;
  }
  if(prefix==='pre') onPreCheckChanged();
}

function onPreCheckChanged(){
  var hasAbnormal = false;
  for(var i=0; i<PRE_NAMES.length; i++){
    if(!isChecked('pre' + i)) { hasAbnormal = true; break; }
  }
  var box = el('preAbnormalBox');
  if(box) box.style.display = hasAbnormal ? 'block' : 'none';
}

function submitPreflight(){
  clearFormErrors('preCard');
  var errors = [];

  var hasAbnormal = false;
  var checks = {};
  for(var i=0; i<PRE_NAMES.length; i++){
    var checked = isChecked('pre' + i);
    checks[PRE_NAMES[i]] = checked ? '正常' : '異常';
    if(!checked) hasAbnormal = true;
  }

  if(hasAbnormal && !val('abnormalDetail')){
    errors.push({ id: 'abnormalDetail', label: '不具合・特記事項', message: '点検項目に「異常」があるため、不具合の内容や対応を入力してください。' });
  }

  if(errors.length > 0){
    showFormErrors('preCard', errors);
    return;
  }

  callServer('savePreflight', {
    checks: checks,
    abnormalDetail: val('abnormalDetail')
  });
}

// ----------------------------------------------------
// 3. 飛行開始待機画面（離陸前）
// ----------------------------------------------------
function renderReadyView(div){
  var s = STATE.session;
  var bOptions = STATE.batteries.map(function(b){
    return '<option value="' + b.value + '">' + esc(b.label) + '</option>';
  }).join('');

  div.innerHTML = sessionHeaderHtml() +
    '<div class="card" id="readyCard">' +
      '<h2>飛行開始待機（第' + (s.flightIndex + 1) + '飛行）</h2>' +
      '<div class="status-box">飛行前点検完了：適合（安全飛行可能）</div>' +

      '<label>使用バッテリー選択<span class="required">*</span></label>' +
      '<select id="flightBattery">' + bOptions + '</select>' +

      '<div class="flex-between">' +
        '<label>離陸場所<span class="required">*</span></label>' +
        '<button type="button" class="btn-outline" onclick="fetchCurrentGps(\'takeoffLocation\', null)">📍 GPSで現在地更新</button>' +
      '</div>' +
      '<input type="text" id="takeoffLocation" value="' + esc(s.route) + '">' +

      '<button class="btn btn-success" style="font-size:18px;padding:14px;margin-top:14px;" onclick="submitStartFlight()">🛫 離陸を記録（フライト開始）</button>' +
      '<div class="flex-row" style="margin-top:10px;">' +
        '<button type="button" class="btn btn-secondary btn-sm" onclick="onSwitchAircraftClick(\'' + esc(s.model === 'EVO Lite' ? 'EVO Lite+' : 'EVO Lite') + '\')">🔄 機体を交代する（' + esc(s.model === 'EVO Lite' ? 'EVO Lite+' : 'EVO Lite') + 'へ）</button>' +
        '<button type="button" class="btn btn-secondary btn-sm" onclick="callServer(\'startPostflight\')">🏁 飛行せず終了（飛行後点検へ）</button>' +
      '</div>' +
      '<button class="btn btn-danger btn-sm" style="margin-top:14px;" onclick="cancelSessionPrompt()">この運航入力を中止</button>' +
    '</div>';
}

function submitStartFlight(){
  clearFormErrors('readyCard');
  var errors = [];

  var battery = val('flightBattery');
  if(!battery) errors.push({ id: 'flightBattery', label: '使用バッテリー', message: 'バッテリーを選択してください。' });

  var takeoffLocation = val('takeoffLocation');
  if(!takeoffLocation) errors.push({ id: 'takeoffLocation', label: '離陸場所', message: '離陸場所を入力してください。' });

  if(errors.length > 0){
    showFormErrors('readyCard', errors);
    return;
  }

  callServer('startFlight', {
    battery: battery,
    takeoffLocation: takeoffLocation
  });
}

// ----------------------------------------------------
// 4. 飛行中・着陸記録画面（ストップウォッチ連動）
// ----------------------------------------------------
function renderFlyingView(div){
  var s = STATE.session;
  var startTime = new Date(s.startedAt);
  var elapsedMinutes = Math.max(1, Math.round((new Date() - startTime) / 60000));

  var tagChips = SAFETY_TAGS.map(function(t){
    return '<span class="tag-chip" onclick="addSafetyTag(\'' + esc(t) + '\')">＋ ' + esc(t) + '</span>';
  }).join('');

  div.innerHTML = sessionHeaderHtml() +
    '<div class="card" id="flyingCard">' +
      '<h2>飛行中・着陸記録（第' + (s.flightIndex + 1) + '飛行）</h2>' +
      '<div class="status-box" style="background:#f0fff4;color:#22543d;border-left-color:#38a169;line-height:1.6;">' +
        '使用中バッテリー：<strong>BAT_' + s.currentBattery + '</strong> ｜ 離陸時刻：<strong>' + formatTimeStr(s.startedAt) + '</strong><br>' +
        '<span class="text-sm" style="color:#276749;">🛡 飛行中はプロポ操作に専念してください。着陸後にプロペラが停止してから記録を行ってください。</span>' +
      '</div>' +

      '<div class="flex-between">' +
        '<label>着陸場所<span class="required">*</span></label>' +
        '<button type="button" class="btn-outline" onclick="fetchCurrentGps(\'landingLocation\', null)">📍 GPSで現在地取得</button>' +
      '</div>' +
      '<input type="text" id="landingLocation" value="' + esc(s.route) + '">' +

      '<label>実飛行時間（分）<span class="required">*</span></label>' +
      '<div class="text-sm" style="color:#64748b;margin-bottom:4px;">送信機（Autel Explorer）アプリに表示された飛行時間を入力してください。</div>' +
      '<input type="number" id="actualMinutes" value="' + elapsedMinutes + '" min="1" style="font-size:18px;font-weight:700;">' +

      '<label class="check-item" style="margin:12px 0 6px;">' +
        '<input type="checkbox" id="safetyIssue" onchange="onSafetyChanged()">' +
        '<span>飛行の安全に影響のあった事項あり</span>' +
      '</label>' +

      '<div id="safetyDetailBox" style="display:none;">' +
        '<label>クイックタグ選択（ワンタップ挿入）：</label>' +
        '<div class="tags-container">' + tagChips + '</div>' +
        '<textarea id="safetyDetail" placeholder="タグを選択または事象を記載してください"></textarea>' +
      '</div>' +

      '<div class="grid-2" style="margin-top:10px;background:#f8fafc;padding:10px;border-radius:6px;">' +
        '<div>' +
          '<label style="color:#64748b;font-size:12px;">使用後サイクル数（任意・空欄可）</label>' +
          '<input type="number" id="cycle" placeholder="未入力でOK">' +
        '</div>' +
        '<div>' +
          '<label style="color:#64748b;font-size:12px;">バッテリー異常・所感（任意・空欄可）</label>' +
          '<input type="text" id="batteryNote" placeholder="未入力でOK">' +
        '</div>' +
      '</div>' +

      '<button class="btn btn-warning" style="font-size:18px;padding:14px;margin-top:14px;" onclick="submitLandFlight()">🛬 着陸を記録する</button>' +
    '</div>';
}

function updateTimerDisplay(startTime){
  var now = new Date();
  var diffSec = Math.max(0, Math.floor((now - startTime) / 1000));
  var m = Math.floor(diffSec / 60);
  var s = diffSec % 60;
  var display = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  var elTimer = el('flightTimerDisplay');
  if(elTimer) elTimer.innerText = display;
  var elMinutes = el('actualMinutes');
  if(elMinutes && (!elMinutes.value || elMinutes.dataset.auto === 'true')){
    var autoMin = Math.max(1, Math.round(diffSec / 60));
    elMinutes.value = autoMin;
    elMinutes.dataset.auto = 'true';
  }
}

function onSafetyChanged(){
  el('safetyDetailBox').style.display = isChecked('safetyIssue') ? 'block' : 'none';
}

function addSafetyTag(tag){
  var ta = el('safetyDetail');
  if(!ta) return;
  var prefix = ta.value ? ta.value.trim() + '、' : '';
  ta.value = prefix + '[' + tag + ']';
}

function submitLandFlight(){
  clearFormErrors('flyingCard');
  var errors = [];

  var landingLocation = val('landingLocation');
  if(!landingLocation) errors.push({ id: 'landingLocation', label: '着陸場所', message: '着陸場所を入力してください。' });

  var actualMinutes = val('actualMinutes');
  var minutesNum = parseInt(actualMinutes, 10);
  if(!actualMinutes || isNaN(minutesNum) || minutesNum < 1){
    errors.push({ id: 'actualMinutes', label: '実飛行時間（分）', message: '実飛行時間（1分以上の数値）を入力してください。' });
  }

  if(isChecked('safetyIssue') && !val('safetyDetail')){
    errors.push({ id: 'safetyDetail', label: '安全影響事項の詳細', message: '安全影響事項「あり」が選択されています。内容を入力してください（タグ選択も可能）。' });
  }

  // ※バッテリーサイクル数および所感は完全任意（未入力チェックなしで素通り）

  if(errors.length > 0){
    showFormErrors('flyingCard', errors);
    return;
  }

  callServer('landFlight', {
    landingLocation: landingLocation,
    actualMinutes: actualMinutes,
    safetyIssue: isChecked('safetyIssue'),
    safetyDetail: val('safetyDetail'),
    cycle: val('cycle'),
    batteryNote: val('batteryNote')
  });
}

// ----------------------------------------------------
// 5. 着陸後選択画面
// ----------------------------------------------------
function renderAfterLandingView(div){
  var s = STATE.session;
  var otherModel = s.model === 'EVO Lite' ? 'EVO Lite+' : 'EVO Lite';
  var acs = s.aircrafts || {};
  var otherAc = acs[otherModel];
  var otherBadge = (otherAc && otherAc.used) ? '（再交代）' : '（本日の交代飛行）';

  div.innerHTML = sessionHeaderHtml() +
    '<div class="card">' +
      '<h2>着陸記録完了（' + esc(s.model) + '）</h2>' +
      '<div class="status-box">' +
        '現在の機体（' + esc(s.model) + '）本日累計：<strong>' + s.totalMinutes + ' 分</strong>（' + (s.flightIndex) + ' 回完了）' +
      '</div>' +
      '<p class="text-sm">次のアクションを選択してください：</p>' +

      '<button class="btn btn-primary" style="font-size:15px;padding:12px;" onclick="callServer(\'continueFlight\')">🔋 バッテリー交換して続ける（' + esc(s.model) + ' で第' + (s.flightIndex + 1) + '飛行へ）</button>' +
      
      '<button class="btn btn-warning" style="margin-top:12px;font-size:15px;padding:12px;background:#e65100;border:none;color:#fff;" onclick="onSwitchAircraftClick(\'' + esc(otherModel) + '\')">🔄 もう1機の機体（' + esc(otherModel) + '）に交代する ' + otherBadge + '</button>' +

      '<button class="btn btn-secondary" style="margin-top:12px;font-size:15px;padding:12px;" onclick="callServer(\'startPostflight\')">🏁 本日の全運航を終了（飛行後点検へ）</button>' +
    '</div>';
}

function onSwitchAircraftClick(targetModel){
  if(confirm('機体を「' + targetModel + '」に交代しますか？\n\n・現在の機体の飛行実績は安全に保存されます。\n・交代先が未点検の場合は飛行前点検が開きます。')){
    callServer('switchAircraft', { targetModel: targetModel });
  }
}

// ----------------------------------------------------
// 6. 飛行後点検画面（様式2：本日使った全機体をスマートに完了）
// ----------------------------------------------------
function renderPostView(div){
  var appDiv = div || el('app');
  var s = STATE.session;
  var acs = s.aircrafts || {};
  var usedModels = Object.keys(acs).filter(function(m){ return acs[m] && acs[m].used; });
  if(usedModels.length === 0 && s.model) usedModels = [s.model];

  var aircraftCardsHtml = usedModels.map(function(model, mIdx){
    var ac = acs[model] || {};
    var prefix = 'post_' + mIdx + '_';
    var checksHtml = POST_NAMES.map(function(name, i){
      return '<label class="check-item"><input type="checkbox" id="' + prefix + i + '" checked onchange="onAnyPostCheckChanged()"><span>' + esc(name) + '</span></label>';
    }).join('');

    var blockLabel = ac.blockNo ? '（No.' + ac.blockNo + '枠）' : '';
    var flightsLabel = (ac.flightCount || s.flightIndex || 0) + '回飛行 / ' + (ac.totalMinutes || s.totalMinutes || 0) + '分';

    return '<div class="card" style="margin-bottom:14px; border-left:5px solid #1976d2;">' +
      '<div class="flex-between">' +
        '<h3 style="margin:0;font-size:16px;color:#1e3a8a;">🚁 機体：' + esc(model) + ' ' + blockLabel + '</h3>' +
        '<span class="badge active">' + flightsLabel + '</span>' +
      '</div>' +
      '<div class="text-sm" style="margin:6px 0 8px; color:var(--muted);">飛行後の機体・プロペラ・発熱状況を確認してください。</div>' +
      '<div class="check-list">' + checksHtml + '</div>' +
      '<div class="flex-row" style="margin:8px 0;">' +
        '<button type="button" class="btn btn-secondary btn-sm" onclick="setPostChecksForModel(' + mIdx + ', true)">この機体を全て正常</button>' +
        '<button type="button" class="btn btn-secondary btn-sm" onclick="setPostChecksForModel(' + mIdx + ', false)">解除</button>' +
      '</div>' +
      '<div id="' + prefix + 'abnormalBox" style="display:none;" class="warn-box">' +
        '<strong>不具合・事象の記録（' + esc(model) + '）</strong>' +
        '<label>不具合箇所</label><input type="text" id="' + prefix + 'defectLocation" placeholder="プロペラ後縁、モーター基部等">' +
        '<label>事象等の内容<span class="required">*</span></label><textarea id="' + prefix + 'defectDetail"></textarea>' +
        '<label>処置内容</label><textarea id="' + prefix + 'actionDetail" placeholder="清掃、部品交換予定、飛行停止等"></textarea>' +
      '</div>' +
    '</div>';
  }).join('');

  appDiv.innerHTML = sessionHeaderHtml() +
    '<div class="card" id="postMainCard">' +
      '<h2>本日の飛行後点検（様式2）</h2>' +
      '<p class="text-sm">本日飛行させた機体の点検を行い、本日の運航日誌を確定します。</p>' +
      
      '<div style="margin-bottom:14px;">' +
        '<button type="button" class="btn btn-success" style="font-size:15px;padding:12px;width:100%;font-weight:700;" onclick="setAllPostChecksAllModels(true)">✨ 本日使用した全機体「全て正常」（ワンタップ）</button>' +
      '</div>' +

      aircraftCardsHtml +

      '<div class="card" style="background:#f8fafc;margin-top:14px;border:1px solid #cbd5e1;">' +
        '<label>点検実施場所<span class="required">*</span></label>' +
        '<input type="text" id="postLocation" value="' + esc(s.inspectionLocation || s.route) + '">' +
        '<label>点検確認者氏名（機長）<span class="required">*</span></label>' +
        '<input type="text" id="confirmer" value="' + esc(s.pilot ? s.pilot.split('（')[0].trim() : '吉田 公一') + '">' +
      '</div>' +

      '<button class="btn btn-primary" style="font-size:16px;padding:14px;margin-top:14px;" onclick="submitAllPostflight()">✅ 飛行後点検を保存し、本日の運航日誌を確定する</button>' +
    '</div>';
}

function setPostChecksForModel(mIdx, normal){
  for(var i=0; i<POST_NAMES.length; i++){
    var c = el('post_' + mIdx + '_' + i);
    if(c) c.checked = normal;
  }
  onAnyPostCheckChanged();
}

function setAllPostChecksAllModels(normal){
  var s = STATE.session || {};
  var acs = s.aircrafts || {};
  var count = Object.keys(acs).length || 2;
  for(var m=0; m<count; m++){
    setPostChecksForModel(m, normal);
  }
}

function onAnyPostCheckChanged(){
  var s = STATE.session || {};
  var acs = s.aircrafts || {};
  var count = Object.keys(acs).length || 2;
  for(var m=0; m<count; m++){
    var prefix = 'post_' + m + '_';
    var hasAb = false;
    for(var i=0; i<POST_NAMES.length; i++){
      if(!isChecked(prefix + i)){ hasAb = true; break; }
    }
    var box = el(prefix + 'abnormalBox');
    if(box) box.style.display = hasAb ? 'block' : 'none';
  }
}

function submitAllPostflight(){
  clearFormErrors('postMainCard');
  var errors = [];
  var postLocation = val('postLocation');
  if(!postLocation) errors.push({ id: 'postLocation', label: '点検実施場所', message: '点検実施場所を入力してください。' });
  var confirmer = val('confirmer');
  if(!confirmer) errors.push({ id: 'confirmer', label: '確認者氏名', message: '点検確認者氏名を入力してください。' });

  var s = STATE.session;
  var acs = s.aircrafts || {};
  var usedModels = Object.keys(acs).filter(function(m){ return acs[m] && acs[m].used; });
  if(usedModels.length === 0 && s.model) usedModels = [s.model];

  var aircraftPayload = {};
  var anyAbnormal = false;

  usedModels.forEach(function(model, mIdx){
    var prefix = 'post_' + mIdx + '_';
    var checks = {};
    var hasAbnormal = false;
    for(var i=0; i<POST_NAMES.length; i++){
      var chk = isChecked(prefix + i);
      checks[POST_NAMES[i]] = chk ? '正常' : '異常';
      if(!chk) hasAbnormal = true;
    }
    var defectLoc = val(prefix + 'defectLocation');
    var defectDet = val(prefix + 'defectDetail');
    var actionDet = val(prefix + 'actionDetail');

    if(hasAbnormal){
      anyAbnormal = true;
      if(!defectDet) errors.push({ id: prefix + 'defectDetail', label: model + 'の事象内容', message: model + 'の異常内容を入力してください。' });
    }

    aircraftPayload[model] = {
      checks: checks,
      abnormal: hasAbnormal,
      defectLocation: defectLoc,
      defectDetail: defectDet,
      actionDetail: actionDet
    };
  });

  if(errors.length > 0){
    showFormErrors('postMainCard', errors);
    return;
  }

  callServer('finishAircraft', {
    inspectionLocation: postLocation,
    confirmer: confirmer,
    aircrafts: aircraftPayload,
    checks: aircraftPayload[s.model] ? aircraftPayload[s.model].checks : {}
  }, function(res){
    STATE = res;
    switchTab('pdf');
  });
}

function cancelSessionPrompt(){
  if(confirm('現在の運航入力を取り消しますか？\n（入力中の内容は保存されません）')){
    callServer('cancelCurrentSession');
  }
}

// ----------------------------------------------------
// 7. 様式3：点検整備記録タブ
// ----------------------------------------------------
function renderMaintenanceView(div){
  var typesHtml = MAINTENANCE_TYPES.map(function(t){
    return '<option value="' + esc(t) + '">' + esc(t) + '</option>';
  }).join('');

  div.innerHTML =
    '<div class="card" id="maintCard">' +
      '<h2>点検整備記録（様式3）</h2>' +
      '<div class="text-sm" style="margin-bottom:10px;">' +
        '定期点検、プロペラ交換、修理、改造、ファームウェア更新等の記録です。<br>' +
        '<strong>※総飛行時間は現在の累計値が自動で記録されます。</strong>' +
      '</div>' +

      '<label>機体型式<span class="required">*</span></label>' +
      '<select id="mModel">' +
        '<option value="EVO Lite">EVO Lite（JU3268805C02）</option>' +
        '<option value="EVO Lite+">EVO Lite+（JU3269B165D2）</option>' +
      '</select>' +

      '<label>実施年月日<span class="required">*</span></label>' +
      '<input type="date" id="mDate" value="' + getTodayYmd() + '">' +

      '<label>作業区分<span class="required">*</span></label>' +
      '<select id="mType">' + typesHtml + '</select>' +

      '<label>実施理由<span class="required">*</span></label>' +
      '<input type="text" id="mReason" placeholder="例：飛行後点検でのキズ発見、定期点検時期到来、メーカ更新">' +

      '<label>作業内容・詳細<span class="required">*</span></label>' +
      '<textarea id="mDetail" placeholder="例：右前プロペラを新品（予備パーツA）に交換し、回転確認を実施"></textarea>' +

      '<label>交換部品名</label>' +
      '<input type="text" id="mParts" placeholder="例：純正プロペラ（フロントCW）1枚">' +

      '<label>点検等実施場所<span class="required">*</span></label>' +
      '<input type="text" id="mLocation" placeholder="例：自宅作業室、現地整備スペース" value="自宅作業室">' +

      '<label>実施者氏名<span class="required">*</span></label>' +
      '<input type="text" id="mPilot" value="吉田 公一">' +

      '<label>確認結果（合否判定）</label>' +
      '<select id="mResult">' +
        '<option value="適合（異常なし）">適合（異常なし）</option>' +
        '<option value="条件付き適合">条件付き適合</option>' +
        '<option value="不適合（要再整備）">不適合（要再整備）</option>' +
      '</select>' +

      '<label>次回予定・備考</label>' +
      '<input type="text" id="mNote" placeholder="例：次回50時間点検、次回フライト時振動注意">' +

      '<button class="btn btn-primary" onclick="submitMaintenance()">点検整備記録を保存する</button>' +
    '</div>';
}

function submitMaintenance(){
  clearFormErrors('maintCard');
  var errors = [];

  if(!val('mModel')) errors.push({ id: 'mModel', label: '機体型式', message: '機体を選択してください。' });
  if(!val('mDate')) errors.push({ id: 'mDate', label: '実施年月日', message: '実施年月日を選択してください。' });
  if(!val('mType')) errors.push({ id: 'mType', label: '作業区分', message: '作業区分を選択してください。' });
  if(!val('mReason')) errors.push({ id: 'mReason', label: '実施理由', message: '実施理由を入力してください。' });
  if(!val('mDetail')) errors.push({ id: 'mDetail', label: '作業内容・詳細', message: '作業内容の詳細を入力してください。' });
  if(!val('mLocation')) errors.push({ id: 'mLocation', label: '点検等実施場所', message: '実施場所を入力してください。' });
  if(!val('mPilot')) errors.push({ id: 'mPilot', label: '実施者氏名', message: '実施者氏名を入力してください。' });

  if(errors.length > 0){
    showFormErrors('maintCard', errors);
    return;
  }

  var payload = {
    model: val('mModel'),
    date: val('mDate'),
    type: val('mType'),
    reason: val('mReason'),
    detail: val('mDetail'),
    parts: val('mParts'),
    location: val('mLocation'),
    pilot: val('mPilot'),
    result: val('mResult'),
    note: val('mNote')
  };
  callServer('addMaintenanceRecord', payload, function(res){
    alert('点検整備記録（様式3）を保存しました。\n（記録時点の総飛行時間：' + res.totalLabel + '）');
    switchTab('flight');
  });
}

// ----------------------------------------------------
// 8. PDF出力・過去日誌検索タブ
// ----------------------------------------------------
function renderPdfView(div){
  var today = STATE ? STATE.today : '';
  div.innerHTML =
    '<div class="card">' +
      '<h2>飛行日誌 PDF即時出力・携行</h2>' +
      '<div class="text-sm" style="margin-bottom:12px;">' +
        '航空法により特定飛行を行う際は飛行日誌の携行・提示が義務付けられています。<br>' +
        '山間部など<strong>電波の届かない現場に備え、あらかじめPDFを端末にダウンロード</strong>しておくことが推奨されます。' +
      '</div>' +

      '<div class="status-box">' +
        '本日（' + esc(today) + '）の飛行日誌：<br>' +
        '<button class="btn btn-success btn-sm" style="margin-top:6px;" onclick="openTodayPdf()">📄 本日の日誌PDFを即時表示・保存</button> ' +
        (STATE && STATE.todaySheetUrl ? '<a href="' + STATE.todaySheetUrl + '" target="_blank" class="btn btn-secondary btn-sm" style="margin-top:6px;text-decoration:none;">📊 スプレッドシートで直接開く</a>' : '') +
      '</div>' +

      '<h3 style="font-size:15px;margin:16px 0 6px;">過去の飛行日誌を検索・出力</h3>' +
      '<div class="flex-row">' +
        '<input type="text" id="searchLogQuery" placeholder="例：2026.9 または 日付" value="' + esc(today) + '">' +
        '<button class="btn btn-primary btn-sm" onclick="doSearchLogs()">検索</button>' +
      '</div>' +

      '<div id="logSearchResults" style="margin-top:12px;"></div>' +

      '<div style="margin-top:20px;border-top:1px solid #edf2f7;padding-top:12px;">' +
        '<a href="' + (STATE ? STATE.spreadsheetUrl : '#') + '" target="_blank" class="text-sm" style="color:var(--primary);text-decoration:none;">' +
          '➡ スプレッドシート本体（原本）を開く' +
        '</a>' +
      '</div>' +
    '</div>';

  doSearchLogs();
}

function openTodayPdf(){
  callServer('getPdfUrl', null, function(res){
    window.open(res.pdfUrl, '_blank');
  });
}

function doSearchLogs(){
  var q = val('searchLogQuery');
  callServer('searchFlightLogs', q, function(list){
    var target = el('logSearchResults');
    if(!list || !list.length){
      target.innerHTML = '<div class="text-sm" style="color:var(--muted);padding:8px 0;">該当する日付シートがありません。</div>';
      return;
    }
    var h = '<div class="check-list">';
    list.forEach(function(item){
      h += '<div class="check-item flex-row" style="justify-content:space-between;">' +
        '<div><strong>' + esc(item.date) + '</strong> の飛行日誌</div>' +
        '<div>' +
          '<button class="btn btn-success btn-sm" onclick="openDatePdf(\'' + esc(item.date) + '\')">PDF</button> ' +
          '<a href="' + item.sheetUrl + '" target="_blank" class="btn btn-secondary btn-sm" style="text-decoration:none;">シート</a>' +
        '</div>' +
      '</div>';
    });
    h += '</div>';
    target.innerHTML = h;
  });
}

function openDatePdf(d){
  callServer('getPdfUrl', d, function(res){
    window.open(res.pdfUrl, '_blank');
  });
}

// ----------------------------------------------------
// 補助関数
// ----------------------------------------------------
function formatTimeStr(iso){
  if(!iso) return '';
  var d = new Date(iso);
  var h = ('0' + d.getHours()).slice(-2);
  var m = ('0' + d.getMinutes()).slice(-2);
  return h + ':' + m;
}

function getTodayYmd(){
  var d = new Date();
  var y = d.getFullYear();
  var m = ('0' + (d.getMonth() + 1)).slice(-2);
  var day = ('0' + d.getDate()).slice(-2);
  return y + '-' + m + '-' + day;
}

// 初回起動
render();
</script>
</body>
</html>`;
