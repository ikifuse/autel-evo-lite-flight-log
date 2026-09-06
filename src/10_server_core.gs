// ============================================================================
// 2. サーバー側ロジック（全運航終了時のスプレッドシート一括書き込み）
// ============================================================================
function doGet() {
  const initialState = JSON.stringify(getAppState())
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return HtmlService.createHtmlOutput(
    APP_HTML
      .replace('__INITIAL_STATE__', initialState)
      .replace('__APP_VERSION__', APP_VERSION)
      .replace(/__APP_ICON__/g, APP_ICON_URL)
  )
    .setTitle('ドローン運航記録')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}

function spreadsheet_() { return SpreadsheetApp.openById(SPREADSHEET_ID); }

function now_() { return new Date(); }

function format_(value, pattern) { return Utilities.formatDate(new Date(value), TZ, pattern); }

function dateFromSheetName_(sheetName, allowTestPrefix) {
  const pattern = allowTestPrefix
    ? /^(?:TEST_)?(\d{4})\.(\d{1,2})\.(\d{1,2})(?:_\d+)?$/
    : /^(\d{4})\.(\d{1,2})\.(\d{1,2})(?:_\d+)?$/;
  const match = String(sheetName || '').match(pattern);
  if (!match) throw new Error('日付シート名を日付へ変換できません：' + sheetName);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < SECURITY_OPERATION_YEAR_MIN || year > SECURITY_OPERATION_YEAR_MAX || month < 1 || month > 12) {
    throw new Error('運航日を確認してください。');
  }
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error('運航日を確認してください。');
  }
  return date;
}

function locked_(work) {
  if (LOCK_DEPTH > 0) return work();
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (error) {
    throw new Error('別の保存処理を実行中です。20秒ほど待ってから、同じ運航記録をもう一度保存してください。');
  }
  LOCK_DEPTH++;
  try {
    return work();
  } finally {
    try { SpreadsheetApp.flush(); } finally { LOCK_DEPTH--; lock.releaseLock(); }
  }
}

function getAppState() {
  const today = format_(now_(), 'yyyy.M.d');
  const ss = spreadsheet_();
  const todaySheet = ss.getSheetByName(today);
  const totalLite = aircraftTotalMinutes_('EVO Lite');
  const totalLitePlus = aircraftTotalMinutes_('EVO Lite+');

  return {
    active: false,
    today: today,
    hasTodaySheet: !!todaySheet,
    batteries: Array.from({ length: 7 }, (_, index) => ({ value: index + 1, label: 'BAT_' + (index + 1) })),
    totals: {
      'EVO Lite': { minutes: totalLite, label: minutesLabel_(totalLite) },
      'EVO Lite+': { minutes: totalLitePlus, label: minutesLabel_(totalLitePlus) }
    },
    session: null
  };
}

