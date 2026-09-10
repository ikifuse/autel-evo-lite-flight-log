// ----------------------------------------------------
// 6. 飛行後点検画面（様式2：本日使った全機体をスマートに完了）
// ----------------------------------------------------
function renderPostView(div){
  var appDiv = div || el('app');
  var s = screenState().session;
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
      '<div style="text-align:center;margin-top:10px;">' +
        '<button type="button" class="diag-trigger-link" style="background:none;border:none;font-size:13px;" onclick="screenDiagnosis()">' +
          '⚠️ 保存が止まった・エラーが出る場合はこちら：保存状態を確認' +
        '</button>' +
      '</div>' +
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
  var s = screenState().session || {};
  var acs = s.aircrafts || {};
  var count = Object.keys(acs).length || 2;
  for(var m=0; m<count; m++){
    setPostChecksForModel(m, normal);
  }
}

function onAnyPostCheckChanged(){
  var s = screenState().session || {};
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

  var s = screenState().session;
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

  screenAction('finishAircraft', {
    inspectionLocation: postLocation,
    confirmer: confirmer,
    aircrafts: aircraftPayload,
    checks: aircraftPayload[s.model] ? aircraftPayload[s.model].checks : {}
  }, function(res){
    alert('運航記録をスプレッドシートへ保存しました。');
  });
}



// ----------------------------------------------------
// 補助関数
// ----------------------------------------------------


function capturePostflightScreenDraft(s){
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
