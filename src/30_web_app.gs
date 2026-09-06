// ============================================================================
// 3. 画面構造（HTML）＆ モバイルデザインスタイル（CSS）
// ============================================================================
const APP_HTML = String.raw`<!doctype html>
<html lang="ja">
<head>
  <base target="_top">
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="theme-color" content="#1976d2">
  <link rel="icon" type="image/png" href="__APP_ICON__">
  <link rel="apple-touch-icon" href="__APP_ICON__">
  <link rel="manifest" href="data:application/manifest+json;utf-8,%7B%22name%22%3A%22%E3%83%89%E3%83%AD%E3%83%BC%E3%83%B3%E9%81%8B%E8%88%AA%E8%A8%98%E9%8C%B2%22%2C%22short_name%22%3A%22%E9%81%8B%E8%88%AA%E8%A8%98%E9%8C%B2%22%2C%22start_url%22%3A%22.%22%2C%22display%22%3A%22standalone%22%2C%22background_color%22%3A%22%23f4f6f9%22%2C%22theme_color%22%3A%22%231976d2%22%2C%22icons%22%3A%5B%7B%22src%22%3A%22__APP_ICON__%22%2C%22sizes%22%3A%22192x192%22%2C%22type%22%3A%22image%2Fpng%22%7D%5D%7D">
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
    .global-back-btn {
      position: sticky;
      top: 8px;
      z-index: 20;
      width: 100%;
      margin: 0 0 10px;
      padding: 10px 12px;
      border: 1px solid #94a3b8;
      border-radius: 8px;
      background: #fff;
      color: #334155;
      font-size: 14px;
      font-weight: 700;
      text-align: left;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.12);
    }
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
      flex: 0 0 auto;
    }
    .check-item-detailed {
      align-items: flex-start;
    }
    .check-item-detailed input {
      margin-top: 2px;
    }
    .check-copy {
      display: grid;
      grid-template-columns: minmax(120px, 165px) minmax(0, 1fr);
      gap: 8px;
      width: 100%;
      line-height: 1.45;
    }
    .check-label {
      font-weight: 700;
      color: #1f2937;
    }
    .check-detail {
      font-weight: 400;
      color: #475569;
    }
    @media (max-width: 520px) {
      .check-copy {
        grid-template-columns: 1fr;
        gap: 1px;
      }
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
    .favorite-list {
      display: grid;
      gap: 8px;
      padding: 6px 0 8px;
    }
    .favorite-item {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 9px;
    }
    .favorite-name {
      color: #334155;
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 7px;
      overflow-wrap: anywhere;
    }
    .favorite-actions {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
    }
    .favorite-action-btn {
      border: 1px solid #94a3b8;
      border-radius: 7px;
      min-height: 42px;
      padding: 7px 4px;
      margin: 0;
      width: 100%;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      touch-action: manipulation;
    }
    .favorite-use-btn { background: #eff6ff; border-color: #60a5fa; color: #1d4ed8; }
    .favorite-rename-btn { background: #fff; color: #475569; }
    .favorite-delete-btn { background: #fff1f2; border-color: #fda4af; color: #be123c; }
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
    /* 気象チップ・通信状態表示 */
    .network-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 700;
      border-radius: 12px;
    }
    .network-badge.online { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
    .network-badge.offline { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
    .chip-group {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 6px 0 10px;
    }
    .chip-btn {
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      border-radius: 16px;
      background: #f1f5f9;
      color: #334155;
      border: 1px solid #cbd5e1;
      cursor: pointer;
      transition: all 0.15s ease;
      user-select: none;
    }
    .chip-btn:hover { background: #e2e8f0; }
    .chip-btn.active {
      background: #2563eb;
      color: #ffffff;
      border-color: #1d4ed8;
      box-shadow: 0 1px 3px rgba(37,99,235,0.3);
    }
    .chip-btn.danger.active {
      background: #dc2626;
      color: #ffffff;
      border-color: #b91c1c;
    }
    .chip-btn.warning.active {
      background: #ea580c;
      color: #ffffff;
      border-color: #c2410c;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <div>
        <div style="display:flex;align-items:center;gap:8px;">
          <h1 style="margin:0;">ドローン運航記録</h1>
          <span id="networkBadge" class="network-badge online">● オンライン</span>
        </div>
        <div class="text-sm">EVO Lite / Lite+ 現場運用版 v__APP_VERSION__</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <span id="appStatusBadge" class="badge">確認中</span>
      </div>
    </header>
    <button type="button" id="globalBackButton" class="global-back-btn" onclick="goBackFromAnywhere()">← 一つ前の画面に戻る</button>

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

var PRE_NAMES = ['機体全般','プロペラ・フレーム','通信系統','推進系統','電源系統','自動制御系統','バッテリー','操縦装置','灯火','カメラ','リモートID'];
var POST_NAMES = ['機体全般','プロペラ・フレーム','発熱','その他'];
var PRE_CHECK_DETAILS = {
  '機体全般': { label: '機体全般', detail: '取付状態、ネジの緩み・脱落、登録記号の表示状態' },
  'プロペラ・フレーム': { label: 'プロペラ・フレーム', detail: '損傷、亀裂、ゆがみがないこと' },
  '通信系統': { label: '通信系統', detail: '機体とプロポの通信状態が正常であること' },
  '推進系統': { label: '推進系統', detail: 'モーターの作動、異音などに異常がないこと' },
  '電源系統': { label: '電源系統', detail: '機体側の電源系統が正常で、Autel Skyに電源警告がないこと' },
  '自動制御系統': { label: '自動制御系統', detail: 'GPS／GNSS測位、ホームポイント、障害物回避、コンパス' },
  'バッテリー': { label: 'バッテリー', detail: '選択したBAT番号、確実な装着・ロック、残量・温度・警告表示、プロポ残量' },
  '操縦装置': { label: '操縦装置（プロポ）', detail: '外観、スティック、スイッチ、表示、Mode 2、手動操作介入' },
  '灯火': { label: '灯火', detail: '点灯・表示が正常であること' },
  'カメラ': { label: 'カメラ', detail: '映像表示・作動が正常であること' },
  'リモートID': { label: 'リモートID', detail: '登録情報が設定され、送信機能が正常に作動していること' }
};
var POST_CHECK_DETAILS = {
  '機体全般': { label: '機体全般', detail: 'ゴミ・汚れ等の付着、各機器の取付状態' },
  'プロペラ・フレーム': { label: 'プロペラ・フレーム', detail: '損傷、亀裂、ゆがみがないこと' },
  '発熱': { label: '発熱', detail: '機体本体・バッテリー・モーターに異常な発熱がないこと' },
  'その他': { label: 'その他', detail: '飛行後に認めた異常・不具合がないこと' }
};
var PURPOSE_NAMES = ['空撮','報道取材','警備','農林水産業','測量','環境調査','設備メンテナンス','インフラ点検・保守','資材管理','輸送・宅配','自然観測','事故・災害対応等','趣味','研究開発','その他','操縦練習','整備後確認飛行','修理後確認飛行'];
var METHOD_NAMES = ['通常飛行（特定飛行なし）','屋内練習','空港等周辺','150m以上','DID','夜間','目視外','30m未満','催し場所上空','危険物輸送','物件投下'];
var SPECIAL_METHODS = ['空港等周辺','150m以上','DID','夜間','目視外','30m未満','催し場所上空','危険物輸送','物件投下'];
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

// ----------------------------------------------------
// 気象情報（天候・風速・風向）ワンタップ選択ロジック
// ----------------------------------------------------
function selectWeather(btn, val){
  var parent = el('weatherChips');
  if(parent){
    var btns = parent.getElementsByClassName('chip-btn');
    for(var i=0; i<btns.length; i++) btns[i].classList.remove('active');
  }
  btn.classList.add('active');
  if(el('weatherVal')) el('weatherVal').value = val;
}

function selectWindSpeed(btn, val){
  var parent = el('windSpeedChips');
  if(parent){
    var btns = parent.getElementsByClassName('chip-btn');
    for(var i=0; i<btns.length; i++) btns[i].classList.remove('active');
  }
  btn.classList.add('active');
  if(el('windSpeedVal')) el('windSpeedVal').value = val;
}

function selectWindDir(btn, val){
  var parent = el('windDirChips');
  if(parent){
    var btns = parent.getElementsByClassName('chip-btn');
    for(var i=0; i<btns.length; i++) btns[i].classList.remove('active');
  }
  btn.classList.add('active');
  if(el('windDirVal')) el('windDirVal').value = val;
}

var ACTIVE_OPERATION_DRAFT_KEY = 'EVO_LITE_ACTIVE_OPERATION_V2';
var LOCAL_FLIGHT_ACTIONS = [
  'startAircraft','savePreflight','confirmBatteryChange','startFlight','completeLanding','landFlight','continueFlight',
  'switchAircraft','startPostflight','goBack','cancelCurrentSession'
];

function cloneData(data){ return JSON.parse(JSON.stringify(data)); }

function createOperationDraftId(){
  if(window.crypto && typeof window.crypto.randomUUID === 'function'){
    return 'op_' + window.crypto.randomUUID();
  }
  if(window.crypto && typeof window.crypto.getRandomValues === 'function'){
    var bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    var hex = Array.prototype.map.call(bytes, function(value){ return value.toString(16).padStart(2, '0'); }).join('');
    return 'op_' + hex.slice(0,8) + '-' + hex.slice(8,12) + '-' + hex.slice(12,16) + '-' + hex.slice(16,20) + '-' + hex.slice(20);
  }
  throw new Error('安全な運航下書きIDを生成できません。ブラウザを更新してください。');
}

function persistOperationDraft(){
  try{
    if(STATE && STATE.active && STATE.session){
      localStorage.setItem(ACTIVE_OPERATION_DRAFT_KEY, JSON.stringify(STATE.session));
    }else{
      localStorage.removeItem(ACTIVE_OPERATION_DRAFT_KEY);
    }
  }catch(e){}
}

function restoreOperationDraft(){
  try{
    var raw = localStorage.getItem(ACTIVE_OPERATION_DRAFT_KEY);
    if(!raw) return;
    var session = JSON.parse(raw);
    if(session && session.phase){
      // v2026.09.05.2 より前の途中データも、その場で捨てずに再開できるよう補完する。
      // 旧 READY 画面では使用 BAT が pendingFlightInput に入っていたため、
      // 新しい「飛行前点検時に BAT を確定する」項目へ引き継ぐ。
      if(!session.selectedBattery && session.pendingFlightInput && session.pendingFlightInput.battery){
        session.selectedBattery = Number(session.pendingFlightInput.battery) || 0;
      }
      if(typeof session.selectedBatteryCycle === 'undefined'){
        session.selectedBatteryCycle = session.pendingFlightInput && session.pendingFlightInput.cycle
          ? session.pendingFlightInput.cycle : '';
      }
      // BAT を特定できない旧 READY データは、入力を失わず飛行前点検へ戻して選び直す。
      if(session.phase === 'READY' && !session.selectedBattery){
        session.phase = 'PRE';
      }
      STATE.active = true;
      STATE.session = session;
      persistOperationDraft();
    }
  }catch(e){}
}

function clearOperationDraft(){
  try{ localStorage.removeItem(ACTIVE_OPERATION_DRAFT_KEY); }catch(e){}
}

function updateNetworkStatus(){
  var online = navigator.onLine;
  var badge = el('networkBadge');
  if(!badge) return;
  badge.className = 'network-badge ' + (online ? 'online' : 'offline');
  badge.innerText = online ? '● オンライン' : '● 圏外（入力は端末に保持）';
}

window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);

function pushDraftHistory(session){
  var history = Array.isArray(session.navigationHistory) ? session.navigationHistory.slice() : [];
  var snapshot = cloneData(session);
  delete snapshot.navigationHistory;
  history.push(snapshot);
  session.navigationHistory = history;
}

function localFlightAction(name, payload, onSuccess){
  payload = payload || {};
  var session = STATE && STATE.session;

  if(name === 'startAircraft'){
    var model = payload.model;
    var other = model === 'EVO Lite' ? 'EVO Lite+' : 'EVO Lite';
    var weather = [];
    if(payload.weather) weather.push(payload.weather);
    if(payload.windSpeed) weather.push('風速' + payload.windSpeed + (payload.windDir ? ' ' + payload.windDir : ''));
    else if(payload.windDir) weather.push('風向' + payload.windDir);
    var purpose = payload.purpose === 'その他' ? 'その他：' + payload.purposeOther : payload.purpose;
    if(weather.length) purpose += ' [気象: ' + weather.join(' / ') + ']';
    var method = (payload.method || []).join(' / ');
    if(payload.permitNo) method += ' [許可承認: ' + payload.permitNo + ']';
    var aircrafts = {};
    aircrafts[model] = { model:model, used:true, preflightDone:false, flightCount:0, totalMinutes:0, preflightChecks:null };
    aircrafts[other] = { model:other, used:false, preflightDone:false, flightCount:0, totalMinutes:0, preflightChecks:null };
    session = {
      draftId:createOperationDraftId(), operationDate:STATE.today, dateSheet:STATE.today,
      forceNewLocation:!!payload.forceNewLocation, currentModel:model, model:model,
      purpose:purpose, route:payload.route, method:method, category:payload.category,
      permitNo:payload.permitNo || '', inspectionLocation:payload.inspectionLocation,
      pilot:payload.pilot, assistant:payload.assistant || '', cert:payload.cert || '',
      phase:'PRE', blockNo:0, flightIndex:0, currentBattery:0, startedAt:'',
      selectedBattery:0, selectedBatteryCycle:'',
      totalMinutes:0, preflightChecks:null, flights:[], navigationHistory:[null], aircrafts:aircrafts
    };
    STATE.active = true;
    STATE.session = session;
  }else if(!session){
    alert('進行中の運航がありません。');
    return;
  }else if(name === 'savePreflight'){
    session.preflightChecks = cloneData(payload.checks || {});
    session.preflightAbnormalDetail = payload.abnormalDetail || '';
    session.selectedBattery = Number(payload.battery);
    session.selectedBatteryCycle = payload.cycle || '';
    session.abnormalPreflight = PRE_NAMES.some(function(item){ return session.preflightChecks[item] !== '正常'; });
    if(session.aircrafts[session.currentModel]){
      session.aircrafts[session.currentModel].preflightChecks = cloneData(session.preflightChecks);
      session.aircrafts[session.currentModel].preflightDone = !session.abnormalPreflight;
    }
    pushDraftHistory(session);
    session.phase = session.abnormalPreflight ? 'PRE_ABNORMAL' : 'READY';
  }else if(name === 'confirmBatteryChange'){
    session.pendingBatteryChangeInput = cloneData(payload);
    pushDraftHistory(session);
    session.selectedBattery = Number(payload.battery);
    session.selectedBatteryCycle = payload.cycle || '';
    session.pendingFlightInput = null;
    session.phase = 'READY';
  }else if(name === 'startFlight'){
    var selectedBattery = Number(payload.battery || session.selectedBattery);
    session.pendingFlightInput = { battery:selectedBattery, takeoffLocation:payload.takeoffLocation };
    pushDraftHistory(session);
    session.pendingBatteryChangeInput = null;
    var ac = session.aircrafts[session.currentModel];
    var takeoffAt = new Date().toISOString();
    ac.flightCount = Number(ac.flightCount || 0) + 1;
    session.flightIndex = ac.flightCount;
    session.currentBattery = selectedBattery;
    session.startedAt = takeoffAt;
    session.flights.push({
      model:session.currentModel, index:session.flightIndex, battery:selectedBattery,
      cycle:session.selectedBatteryCycle || '', takeoffLocation:payload.takeoffLocation, takeoffAt:takeoffAt
    });
    session.phase = 'FLYING';
  }else if(name === 'completeLanding'){
    pushDraftHistory(session);
    var activeFlight = session.flights[session.flights.length - 1];
    if(activeFlight && !activeFlight.landingAt) activeFlight.landingAt = new Date().toISOString();
    session.phase = 'LANDING';
  }else if(name === 'landFlight'){
    session.pendingLandingInput = cloneData(payload);
    pushDraftHistory(session);
    var flight = session.flights[session.flights.length - 1];
    var minutes = Number(payload.actualMinutes) || Math.max(1, Math.round((new Date() - new Date(session.startedAt)) / 60000));
    flight.landingLocation = payload.landingLocation;
    flight.landingAt = flight.landingAt || new Date().toISOString();
    flight.actualMinutes = minutes;
    flight.safetyIssue = !!payload.safetyIssue;
    flight.safetyDetail = payload.safetyDetail || '';
    flight.batteryNote = payload.batteryNote || '';
    session.totalMinutes = Number(session.totalMinutes || 0) + minutes;
    session.aircrafts[session.currentModel].totalMinutes = Number(session.aircrafts[session.currentModel].totalMinutes || 0) + minutes;
    session.currentBattery = 0;
    session.startedAt = '';
    session.phase = 'AFTER_LANDING';
  }else if(name === 'continueFlight'){
    pushDraftHistory(session);
    session.pendingFlightInput = null;
    session.pendingLandingInput = null;
    session.selectedBattery = 0;
    session.selectedBatteryCycle = '';
    session.phase = 'BATTERY_CHANGE';
  }else if(name === 'switchAircraft'){
    pushDraftHistory(session);
    var target = payload.targetModel;
    var targetAc = session.aircrafts[target] || { model:target, used:false, preflightDone:false, flightCount:0, totalMinutes:0, preflightChecks:null };
    targetAc.used = true;
    session.aircrafts[target] = targetAc;
    session.currentModel = target;
    session.model = target;
    session.flightIndex = targetAc.flightCount || 0;
    session.totalMinutes = targetAc.totalMinutes || 0;
    session.preflightChecks = targetAc.preflightChecks || null;
    session.pendingFlightInput = null;
    session.pendingBatteryChangeInput = null;
    session.selectedBattery = 0;
    session.selectedBatteryCycle = '';
    session.phase = targetAc.preflightDone ? 'BATTERY_CHANGE' : 'PRE';
  }else if(name === 'startPostflight'){
    pushDraftHistory(session);
    session.phase = 'POST_ALL';
  }else if(name === 'goBack'){
    var history = Array.isArray(session.navigationHistory) ? session.navigationHistory.slice() : [];
    if(!history.length){ alert('これより前の画面はありません。'); return; }
    var previous = history.pop();
    if(previous){
      previous.preflightChecks = cloneData(session.preflightChecks || previous.preflightChecks || {});
      previous.preflightAbnormalDetail = session.preflightAbnormalDetail || '';
      previous.selectedBattery = session.selectedBattery || previous.selectedBattery || 0;
      previous.selectedBatteryCycle = session.selectedBatteryCycle || '';
      previous.pendingFlightInput = cloneData(session.pendingFlightInput || previous.pendingFlightInput || {});
      previous.pendingBatteryChangeInput = cloneData(session.pendingBatteryChangeInput || previous.pendingBatteryChangeInput || {});
      previous.pendingLandingInput = cloneData(session.pendingLandingInput || previous.pendingLandingInput || {});
      previous.pendingPostflightInput = cloneData(session.pendingPostflightInput || previous.pendingPostflightInput || {});
      previous.navigationHistory = history;
      STATE.session = previous;
    }else{
      STATE.active = false;
      STATE.session = null;
    }
  }else if(name === 'cancelCurrentSession'){
    STATE.active = false;
    STATE.session = null;
  }

  persistOperationDraft();
  if(onSuccess) onSuccess(STATE);
  else render();
}

function callServer(name, arg, onSuccess){
  if(LOCAL_FLIGHT_ACTIONS.indexOf(name) >= 0){
    localFlightAction(name, arg, onSuccess);
    return;
  }

  if(name === 'finishAircraft'){
    if(!navigator.onLine){
      alert('現在は圏外です。入力内容は端末に残っています。電波が戻ってから、もう一度「運航日誌を確定する」を押してください。');
      return;
    }
    STATE.session.pendingPostflightInput = cloneData(arg || {});
    persistOperationDraft();
    arg = { session:cloneData(STATE.session), postflight:arg || {} };
  }

  busy(true);
  var r = google.script.run
    .withSuccessHandler(function(res){
      busy(false);
      if(name === 'finishAircraft'){
        clearOperationDraft();
        STATE.active = false;
        STATE.session = null;
      }
      if(onSuccess) onSuccess(res);
      else {
        STATE = res;
        render();
      }
    })
    .withFailureHandler(function(err){
      busy(false);
      var msg = err && err.message ? err.message : String(err);
      if(name === 'finishAircraft') alert('保存できませんでした。入力内容は端末に残っています。電波を確認して、もう一度保存してください。\n\n' + msg);
      else renderError(msg);
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

function goBackFromAnywhere(){
  var session = STATE && STATE.session;
  if(session){
    captureCurrentScreenDraft();
    callServer('goBack');
    return;
  }

  alert('これより前の画面はありません。');
}

function captureCurrentScreenDraft(){
  var s = STATE && STATE.session;
  if(!s) return;
  if(s.phase === 'PRE'){
    var checks = {};
    for(var i=0; i<PRE_NAMES.length; i++) checks[PRE_NAMES[i]] = isChecked('pre' + i) ? '正常' : '異常';
    s.preflightChecks = checks;
    s.preflightAbnormalDetail = val('abnormalDetail');
    s.selectedBattery = Number(val('preflightBattery')) || 0;
    s.selectedBatteryCycle = val('preflightCycle');
  }else if(s.phase === 'BATTERY_CHANGE'){
    s.pendingBatteryChangeInput = {
      battery:val('changeBattery'), cycle:val('changeBatteryCycle'),
      installed:isChecked('batteryInstalled'), statusOk:isChecked('batteryStatusOk')
    };
  }else if(s.phase === 'READY'){
    s.pendingFlightInput = { battery:s.selectedBattery, takeoffLocation:val('takeoffLocation') };
  }else if(s.phase === 'LANDING'){
    s.pendingLandingInput = {
      landingLocation:val('landingLocation'), actualMinutes:val('actualMinutes'),
      safetyIssue:isChecked('safetyIssue'), safetyDetail:val('safetyDetail'),
      batteryNote:val('batteryNote')
    };
  }else if(s.phase === 'POST_ALL'){
    var aircrafts = {};
    var usedModels = Object.keys(s.aircrafts || {}).filter(function(model){ return s.aircrafts[model] && s.aircrafts[model].used; });
    usedModels.forEach(function(model, modelIndex){
      var prefix = 'post_' + modelIndex + '_';
      var postChecks = {};
      for(var j=0; j<POST_NAMES.length; j++) postChecks[POST_NAMES[j]] = isChecked(prefix + j) ? '正常' : '異常';
      aircrafts[model] = {
        checks:postChecks,
        defectLocation:val(prefix + 'defectLocation'),
        defectDetail:val(prefix + 'defectDetail'),
        actionDetail:val(prefix + 'actionDetail')
      };
    });
    s.pendingPostflightInput = {
      inspectionLocation:val('postLocation'), confirmer:val('confirmer'), aircrafts:aircrafts
    };
  }
  persistOperationDraft();
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
function findFavoriteSpotIndex_(list, location, route){
  for(var i=0; i<list.length; i++){
    var f = list[i] || {};
    if(String(f.location || '') === String(location || '') && String(f.route || '') === String(route || '')) return i;
  }
  return -1;
}
function storeFavorites_(list){
  try{
    localStorage.setItem(STORAGE_KEY_FAVORITES, JSON.stringify(list));
    return true;
  }catch(e){ return false; }
}
function saveFavoriteSpot(name, location, route){
  try{
    var list = loadFavorites();
    if(!Array.isArray(list)) list = [];
    var existingIndex = findFavoriteSpotIndex_(list, location, route);
    if(existingIndex >= 0) return { status:'duplicate', index:existingIndex, favorite:list[existingIndex] };
    list.unshift({ name: name, location: location, route: route });
    if(list.length > 8) list.pop();
    return storeFavorites_(list) ? { status:'saved', index:0 } : { status:'error' };
  }catch(e){ return { status:'error' }; }
}
function renameFavoriteSpot_(idx, name){
  var list = loadFavorites();
  if(!Array.isArray(list) || !list[idx]) return false;
  list[idx].name = name;
  return storeFavorites_(list);
}
function deleteFavoriteSpot_(idx){
  var list = loadFavorites();
  if(!Array.isArray(list) || !list[idx]) return false;
  list.splice(idx, 1);
  return storeFavorites_(list);
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
  var backButton = el('globalBackButton');
  var hasActiveOperation = !!(STATE && STATE.active && STATE.session);

  // 運航の初期画面には「一つ前」が存在しないため表示しない。
  if(backButton){
    backButton.style.display = hasActiveOperation ? 'block' : 'none';
  }

  if(TIMER_INTERVAL){ clearInterval(TIMER_INTERVAL); TIMER_INTERVAL = null; }
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
    else if(phase === 'PRE_ABNORMAL') renderPreAbnormalView(appDiv);
    else if(phase === 'BATTERY_CHANGE') renderBatteryChangeView(appDiv);
    else if(phase === 'READY') renderReadyView(appDiv);
    else if(phase === 'FLYING') renderFlyingView(appDiv);
    else if(phase === 'LANDING') renderLandingView(appDiv);
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
      'BATTERY_CHANGE': 'バッテリー交換後確認',
      'READY': '離陸待機中',
      'FLYING': '飛行中',
      'LANDING': '着陸後入力',
      'AFTER_LANDING': '着陸後',
      'POST_ALL': '飛行後点検'
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

  var favHtml = favoriteListHtml_(favs);

  div.innerHTML =
    sessionNoticeHtml +
    '<div class="card" id="startCard">' +
      '<div class="flex-between" style="margin-bottom:8px;">' +
        '<h2>本日の運航を開始</h2>' +
        '<button type="button" class="btn-outline" onclick="applyLastOperation()">🔄 前回と同じ条件で引用</button>' +
      '</div>' +

      '<div id="favoriteSection" style="margin-bottom:8px;' + (favHtml ? '' : 'display:none;') + '">' +
        '<div class="text-sm">登録済みのお気に入り現場：</div>' +
        '<div id="favoriteList">' + favHtml + '</div>' +
      '</div>' +

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
      '<div class="card" style="background:#f8fafc;border:1px solid #cbd5e1;margin:12px 0 10px;padding:12px;">' +
        '<div style="font-weight:700;font-size:13px;color:#1e3a8a;margin-bottom:6px;">🌤 気象情報（安全運航確認・ワンタップ入力）</div>' +
        '<label style="font-size:12px;margin:4px 0 2px;">天候</label>' +
        '<div class="chip-group" id="weatherChips">' +
          '<button type="button" class="chip-btn" onclick="selectWeather(this, \'晴\')">☀ 晴</button>' +
          '<button type="button" class="chip-btn" onclick="selectWeather(this, \'曇\')">☁ 曇</button>' +
          '<button type="button" class="chip-btn" onclick="selectWeather(this, \'雨\')">🌧 雨</button>' +
          '<button type="button" class="chip-btn warning" onclick="selectWeather(this, \'強風注意\')">⚠ 強風注意</button>' +
        '</div>' +
        '<input type="hidden" id="weatherVal" value="">' +
        '<label style="font-size:12px;margin:4px 0 2px;">風速（平均）</label>' +
        '<div class="chip-group" id="windSpeedChips">' +
          '<button type="button" class="chip-btn" onclick="selectWindSpeed(this, \'0〜1m/s 静穏\')">🍃 0〜1m/s 静穏</button>' +
          '<button type="button" class="chip-btn" onclick="selectWindSpeed(this, \'2〜3m/s 穏やか\')">🍃 2〜3m/s 穏やか</button>' +
          '<button type="button" class="chip-btn warning" onclick="selectWindSpeed(this, \'4〜5m/s 注意\')">⚠️ 4〜5m/s 注意</button>' +
          '<button type="button" class="chip-btn danger" onclick="selectWindSpeed(this, \'6m/s以上 飛行不可\')">⛔ 6m/s以上 飛行不可</button>' +
        '</div>' +
        '<input type="hidden" id="windSpeedVal" value="">' +
        '<label style="font-size:12px;margin:4px 0 2px;">風向</label>' +
        '<div class="chip-group" id="windDirChips">' +
          '<button type="button" class="chip-btn" onclick="selectWindDir(this, \'北\')">北</button>' +
          '<button type="button" class="chip-btn" onclick="selectWindDir(this, \'北東\')">北東</button>' +
          '<button type="button" class="chip-btn" onclick="selectWindDir(this, \'東\')">東</button>' +
          '<button type="button" class="chip-btn" onclick="selectWindDir(this, \'南東\')">南東</button>' +
          '<button type="button" class="chip-btn" onclick="selectWindDir(this, \'南\')">南</button>' +
          '<button type="button" class="chip-btn" onclick="selectWindDir(this, \'南西\')">南西</button>' +
          '<button type="button" class="chip-btn" onclick="selectWindDir(this, \'西\')">西</button>' +
          '<button type="button" class="chip-btn" onclick="selectWindDir(this, \'北西\')">北西</button>' +
        '</div>' +
        '<input type="hidden" id="windDirVal" value="">' +
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

function favoriteDisplayName_(f){
  return String((f && (f.name || f.route || f.location)) || '名称未設定');
}

function favoriteListHtml_(favs){
  if(!Array.isArray(favs) || favs.length === 0) return '';
  return '<div class="favorite-list">' + favs.map(function(f, idx){
    return '<div class="favorite-item">' +
      '<div class="favorite-name">📍 ' + esc(favoriteDisplayName_(f)) + '</div>' +
      '<div class="favorite-actions">' +
        '<button type="button" class="favorite-action-btn favorite-use-btn" onclick="applyFavorite(' + idx + ')">使う</button>' +
        '<button type="button" class="favorite-action-btn favorite-rename-btn" onclick="renameFavorite(' + idx + ')">名前変更</button>' +
        '<button type="button" class="favorite-action-btn favorite-delete-btn" onclick="deleteFavorite(' + idx + ')">削除</button>' +
      '</div>' +
    '</div>';
  }).join('') + '</div>';
}

function refreshFavoriteList_(){
  var favHtml = favoriteListHtml_(loadFavorites());
  var section = el('favoriteSection');
  var list = el('favoriteList');
  if(list) list.innerHTML = favHtml;
  if(section) section.style.display = favHtml ? '' : 'none';
}

function applyFavorite(idx){
  var favs = loadFavorites();
  var f = favs[idx];
  if(!f) return;
  if(el('route')) el('route').value = f.route;
  if(el('inspectionLocation')) el('inspectionLocation').value = f.location;
}

function renameFavorite(idx){
  var favs = loadFavorites();
  var f = Array.isArray(favs) ? favs[idx] : null;
  if(!f) return;
  var name = prompt('お気に入り現場の新しい名前を入力してください：', favoriteDisplayName_(f));
  if(name === null) return;
  name = String(name).trim();
  if(!name){ alert('名前を入力してください。'); return; }
  if(renameFavoriteSpot_(idx, name)){
    refreshFavoriteList_();
    alert('お気に入り現場の名前を変更しました。');
  }else{
    alert('名前を変更できませんでした。もう一度お試しください。');
  }
}

function deleteFavorite(idx){
  var favs = loadFavorites();
  var f = Array.isArray(favs) ? favs[idx] : null;
  if(!f) return;
  if(!confirm('お気に入り現場「' + favoriteDisplayName_(f) + '」を削除しますか？')) return;
  if(deleteFavoriteSpot_(idx)){
    refreshFavoriteList_();
    alert('お気に入り現場を削除しました。');
  }else{
    alert('削除できませんでした。もう一度お試しください。');
  }
}

function saveCurrentAsFavorite(){
  var loc = val('inspectionLocation');
  var r = val('route');
  if(!loc && !r){ alert('場所または経路を入力してください。'); return; }
  var name = prompt('この現場の表示名を入力してください（例：〇〇海岸、自宅横）：', r.slice(0, 12) || 'お気に入り現場');
  if(name === null) return;
  name = String(name).trim();
  if(!name){ alert('名前を入力してください。'); return; }
  var result = saveFavoriteSpot(name, loc, r);
  if(result.status === 'saved'){
    alert('お気に入り現場に登録しました。');
    refreshFavoriteList_();
  }else if(result.status === 'duplicate'){
    var currentName = favoriteDisplayName_(result.favorite);
    if(currentName === name){
      alert('この場所は「' + currentName + '」として既に保存されています。');
    }else if(confirm('この場所は「' + currentName + '」として既に保存されています。\n名前を「' + name + '」に変更しますか？')){
      if(renameFavoriteSpot_(result.index, name)){
        refreshFavoriteList_();
        alert('既存のお気に入り現場の名前を変更しました。');
      }else{
        alert('名前を変更できませんでした。もう一度お試しください。');
      }
    }
  }else{
    alert('お気に入り現場を保存できませんでした。もう一度お試しください。');
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
    forceNewLocation: isChecked('forceNewLocation'),
    weather: val('weatherVal'),
    windSpeed: val('windSpeedVal'),
    windDir: val('windDirVal')
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
  var recordLabel = s.blockNo
    ? s.dateSheet + ' No.' + s.blockNo
    : s.operationDate + '（全運航終了時に一括保存）';
  return '<div class="card status-box" style="margin-bottom:8px;">' +
    '<div class="flex-between">' +
      '<div><strong>' + esc(recordLabel) + '</strong> ｜ ' + esc(s.model) + '</div>' +
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
  var s = STATE.session;
  var savedChecks = (s && s.preflightChecks) || {};
  var batteryOptions = '<option value="">装着しているBATを選択</option>' + STATE.batteries.map(function(b){
    return '<option value="' + b.value + '"' + (String(s.selectedBattery || '') === String(b.value) ? ' selected' : '') + '>' + esc(b.label) + '</option>';
  }).join('');
  var checksHtml = PRE_NAMES.map(function(name, i){
    var check = PRE_CHECK_DETAILS[name] || { label: name, detail: '' };
    var checked = savedChecks[name] ? savedChecks[name] === '正常' : false;
    return '<label class="check-item check-item-detailed"><input type="checkbox" id="pre' + i + '"' + (checked ? ' checked' : '') + ' onchange="onPreCheckChanged()">' +
      '<span class="check-copy"><span class="check-label">' + esc(check.label) + '</span>' +
      '<span class="check-detail">' + esc(check.detail) + '</span></span></label>';
  }).join('');
  var hasSavedAbnormal = PRE_NAMES.some(function(name){ return savedChecks[name] === '異常'; });
  var savedAbnormalDetail = (STATE.session && STATE.session.preflightAbnormalDetail) || '';

  div.innerHTML = sessionHeaderHtml() +
    '<div class="card" id="preCard">' +
      '<h2>飛行前点検（様式2）</h2>' +
      '<div class="text-sm" style="margin-bottom:8px;">機体に使用するバッテリーを装着・電源投入してから、11項目を確認してください。</div>' +
      '<div class="card" style="background:#f8fafc;margin:8px 0 12px;border:1px solid #cbd5e1;">' +
        '<label>機体に装着しているバッテリー<span class="required">*</span></label>' +
        '<select id="preflightBattery">' + batteryOptions + '</select>' +
        '<label>現在のサイクル数（任意・確認できる場合のみ）</label>' +
        '<input type="number" id="preflightCycle" min="0" value="' + esc(s.selectedBatteryCycle || '') + '" placeholder="Autel Skyで確認できなければ空欄でOK">' +
      '</div>' +
      '<div class="check-list">' + checksHtml + '</div>' +

      '<div class="flex-row" style="margin:8px 0;">' +
        '<button type="button" class="btn btn-secondary btn-sm" onclick="setAllChecks(\'pre\', ' + PRE_NAMES.length + ', true)">全て正常（実機確認済み）</button>' +
        '<button type="button" class="btn btn-secondary btn-sm" onclick="setAllChecks(\'pre\', ' + PRE_NAMES.length + ', false)">全て解除</button>' +
      '</div>' +

      '<div id="preAbnormalBox" style="display:' + (hasSavedAbnormal ? 'block' : 'none') + ';" class="warn-box">' +
        '<strong>⚠ 異常箇所の特記事項</strong>' +
        '<div class="text-sm">異常がある場合、航空法および教則に基づき飛行を中止し、整備を行う必要があります。</div>' +
        '<textarea id="abnormalDetail" placeholder="異常の内容・部位を具体的に記載してください">' + esc(savedAbnormalDetail) + '</textarea>' +
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

  var battery = val('preflightBattery');
  if(!battery) errors.push({ id: 'preflightBattery', label: '装着バッテリー', message: '機体に装着しているバッテリーを選択してください。' });

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
    abnormalDetail: val('abnormalDetail'),
    battery: battery,
    cycle: val('preflightCycle')
  });
}

function renderPreAbnormalView(div){
  div.innerHTML = sessionHeaderHtml() +
    '<div class="card error-box">' +
      '<h2>飛行前点検で異常を記録しました</h2>' +
      '<p>この機体は離陸できません。必要な点検・整備を行い、点検整備記録はスプレッドシートの「点検整備記録_原本」を使用して記録してください。</p>' +
      '<button class="btn btn-danger btn-sm" style="margin-top:12px;" onclick="cancelSessionPrompt()">この運航を終了する</button>' +
    '</div>';
}

// ----------------------------------------------------
// 3. バッテリー交換確認／飛行開始待機画面（離陸前）
// ----------------------------------------------------
function renderBatteryChangeView(div){
  var s = STATE.session;
  var previousInput = s.pendingBatteryChangeInput || {};
  var batteryOptions = '<option value="">交換後のBATを選択</option>' + STATE.batteries.map(function(b){
    return '<option value="' + b.value + '"' + (String(previousInput.battery || '') === String(b.value) ? ' selected' : '') + '>' + esc(b.label) + '</option>';
  }).join('');

  div.innerHTML = sessionHeaderHtml() +
    '<div class="card" id="batteryChangeCard">' +
      '<h2>バッテリー交換後の確認</h2>' +
      '<div class="text-sm" style="margin-bottom:10px;">同じ現場・同じ目的で連続飛行するため、正式な飛行前点検は繰り返しません。交換したバッテリーだけ確認します。</div>' +
      '<label>交換後のバッテリー<span class="required">*</span></label>' +
      '<select id="changeBattery">' + batteryOptions + '</select>' +
      '<label>現在のサイクル数（任意・確認できる場合のみ）</label>' +
      '<input type="number" id="changeBatteryCycle" min="0" value="' + esc(previousInput.cycle || '') + '" placeholder="Autel Skyで確認できなければ空欄でOK">' +
      '<div class="check-list" style="margin-top:10px;">' +
        '<label class="check-item"><input type="checkbox" id="batteryInstalled"' + (previousInput.installed ? ' checked' : '') + '><span>バッテリーが確実に装着・ロックされている</span></label>' +
        '<label class="check-item"><input type="checkbox" id="batteryStatusOk"' + (previousInput.statusOk ? ' checked' : '') + '><span>残量・温度・警告表示に異常がない</span></label>' +
      '</div>' +
      '<button class="btn btn-primary" style="font-size:17px;padding:14px;margin-top:12px;" onclick="submitBatteryChange()">確認して離陸準備へ</button>' +
    '</div>';
}

function submitBatteryChange(){
  clearFormErrors('batteryChangeCard');
  var errors = [];
  var battery = val('changeBattery');
  if(!battery) errors.push({ id:'changeBattery', label:'交換後のバッテリー', message:'交換したバッテリーを選択してください。' });
  if(!isChecked('batteryInstalled')) errors.push({ id:'batteryInstalled', label:'装着・ロック', message:'実機を確認してチェックしてください。' });
  if(!isChecked('batteryStatusOk')) errors.push({ id:'batteryStatusOk', label:'残量・警告表示', message:'Autel Skyの表示を確認してチェックしてください。' });
  if(errors.length){ showFormErrors('batteryChangeCard', errors); return; }
  callServer('confirmBatteryChange', {
    battery:battery, cycle:val('changeBatteryCycle'), installed:true, statusOk:true
  });
}

function renderReadyView(div){
  var s = STATE.session;
  var previousInput = s.pendingFlightInput || {};

  div.innerHTML = sessionHeaderHtml() +
    '<div class="card" id="readyCard">' +
      '<h2>飛行開始待機（第' + (s.flightIndex + 1) + '飛行）</h2>' +
      '<div class="status-box">離陸前確認完了：適合（安全飛行可能）</div>' +

      '<div class="status-box">使用バッテリー：<strong>BAT_' + esc(s.selectedBattery) + '</strong>' +
        (s.selectedBatteryCycle !== '' ? ' ｜ サイクル数：<strong>' + esc(s.selectedBatteryCycle) + '</strong>' : '') + '</div>' +

      '<div class="flex-between">' +
        '<label>離陸場所<span class="required">*</span></label>' +
        '<button type="button" class="btn-outline" onclick="fetchCurrentGps(\'takeoffLocation\', null)">📍 GPSで現在地更新（任意）</button>' +
      '</div>' +
      '<input type="text" id="takeoffLocation" value="' + esc(previousInput.takeoffLocation || s.route) + '">' +

      '<button class="btn btn-success" style="font-size:18px;padding:14px;margin-top:14px;" onclick="submitStartFlight()">🛫 離陸開始</button>' +
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

  var battery = Number(STATE.session.selectedBattery || 0);
  if(!battery) errors.push({ id: '', label: '使用バッテリー', message: '一つ前の画面に戻り、使用バッテリーを確認してください。' });

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
// 4. 飛行中画面（操縦に集中）／着陸後入力画面
// ----------------------------------------------------
function renderFlyingView(div){
  var s = STATE.session;
  var startTime = new Date(s.startedAt);

  div.innerHTML = sessionHeaderHtml() +
    '<div class="card">' +
      '<h2>飛行中（第' + (s.flightIndex) + '飛行）</h2>' +
      '<div class="status-box" style="background:#f0fff4;color:#22543d;border-left-color:#38a169;line-height:1.7;">' +
        '使用中バッテリー：<strong>BAT_' + s.currentBattery + '</strong> ｜ 離陸時刻：<strong>' + formatTimeStr(s.startedAt) + '</strong><br>' +
        '経過時間：<strong id="flightTimerDisplay" style="font-size:22px;">00:00</strong>' +
      '</div>' +
      '<div class="warn-box" style="margin-top:12px;background:#eff6ff;border-left-color:#2563eb;color:#1e3a8a;">' +
        '<strong>飛行中は画面操作をせず、操縦と周囲確認に集中してください。</strong>' +
      '</div>' +
      '<button class="btn btn-warning" style="font-size:18px;padding:16px;margin-top:16px;" onclick="callServer(\'completeLanding\')">🛬 着陸完了（プロペラ停止後）</button>' +
    '</div>';

  updateTimerDisplay(startTime);
  TIMER_INTERVAL = setInterval(function(){ updateTimerDisplay(startTime); }, 1000);
}

function renderLandingView(div){
  var s = STATE.session;
  var previousInput = s.pendingLandingInput || {};
  var startTime = new Date(s.startedAt);
  var activeFlight = s.flights && s.flights.length ? s.flights[s.flights.length - 1] : null;
  var landingTime = activeFlight && activeFlight.landingAt ? new Date(activeFlight.landingAt) : new Date();
  var elapsedMinutes = Math.max(1, Math.round((landingTime - startTime) / 60000));
  var displayedMinutes = previousInput.actualMinutes || elapsedMinutes;

  var tagChips = SAFETY_TAGS.map(function(t){
    return '<span class="tag-chip" onclick="addSafetyTag(\'' + esc(t) + '\')">＋ ' + esc(t) + '</span>';
  }).join('');

  div.innerHTML = sessionHeaderHtml() +
    '<div class="card" id="landingCard">' +
      '<h2>着陸後の記録（第' + s.flightIndex + '飛行）</h2>' +
      '<div class="status-box" style="background:#f0fff4;color:#22543d;border-left-color:#38a169;line-height:1.6;">' +
        '使用中バッテリー：<strong>BAT_' + s.currentBattery + '</strong> ｜ 離陸時刻：<strong>' + formatTimeStr(s.startedAt) + '</strong><br>' +
        '<span class="text-sm" style="color:#276749;">プロペラ停止後に、着陸内容を入力してください。</span>' +
      '</div>' +

      '<div class="flex-between">' +
        '<label>着陸場所<span class="required">*</span></label>' +
        '<button type="button" class="btn-outline" onclick="fetchCurrentGps(\'landingLocation\', null)">📍 GPSで現在地取得（任意）</button>' +
      '</div>' +
      '<input type="text" id="landingLocation" value="' + esc(previousInput.landingLocation || s.route) + '">' +

      '<label>実飛行時間（分）<span class="required">*</span></label>' +
      '<div class="text-sm" style="color:#64748b;margin-bottom:4px;">送信機（Autel Sky）に表示された飛行時間を入力してください。</div>' +
      '<input type="number" id="actualMinutes" value="' + displayedMinutes + '" min="1" style="font-size:18px;font-weight:700;">' +

      '<label class="check-item" style="margin:12px 0 6px;">' +
        '<input type="checkbox" id="safetyIssue"' + (previousInput.safetyIssue ? ' checked' : '') + ' onchange="onSafetyChanged()">' +
        '<span>飛行の安全に影響のあった事項あり</span>' +
      '</label>' +

      '<div id="safetyDetailBox" style="display:' + (previousInput.safetyIssue ? 'block' : 'none') + ';">' +
        '<label>クイックタグ選択（ワンタップ挿入）：</label>' +
        '<div class="tags-container">' + tagChips + '</div>' +
        '<textarea id="safetyDetail" placeholder="タグを選択または事象を記載してください">' + esc(previousInput.safetyDetail || '') + '</textarea>' +
      '</div>' +

      '<div style="margin-top:10px;background:#f8fafc;padding:10px;border-radius:6px;">' +
        '<div>' +
          '<label style="color:#64748b;font-size:12px;">バッテリー異常・所感（任意・空欄可）</label>' +
          '<input type="text" id="batteryNote" value="' + esc(previousInput.batteryNote || '') + '" placeholder="未入力でOK">' +
        '</div>' +
      '</div>' +

      '<button class="btn btn-warning" style="font-size:18px;padding:14px;margin-top:14px;" onclick="submitLandFlight()">📝 着陸内容を確定して次へ</button>' +
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
  clearFormErrors('landingCard');
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

  // ※バッテリー所感は完全任意（未入力チェックなしで素通り）

  if(errors.length > 0){
    showFormErrors('landingCard', errors);
    return;
  }

  callServer('landFlight', {
    landingLocation: landingLocation,
    actualMinutes: actualMinutes,
    safetyIssue: isChecked('safetyIssue'),
    safetyDetail: val('safetyDetail'),
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
      '<p class="text-sm">次に行う操作を選んでください。</p>' +

      '<button class="btn btn-primary" style="font-size:18px;padding:15px;" onclick="callServer(\'continueFlight\')">🔋 同じ機体で続ける（バッテリー交換）</button>' +
      '<div class="text-sm" style="margin:5px 0 0;color:#64748b;">' + esc(s.model) + ' の第' + (s.flightIndex + 1) + '飛行へ進みます。</div>' +
      
      '<button class="btn btn-secondary" style="margin-top:14px;font-size:15px;padding:12px;" onclick="onSwitchAircraftClick(\'' + esc(otherModel) + '\')">🔄 機体を交代する（' + esc(otherModel) + '）' + otherBadge + '</button>' +

      '<div style="margin-top:20px;padding-top:14px;border-top:1px solid #cbd5e1;">' +
        '<div class="text-sm" style="margin-bottom:6px;color:#475569;">本日の飛行を終える場合</div>' +
        '<button class="btn btn-secondary" style="font-size:15px;padding:12px;" onclick="callServer(\'startPostflight\')">🏁 全飛行を終了して飛行後点検へ</button>' +
      '</div>' +
    '</div>';
}

function onSwitchAircraftClick(targetModel){
  callServer('switchAircraft', { targetModel: targetModel });
}

// ----------------------------------------------------
// 6. 飛行後点検画面（様式2：本日使った全機体をスマートに完了）
// ----------------------------------------------------
function renderPostView(div){
  var appDiv = div || el('app');
  var s = STATE.session;
  var acs = s.aircrafts || {};
  var previousPost = s.pendingPostflightInput || {};
  var previousAircrafts = previousPost.aircrafts || {};
  var usedModels = Object.keys(acs).filter(function(m){ return acs[m] && acs[m].used; });
  if(usedModels.length === 0 && s.model) usedModels = [s.model];

  var aircraftCardsHtml = usedModels.map(function(model, mIdx){
    var ac = acs[model] || {};
    var previousAc = previousAircrafts[model] || {};
    var previousChecks = previousAc.checks || {};
    var prefix = 'post_' + mIdx + '_';
    var checksHtml = POST_NAMES.map(function(name, i){
      var check = POST_CHECK_DETAILS[name] || { label: name, detail: '' };
      var checked = previousChecks[name] ? previousChecks[name] === '正常' : false;
      return '<label class="check-item check-item-detailed"><input type="checkbox" id="' + prefix + i + '"' + (checked ? ' checked' : '') + ' onchange="onAnyPostCheckChanged()">' +
        '<span class="check-copy"><span class="check-label">' + esc(check.label) + '</span>' +
        '<span class="check-detail">' + esc(check.detail) + '</span></span></label>';
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
      '<div id="' + prefix + 'abnormalBox" style="display:' + (previousAc.abnormal ? 'block' : 'none') + ';" class="warn-box">' +
        '<strong>不具合・事象の記録（' + esc(model) + '）</strong>' +
        '<label>不具合箇所</label><input type="text" id="' + prefix + 'defectLocation" value="' + esc(previousAc.defectLocation || '') + '" placeholder="プロペラ後縁、モーター基部等">' +
        '<label>事象等の内容<span class="required">*</span></label><textarea id="' + prefix + 'defectDetail">' + esc(previousAc.defectDetail || '') + '</textarea>' +
        '<label>処置内容</label><textarea id="' + prefix + 'actionDetail" placeholder="清掃、部品交換予定、飛行停止等">' + esc(previousAc.actionDetail || '') + '</textarea>' +
      '</div>' +
    '</div>';
  }).join('');

  appDiv.innerHTML = sessionHeaderHtml() +
    '<div class="card" id="postMainCard">' +
      '<h2>今回の運航の飛行後点検（様式2）</h2>' +
      '<p class="text-sm">今回の同一現場・同一目的の連続飛行で使用した機体を、撤収前に点検します。</p>' +
      
      '<div style="margin-bottom:14px;">' +
        '<button type="button" class="btn btn-success" style="font-size:15px;padding:12px;width:100%;font-weight:700;" onclick="setAllPostChecksAllModels(true)">✨ 今回使用した全機体「全て正常（実機確認済み）」</button>' +
      '</div>' +

      aircraftCardsHtml +

      '<div class="card" style="background:#f8fafc;margin-top:14px;border:1px solid #cbd5e1;">' +
        '<label>点検実施場所<span class="required">*</span></label>' +
        '<input type="text" id="postLocation" value="' + esc(previousPost.inspectionLocation || s.inspectionLocation || s.route) + '">' +
        '<label>点検確認者氏名（機長）<span class="required">*</span></label>' +
        '<input type="text" id="confirmer" value="' + esc(previousPost.confirmer || (s.pilot ? s.pilot.split('（')[0].trim() : '吉田 公一')) + '">' +
      '</div>' +

      '<button class="btn btn-primary" style="font-size:16px;padding:14px;margin-top:14px;" onclick="submitAllPostflight()">✅ 全記録を一括保存し、今回の運航日誌を確定する</button>' +
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
  onAnyPostCheckChanged();
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
    render();
    alert('運航記録をスプレッドシートへ保存しました。');
  });
}

function cancelSessionPrompt(){
  if(confirm('現在の運航入力を取り消しますか？\n（入力中の内容は保存されません）')){
    callServer('cancelCurrentSession');
  }
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

// 初回起動：進行中の運航下書き1件だけを端末から復元する。
restoreOperationDraft();
updateNetworkStatus();
render();
</script>
</body>
</html>`;
