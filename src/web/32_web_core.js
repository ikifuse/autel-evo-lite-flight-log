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
var PURPOSE_NAMES = ['空撮','報道取材','警備','農林水産業','測量','環境調査','設備メンテナンス','インフラ点検・保守','資材管理','輸送・宅配','自然観測','事故・災害対応等','趣味','研究開発','その他','操縦練習','整備後確認飛行','修理後確認飛行','アプリテスト'];
var METHOD_NAMES = ['通常飛行（特定飛行なし）','屋内練習','空港等周辺','150m以上','DID','夜間','目視外','30m未満','催し場所上空','危険物輸送','物件投下'];
var SPECIAL_METHODS = ['空港等周辺','150m以上','DID','夜間','目視外','30m未満','催し場所上空','危険物輸送','物件投下'];
var METHOD_DETAILS = {
  '空港等周辺': '空港周辺等',
  '150m以上': '地表・水面から150m以上',
  'DID': '人口集中地区',
  '夜間': '日没〜日の出',
  '目視外': '直接目視しない飛行',
  '30m未満': '第三者・物件から30m未満',
  '催し場所上空': 'イベント等の上空',
  '危険物輸送': '危険物を輸送',
  '物件投下': '飛行中に物件を投下'
};
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
var CATEGORY_NOTICE_TIMER = null;

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

