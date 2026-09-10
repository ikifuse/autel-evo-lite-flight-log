// 通信・状態遷移・画面の組立を担当するcontroller/router。

var WEB_ROUTES = null;

function configureWebRoutes(routes){ WEB_ROUTES = routes; }

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
  runServerRequest(name, arg, function(res){
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
    }, function(err){
      busy(false);
      var msg = err && err.message ? err.message : String(err);
      if(name === 'finishAircraft') alert('保存できませんでした。入力内容は端末に残っています。電波を確認して、もう一度保存してください。\n\n' + msg);
      else renderError(msg);
    });
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
  var capture = WEB_ROUTES.capture[s.phase];
  if(capture) capture(s);
  persistOperationDraft();
}

function render(){
  var appDiv = el('app');
  var badge = el('appStatusBadge');
  var backButton = el('globalBackButton');
  var hasActiveOperation = !!(STATE && STATE.active && STATE.session);

  // 運航の初期画面には「一つ前」が存在しないため表示しない。
  if(backButton){
    backButton.style.display = hasActiveOperation ? 'block' : 'none';
  }

  WEB_ROUTES.beforeRender();
  if(!STATE){
    badge.className = 'badge';
    badge.innerText = '接続中';
    appDiv.innerHTML = '<div class="card">接続中...</div>';
    return;
  }

  if(!STATE.active){
    badge.className = 'badge';
    badge.innerText = '待機中';
    WEB_ROUTES.start(appDiv);
  } else {
    badge.className = 'badge active';
    badge.innerText = '運航中';
    var phase = STATE.session.phase;
    var view = WEB_ROUTES.phases[phase] || WEB_ROUTES.fallback;
    view(appDiv);
  }
}

function cancelSessionPrompt(){
  if(confirm('現在の運航入力を取り消しますか？\n（入力中の内容は保存されません）')){
    callServer('cancelCurrentSession');
  }
}
