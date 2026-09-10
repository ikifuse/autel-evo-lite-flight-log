// GAS実行基盤: サービス接続・時刻・hash・Script Lock・障害注入。業務判断を持たない。

function spreadsheet_() { return SpreadsheetApp.openById(SPREADSHEET_ID); }

function now_() { return new Date(); }

function format_(value, pattern) { return Utilities.formatDate(new Date(value), TZ, pattern); }

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

function sha256Text_(text) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(digest);
}

function commitFault_(point) {
  if (typeof COMMIT_FAULT_INJECTOR === 'function') COMMIT_FAULT_INJECTOR(point);
}

function commitLog_(msg) {
  if (typeof Logger !== 'undefined' && typeof Logger.log === 'function') {
    Logger.log(msg);
  }
}

let LOCK_DEPTH = 0;

let COMMIT_FAULT_INJECTOR = null;
