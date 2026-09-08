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

// ----------------------------------------------------
// 保存状態の読み取り専用診断モーダル
// ----------------------------------------------------
var STAGE_HUMAN_NAMES = {
  'PLAN_PERSISTED': '保存準備完了',
  'PREFLIGHT_WRITTEN': '点検記録保存後',
  'FLIGHTS_WRITTEN': '飛行記録保存後',
  'BATTERY_WRITTEN': 'BAT履歴保存後',
  'POSTFLIGHT_WRITTEN': '飛行後点検保存後',
  'AIRCRAFT_TOTALS_WRITTEN': '機体累計更新後',
  'FINAL_FLUSH': 'シート反映後（検証前）',
  'VERIFIED': '検証完了（完了前）'
};

function openCommitDiagnosisModal(){
  var existing = el('commitDiagnosisModal');
  if(existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'commitDiagnosisModal';
  overlay.className = 'diag-modal-overlay';
  overlay.onclick = function(e){
    if(e.target === overlay) closeCommitDiagnosisModal();
  };

  overlay.innerHTML =
    '<div class="diag-modal-content" onclick="event.stopPropagation()">' +
      '<div class="diag-modal-header">' +
        '<h3>📋 保存状態の診断</h3>' +
        '<button type="button" class="diag-modal-close" onclick="closeCommitDiagnosisModal()" aria-label="閉じる">✕</button>' +
      '</div>' +
      '<div class="diag-modal-body" id="diagModalBody">' +
        '<div style="text-align:center;padding:24px 8px;">' +
          '<div style="font-size:15px;font-weight:600;color:#1e40af;margin-bottom:8px;">スプレッドシートの保存状態を確認中...</div>' +
          '<div style="font-size:12px;color:#64748b;">読み取り専用で安全に確認しています（変更はされません）</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  runCommitDiagnosis();
}

function closeCommitDiagnosisModal(){
  var modal = el('commitDiagnosisModal');
  if(modal) modal.remove();
}

function runCommitDiagnosis(){
  var body = el('diagModalBody');
  if(!body) return;

  google.script.run
    .withSuccessHandler(function(reports){
      renderCommitDiagnosisResult(reports);
    })
    .withFailureHandler(function(err){
      var msg = err && err.message ? err.message : String(err);
      if(!el('diagModalBody')) return;
      el('diagModalBody').innerHTML =
        '<div class="warn-box" style="margin-bottom:12px;">' +
          '<strong style="color:#b91c1c;">⚠️ 診断処理でエラーが発生しました</strong>' +
          '<div style="margin-top:6px;font-size:13px;color:#475569;">' + esc(msg) + '</div>' +
        '</div>' +
        '<button type="button" class="btn btn-secondary diag-footer-btn" onclick="runCommitDiagnosis()">再試行する</button>' +
        '<button type="button" class="btn diag-footer-btn" style="background:#e2e8f0;color:#334155;margin-top:8px;" onclick="closeCommitDiagnosisModal()">閉じる</button>';
    })
    .diagnosePendingCommitPlans();
}

function renderCommitDiagnosisResult(reports){
  var body = el('diagModalBody');
  if(!body) return;

  if(!reports || reports.length === 0){
    body.innerHTML =
      '<div class="diag-item-card is-ok">' +
        '<div style="font-weight:700;font-size:15px;color:#065f46;margin-bottom:6px;">✅ 未完了の保存はありません</div>' +
        '<div style="font-size:13px;color:#047857;">すべての運航記録は正常に保存・完了しています。<br>スプレッドシートとの競合や保留データはありません。</div>' +
      '</div>' +
      '<button type="button" class="btn btn-primary diag-footer-btn" onclick="closeCommitDiagnosisModal()">閉じる</button>';
    return;
  }

  var html = '<div style="margin-bottom:10px;font-weight:700;color:#991b1b;font-size:14px;">⚠️ 保留中・未完了の保存が ' + reports.length + ' 件見つかりました</div>';

  reports.forEach(function(r, idx){
    var stateText = r.state === 'failed' ? '失敗（途中で停止）' : (r.state === 'writing' ? '処理中（または通信切断）' : esc(r.state));
    var stageText = STAGE_HUMAN_NAMES[r.stage] || r.stage || '(不明)';
    var lastErrStageText = r.lastErrorStage ? (STAGE_HUMAN_NAMES[r.lastErrorStage] || r.lastErrorStage) : '(なし)';
    var stoppedAtText = r.lastErrorStage && r.lastErrorStage !== '(なし)' ? lastErrStageText + ' で停止' : stageText;

    var counts = r.operationCounts || { intended: 0, before: 0, conflict: 0, total: 0 };
    var hasCorruption = !r.chunksComplete || !r.planHashMatches;
    var corruptionText = hasCorruption ? '⚠️ 異常あり（データ欠落・破損の疑い）' : 'なし（正常）';

    var isSafe = !!r.safeToRecover;
    var recoveryStatusText = isSafe ? 'あり（安全に復旧可能）' : '不可';

    var detailId = 'diagDetail_' + idx;

    html +=
      '<div class="diag-item-card has-pending">' +
        '<div style="font-weight:700;font-size:14px;color:#9f1239;margin-bottom:6px;">' +
          '【保存計画 ' + (idx + 1) + '】 前回の保存が途中で止まっています' +
        '</div>' +
        '<div class="diag-grid">' +
          '<div class="diag-grid-label">状態</div><div class="diag-grid-value"><strong>' + esc(stateText) + '</strong></div>' +
          '<div class="diag-grid-label">止まった場所</div><div class="diag-grid-value"><strong>' + esc(stoppedAtText) + '</strong></div>' +
          '<div class="diag-grid-label">未書込み</div><div class="diag-grid-value">' + counts.before + ' 件</div>' +
          '<div class="diag-grid-label">書込み済み</div><div class="diag-grid-value">' + counts.intended + ' 件（全' + counts.total + '件中）</div>' +
          '<div class="diag-grid-label">競合件数</div><div class="diag-grid-value">' + (counts.conflict > 0 ? '<span style="color:#dc2626;font-weight:700;">' + counts.conflict + ' 件</span>' : '0 件') + '</div>' +
          '<div class="diag-grid-label">データ破損の有無</div><div class="diag-grid-value">' + esc(corruptionText) + '</div>' +
          '<div class="diag-grid-label">安全に復旧できるか</div><div class="diag-grid-value"><strong style="color:' + (isSafe ? '#15803d' : '#b91c1c') + ';">' + recoveryStatusText + '</strong></div>' +
        '</div>';

    if(r.statusCategory === 'SAFE_TO_RECOVER'){
      html +=
        '<div style="margin-top:12px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:12px;text-align:center;">' +
          '<div style="font-size:13px;font-weight:700;color:#065f46;margin-bottom:4px;">✨ 前回の保存を安全に復旧できます</div>' +
          '<div style="font-size:12px;color:#047857;margin-bottom:10px;line-height:1.4;">' +
            '前回の続きの書き込みを安全に完了し、保留状態を解除します。<br>（重複記録や累計の二重加算は発生しません）' +
          '</div>' +
          '<button type="button" class="btn btn-success" style="font-size:15px;padding:13px;width:100%;font-weight:700;" onclick="executeCommitRecovery(\'' + esc(r.draftId) + '\')">' +
            '🚀 前回の保存を安全に復旧する' +
          '</button>' +
        '</div>';
    } else if(r.statusCategory === 'SAFE_TO_DISCARD_TEST'){
      html +=
        '<div style="margin-top:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;text-align:center;">' +
          '<div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:4px;">💡 このTEST保存は安全に破棄できます</div>' +
          '<div style="font-size:12px;color:#b45309;margin-bottom:10px;line-height:1.4;">' +
            'TEST日付シートは既に削除されており、BAT履歴や機体累計にも書き込まれていません。<br>' +
            'このテスト保存計画を破棄して保留ロックを解除し、現在の入力内容を保存できるようにします。' +
          '</div>' +
          '<button type="button" class="btn btn-danger" style="font-size:15px;padding:13px;width:100%;font-weight:700;background:#dc2626;color:#ffffff;border:none;border-radius:6px;" onclick="executeTestCommitDiscard(\'' + esc(r.draftId) + '\')">' +
            '🗑️ このTEST保存を破棄して解除' +
          '</button>' +
        '</div>';
    } else {
      html +=
        '<div class="warn-box" style="margin-top:10px;background:#fef2f2;border-left:4px solid #ef4444;padding:10px;">' +
          '<strong style="color:#b91c1c;">⚠️ 自動処理できません。詳細を確認してください</strong>' +
          '<div style="font-size:12px;color:#7f1d1d;margin-top:4px;">' +
            '理由: ' + esc((r.resumeBlockReasons || []).concat(r.discardBlockReasons || []).filter(function(v,i,a){return a.indexOf(v)===i;}).join(' / ') || '競合またはデータ不整合') +
          '</div>' +
        '</div>';
    }

    html +=
        '<button type="button" class="diag-detail-toggle" onclick="toggleDiagDetail(\'' + detailId + '\')">▶ 詳しい技術情報（draftIdなど）を見る</button>' +
        '<div id="' + detailId + '" class="diag-detail-box" style="display:none;">' +
          'draftId: ' + esc(r.draftId) + '\n' +
          '運航種別: ' + (r.isAppTest ? 'アプリテスト (TEST運航)' : '通常運航') + '\n' +
          '状態分類: ' + esc(r.statusCategory || '') + '\n' +
          '目的: ' + esc(r.purpose || '') + '\n' +
          '作成日時: ' + esc(r.createdAt) + '\n' +
          '更新日時: ' + esc(r.updatedAt) + '\n' +
          'DATA chunks: ' + (r.chunksComplete ? '完全' : '一部欠落') + '\n' +
          'planHash一致: ' + (r.planHashMatches ? '一致' : '不一致') + '\n' +
          'BAT付与状況: ' + r.batteryMetadata.matched + ' / ' + r.batteryMetadata.total + ' 件\n' +
          '機体累計状況: ' + (r.isAppTest ? r.aircraftTotals.note : (r.aircraftTotals.matched + ' / ' + r.aircraftTotals.targets + ' 件')) + '\n' +
          (r.conflicts && r.conflicts.length > 0 ? ('\n[競合詳細]:\n' + JSON.stringify(r.conflicts, null, 2)) : '') +
        '</div>' +
      '</div>';
  });

  html +=
    '<button type="button" class="btn btn-secondary diag-footer-btn" onclick="closeCommitDiagnosisModal()">閉じる</button>';

  body.innerHTML = html;
}

function executeCommitRecovery(draftId){
  var body = el('diagModalBody');
  if(!body) return;

  body.innerHTML =
    '<div style="text-align:center;padding:32px 12px;">' +
      '<div style="font-size:16px;font-weight:700;color:#1e40af;margin-bottom:8px;">前回の保存を復旧中...</div>' +
      '<div style="font-size:13px;color:#64748b;margin-bottom:12px;">スプレッドシートの残りの書き込みを安全に完了しています</div>' +
      '<div class="text-sm" style="color:#0369a1;">（端末に入力中の下書きは保持されています）</div>' +
    '</div>';

  google.script.run
    .withSuccessHandler(function(res){
      if(!el('diagModalBody')) return;
      el('diagModalBody').innerHTML =
        '<div class="diag-item-card is-ok" style="padding:16px;text-align:center;">' +
          '<div style="font-weight:700;font-size:16px;color:#065f46;margin-bottom:8px;">' +
            '✅ 前回の保存を復旧しました。現在の運航を保存できます' +
          '</div>' +
          '<div style="font-size:13px;color:#047857;line-height:1.5;margin-bottom:14px;">' +
            '前回の保存は正常に完了し、保留状態が解除されました。<br>' +
            '端末の入力内容はそのまま保持されていますので、このまま「運航日誌を確定する」を押して保存してください。' +
          '</div>' +
          '<button type="button" class="btn btn-primary diag-footer-btn" onclick="closeCommitDiagnosisModal()">閉じる</button>' +
        '</div>';
    })
    .withFailureHandler(function(err){
      var msg = err && err.message ? err.message : String(err);
      if(!el('diagModalBody')) return;
      el('diagModalBody').innerHTML =
        '<div class="warn-box" style="margin-bottom:12px;">' +
          '<strong style="color:#b91c1c;">⚠️ 復旧処理でエラーが発生しました</strong>' +
          '<div style="margin-top:6px;font-size:13px;color:#475569;">' + esc(msg) + '</div>' +
        '</div>' +
        '<button type="button" class="btn btn-secondary diag-footer-btn" onclick="runCommitDiagnosis()">もう一度確認する</button>' +
        '<button type="button" class="btn diag-footer-btn" style="background:#e2e8f0;color:#334155;margin-top:8px;" onclick="closeCommitDiagnosisModal()">閉じる</button>';
    })
    .recoverPendingCommitPlan(draftId);
}

function executeTestCommitDiscard(draftId){
  var body = el('diagModalBody');
  if(!body) return;

  body.innerHTML =
    '<div style="text-align:center;padding:32px 12px;">' +
      '<div style="font-size:16px;font-weight:700;color:#991b1b;margin-bottom:8px;">テスト保存計画を破棄中...</div>' +
      '<div style="font-size:13px;color:#64748b;margin-bottom:12px;">保留ロックを安全に解除しています</div>' +
      '<div class="text-sm" style="color:#0369a1;">（端末に入力中の下書きは保持されています）</div>' +
    '</div>';

  google.script.run
    .withSuccessHandler(function(res){
      if(!el('diagModalBody')) return;
      el('diagModalBody').innerHTML =
        '<div class="diag-item-card is-ok" style="padding:16px;text-align:center;">' +
          '<div style="font-weight:700;font-size:16px;color:#065f46;margin-bottom:8px;">' +
            '✅ 保留中のテスト保存を破棄しました' +
          '</div>' +
          '<div style="font-size:13px;color:#047857;margin-bottom:16px;line-height:1.5;">' +
            '保留ロックが解除されました。<br>入力中の下書きは保持されています。<br>「閉じる」を押して、そのまま一括保存を実行できます。' +
          '</div>' +
          '<button type="button" class="btn btn-primary diag-footer-btn" onclick="closeCommitDiagnosisModal()">閉じる</button>' +
        '</div>';
    })
    .withFailureHandler(function(err){
      var msg = err && err.message ? err.message : String(err);
      if(!el('diagModalBody')) return;
      el('diagModalBody').innerHTML =
        '<div class="warn-box" style="margin-bottom:12px;">' +
          '<strong style="color:#b91c1c;">⚠️ 破棄処理でエラーが発生しました</strong>' +
          '<div style="margin-top:6px;font-size:13px;color:#475569;">' + esc(msg) + '</div>' +
        '</div>' +
        '<button type="button" class="btn btn-secondary diag-footer-btn" onclick="runCommitDiagnosis()">再試行する</button>' +
        '<button type="button" class="btn diag-footer-btn" style="background:#e2e8f0;color:#334155;margin-top:8px;" onclick="closeCommitDiagnosisModal()">閉じる</button>';
    })
    .discardPendingTestCommitPlan(draftId);
}

function toggleDiagDetail(id){
  var elBox = el(id);
  if(!elBox) return;
  var isHidden = elBox.style.display === 'none';
  elBox.style.display = isHidden ? 'block' : 'none';
}
