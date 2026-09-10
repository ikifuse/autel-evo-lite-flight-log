// 依存の注入と初回起動。必ずWebスクリプトの最後に結合する。

window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);

// 初回起動：進行中の運航下書き1件だけを端末から復元する。
configureDraftStorage({ getState:function(){ return STATE; } });
configureWorkflowPorts({ render:function(){ render(); }, notify:function(message){ alert(message); } });
configureScreenPorts({
  state:function(){ return STATE; },
  action:callServer,
  render:function(state){ if(state !== undefined) STATE = state; render(); },
  gps:fetchCurrentGps,
  diagnosis:openCommitDiagnosisModal,
  reset:confirmResetSession,
  cancel:cancelSessionPrompt
});
configureWebRoutes({
  start:renderStartView,
  phases:{
    PRE:renderPreView,
    PRE_ABNORMAL:renderPreAbnormalView,
    BATTERY_CHANGE:renderBatteryChangeView,
    READY:renderReadyView,
    FLYING:renderFlyingView,
    LANDING:renderLandingView,
    POST_ALL:renderPostView
  },
  fallback:renderAfterLandingView,
  capture:{
    PRE:captureFlightScreenDraft,
    BATTERY_CHANGE:captureFlightScreenDraft,
    READY:captureFlightScreenDraft,
    LANDING:captureFlightScreenDraft,
    POST_ALL:capturePostflightScreenDraft
  },
  beforeRender:stopFlightTimer
});
restoreOperationDraft();
updateNetworkStatus();
render();
