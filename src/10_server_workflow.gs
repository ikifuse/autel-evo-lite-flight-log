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

function encodedCellValue_(value) {
  if (value instanceof Date) return { __commitDate: value.toISOString() };
  return value == null ? '' : value;
}

function decodedCellValue_(value) {
  return value && typeof value === 'object' && value.__commitDate ? new Date(value.__commitDate) : value;
}

function canonicalValue_(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue_);
  if (value && typeof value === 'object') {
    const result = {};
    Object.keys(value).sort().forEach(function(key) { result[key] = canonicalValue_(value[key]); });
    return result;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('保存内容に不正な数値があります。');
  return value;
}

function canonicalJson_(value) { return JSON.stringify(canonicalValue_(value)); }

function sha256Text_(text) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(digest);
}

function sameCommitValue_(left, right) { return canonicalJson_(left) === canonicalJson_(right); }

function recordCommitCell_(range, value, kind) {
  const sheet = range.getSheet();
  const key = kind + '|' + sheet.getName() + '|' + range.getRow() + '|' + range.getColumn();
  let operation = COMMIT_WRITE_CAPTURE.byKey[key];
  if (!operation) {
    operation = {
      kind: kind,
      stage: COMMIT_WRITE_CAPTURE.stage,
      sheetName: sheet.getName(),
      row: range.getRow(),
      col: range.getColumn(),
      before: kind === 'format' ? range.getNumberFormat() : encodedCellValue_(range.getValue()),
      value: kind === 'format' ? String(value) : encodedCellValue_(value)
    };
    COMMIT_WRITE_CAPTURE.byKey[key] = operation;
    COMMIT_WRITE_CAPTURE.operations.push(operation);
  } else {
    operation.value = kind === 'format' ? String(value) : encodedCellValue_(value);
  }
}

function trackedSetValue_(range, value) {
  if (COMMIT_WRITE_CAPTURE) {
    recordCommitCell_(range, value, 'value');
    return range;
  }
  return range.setValue(value);
}

function trackedSetValues_(range, values) {
  if (COMMIT_WRITE_CAPTURE) {
    values.forEach(function(line, rowOffset) {
      line.forEach(function(value, colOffset) {
        recordCommitCell_(range.getSheet().getRange(range.getRow() + rowOffset, range.getColumn() + colOffset), value, 'value');
      });
    });
    return range;
  }
  return range.setValues(values);
}

function trackedSetNumberFormat_(range, format) {
  if (COMMIT_WRITE_CAPTURE) {
    recordCommitCell_(range, format, 'format');
    return range;
  }
  return range.setNumberFormat(format);
}
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
  try {
    lock.waitLock(20000);
  } catch (error) {
    throw new Error('別の保存処理を実行中です。20秒ほど待ってから、同じ運航記録をもう一度保存してください。');
  }
  LOCK_DEPTH++;
  try {
    return work();
  } finally {
    try { SpreadsheetApp.flush(); } finally { LOCK_DEPTH--; lock.releaseLock(); }
  }
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

function commitMetaKey_(draftId) { return COMMIT_V2_PREFIX + draftId + '_META'; }
function commitDataKey_(draftId, index) { return COMMIT_V2_PREFIX + draftId + '_DATA_' + index; }

function utf8Length_(text) { return unescape(encodeURIComponent(String(text))).length; }

function splitCommitChunks_(text) {
  const chunks = [];
  let current = '';
  Array.from(String(text)).forEach(function(character) {
    if (current && utf8Length_(current + character) > COMMIT_CHUNK_MAX_BYTES) {
      chunks.push(current);
      current = '';
    }
    current += character;
  });
  if (current || !chunks.length) chunks.push(current);
  return chunks;
}

function readCommitMeta_(draftId) {
  const raw = commitProperties_().getProperty(commitMetaKey_(draftId));
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch (error) { throw new Error('保存計画METAが破損しています。同じ運航記録を保持したまま管理者へ連絡してください。'); }
}

function writeCommitMeta_(meta) {
  meta.updatedAt = now_().toISOString();
  commitProperties_().setProperty(commitMetaKey_(meta.draftId), JSON.stringify(meta));
}

