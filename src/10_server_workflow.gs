// ============================================================================
// 2. サーバー側ロジック（全運航終了時のスプレッドシート一括書き込み）
// ============================================================================
function doGet() {
  const initialState = JSON.stringify(getAppState())
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return HtmlService.createHtmlOutput(
    APP_HTML
      .replace('__INITIAL_STATE__', initialState)
      .replace('__APP_VERSION__', APP_VERSION)
      .replace(/__APP_ICON__/g, APP_ICON_URL)
  )
    .setTitle('ドローン運航記録')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}

function spreadsheet_() { return SpreadsheetApp.openById(SPREADSHEET_ID); }
function now_() { return new Date(); }
function format_(value, pattern) { return Utilities.formatDate(new Date(value), TZ, pattern); }
function dateFromSheetName_(sheetName) {
  const match = String(sheetName || '').match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})(?:_\d+)?$/);
  if (!match) throw new Error('日付シート名を日付へ変換できません：' + sheetName);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}
function commitCache_() { return CacheService.getScriptCache(); }
function commitProperties_() { return PropertiesService.getScriptProperties(); }

function trackedSetValue_(range, value) { return range.setValue(value); }
function trackedSetValues_(range, values) { return range.setValues(values); }
function trackedSetNumberFormat_(range, format) { return range.setNumberFormat(format); }
function required_(value, label) {
  if (value == null || String(value).trim() === '') throw new Error(label + 'は必須です。');
}

function normalizeList_(value) {
  if (Array.isArray(value)) return value.map(String).map(item => item.trim()).filter(Boolean);
  return value == null || String(value).trim() === '' ? [] : [String(value).trim()];
}

function validateOperationSelection_(input) {
  if (FLIGHT_PURPOSES.indexOf(input.purpose) < 0) throw new Error('飛行目的を選択してください。');
  if (input.purpose === 'その他') required_(input.purposeOther, 'その他の飛行目的');

  const methods = normalizeList_(input.method);
  if (!methods.length) throw new Error('飛行禁止空域・飛行方法を1つ以上選択してください。');
  const allowedMethods = ['通常飛行（特定飛行なし）','屋内練習'].concat(SPECIAL_FLIGHT_METHODS);
  methods.forEach(method => {
    if (allowedMethods.indexOf(method) < 0) throw new Error('飛行禁止空域・飛行方法の選択を確認してください。');
  });

  const category = String(input.category || '');
  if (['カテゴリーⅠ','カテゴリーⅡ','カテゴリーⅢ'].indexOf(category) < 0) {
    throw new Error('飛行カテゴリーを選択してください。');
  }
  const special = methods.filter(method => SPECIAL_FLIGHT_METHODS.indexOf(method) >= 0);
  if (methods.indexOf('通常飛行（特定飛行なし）') >= 0 && methods.length > 1) {
    throw new Error('「通常飛行（特定飛行なし）」は他の飛行方法と同時に選択できません。');
  }
  if (methods.indexOf('屋内練習') >= 0 && methods.length > 1) {
    throw new Error('「屋内練習」は他の飛行方法と同時に選択できません。');
  }
  if (category === 'カテゴリーⅠ' && special.length) {
    throw new Error('特定飛行を選択した場合はカテゴリーⅡまたはⅢです。');
  }
  if ((category === 'カテゴリーⅡ' || category === 'カテゴリーⅢ') && !special.length) {
    throw new Error(category + 'には特定飛行の選択が必要です。');
  }
  return {
    purpose: input.purpose === 'その他' ? 'その他：' + String(input.purposeOther).trim() : input.purpose,
    methods: methods,
    category: category
  };
}

function locked_(work) {
  if (LOCK_DEPTH > 0) return work();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  LOCK_DEPTH++;
  try { return work(); } finally { LOCK_DEPTH--; lock.releaseLock(); }
}

function getAppState() {
  const today = format_(now_(), 'yyyy.M.d');
  const ss = spreadsheet_();
  const todaySheet = ss.getSheetByName(today);
  const totalLite = aircraftTotalMinutes_('EVO Lite');
  const totalLitePlus = aircraftTotalMinutes_('EVO Lite+');

  return {
    active: false,
    today: today,
    hasTodaySheet: !!todaySheet,
    batteries: Array.from({ length: 7 }, (_, index) => ({ value: index + 1, label: 'BAT_' + (index + 1) })),
    totals: {
      'EVO Lite': { minutes: totalLite, label: minutesLabel_(totalLite) },
      'EVO Lite+': { minutes: totalLitePlus, label: minutesLabel_(totalLitePlus) }
    },
    session: null
  };
}

