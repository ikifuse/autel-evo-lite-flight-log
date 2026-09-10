// LocalStorageの下書き・直前履歴。運航状態の取得先だけを注入する。

var DRAFT_STORAGE_PORTS = null;
function configureDraftStorage(ports){ DRAFT_STORAGE_PORTS = ports; }

var ACTIVE_OPERATION_DRAFT_KEY = 'EVO_LITE_ACTIVE_OPERATION_V2';
var STORAGE_KEY_LAST = 'EVO_LITE_LAST_OPERATION';
var STORAGE_KEY_ASSISTANTS = 'EVO_LITE_ASSISTANT_HISTORY_V1';

var DRAFT_STORAGE_FAILED = false;
function persistOperationDraft(){
  var state = DRAFT_STORAGE_PORTS.getState();
  try{
    if(state && state.active && state.session){
      var serialized = JSON.stringify(state.session);
      localStorage.setItem(ACTIVE_OPERATION_DRAFT_KEY, serialized);
      if(localStorage.getItem(ACTIVE_OPERATION_DRAFT_KEY) !== serialized) throw new Error('draft readback failed');
    }else{
      localStorage.removeItem(ACTIVE_OPERATION_DRAFT_KEY);
    }
    DRAFT_STORAGE_FAILED = false;
    return true;
  }catch(e){
    if(!DRAFT_STORAGE_FAILED) alert('端末への下書き保存に失敗しました。この画面を閉じたり再読み込みしたりせず、入力内容を控えてください。');
    DRAFT_STORAGE_FAILED = true;
    return false;
  }
}

function restoreOperationDraft(){
  var state = DRAFT_STORAGE_PORTS.getState();
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
      state.active = true;
      state.session = session;
      persistOperationDraft();
    }
  }catch(e){
    alert('端末の下書きを読み込めませんでした。前回の入力があった場合は、新しい運航を始める前に記録の保存状況を確認してください。');
  }
}

function clearOperationDraft(){
  try{ localStorage.removeItem(ACTIVE_OPERATION_DRAFT_KEY); }catch(e){}
}

function saveLastOperation(data){
  try{ localStorage.setItem(STORAGE_KEY_LAST, JSON.stringify(data)); }catch(e){}
}

function loadLastOperation(){
  try{ var d = localStorage.getItem(STORAGE_KEY_LAST); return d ? JSON.parse(d) : null; }catch(e){ return null; }
}

function loadAssistantHistory(){
  try{
    var raw = localStorage.getItem(STORAGE_KEY_ASSISTANTS);
    var parsed = raw ? JSON.parse(raw) : [];
    if(!Array.isArray(parsed)) return [];
    var names = [];
    parsed.forEach(function(item){
      var name = typeof item === 'string' ? item.trim() : '';
      if(name && names.indexOf(name) < 0) names.push(name);
    });
    return names;
  }catch(e){ return []; }
}

function saveAssistantHistory(names){
  try{ localStorage.setItem(STORAGE_KEY_ASSISTANTS, JSON.stringify(names)); }catch(e){}
}

function rememberAssistantName(name){
  name = String(name == null ? '' : name).trim();
  if(!name) return;
  var names = loadAssistantHistory();
  if(names.indexOf(name) < 0){
    names.push(name);
    saveAssistantHistory(names);
  }
}

function assistantCandidates(lastAssistant, currentAssistant){
  var names = loadAssistantHistory();
  [lastAssistant, currentAssistant].forEach(function(item){
    var name = String(item == null ? '' : item).trim();
    if(name && names.indexOf(name) < 0) names.push(name);
  });
  return names;
}