function storeCommitPlan_(plan, signature) {
  const text = canonicalJson_(plan);
  const chunks = splitCommitChunks_(text);
  const properties = commitProperties_();
  chunks.forEach(function(chunk, index) { properties.setProperty(commitDataKey_(plan.draftId, index), chunk); });
  const reread = chunks.map(function(_chunk, index) {
    const value = properties.getProperty(commitDataKey_(plan.draftId, index));
    if (value == null) throw new Error('保存計画DATAの永続化に失敗しました。');
    return value;
  }).join('');
  const planHash = sha256Text_(text);
  if (sha256Text_(reread) !== planHash) throw new Error('保存計画DATAの整合性確認に失敗しました。');
  const meta = {
    version: COMMIT_PLAN_VERSION,
    draftId: plan.draftId,
    signature: signature,
    state: 'pending',
    stage: 'PLAN_READY',
    chunkCount: chunks.length,
    planHash: planHash,
    createdAt: now_().toISOString(),
    updatedAt: now_().toISOString(),
    completedAt: '',
    lastErrorStage: '',
    resultHash: ''
  };
  writeCommitMeta_(meta);
  return { meta: meta, plan: plan };
}

function loadCommitPlan_(draftId, meta) {
  meta = meta || readCommitMeta_(draftId);
  if (!meta) return null;
  if (Number(meta.version) !== COMMIT_PLAN_VERSION) throw new Error('保存計画のバージョンを確認できません。');
  if (meta.state === 'complete' && !meta.chunkCount) return { meta: meta, plan: null };
  const chunks = [];
  for (let index = 0; index < Number(meta.chunkCount || 0); index++) {
    const value = commitProperties_().getProperty(commitDataKey_(draftId, index));
    if (value == null) throw new Error('保存計画DATAが不足しています。自動再保存せず管理者へ連絡してください。');
    chunks.push(value);
  }
  const text = chunks.join('');
  if (!text || sha256Text_(text) !== meta.planHash) {
    throw new Error('保存計画DATAのハッシュが一致しません。自動再保存せず管理者へ連絡してください。');
  }
  try { return { meta: meta, plan: JSON.parse(text) }; }
  catch (error) { throw new Error('保存計画DATAを読み込めません。自動再保存せず管理者へ連絡してください。'); }
}

function compactCompletePlan_(record, resultHash) {
  const properties = commitProperties_();
  record.meta.state = 'complete';
  record.meta.stage = 'COMPLETE';
  record.meta.completedAt = now_().toISOString();
  record.meta.resultHash = resultHash;
  // completeを先に確定する。以降で停止しても同じdraftIdは再書込みされない。
  writeCommitMeta_(record.meta);
  commitFault_('AFTER_COMPLETE_META');
  const chunkCount = Number(record.meta.chunkCount || 0);
  for (let index = 0; index < chunkCount; index++) {
    properties.deleteProperty(commitDataKey_(record.meta.draftId, index));
  }
  record.meta.chunkCount = 0;
  writeCommitMeta_(record.meta);
}

function safeCommitCacheGet_(key) {
  try { return key ? commitCache_().get(key) : ''; } catch (error) { return ''; }
}

function safeCommitCachePut_(key, value) {
  try { if (key) commitCache_().put(key, value, 21600); } catch (error) {}
}

function validateDraftId_(draftId) {
  required_(draftId, '運航下書きID');
  const text = String(draftId);
  const oldFormat = /^op_\d{10,17}$/;
  const uuidFormat = /^op_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const testFormat = /^test_[A-Za-z0-9_-]{1,80}$/;
  if (!oldFormat.test(text) && !uuidFormat.test(text) && !testFormat.test(text)) {
    throw new Error('運航下書きIDの形式を確認してください。');
  }
}

