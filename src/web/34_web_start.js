// ----------------------------------------------------
// 1. 運航開始画面（トップ）
// ----------------------------------------------------
function renderStartView(div){
  var last = loadLastOperation() || {};
  var currentAssistant = STATE && STATE.session ? STATE.session.assistant || '' : '';

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
    var detail = METHOD_DETAILS[name] || '';
    var copyClass = detail ? 'method-copy method-copy-detailed' : 'method-copy';
    return '<label class="check-item"><input type="checkbox" id="method'+i+'"'+chk+' onchange="onMethodChanged('+i+')"><span class="'+copyClass+'"><span class="method-label">'+esc(name)+'</span>' +
      (detail ? '<span class="method-detail">'+esc(detail)+'</span>' : '') + '</span></label>';
  }).join('');

  div.innerHTML =
    sessionNoticeHtml +
    '<div class="card" id="startCard">' +
      '<div class="flex-between" style="margin-bottom:8px;">' +
        '<h2>本日の運航を開始</h2>' +
        '<button type="button" class="btn-outline" onclick="applyLastOperation()">🔄 前回と同じ条件で引用</button>' +
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
      '<div id="categoryAutoNotice" class="category-auto-notice" role="status" aria-live="polite"></div>' +

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
          '<select id="assistantSelect" onchange="onAssistantSelectionChanged()">' + assistantOptionsHtml(last.assistant || '', currentAssistant) + '</select>' +
          '<div id="assistantNewBox" class="assistant-new-box" style="display:none;">' +
            '<input type="text" id="assistantNew" placeholder="補助者氏名（任意）">' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<label>技能証明書番号</label>' +
      '<input type="text" id="cert" placeholder="未所持または技能証明番号" value="' + esc(last.cert || '') + '">' +
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

function showCategoryAutoNotice(){
  var notice = el('categoryAutoNotice');
  if(!notice) return;
  notice.textContent = '特定飛行を選択したため、カテゴリーⅡに変更しました';
  notice.classList.add('visible');
  if(CATEGORY_NOTICE_TIMER) clearTimeout(CATEGORY_NOTICE_TIMER);
  CATEGORY_NOTICE_TIMER = setTimeout(function(){
    var current = el('categoryAutoNotice');
    if(current) current.classList.remove('visible');
    CATEGORY_NOTICE_TIMER = null;
  }, 3000);
}

function checkPermitExpiry(){
  var badge = el('permitExpireBadge');
  if(!badge) return;
  var exp = val('permitExpire');
  var now = new Date();
  var today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
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
    showCategoryAutoNotice();
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
  var assistant = selectedAssistantName();

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
    assistant: assistant,
    cert: val('cert'),
    forceNewLocation: isChecked('forceNewLocation'),
    weather: val('weatherVal'),
    windSpeed: val('windSpeedVal'),
    windDir: val('windDirVal')
  };

  callServer('startAircraft', payload, function(res){
    saveLastOperation(payload);
    rememberAssistantName(payload.assistant);
    STATE = res;
    render();
  });
}

