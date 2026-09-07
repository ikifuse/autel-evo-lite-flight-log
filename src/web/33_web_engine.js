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
        STATE = res;
        render();
        clearOperationDraft();
        if(onSuccess) onSuccess(res);
        return;
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
// LocalStorage 管理（下書き・直前履歴）
// ----------------------------------------------------
var STORAGE_KEY_LAST = 'EVO_LITE_LAST_OPERATION';
var STORAGE_KEY_ASSISTANTS = 'EVO_LITE_ASSISTANT_HISTORY_V1';

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
function assistantOptionsHtml(lastAssistant, currentAssistant){
  var selectedName = String(currentAssistant == null ? '' : currentAssistant).trim();
  var html = '<option value=""' + (!selectedName ? ' selected' : '') + '>なし</option>';
  assistantCandidates(lastAssistant, selectedName).forEach(function(name){
    html += '<option value="' + esc(name) + '"' + (selectedName === name ? ' selected' : '') + '>' + esc(name) + '</option>';
  });
  return html + '<option value="__NEW__">新しい人を入力</option>';
}
function onAssistantSelectionChanged(){
  var box = el('assistantNewBox');
  if(box) box.style.display = val('assistantSelect') === '__NEW__' ? 'block' : 'none';
}
function selectedAssistantName(){
  return val('assistantSelect') === '__NEW__' ? val('assistantNew') : val('assistantSelect');
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