function normalizedCommitInput_(input) {
  const session = input && input.session;
  const postflight = input && input.postflight;
  if (!session || !postflight) throw new Error('確定する運航データがありません。');
  validateDraftId_(session.draftId);
  const aircrafts = {};
  Object.keys(session.aircrafts || {}).sort().forEach(function(model) {
    const aircraft = session.aircrafts[model] || {};
    aircrafts[model] = {
      model: model,
      used: !!aircraft.used,
      preflightChecks: aircraft.preflightChecks || {},
      preflightAbnormalDetail: aircraft.preflightAbnormalDetail || ''
    };
  });
  const postAircrafts = {};
  Object.keys(postflight.aircrafts || {}).sort().forEach(function(model) {
    const aircraft = postflight.aircrafts[model] || {};
    postAircrafts[model] = {
      checks: aircraft.checks || {},
      abnormal: !!aircraft.abnormal,
      defectLocation: aircraft.defectLocation || '',
      defectDetail: aircraft.defectDetail || '',
      actionDetail: aircraft.actionDetail || ''
    };
  });
  return canonicalValue_({
    session: {
      draftId: String(session.draftId),
      operationDate: session.operationDate || '',
      forceNewLocation: !!session.forceNewLocation,
      model: session.model || '',
      purpose: session.purpose || '',
      route: session.route || '',
      method: session.method || '',
      category: session.category || '',
      permitNo: session.permitNo || '',
      inspectionLocation: session.inspectionLocation || '',
      pilot: session.pilot || '',
      assistant: session.assistant || '',
      cert: session.cert || '',
      preflightAbnormalDetail: session.preflightAbnormalDetail || '',
      aircrafts: aircrafts,
      flights: (session.flights || []).map(function(flight, index) {
        return {
          model: flight.model || '', index: Number(flight.index || index + 1),
          battery: Number(flight.battery), cycle: flight.cycle || '',
          takeoffLocation: flight.takeoffLocation || '', landingLocation: flight.landingLocation || '',
          takeoffAt: flight.takeoffAt || '', landingAt: flight.landingAt || '',
          actualMinutes: Number(flight.actualMinutes), safetyIssue: !!flight.safetyIssue,
          safetyDetail: flight.safetyDetail || '', batteryNote: flight.batteryNote || ''
        };
      })
    },
    postflight: {
      inspectionLocation: postflight.inspectionLocation || '',
      confirmer: postflight.confirmer || '',
      checks: postflight.checks || {},
      aircrafts: postAircrafts
    }
  });
}

function commitSignatureV2_(normalizedInput) { return sha256Text_(canonicalJson_(normalizedInput)); }

function commitFault_(point) {
  if (typeof COMMIT_FAULT_INJECTOR === 'function') COMMIT_FAULT_INJECTOR(point);
}

function setCommitProgress_(record, state, stage) {
  record.meta.state = state;
  record.meta.stage = stage;
  record.meta.lastErrorStage = '';
  writeCommitMeta_(record.meta);
}

function failCommitProgress_(record, stage, error) {
  if (!record || !record.meta || record.meta.state === 'complete') return;
  try {
    record.meta.state = 'failed';
    record.meta.stage = stage;
    record.meta.lastErrorStage = stage;
    writeCommitMeta_(record.meta);
  } catch (ignored) {}
}

function operationCurrentValue_(operation) {
  const sheet = spreadsheet_().getSheetByName(operation.sheetName);
  if (!sheet) return { missingSheet: true };
  const range = sheet.getRange(operation.row, operation.col);
  return operation.kind === 'format' ? range.getNumberFormat() : encodedCellValue_(range.getValue());
}

function applyCommitOperations_(operations, verifyOnly, spreadsheet) {
  const ss = spreadsheet || spreadsheet_();
  (operations || []).forEach(function(operation, operationIndex) {
    const sheet = ss.getSheetByName(operation.sheetName);
    if (!sheet) throw new Error('固定保存先シートが見つかりません：' + operation.sheetName);
    const range = sheet.getRange(operation.row, operation.col);
    const current = operation.kind === 'format' ? range.getNumberFormat() : encodedCellValue_(range.getValue());
    if (sameCommitValue_(current, operation.value)) return;
    if (verifyOnly) throw new Error('保存後の読取確認に失敗しました：' + operation.sheetName + '!' + range.getA1Notation());
    if (!sameCommitValue_(current, operation.before)) {
      throw new Error('保存対象セルが保存開始後に変更されています：' + operation.sheetName + '!' + range.getA1Notation());
    }
    if (operation.kind === 'format') range.setNumberFormat(operation.value);
    else range.setValue(decodedCellValue_(operation.value));
    if (!verifyOnly) commitFault_('AFTER_' + String(operation.stage || 'WRITE').toUpperCase() + '_OP_' + operationIndex);
  });
}

function metadataMatches_(target, spreadsheet) {
  const sheet = (spreadsheet || spreadsheet_()).getSheetByName(target.sheetName);
  if (!sheet) return false;
  const range = sheet.getRange(target.row, 1, 1, 8);
  if (typeof range.getDeveloperMetadata !== 'function') return true;
  return range.getDeveloperMetadata().some(function(item) {
    return item.getKey() === BATTERY_COMMIT_METADATA_KEY && item.getValue() === target.commitId;
  });
}

function ensureBatteryMetadata_(target, spreadsheet) {
  const ss = spreadsheet || spreadsheet_();
  if (metadataMatches_(target, ss)) return;
  const sheet = ss.getSheetByName(target.sheetName);
  const range = sheet.getRange(target.row, 1, 1, 8);
  if (typeof range.addDeveloperMetadata === 'function') {
    range.addDeveloperMetadata(BATTERY_COMMIT_METADATA_KEY, target.commitId);
  }
}

