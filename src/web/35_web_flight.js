var TIMER_INTERVAL = null;

// ----------------------------------------------------
// セッションヘッダー
// ----------------------------------------------------


// ----------------------------------------------------
// 2. 飛行前点検画面（様式2）
// ----------------------------------------------------
function renderPreView(div){
  var s = screenState().session;
  var savedChecks = (s && s.preflightChecks) || {};
  var batteryOptions = '<option value="">装着しているBATを選択</option>' + screenState().batteries.map(function(b){
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
  var savedAbnormalDetail = (screenState().session && screenState().session.preflightAbnormalDetail) || '';

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
      '<button class="btn btn-danger btn-sm" style="margin-top:12px;" onclick="screenCancel()">この運航入力を中止</button>' +
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

  screenAction('savePreflight', {
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
      '<button class="btn btn-danger btn-sm" style="margin-top:12px;" onclick="screenCancel()">この運航を終了する</button>' +
    '</div>';
}

// ----------------------------------------------------
// 3. バッテリー交換確認／飛行開始待機画面（離陸前）
// ----------------------------------------------------
function renderBatteryChangeView(div){
  var s = screenState().session;
  var previousInput = s.pendingBatteryChangeInput || {};
  var batteryOptions = '<option value="">交換後のBATを選択</option>' + screenState().batteries.map(function(b){
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
  screenAction('confirmBatteryChange', {
    battery:battery, cycle:val('changeBatteryCycle'), installed:true, statusOk:true
  });
}

function renderReadyView(div){
  var s = screenState().session;
  var previousInput = s.pendingFlightInput || {};

  div.innerHTML = sessionHeaderHtml() +
    '<div class="card" id="readyCard">' +
      '<h2>飛行開始待機（第' + (s.flightIndex + 1) + '飛行）</h2>' +
      '<div class="status-box">離陸前確認完了：適合（安全飛行可能）</div>' +

      '<div class="status-box">使用バッテリー：<strong>BAT_' + esc(s.selectedBattery) + '</strong>' +
        (s.selectedBatteryCycle !== '' ? ' ｜ サイクル数：<strong>' + esc(s.selectedBatteryCycle) + '</strong>' : '') + '</div>' +

      '<div class="flex-between">' +
        '<label>離陸場所<span class="required">*</span></label>' +
        '<button type="button" class="btn-outline" onclick="screenGps(\'takeoffLocation\', null)">📍 GPSで現在地更新（任意）</button>' +
      '</div>' +
      '<input type="text" id="takeoffLocation" value="' + esc(previousInput.takeoffLocation || s.route) + '">' +

      '<button class="btn btn-success" style="font-size:18px;padding:14px;margin-top:14px;" onclick="submitStartFlight()">🛫 離陸開始</button>' +
      '<div class="flex-row" style="margin-top:10px;">' +
        '<button type="button" class="btn btn-secondary btn-sm" onclick="onSwitchAircraftClick(\'' + esc(s.model === 'EVO Lite' ? 'EVO Lite+' : 'EVO Lite') + '\')">🔄 機体を交代する（' + esc(s.model === 'EVO Lite' ? 'EVO Lite+' : 'EVO Lite') + 'へ）</button>' +
        '<button type="button" class="btn btn-secondary btn-sm" onclick="screenAction(\'startPostflight\')">🏁 飛行せず終了（飛行後点検へ）</button>' +
      '</div>' +
      '<button class="btn btn-danger btn-sm" style="margin-top:14px;" onclick="screenCancel()">この運航入力を中止</button>' +
    '</div>';
}

function submitStartFlight(){
  clearFormErrors('readyCard');
  var errors = [];

  var battery = Number(screenState().session.selectedBattery || 0);
  if(!battery) errors.push({ id: '', label: '使用バッテリー', message: '一つ前の画面に戻り、使用バッテリーを確認してください。' });

  var takeoffLocation = val('takeoffLocation');
  if(!takeoffLocation) errors.push({ id: 'takeoffLocation', label: '離陸場所', message: '離陸場所を入力してください。' });

  if(errors.length > 0){
    showFormErrors('readyCard', errors);
    return;
  }

  screenAction('startFlight', {
    battery: battery,
    takeoffLocation: takeoffLocation
  });
}

// ----------------------------------------------------
// 4. 飛行中画面（操縦に集中）／着陸後入力画面
// ----------------------------------------------------
function renderFlyingView(div){
  var s = screenState().session;
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
      '<button class="btn btn-warning" style="font-size:18px;padding:16px;margin-top:16px;" onclick="screenAction(\'completeLanding\')">🛬 着陸完了（プロペラ停止後）</button>' +
    '</div>';

  updateTimerDisplay(startTime);
  TIMER_INTERVAL = setInterval(function(){ updateTimerDisplay(startTime); }, 1000);
}

function renderLandingView(div){
  var s = screenState().session;
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
        '<button type="button" class="btn-outline" onclick="screenGps(\'landingLocation\', null)">📍 GPSで現在地取得（任意）</button>' +
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

  screenAction('landFlight', {
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
  var s = screenState().session;
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

      '<button class="btn btn-primary" style="font-size:18px;padding:15px;" onclick="screenAction(\'continueFlight\')">🔋 同じ機体で続ける（バッテリー交換）</button>' +
      '<div class="text-sm" style="margin:5px 0 0;color:#64748b;">' + esc(s.model) + ' の第' + (s.flightIndex + 1) + '飛行へ進みます。</div>' +

      '<button class="btn btn-secondary" style="margin-top:14px;font-size:15px;padding:12px;" onclick="onSwitchAircraftClick(\'' + esc(otherModel) + '\')">🔄 機体を交代する（' + esc(otherModel) + '）' + otherBadge + '</button>' +

      '<div style="margin-top:20px;padding-top:14px;border-top:1px solid #cbd5e1;">' +
        '<div class="text-sm" style="margin-bottom:6px;color:#475569;">本日の飛行を終える場合</div>' +
        '<button class="btn btn-secondary" style="font-size:15px;padding:12px;" onclick="screenAction(\'startPostflight\')">🏁 全飛行を終了して飛行後点検へ</button>' +
      '</div>' +
    '</div>';
}

function onSwitchAircraftClick(targetModel){
  screenAction('switchAircraft', { targetModel: targetModel });
}


function captureFlightScreenDraft(s){
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
  }
}

function stopFlightTimer(){
  if(TIMER_INTERVAL){ clearInterval(TIMER_INTERVAL); TIMER_INTERVAL = null; }
}
