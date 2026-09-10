// 運航下書きの状態遷移。表示の通知先はbootstrapから注入する。

var STATE = __INITIAL_STATE__;
var WORKFLOW_PORTS = null;
function configureWorkflowPorts(ports){ WORKFLOW_PORTS = ports; }

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

function pushDraftHistory(session){
  var history = Array.isArray(session.navigationHistory) ? session.navigationHistory.slice() : [];
  var snapshot = cloneData(session);
  delete snapshot.navigationHistory;
  history.push(snapshot);
  session.navigationHistory = history;
}

// 運航開始日は帳票と同じ日本時間。開始済み下書きの日付は変更しない。
function currentOperationDate(){
  var date = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return date.getUTCFullYear() + '.' + (date.getUTCMonth() + 1) + '.' + date.getUTCDate();
}

function localFlightAction(name, payload, onSuccess){
  payload = payload || {};
  var session = STATE && STATE.session;

  if(name === 'startAircraft'){
    var today = currentOperationDate();
    if(STATE.today !== today) STATE.hasTodaySheet = false;
    STATE.today = today;
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
    WORKFLOW_PORTS.notify('進行中の運航がありません。');
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
    if(!history.length){ WORKFLOW_PORTS.notify('これより前の画面はありません。'); return; }
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
  else WORKFLOW_PORTS.render();
}