function verifyCommitPlanResult_(plan, spreadsheet) {
  const ss = spreadsheet || spreadsheet_();
  ['date','battery','postflight','totals'].forEach(function(stage) {
    applyCommitOperations_(plan.operations[stage] || [], true, ss);
  });
  (plan.batteryTargets || []).forEach(function(target) {
    if (!metadataMatches_(target, ss)) throw new Error('BAT履歴の内部識別子を確認できません：' + target.sheetName + ' ' + target.row + '行');
  });
  return sha256Text_(canonicalJson_({ operations: plan.operations, batteryTargets: plan.batteryTargets }));
}

function cleanupCommitPlans_() {
  const properties = commitProperties_();
  const all = properties.getProperties();
  const nowMillis = now_().getTime();
  const completeLimit = COMMIT_COMPLETE_RETENTION_DAYS * 86400000;
  const staleLimit = COMMIT_STALE_DAYS * 86400000;
  const metaByDraft = {};
  Object.keys(all).forEach(function(key) {
    if (key.indexOf(COMMIT_V2_PREFIX) !== 0 || !/_META$/.test(key)) return;
    try {
      const meta = JSON.parse(all[key]);
      metaByDraft[meta.draftId] = meta;
      if (meta.state === 'complete' && Number(meta.chunkCount || 0) > 0) {
        for (let index = 0; index < Number(meta.chunkCount); index++) properties.deleteProperty(commitDataKey_(meta.draftId, index));
        meta.chunkCount = 0;
        writeCommitMeta_(meta);
      }
      if (meta.state === 'complete' && meta.completedAt && nowMillis - new Date(meta.completedAt).getTime() > completeLimit) {
        properties.deleteProperty(key);
      } else if (meta.state !== 'complete' && meta.updatedAt && nowMillis - new Date(meta.updatedAt).getTime() > staleLimit) {
        const record = loadCommitPlan_(meta.draftId, meta);
        const operations = [].concat(
          record.plan.operations.date || [], record.plan.operations.battery || [],
          record.plan.operations.postflight || [], record.plan.operations.totals || []
        );
        let intended = 0;
        let before = 0;
        let conflict = 0;
        operations.forEach(function(operation) {
          if (sameCommitValue_(operation.before, operation.value)) return;
          const current = operationCurrentValue_(operation);
          if (sameCommitValue_(current, operation.value)) intended++;
          else if (sameCommitValue_(current, operation.before)) before++;
          else conflict++;
        });
        const metadataOk = (record.plan.batteryTargets || []).every(metadataMatches_);
        if (!conflict && !before && metadataOk) {
          compactCompletePlan_(record, verifyCommitPlanResult_(record.plan));
        } else if (!conflict && !intended) {
          for (let index = 0; index < Number(meta.chunkCount || 0); index++) properties.deleteProperty(commitDataKey_(meta.draftId, index));
          properties.deleteProperty(key);
        } else {
          meta.state = 'failed';
          meta.stage = conflict ? 'STALE_CONFLICT' : 'STALE_PARTIAL';
          writeCommitMeta_(meta);
        }
      }
    } catch (ignored) {}
  });
  Object.keys(all).forEach(function(key) {
    const match = key.match(new RegExp('^' + COMMIT_V2_PREFIX + '(.+)_DATA_\\d+$'));
    if (match && !metaByDraft[match[1]]) properties.deleteProperty(key);
  });
}

function getCommitStorageStats_() {
  const all = commitProperties_().getProperties();
  const result = { propertyCount: 0, approximateBytes: 0, states: {} };
  Object.keys(all).forEach(function(key) {
    if (key.indexOf(COMMIT_V2_PREFIX) !== 0) return;
    result.propertyCount++;
    result.approximateBytes += utf8Length_(key) + utf8Length_(all[key]);
    if (/_META$/.test(key)) {
      try {
        const state = JSON.parse(all[key]).state || 'unknown';
        result.states[state] = Number(result.states[state] || 0) + 1;
      } catch (error) { result.states.corrupt = Number(result.states.corrupt || 0) + 1; }
    }
  });
  return result;
}