function finishAircraft(input) {
  return locked_(function() {
    const session = input && input.session;
    const postflight = input && input.postflight;
    if (!session || !postflight) throw new Error('確定する運航データがありません。');
    const commitKey = session.draftId ? COMMIT_RESULT_PREFIX + session.draftId : '';
    const previousResult = commitKey ? commitCache_().get(commitKey) : '';
    if (previousResult) return JSON.parse(previousResult);
    const planKey = session.draftId ? COMMIT_PLAN_PREFIX + session.draftId : '';
    const previousPlan = planKey ? commitProperties_().getProperty(planKey) : '';
    if (previousPlan && JSON.parse(previousPlan).status === 'complete') return getAppState();
    required_(session.draftId, '運航下書きID');
    required_(session.model, '機体');
    required_(session.route, '飛行経路・場所');
    required_(session.pilot, '操縦者');
    required_(postflight.inspectionLocation, '飛行後の点検実施場所');
    required_(postflight.confirmer, '飛行後の点検確認者');

    const ss = spreadsheet_();
    const operationDate = session.operationDate
      ? dateFromSheetName_(session.operationDate)
      : now_();
    const usedModels = Object.keys(session.aircrafts || {}).filter(function(model) {
      return session.aircrafts[model] && session.aircrafts[model].used;
    });
    const modelsToProcess = usedModels.length ? usedModels : [session.model];
    if (modelsToProcess.length > 2) throw new Error('1回の運航で記録できる機体は2機までです。');
    modelsToProcess.forEach(function(model) {
      const ac = session.aircrafts && session.aircrafts[model];
      const missingPre = PRE_CHECK_NAMES.filter(function(name) {
        return !ac || !ac.preflightChecks || !ac.preflightChecks[name];
      });
      if (missingPre.length) throw new Error(model + 'の飛行前点検が未完了です。');
      const post = postflight.aircrafts && postflight.aircrafts[model];
      const missingPost = POST_CHECK_NAMES.filter(function(name) {
        return !post || !post.checks || !post.checks[name];
      });
      if (missingPost.length) throw new Error(model + 'の飛行後点検が未完了です。');
    });
    (session.flights || []).forEach(function(flight) {
      if (!MODELS[flight.model]) throw new Error('飛行記録の機体を確認してください。');
      if (!Number.isInteger(Number(flight.battery)) || Number(flight.battery) < 1 || Number(flight.battery) > 7) {
        throw new Error('飛行記録のバッテリーを確認してください。');
      }
      required_(flight.takeoffLocation, '離陸場所');
      required_(flight.landingLocation, '着陸場所');
      required_(flight.takeoffAt, '離陸時刻');
      required_(flight.landingAt, '着陸時刻');
      const minutes = Number(flight.actualMinutes);
      if (!Number.isFinite(minutes) || minutes <= 0) throw new Error('実飛行時間を確認してください。');
    });

    const commitSignature = commitSignature_(session);
    let commitPlan;
    if (previousPlan) {
      commitPlan = JSON.parse(previousPlan);
      if (commitPlan.signature !== commitSignature) {
        throw new Error('保存再試行時の運航内容が最初の送信内容と一致しません。新しい運航として保存してください。');
      }
    } else {
      const startingByModel = {};
      const finalByModel = {};
      modelsToProcess.forEach(function(model) {
        startingByModel[model] = aircraftTotalMinutes_(model);
        finalByModel[model] = startingByModel[model];
      });
      (session.flights || []).forEach(function(flight) {
        finalByModel[flight.model] += Number(flight.actualMinutes);
      });
      commitPlan = {
        status: 'pending',
        signature: commitSignature,
        startingByModel: startingByModel,
        finalByModel: finalByModel
      };
      commitProperties_().setProperty(planKey, JSON.stringify(commitPlan));
    }

    let sheet = getOrCreateDateSheet_(ss, operationDate, !!session.forceNewLocation);

    const aircraftDataMap = postflight.aircrafts || {};
    const blockAssignments = [];
    modelsToProcess.forEach(function(model) {
      const modelFlights = (session.flights || []).filter(function(flight) { return flight.model === model; });
      const chunks = [];
      for (let index = 0; index < modelFlights.length; index += 7) {
        chunks.push(modelFlights.slice(index, index + 7));
      }
      if (!chunks.length) chunks.push([]);

      chunks.forEach(function(flights) {
        let blockNo = chooseAvailableBlock_(sheet);
        if (!blockNo) {
          const sequenceMatch = sheet.getName().match(/_(\d+)$/);
          const nextSequence = (sequenceMatch ? Number(sequenceMatch[1]) : 1) + 1;
          sheet = getOrCreateDateSheet_(ss, operationDate, false, nextSequence);
          blockNo = chooseAvailableBlock_(sheet);
        }
        if (!blockNo) throw new Error('運航記録を書き込める空き枠がありません。');

        const modelSession = Object.assign({}, session, {
          model: model,
          dateSheet: sheet.getName(),
          blockNo: blockNo
        });
        writeHeaderFields_(sheet, modelSession, blockNo);
        const ac = session.aircrafts && session.aircrafts[model];
        writeCheckResults_(sheet, (ac && ac.preflightChecks) || {}, '飛行前点検', blockNo);
        blockAssignments.push({ model: model, flights: flights, sheet: sheet, blockNo: blockNo });
      });
    });

    const cumulativeByModel = {};
    modelsToProcess.forEach(function(model) { cumulativeByModel[model] = commitPlan.startingByModel[model]; });
    const flightTargetByFlight = new Map();

    // 通信は最後に1回だけ行うが、日付シートには各飛行を使用した分だけ1行ずつ残す。
    // 同じ内容をBAT管理シートにも個別保存し、飛行記録とバッテリー履歴を両立する。
    blockAssignments.forEach(function(assignment) {
      const block = flightBlocks_(assignment.sheet).filter(function(item) {
        return item.blockNo === assignment.blockNo;
      })[0];
      assignment.flights.forEach(function(flight, index) {
        const model = assignment.model;
        const minutes = Number(flight.actualMinutes);
        cumulativeByModel[model] += minutes;
        writeFlightFields_(assignment.sheet, { blockNo: assignment.blockNo, row: block.startRow + index }, {
          '使用バッテリー': 'BAT_' + Number(flight.battery),
          '離陸場所': flight.takeoffLocation,
          '着陸場所': flight.landingLocation,
          '離陸時刻': format_(flight.takeoffAt, 'HH:mm'),
          '着陸時刻': format_(flight.landingAt, 'HH:mm'),
          '飛行時間': formatHoursMinutes_(minutes),
          '総飛行時間': formatHoursMinutes_(cumulativeByModel[model]),
          '安全に影響した事項': flight.safetyIssue ? (flight.safetyDetail || 'あり') : 'なし',
          'バッテリー異常・所感': flight.batteryNote || ''
        });
        flightTargetByFlight.set(flight, assignment.sheet.getName());
      });
    });

    // BAT履歴は、機体別ブロックへの割当後も実際の飛行順を維持して各飛行1件だけ記録する。
    (session.flights || []).forEach(function(flight) {
      appendBatteryHistory_({
        dateSheet: flightTargetByFlight.get(flight), model: flight.model, purpose: session.purpose,
        route: session.route, currentBattery: Number(flight.battery)
      }, Number(flight.actualMinutes) || 0, { cycle: flight.cycle || '', batteryNote: flight.batteryNote || '' });
    });

    blockAssignments.forEach(function(assignment) {
      const acInput = aircraftDataMap[assignment.model] || postflight;
      const checks = acInput.checks || postflight.checks || {};
      const abnormal = POST_CHECK_NAMES.some(function(name) { return checks[name] !== '正常'; });

      writeCheckResults_(assignment.sheet, checks, '飛行後点検', assignment.blockNo);
      writeOptionalFields_(assignment.sheet, {
        inspectionLocation: postflight.inspectionLocation || session.inspectionLocation,
        defectLocation: acInput.defectLocation || '',
        defectDetail: acInput.defectDetail || '',
        actionDetail: acInput.actionDetail || '',
        confirmer: postflight.confirmer || session.pilot
      }, assignment.blockNo, abnormal);
    });

    applyAircraftTotals_(commitPlan);
    commitPlan.status = 'complete';
    commitProperties_().setProperty(planKey, JSON.stringify(commitPlan));
    const appState = getAppState();
    if (commitKey) commitCache_().put(commitKey, JSON.stringify(appState), 21600);
    return appState;
  });
}