function finishAircraft(input) {
  const normalizedInput = normalizedCommitInput_(input);
  const session = normalizedInput.session;
  const signature = commitSignatureV2_(normalizedInput);

  return locked_(function() {
    cleanupCommitPlans_();
    let record = null;
    let currentStage = 'PLAN_READY';
    try {
      const existingMeta = readCommitMeta_(session.draftId);
      if (existingMeta) {
        if (existingMeta.signature !== signature) {
          throw new Error('同じ運航下書きIDで送信内容が変更されています。元の内容を保持したまま管理者へ連絡してください。');
        }
        if (existingMeta.state === 'complete') {
          const cacheKey = COMMIT_RESULT_PREFIX + session.draftId;
          const cached = safeCommitCacheGet_(cacheKey);
          if (cached) {
            try { return JSON.parse(cached); } catch (ignored) {}
          }
          return getAppState();
        }
        record = loadCommitPlan_(session.draftId, existingMeta);
      } else {
        const legacyRaw = commitProperties_().getProperty(COMMIT_PLAN_PREFIX + session.draftId);
        if (legacyRaw) {
          let legacyPlan;
          try { legacyPlan = JSON.parse(legacyRaw); } catch (error) {
            throw new Error('旧方式の保存計画を読み込めません。入力内容を保持したまま管理者へ連絡してください。');
          }
          if (legacyPlan.status === 'complete') return getAppState();
          throw new Error('旧方式で途中保存された運航記録があります。重複防止のため自動保存を停止しました。入力内容を保持したまま管理者へ連絡してください。');
        }
        const plan = buildFixedCommitPlan_(normalizedInput);
        record = storeCommitPlan_(plan, signature);
        commitFault_('AFTER_PLAN_PERSISTED');
      }

      setCommitProgress_(record, 'writing', record.meta.stage || 'PLAN_READY');
      const commitSpreadsheet = spreadsheet_();

      currentStage = 'DATE_RECORDS_WRITTEN';
      applyCommitOperations_(record.plan.operations.date, false, commitSpreadsheet);
      commitFault_('AFTER_DATE_RECORDS');
      SpreadsheetApp.flush();
      applyCommitOperations_(record.plan.operations.date, true, commitSpreadsheet);
      setCommitProgress_(record, 'writing', currentStage);

      currentStage = 'BAT_HISTORY_WRITTEN';
      record.plan.batteryTargets.forEach(function(target, index) {
        applyCommitOperations_(record.plan.operations.battery.filter(function(operation) {
          return operation.targetIndex === index;
        }), false, commitSpreadsheet);
        ensureBatteryMetadata_(target, commitSpreadsheet);
        commitFault_('AFTER_BAT_' + target.battery);
        commitFault_('AFTER_BAT_WRITE_BEFORE_PROGRESS');
      });
      SpreadsheetApp.flush();
      applyCommitOperations_(record.plan.operations.battery, true, commitSpreadsheet);
      record.plan.batteryTargets.forEach(function(target) {
        if (!metadataMatches_(target, commitSpreadsheet)) throw new Error('BAT履歴の内部識別子を確認できません。');
      });
      setCommitProgress_(record, 'writing', currentStage);

      currentStage = 'POSTFLIGHT_WRITTEN';
      applyCommitOperations_(record.plan.operations.postflight, false, commitSpreadsheet);
      commitFault_('AFTER_POSTFLIGHT');
      SpreadsheetApp.flush();
      applyCommitOperations_(record.plan.operations.postflight, true, commitSpreadsheet);
      setCommitProgress_(record, 'writing', currentStage);

      currentStage = 'AIRCRAFT_TOTALS_WRITTEN';
      record.plan.totalTargets.forEach(function(target, index) {
        applyCommitOperations_(record.plan.operations.totals.filter(function(operation) {
          return operation.model === target.model;
        }), false, commitSpreadsheet);
        if (index === 0 && record.plan.totalTargets.length > 1) commitFault_('BETWEEN_AIRCRAFT_TOTALS');
      });
      SpreadsheetApp.flush();
      applyCommitOperations_(record.plan.operations.totals, true, commitSpreadsheet);
      setCommitProgress_(record, 'writing', currentStage);

      currentStage = 'FINAL_FLUSH';
      commitFault_('BEFORE_FINAL_FLUSH');
      SpreadsheetApp.flush();
      const resultHash = verifyCommitPlanResult_(record.plan, commitSpreadsheet);
      record.meta.stage = 'VERIFIED';
      writeCommitMeta_(record.meta);
      commitFault_('BEFORE_COMPLETE');
      compactCompletePlan_(record, resultHash);

      const appState = getAppState();
      safeCommitCachePut_(COMMIT_RESULT_PREFIX + session.draftId, JSON.stringify(appState));
      commitFault_('AFTER_COMPLETE_BEFORE_RESPONSE');
      return appState;
    } catch (error) {
      failCommitProgress_(record, currentStage, error);
      throw error;
    }
  });
}

function finishAircraftLegacy_(input) {
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
