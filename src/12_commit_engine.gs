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

function normalizeCommitFormatValue_(val, kind) {
  const str = (val == null) ? '' : String(val).trim();
  if (kind === 'horizontalAlignment') {
    const lower = str.toLowerCase();
    if (lower === 'general' || lower === 'general-left' || lower === 'general-right' || lower === '' || lower === 'null') {
      return 'general';
    }
    return lower;
  }
  if (kind === 'verticalAlignment') {
    const lower = str.toLowerCase();
    if (lower === 'general' || lower === '' || lower === 'null') {
      return 'bottom';
    }
    return lower;
  }
  return str;
}

function sameCommitValue_(left, right, kind) {
  if (kind === 'horizontalAlignment' || kind === 'verticalAlignment') {
    return normalizeCommitFormatValue_(left, kind) === normalizeCommitFormatValue_(right, kind);
  }
  return canonicalJson_(left) === canonicalJson_(right);
}

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
      before: commitRangeProperty_(range, kind),
      value: commitOperationValue_(value, kind)
    };
    COMMIT_WRITE_CAPTURE.byKey[key] = operation;
    COMMIT_WRITE_CAPTURE.operations.push(operation);
  } else {
    operation.value = commitOperationValue_(value, kind);
  }
}

function commitRangeProperty_(range, kind) {
  if (kind === 'format') return range.getNumberFormat();
  if (kind === 'fontSize') return range.getFontSize();
  if (kind === 'horizontalAlignment') return range.getHorizontalAlignment();
  if (kind === 'verticalAlignment') return range.getVerticalAlignment();
  if (kind === 'wrap') return range.getWrap();
  return encodedCellValue_(range.getValue());
}

function commitOperationValue_(value, kind) {
  if (['format','horizontalAlignment','verticalAlignment'].indexOf(kind) >= 0) return String(value);
  if (kind === 'fontSize') return Number(value);
  if (kind === 'wrap') return !!value;
  return encodedCellValue_(value);
}

function trackedSetValue_(range, value) {
  if (COMMIT_WRITE_CAPTURE) {
    recordCommitCell_(range, value, 'value');
    return range;
  }
  return range.setValue(value);
}

function isFormulaLikeUserText_(value) {
  return /^[\u0000-\u0020]*[=+\-@]/.test(String(value == null ? '' : value));
}

function richTextValue_(value) {
  return SpreadsheetApp.newRichTextValue().setText(String(value == null ? '' : value)).build();
}

function trackedSetUserText_(range, value) {
  const text = String(value == null ? '' : value);
  if (!isFormulaLikeUserText_(text)) return trackedSetValue_(range, text);
  if (COMMIT_WRITE_CAPTURE) {
    recordCommitCell_(range, text, 'text');
    return range;
  }
  return range.setRichTextValue(richTextValue_(text));
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

function trackedSetFontSize_(range, size) {
  if (COMMIT_WRITE_CAPTURE) {
    recordCommitCell_(range, size, 'fontSize');
    return range;
  }
  return range.setFontSize(size);
}

function trackedSetHorizontalAlignment_(range, alignment) {
  if (COMMIT_WRITE_CAPTURE) {
    recordCommitCell_(range, alignment, 'horizontalAlignment');
    return range;
  }
  return range.setHorizontalAlignment(alignment);
}

function trackedSetVerticalAlignment_(range, alignment) {
  if (COMMIT_WRITE_CAPTURE) {
    recordCommitCell_(range, alignment, 'verticalAlignment');
    return range;
  }
  return range.setVerticalAlignment(alignment);
}

function trackedSetWrap_(range, wrap) {
  if (COMMIT_WRITE_CAPTURE) {
    recordCommitCell_(range, wrap, 'wrap');
    return range;
  }
  return range.setWrap(wrap);
}

function commitMetaKey_(draftId) { return COMMIT_V2_PREFIX + draftId + '_META'; }

function commitDataKey_(draftId, index) { return COMMIT_V2_PREFIX + draftId + '_DATA_' + index; }

function propertyStorageBytes_() {
  const all = commitProperties_().getProperties();
  return Object.keys(all).reduce(function(total, key) {
    return total + utf8Length_(key) + utf8Length_(all[key]);
  }, 0);
}

function estimatedCommitPlanBytes_(input) {
  const flights = (input.session && input.session.flights) || [];
  const usedModels = Object.keys((input.session && input.session.aircrafts) || {}).filter(function(model) {
    return input.session.aircrafts[model] && input.session.aircrafts[model].used;
  });
  const assignments = usedModels.reduce(function(total, model) {
    const count = flights.filter(function(flight) { return flight.model === model; }).length;
    return total + Math.max(1, Math.ceil(count / 7));
  }, 0);
  return utf8Length_(canonicalJson_(input)) * 4 + flights.length * 4000 + assignments * 12000 + 20000;
}

function ensureCommitPlanCapacity_(input) {
  const estimated = estimatedCommitPlanBytes_(input);
  if (estimated > SECURITY_MAX_COMMIT_PLAN_BYTES) throw new Error('保存計画の容量が上限を超えています。');
  if (propertyStorageBytes_() + estimated > SECURITY_MAX_PROPERTY_STORE_BYTES) {
    throw new Error('保存用領域の空き容量が不足しています。古い保存計画を整理してから再試行してください。');
  }
}

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
  if (utf8Length_(text) > SECURITY_MAX_COMMIT_PLAN_BYTES || chunks.length > SECURITY_MAX_COMMIT_CHUNKS) {
    throw new Error('保存計画の容量が上限を超えています。');
  }
  const properties = commitProperties_();
  const additionalBytes = chunks.reduce(function(total, chunk, index) {
    return total + utf8Length_(commitDataKey_(plan.draftId, index)) + utf8Length_(chunk);
  }, 0) + utf8Length_(commitMetaKey_(plan.draftId)) + 2000;
  if (propertyStorageBytes_() + additionalBytes > SECURITY_MAX_PROPERTY_STORE_BYTES) {
    throw new Error('保存用領域の空き容量が不足しています。古い保存計画を整理してから再試行してください。');
  }
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
  return commitRangeProperty_(range, operation.kind);
}

function applyCommitOperations_(operations, verifyOnly, spreadsheet) {
  const ss = spreadsheet || spreadsheet_();
  (operations || []).forEach(function(operation, operationIndex) {
    const sheet = ss.getSheetByName(operation.sheetName);
    if (!sheet) throw new Error('固定保存先シートが見つかりません：' + operation.sheetName);
    const range = sheet.getRange(operation.row, operation.col);
    const current = commitRangeProperty_(range, operation.kind);
    if (sameCommitValue_(current, operation.value, operation.kind)) return;
    if (verifyOnly) throw new Error('保存後の読取確認に失敗しました：' + operation.sheetName + '!' + range.getA1Notation());
    if (!sameCommitValue_(current, operation.before, operation.kind)) {
      throw new Error('保存対象セルが保存開始後に変更されています：' + operation.sheetName + '!' + range.getA1Notation());
    }
    if (operation.kind === 'format') range.setNumberFormat(operation.value);
    else if (operation.kind === 'fontSize') range.setFontSize(operation.value);
    else if (operation.kind === 'horizontalAlignment') range.setHorizontalAlignment(operation.value);
    else if (operation.kind === 'verticalAlignment') range.setVerticalAlignment(operation.value);
    else if (operation.kind === 'wrap') range.setWrap(operation.value);
    else if (operation.kind === 'text') range.setRichTextValue(richTextValue_(decodedCellValue_(operation.value)));
    else range.setValue(decodedCellValue_(operation.value));
    if (!verifyOnly) commitFault_('AFTER_' + String(operation.stage || 'WRITE').toUpperCase() + '_OP_' + operationIndex);
  });
}

function dateOwnershipValue_(assignment, draftId) {
  return String(draftId) + '|block=' + Number(assignment.blockNo);
}

function dateOwnershipParts_(value) {
  const match = String(value || '').match(/^(op_[0-9a-f-]+)\|block=([12])$/i);
  return match ? { draftId: match[1], blockNo: Number(match[2]) } : null;
}

function dateMetadataForBlock_(assignment, spreadsheet) {
  const ss = spreadsheet || spreadsheet_();
  const sheet = ss.getSheetByName(assignment.sheetName);
  if (!sheet) return [];
  if (typeof sheet.getDeveloperMetadata !== 'function') {
    throw new Error('日付シートのDeveloper Metadataを読み取れません：' + assignment.sheetName);
  }
  const suffix = '|block=' + Number(assignment.blockNo);
  return sheet.getDeveloperMetadata().filter(function(item) {
    if (item.getKey() !== DATE_COMMIT_METADATA_KEY) return false;
    const value = String(item.getValue() || '');
    // ブロック番号を持たない旧・不明形式は、安全側に倒して当該ブロック候補として扱う。
    return value.indexOf('|block=') < 0 || value.slice(-suffix.length) === suffix;
  });
}

function dateMetadataMatches_(assignment, spreadsheet, draftId) {
  const expected = dateOwnershipValue_(assignment, draftId);
  return dateMetadataForBlock_(assignment, spreadsheet).some(function(item) {
    return item.getValue() === expected;
  });
}

function dateMetadataConflict_(assignment, spreadsheet, draftId, properties) {
  const props = properties || commitProperties_();
  return dateMetadataForBlock_(assignment, spreadsheet).some(function(item) {
    const parts = dateOwnershipParts_(item.getValue());
    if (!parts) return true;
    if (parts.draftId === draftId) return false;
    const raw = props.getProperty(commitMetaKey_(parts.draftId));
    if (!raw) return false;
    try { return JSON.parse(raw).state !== 'complete'; }
    catch (error) { return true; }
  });
}

function ensureDateMetadata_(assignment, spreadsheet, draftId) {
  const ss = spreadsheet || spreadsheet_();
  if (dateMetadataMatches_(assignment, ss, draftId)) return;
  const sheet = ss.getSheetByName(assignment.sheetName);
  if (!sheet) throw new Error('固定保存先シートが見つかりません：' + assignment.sheetName);
  if (dateMetadataConflict_(assignment, ss, draftId)) {
    throw new Error('日付シートのNo.' + assignment.blockNo + 'に別の保存計画の識別子があります：' + assignment.sheetName);
  }
  if (typeof sheet.addDeveloperMetadata !== 'function') {
    throw new Error('日付シートへDeveloper Metadataを追加できません：' + assignment.sheetName);
  }
  // GASが公式に対応するSheet-level metadataを使用する。
  // 所属シート + value内のblock番号でNo.1/No.2を一意に識別する。
  sheet.addDeveloperMetadata(DATE_COMMIT_METADATA_KEY, dateOwnershipValue_(assignment, draftId));
}

function batteryMetadataRange_(target, spreadsheet) {
  const sheet = (spreadsheet || spreadsheet_()).getSheetByName(target.sheetName);
  if (!sheet) return null;
  const cell = sheet.getRange(target.row, 1);
  if (typeof cell.getEntireRow !== 'function') {
    throw new Error('BAT履歴行全体を取得できません：' + target.sheetName + ' ' + target.row + '行');
  }
  return cell.getEntireRow();
}

function metadataMatches_(target, spreadsheet) {
  const range = batteryMetadataRange_(target, spreadsheet);
  if (!range) return false;
  if (typeof range.getDeveloperMetadata !== 'function') {
    throw new Error('BAT履歴のDeveloper Metadataを読み取れません：' + target.sheetName + ' ' + target.row + '行');
  }
  return range.getDeveloperMetadata().some(function(item) {
    return item.getKey() === BATTERY_COMMIT_METADATA_KEY && item.getValue() === target.commitId;
  });
}

function ensureBatteryMetadata_(target, spreadsheet) {
  const ss = spreadsheet || spreadsheet_();
  if (metadataMatches_(target, ss)) return;
  const range = batteryMetadataRange_(target, ss);
  if (!range) throw new Error('BAT履歴シートが見つかりません：' + target.sheetName);
  if (typeof range.addDeveloperMetadata !== 'function') {
    throw new Error('BAT履歴行へDeveloper Metadataを追加できません：' + target.sheetName + ' ' + target.row + '行');
  }
  // GASが公式に対応するentire-row metadataを使用する。A:Hの部分Rangeには付与しない。
  range.addDeveloperMetadata(BATTERY_COMMIT_METADATA_KEY, target.commitId);
}

function verifyCommitPlanResult_(plan, spreadsheet) {
  const ss = spreadsheet || spreadsheet_();
  ['date','battery','postflight','totals'].forEach(function(stage) {
    applyCommitOperations_(plan.operations[stage] || [], true, ss);
  });
  (plan.batteryTargets || []).forEach(function(target) {
    if (!metadataMatches_(target, ss)) throw new Error('BAT履歴の内部識別子を確認できません：' + target.sheetName + ' ' + target.row + '行');
  });
  (plan.assignments || []).forEach(function(assignment) {
    if (!dateMetadataMatches_(assignment, ss, plan.draftId)) {
      throw new Error('日付シートの内部識別子を確認できません：' + assignment.sheetName + ' No.' + assignment.blockNo);
    }
  });
  return sha256Text_(canonicalJson_({ operations: plan.operations, batteryTargets: plan.batteryTargets, assignments: plan.assignments }));
}

function cleanupCommitPlans_() {
  const properties = commitProperties_();
  const all = properties.getProperties();
  const nowMillis = now_().getTime();
  const completeLimit = COMMIT_COMPLETE_RETENTION_DAYS * 86400000;
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
      }
      // 未完了保存計画（meta.state !== 'complete'）は日数で勝手に削除・変更しない。
      // Web画面上の診断（diagnosePendingCommitPlans）と復旧/安全破棄操作で管理する。
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
  assertInputComplexity_(input, {
    maxBytes: SECURITY_MAX_RAW_INPUT_BYTES,
    maxProperties: SECURITY_MAX_RAW_PROPERTIES,
    maxDepth: SECURITY_MAX_OBJECT_DEPTH,
    maxArrayItems: SECURITY_MAX_ARRAY_ITEMS
  }, '送信データ');
  const normalizedInput = normalizedCommitInput_(input);
  assertInputComplexity_(normalizedInput, {
    maxBytes: SECURITY_MAX_NORMALIZED_INPUT_BYTES,
    maxProperties: SECURITY_MAX_NORMALIZED_PROPERTIES,
    maxDepth: SECURITY_MAX_OBJECT_DEPTH,
    maxArrayItems: SECURITY_MAX_ARRAY_ITEMS
  }, '保存データ');
  validateCommitBusinessInput_(normalizedInput);
  const session = normalizedInput.session;
  const signature = commitSignatureV2_(normalizedInput);

  return locked_(function() {
    let record = null;
    let currentStage = 'PLAN_READY';
    try {
      cleanupCommitPlans_();
      let existingMeta = readCommitMeta_(session.draftId);
      if (!existingMeta) ensureCommitPlanCapacity_(normalizedInput);
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
        // 新規保存の前に、過去の未完了draftを時系列順に直前再診断しながら自動解決（TEST安全残骸の自動整理 / 本番の安全自動復旧）
        resolvePendingCommitPlansBeforeSave_(session.draftId, spreadsheet_(), commitProperties_());

        const plan = buildFixedCommitPlan_(normalizedInput);
        record = storeCommitPlan_(plan, signature);
        commitFault_('AFTER_PLAN_PERSISTED');
      }

      return executeCommitPlanRollForward_(record, spreadsheet_());
    } catch (error) {
      if (record && record.meta.state !== 'complete') {
        failCommitProgress_(record, record.meta.stage || 'PLAN_READY', error);
      }
      throw error;
    }
  });
}

function executeCommitPlanRollForward_(record, commitSpreadsheet) {
  let currentStage = record.meta.stage || 'PLAN_READY';
  try {
    setCommitProgress_(record, 'writing', currentStage);
    const ss = commitSpreadsheet || spreadsheet_();

    currentStage = 'DATE_RECORDS_WRITTEN';
    applyCommitOperations_(record.plan.operations.date, false, ss);
    commitFault_('AFTER_DATE_RECORDS');
    SpreadsheetApp.flush();
    applyCommitOperations_(record.plan.operations.date, true, ss);
    (record.plan.assignments || []).forEach(function(assignment) {
      ensureDateMetadata_(assignment, ss, record.meta.draftId);
    });
    setCommitProgress_(record, 'writing', currentStage);

    currentStage = 'BAT_HISTORY_WRITTEN';
    record.plan.batteryTargets.forEach(function(target, index) {
      applyCommitOperations_(record.plan.operations.battery.filter(function(operation) {
        return operation.targetIndex === index;
      }), false, ss);
      ensureBatteryMetadata_(target, ss);
      commitFault_('AFTER_BAT_' + target.battery);
      commitFault_('AFTER_BAT_WRITE_BEFORE_PROGRESS');
    });
    SpreadsheetApp.flush();
    applyCommitOperations_(record.plan.operations.battery, true, ss);
    record.plan.batteryTargets.forEach(function(target) {
      if (!metadataMatches_(target, ss)) throw new Error('BAT履歴の内部識別子を確認できません。');
    });
    setCommitProgress_(record, 'writing', currentStage);

    currentStage = 'POSTFLIGHT_WRITTEN';
    applyCommitOperations_(record.plan.operations.postflight, false, ss);
    commitFault_('AFTER_POSTFLIGHT');
    SpreadsheetApp.flush();
    applyCommitOperations_(record.plan.operations.postflight, true, ss);
    setCommitProgress_(record, 'writing', currentStage);

    currentStage = 'AIRCRAFT_TOTALS_WRITTEN';
    record.plan.totalTargets.forEach(function(target, index) {
      applyCommitOperations_(record.plan.operations.totals.filter(function(operation) {
        return operation.model === target.model;
      }), false, ss);
      if (index === 0 && record.plan.totalTargets.length > 1) commitFault_('BETWEEN_AIRCRAFT_TOTALS');
    });
    SpreadsheetApp.flush();
    applyCommitOperations_(record.plan.operations.totals, true, ss);
    setCommitProgress_(record, 'writing', currentStage);

    currentStage = 'FINAL_FLUSH';
    commitFault_('BEFORE_FINAL_FLUSH');
    SpreadsheetApp.flush();
    const resultHash = verifyCommitPlanResult_(record.plan, ss);
    record.meta.stage = 'VERIFIED';
    writeCommitMeta_(record.meta);
    commitFault_('BEFORE_COMPLETE');
    compactCompletePlan_(record, resultHash);

    const appState = getAppState();
    safeCommitCachePut_(COMMIT_RESULT_PREFIX + record.meta.draftId, JSON.stringify(appState));
    commitFault_('AFTER_COMPLETE_BEFORE_RESPONSE');
    return appState;
  } catch (error) {
    failCommitProgress_(record, currentStage, error);
    throw error;
  }
}

function isAppTestPurpose_(purpose) {
  const text = String(purpose || '');
  return text === APP_TEST_PURPOSE || text.indexOf(APP_TEST_PURPOSE + ' [気象: ') === 0;
}

function activeCommitReservations_(excludeDraftId) {
  const result = { blocks: {}, batteryRows: {}, activeDrafts: [] };
  const all = commitProperties_().getProperties();
  Object.keys(all).forEach(function(key) {
    if (key.indexOf(COMMIT_V2_PREFIX) !== 0 || !/_META$/.test(key)) return;
    let meta;
    try { meta = JSON.parse(all[key]); } catch (error) { return; }
    if (!meta.draftId || meta.draftId === excludeDraftId || meta.state === 'complete') return;
    result.activeDrafts.push(meta.draftId);
    const record = loadCommitPlan_(meta.draftId, meta);
    (record.plan.assignments || []).forEach(function(item) {
      result.blocks[item.sheetName + '|' + item.blockNo] = meta.draftId;
    });
    (record.plan.batteryTargets || []).forEach(function(item) {
      result.batteryRows[item.sheetName + '|' + item.row] = meta.draftId;
    });
  });
  return result;
}

function chooseFixedBlock_(sheet, reserved) {
  if (!blockUsed_(sheet, 1) && !reserved.blocks[sheet.getName() + '|1']) return 1;
  if (!blockUsed_(sheet, 2) && !reserved.blocks[sheet.getName() + '|2']) return 2;
  return 0;
}

function nextFixedSheetAndBlock_(ss, operationDate, currentSheet, forceNew, reserved, appTest) {
  let sheet = currentSheet;
  if (!sheet) {
    const beforeNames = {};
    ss.getSheets().forEach(function(item) { beforeNames[item.getName()] = true; });
    sheet = getOrCreateDateSheet_(ss, operationDate, !!forceNew, 1, appTest);
    if (!beforeNames[sheet.getName()]) commitFault_('AFTER_SHEET_COPY');
  }
  while (true) {
    const blockNo = chooseFixedBlock_(sheet, reserved);
    if (blockNo) return { sheet: sheet, blockNo: blockNo };
    const match = sheet.getName().match(/_(\d+)$/);
    const nextSequence = (match ? Number(match[1]) : 1) + 1;
    const name = (appTest ? 'TEST_' : '') + format_(operationDate, 'yyyy.M.d') + '_' + nextSequence;
    const existed = !!ss.getSheetByName(name);
    sheet = getOrCreateDateSheet_(ss, operationDate, false, nextSequence, appTest);
    if (!existed) commitFault_('AFTER_SHEET_COPY');
  }
}

function captureCommitStage_(capture, stage, work) {
  capture.stage = stage;
  const start = capture.operations.length;
  work();
  return capture.operations.slice(start);
}

function buildFixedCommitPlan_(input) {
  const session = input.session;
  const postflight = input.postflight;
  const models = validateCommitBusinessInput_(input);
  const operationDate = dateFromSheetName_(session.operationDate || format_(now_(), 'yyyy.M.d'));
  const appTest = isAppTestPurpose_(session.purpose);
  const ss = spreadsheet_();
  const reservations = activeCommitReservations_(session.draftId);
  if (reservations.activeDrafts.length) {
    throw new Error('別の運航記録が保存途中です。先に元の端末から同じ運航記録を再保存してください。');
  }
  const assignments = [];
  let currentSheet = null;
  let firstAssignment = true;

  models.forEach(function(model) {
    const modelFlights = (session.flights || []).filter(function(flight) { return flight.model === model; });
    const chunks = [];
    for (let index = 0; index < modelFlights.length; index += 7) chunks.push(modelFlights.slice(index, index + 7));
    if (!chunks.length) chunks.push([]);
    chunks.forEach(function(flights) {
      const allocated = nextFixedSheetAndBlock_(ss, operationDate, currentSheet, firstAssignment && !!session.forceNewLocation, reservations, appTest);
      currentSheet = allocated.sheet;
      firstAssignment = false;
      reservations.blocks[currentSheet.getName() + '|' + allocated.blockNo] = session.draftId;
      assignments.push({
        model: model,
        sheetName: currentSheet.getName(),
        blockNo: allocated.blockNo,
        flightIndexes: flights.map(function(flight) { return session.flights.indexOf(flight); })
      });
    });
  });

  const batteryTargets = [];
  (session.flights || []).forEach(function(flight, flightIndex) {
    const sheet = ss.getSheetByName(BATTERY_SHEET_PREFIX + Number(flight.battery));
    if (!sheet) throw new Error('BAT_' + flight.battery + ' シートが見つかりません。');
    const row = fixedBatteryRow_(sheet, reservations.batteryRows);
    reservations.batteryRows[sheet.getName() + '|' + row] = session.draftId;
    batteryTargets.push({
      battery: Number(flight.battery), sheetName: sheet.getName(), row: row,
      flightIndex: flightIndex, commitId: session.draftId + ':' + flightIndex
    });
  });

  const startingByModel = {};
  const finalByModel = {};
  const totalTargets = [];
  models.forEach(function(model) {
    const cell = aircraftTotalCell_(model);
    startingByModel[model] = parseHoursMinutes_(cell.getDisplayValue(), model + 'の点検時の総飛行時間');
    finalByModel[model] = startingByModel[model];
    if (!appTest) totalTargets.push({ model: model, sheetName: cell.getSheet().getName(), row: cell.getRow(), col: cell.getColumn() });
  });
  (session.flights || []).forEach(function(flight) { finalByModel[flight.model] += Number(flight.actualMinutes); });

  const capture = { stage: '', operations: [], byKey: {} };
  COMMIT_WRITE_CAPTURE = capture;
  try {
    captureCommitStage_(capture, 'date', function() {
      const cumulative = {};
      models.forEach(function(model) { cumulative[model] = startingByModel[model]; });
      assignments.forEach(function(assignment, assignmentIndex) {
        const sheet = ss.getSheetByName(assignment.sheetName);
        const modelSession = Object.assign({}, session, { model: assignment.model, dateSheet: assignment.sheetName, blockNo: assignment.blockNo });
        writeHeaderFields_(sheet, modelSession, assignment.blockNo);
        const ac = session.aircrafts && session.aircrafts[assignment.model];
        writeCheckResults_(sheet, (ac && ac.preflightChecks) || {}, '飛行前点検', assignment.blockNo);
        const block = flightBlocks_(sheet).filter(function(item) { return item.blockNo === assignment.blockNo; })[0];
        assignment.flightIndexes.forEach(function(flightIndex, rowIndex) {
          const flight = session.flights[flightIndex];
          const minutes = Number(flight.actualMinutes);
          cumulative[assignment.model] += minutes;
          writeFlightFields_(sheet, { blockNo: assignment.blockNo, row: block.startRow + rowIndex }, {
            '使用バッテリー': 'BAT_' + Number(flight.battery),
            '離陸場所': flight.takeoffLocation, '着陸場所': flight.landingLocation,
            '離陸時刻': format_(flight.takeoffAt, 'HH:mm'), '着陸時刻': format_(flight.landingAt, 'HH:mm'),
            '飛行時間': formatHoursMinutes_(minutes), '総飛行時間': formatHoursMinutes_(cumulative[assignment.model]),
            '安全に影響した事項': flight.safetyIssue ? (flight.safetyDetail || 'あり') : 'なし',
            'バッテリー異常・所感': flight.batteryNote || ''
          });
        });
      });
    });

    batteryTargets.forEach(function(target, targetIndex) {
      const start = capture.operations.length;
      const flight = session.flights[target.flightIndex];
      const assignment = assignments.filter(function(item) { return item.flightIndexes.indexOf(target.flightIndex) >= 0; })[0];
      writeBatteryHistoryAt_(ss.getSheetByName(target.sheetName), target.row, {
        dateSheet: assignment.sheetName, model: flight.model, purpose: session.purpose, route: session.route
      }, Number(flight.actualMinutes), { cycle: flight.cycle || '', batteryNote: flight.batteryNote || '' });
      capture.operations.slice(start).forEach(function(operation) { operation.stage = 'battery'; operation.targetIndex = targetIndex; });
    });

    captureCommitStage_(capture, 'postflight', function() {
      assignments.forEach(function(assignment) {
        const sheet = ss.getSheetByName(assignment.sheetName);
        const acInput = (postflight.aircrafts || {})[assignment.model] || postflight;
        const checks = acInput.checks || postflight.checks || {};
        const abnormal = POST_CHECK_NAMES.some(function(name) { return checks[name] !== '正常'; });
        writeCheckResults_(sheet, checks, '飛行後点検', assignment.blockNo);
        writeOptionalFields_(sheet, {
          inspectionLocation: postflight.inspectionLocation || session.inspectionLocation,
          defectLocation: acInput.defectLocation || '', defectDetail: acInput.defectDetail || '',
          actionDetail: acInput.actionDetail || '', confirmer: postflight.confirmer || session.pilot
        }, assignment.blockNo, abnormal);
      });
    });

    totalTargets.forEach(function(target) {
      capture.stage = 'totals';
      const cell = ss.getSheetByName(target.sheetName).getRange(target.row, target.col);
      const start = capture.operations.length;
      trackedSetNumberFormat_(cell, '@');
      trackedSetValue_(cell, formatHoursMinutes_(finalByModel[target.model]));
      capture.operations.slice(start).forEach(function(operation) { operation.model = target.model; });
    });
  } finally {
    COMMIT_WRITE_CAPTURE = null;
  }

  const operations = { date: [], battery: [], postflight: [], totals: [] };
  capture.operations.forEach(function(operation) { operations[operation.stage].push(operation); });
  return {
    version: COMMIT_PLAN_VERSION,
    draftId: session.draftId,
    normalizedInput: input,
    operationDate: format_(operationDate, 'yyyy.M.d'),
    assignments: assignments,
    batteryTargets: batteryTargets,
    totalTargets: totalTargets,
    startingByModel: startingByModel,
    finalByModel: finalByModel,
    operations: operations
  };
}

function commitLog_(msg) {
  if (typeof Logger !== 'undefined' && typeof Logger.log === 'function') {
    Logger.log(msg);
  }
}

/**
 * 1件の未完了draftについて最新のSpreadsheet実状態から詳細診断を行う関数
 * ※完全な読み取り専用であり、SpreadsheetやProperties、Cacheを1バイトも変更しません。
 */
function diagnoseSingleCommitPlan_(meta, spreadsheet, properties) {
  const ss = spreadsheet || spreadsheet_();
  const props = properties || commitProperties_();

  const report = {
    draftId: meta.draftId,
    state: meta.state,
    stage: meta.stage,
    lastErrorStage: meta.lastErrorStage || '(なし)',
    createdAt: meta.createdAt || '(不明)',
    updatedAt: meta.updatedAt || '(不明)',
    isAppTest: false,
    chunksComplete: false,
    planHashMatches: false,
    operationCounts: { intended: 0, before: 0, conflict: 0, total: 0 },
    conflicts: [],
    dateMetadata: { total: 0, matched: 0, details: [] },
    batteryMetadata: { total: 0, matched: 0, details: [] },
    aircraftTotals: { targets: 0, matched: 0, details: [] },
    canResumeRollForward: false,
    safeToRecover: false,
    safeToDiscardTest: false,
    statusCategory: 'CANNOT_AUTO_PROCESS',
    resumeBlockReasons: [],
    discardBlockReasons: []
  };

  // 1. DATA chunkの読み取り確認（read-only）
  const chunks = [];
  let chunksMissing = false;
  for (let i = 0; i < Number(meta.chunkCount || 0); i++) {
    const val = props.getProperty(commitDataKey_(meta.draftId, i));
    if (val == null) { chunksMissing = true; break; }
    chunks.push(val);
  }
  report.chunksComplete = !chunksMissing && chunks.length === Number(meta.chunkCount || 0);

  let plan = null;
  if (report.chunksComplete) {
    const fullText = chunks.join('');
    report.planHashMatches = sha256Text_(fullText) === meta.planHash;
    if (report.planHashMatches) {
      try { plan = JSON.parse(fullText); } catch (e) {
        report.resumeBlockReasons.push('保存計画JSONのパースに失敗しました');
        report.discardBlockReasons.push('保存計画JSONのパースに失敗しました');
      }
    } else {
      report.resumeBlockReasons.push('保存計画DATAのSHA-256ハッシュがMETAと一致しません');
      report.discardBlockReasons.push('保存計画DATAのSHA-256ハッシュがMETAと一致しません');
    }
  } else {
    report.resumeBlockReasons.push('保存計画DATA chunkの一部または全部が欠落しています');
    report.discardBlockReasons.push('保存計画DATA chunkの一部または全部が欠落しています');
  }

  if (!plan) {
    report.canResumeRollForward = false;
    report.safeToRecover = false;
    report.safeToDiscardTest = false;
    report.statusCategory = 'CANNOT_AUTO_PROCESS';
    return report;
  }

  // 運航目的の判定（アプリテストか通常か）
  const purpose = (plan.normalizedInput && plan.normalizedInput.session) ? plan.normalizedInput.session.purpose : '';
  report.isAppTest = isAppTestPurpose_(purpose);
  report.purpose = purpose;

  // 2. Spreadsheetの各operationの状態診断（read-only）
  const allOps = [].concat(
    plan.operations.date || [],
    plan.operations.battery || [],
    plan.operations.postflight || [],
    plan.operations.totals || []
  );
  report.operationCounts.total = allOps.length;

  allOps.forEach(function(op) {
    const targetSheet = ss.getSheetByName(op.sheetName);
    if (!targetSheet) {
      report.operationCounts.conflict++;
      report.conflicts.push({
        stage: op.stage,
        sheet: op.sheetName,
        cell: 'row ' + op.row + ', col ' + op.col,
        kind: op.kind,
        reason: 'シートが存在しません：' + op.sheetName
      });
      report.resumeBlockReasons.push('保存先シートが存在しません：' + op.sheetName);
      return;
    }
    const range = targetSheet.getRange(op.row, op.col);
    const current = commitRangeProperty_(range, op.kind);

    if (sameCommitValue_(current, op.value, op.kind)) {
      report.operationCounts.intended++;
    } else if (sameCommitValue_(current, op.before, op.kind)) {
      report.operationCounts.before++;
    } else {
      report.operationCounts.conflict++;
      report.conflicts.push({
        stage: op.stage,
        sheet: op.sheetName,
        cell: range.getA1Notation(),
        kind: op.kind,
        before: op.before,
        expected: op.value,
        actual: current
      });
    }
  });

  // 3. DATE Sheet-level Developer Metadataの状態診断（read-only）
  const dateAssignments = plan.assignments || [];
  report.dateMetadata.total = dateAssignments.length;
  dateAssignments.forEach(function(assignment) {
    const matched = dateMetadataMatches_(assignment, ss, meta.draftId);
    const conflicted = dateMetadataConflict_(assignment, ss, meta.draftId, props);
    if (matched) report.dateMetadata.matched++;
    if (conflicted) {
      report.resumeBlockReasons.push('日付シートのNo.' + assignment.blockNo + 'に別の保存計画の識別子があります（競合）：' + assignment.sheetName);
    }
    report.dateMetadata.details.push({
      sheet: assignment.sheetName,
      blockNo: assignment.blockNo,
      ownershipValue: dateOwnershipValue_(assignment, meta.draftId),
      matched: matched,
      conflicted: conflicted
    });
  });

  // 4. BAT entire-row Developer Metadataの状態診断（read-only）
  const batTargets = plan.batteryTargets || [];
  report.batteryMetadata.total = batTargets.length;
  batTargets.forEach(function(target) {
    const matched = metadataMatches_(target, ss);
    if (matched) {
      report.batteryMetadata.matched++;
    } else {
      report.batteryMetadata.details.push({
        sheet: target.sheetName,
        row: target.row,
        commitId: target.commitId,
        matched: false
      });
    }
  });

  // 5. 機体累計の状態診断（read-only）
  const totalTargets = plan.totalTargets || [];
  report.aircraftTotals.targets = totalTargets.length;
  if (report.isAppTest) {
    report.aircraftTotals.note = 'アプリテストのため原本累計は更新対象外（正常）';
  } else {
    totalTargets.forEach(function(target) {
      const targetSheet = ss.getSheetByName(target.sheetName);
      if (!targetSheet) {
        report.resumeBlockReasons.push('機体累計シートが存在しません：' + target.sheetName);
        return;
      }
      const cell = targetSheet.getRange(target.row, target.col);
      const currentTotal = cell.getDisplayValue();
      const expectedFinal = formatHoursMinutes_(plan.finalByModel[target.model]);
      const startVal = formatHoursMinutes_(plan.startingByModel[target.model]);
      const isUpdated = (currentTotal === expectedFinal);
      const isBefore = (currentTotal === startVal);
      if (isUpdated) {
        report.aircraftTotals.matched++;
      } else if (!isBefore) {
        report.resumeBlockReasons.push('機体累計セルが計画開始前とも確定予定値とも一致しません（競合）：' + target.model);
      }
      report.aircraftTotals.details.push({
        model: target.model,
        current: currentTotal,
        start: startVal,
        expectedFinal: expectedFinal,
        isUpdated: isUpdated
      });
    });
  }

  // 6. BAT Developer Metadata の競合チェック（別draftとの矛盾がないか）
  (plan.batteryTargets || []).forEach(function(target) {
    const bSheet = ss.getSheetByName(target.sheetName);
    if (!bSheet) return;
    const bRange = batteryMetadataRange_(target, ss);
    if (typeof bRange.getDeveloperMetadata === 'function') {
      const metas = bRange.getDeveloperMetadata().filter(function(item) {
        return item.getKey() === BATTERY_COMMIT_METADATA_KEY;
      });
      const hasOtherMeta = metas.some(function(item) {
        return item.getValue() !== target.commitId;
      });
      if (hasOtherMeta) {
        report.resumeBlockReasons.push('BAT履歴行に別の保存計画の識別子が付与されています（競合）：' + target.sheetName + ' ' + target.row + '行');
      }
    }
  });

  // 7. ロールフォワード再開・安全復旧可能かどうかの厳格判定
  if (report.operationCounts.conflict > 0) {
    report.resumeBlockReasons.push('セル競合（conflict）が ' + report.operationCounts.conflict + ' 件検出されました');
  }
  report.safeToRecover = (report.resumeBlockReasons.length === 0);
  report.canResumeRollForward = report.safeToRecover;

  // 8. TESTで安全に破棄可能かどうかの厳格判定（すべて満たす場合のみ許可）
  const discardBlockReasons = [];
  if (!report.isAppTest) {
    discardBlockReasons.push('通常運航の保存計画は自動破棄できません（原本保護）');
  }
  if (!report.chunksComplete) {
    discardBlockReasons.push('DATA chunkが一部欠落しています');
  }
  if (!report.planHashMatches) {
    discardBlockReasons.push('保存計画のハッシュが一致しません');
  }

  // DATE operations / Developer Metadata の実データ書き込みチェック
  // （TESTシートが存在していても、該当ブロックに実データ書き込みもMetadataもなければ安全破棄可能）
  let dateHasRealData = false;
  (plan.assignments || []).forEach(function(assignment) {
    const dSheet = ss.getSheetByName(assignment.sheetName);
    if (!dSheet) return;

    // ① DATE Developer Metadata チェック（当該draftまたは別draftのメタデータがあるか）
    if (typeof dSheet.getDeveloperMetadata === 'function') {
      const ownMetadata = dateMetadataMatches_(assignment, ss, meta.draftId);
      const conflictingMetadata = dateMetadataConflict_(assignment, ss, meta.draftId, props);
      if (ownMetadata || conflictingMetadata) {
        dateHasRealData = true;
        discardBlockReasons.push('日付シートに保存計画の識別子（Developer Metadata）が付与されています：' + assignment.sheetName);
        return;
      }
    }

    // ② DATE operations の実データチェック（実データ書き込みが1セルでもあれば破棄禁止）
    const dateOps = (plan.operations.date || []).filter(function(op) {
      return op.sheetName === assignment.sheetName;
    });
    dateOps.forEach(function(op) {
      if (dateHasRealData) return;
      const cellRange = dSheet.getRange(op.row, op.col);
      const current = commitRangeProperty_(cellRange, op.kind);
      // 空文字の予定で現在も空文字なら実データ書き込みなし
      if (String(op.value || '').trim() === '' && String(current || '').trim() === '') return;
      // セルの現在値が空（未入力）なら実データ書き込みは存在しない
      if (String(current || '').trim() === '') return;
      // セルの現在値が op.before と一致していれば未書き込みなので問題なし
      if (sameCommitValue_(current, op.before, op.kind)) return;
      // 書式設定のみの差で実データ（値）が未入力なら実データ書き込みとみなさない
      if (op.kind !== 'value' && op.kind !== 'text' && String(cellRange.getValue() || '').trim() === '') return;

      dateHasRealData = true;
      discardBlockReasons.push('日付シートに対象保存計画の実データ書込みが存在します：' + op.sheetName + ' ' + cellRange.getA1Notation());
    });
  });

  // BAT operations の実データ書き込みチェック
  // 当該draft由来のデータ書き込みが1セルでもあれば破棄禁止
  let batHasRealData = false;
  (plan.operations.battery || []).forEach(function(op) {
    const bSheet = ss.getSheetByName(op.sheetName);
    if (!bSheet) return;
    const bRange = bSheet.getRange(op.row, op.col);
    const current = commitRangeProperty_(bRange, op.kind);
    // 空文字の予定で現在も空文字なら実データ書き込みなし
    if (String(op.value || '').trim() === '' && String(current || '').trim() === '') return;
    // セルの現在値が空（未入力）なら実データ書き込みは存在しない
    if (String(current || '').trim() === '') return;
    // セルの現在値が op.before と一致していれば未書き込みなので問題なし
    if (sameCommitValue_(current, op.before, op.kind)) return;
    // それ以外（実データが書かれている、または他者により変更されている）
    batHasRealData = true;
    discardBlockReasons.push('BAT履歴セルに変更または書込みがあります：' + op.sheetName + ' ' + bRange.getA1Notation());
  });

  // BAT Developer Metadata の付与チェック（0件であること）
  if (report.batteryMetadata.matched > 0) {
    discardBlockReasons.push('BAT履歴に保存計画の識別子（Developer Metadata）が付与されています（' + report.batteryMetadata.matched + '件）');
  }

  // 機体正式累計の更新チェック（TEST運航なので更新されていないこと）
  if (report.aircraftTotals.matched > 0) {
    discardBlockReasons.push('機体累計が更新されています');
  }

  report.safeToDiscardTest = (
    report.isAppTest &&
    report.chunksComplete &&
    report.planHashMatches &&
    !dateHasRealData &&
    !batHasRealData &&
    report.batteryMetadata.matched === 0 &&
    report.aircraftTotals.matched === 0 &&
    discardBlockReasons.length === 0
  );
  report.discardBlockReasons = discardBlockReasons;

  // 4状態の分類
  if (report.safeToRecover) {
    report.statusCategory = 'SAFE_TO_RECOVER';
  } else if (report.safeToDiscardTest) {
    report.statusCategory = 'SAFE_TO_DISCARD_TEST';
  } else {
    report.statusCategory = 'CANNOT_AUTO_PROCESS';
  }

  return report;
}

/**
 * TEST保存計画の内部安全破棄ヘルパー
 */
function discardPendingTestPlanInternal_(draftId, meta, properties) {
  const props = properties || commitProperties_();
  const chunkCount = Number(meta.chunkCount || 0);
  for (let index = 0; index < chunkCount; index++) {
    props.deleteProperty(commitDataKey_(draftId, index));
  }
  props.deleteProperty(commitMetaKey_(draftId));
}

/**
 * 新規保存前に、過去の未完了draftを時系列順に直前再診断しながら自動解決するパイプライン
 * 1. createdAt の昇順（古い順）に整列
 * 2. 各draftの実行直前に最新のSpreadsheet実状態で再診断（前回の結果使い回し禁止）
 * 3. TEST安全残骸 → 自動整理して次へ
 * 4. 本番（または実データありTEST）で100%安全復旧可能 → executeCommitPlanRollForward_ で確定復旧 → Spreadsheet.flush() で実状態同期
 * 5. 1件でも安全条件を満たせない場合（conflict、破損、先行完了状態との矛盾等） → 即座に例外で新規保存を安全停止
 */
function resolvePendingCommitPlansBeforeSave_(currentDraftId, spreadsheet, properties) {
  const ss = spreadsheet || spreadsheet_();
  const props = properties || commitProperties_();
  const all = props.getProperties();
  const pendingMetas = [];

  Object.keys(all).forEach(function(key) {
    if (key.indexOf(COMMIT_V2_PREFIX) !== 0 || !/_META$/.test(key)) return;
    try {
      const meta = JSON.parse(all[key]);
      if (meta && meta.draftId && meta.draftId !== currentDraftId && meta.state !== 'complete') {
        pendingMetas.push(meta);
      }
    } catch (ignored) {}
  });

  if (!pendingMetas.length) return [];

  // createdAt の昇順（古い順）にソート
  pendingMetas.sort(function(a, b) {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return timeA - timeB;
  });

  const resolved = [];

  for (let i = 0; i < pendingMetas.length; i++) {
    const targetMeta = pendingMetas[i];

    // ★重要：各draftの実行直前に必ず最新のSpreadsheet実状態で再診断（診断結果の使い回し禁止）
    const report = diagnoseSingleCommitPlan_(targetMeta, ss, props);

    if (report.safeToDiscardTest) {
      discardPendingTestPlanInternal_(targetMeta.draftId, targetMeta, props);
      commitLog_('保留中のTEST安全残骸を自動整理しました: ' + targetMeta.draftId);
      resolved.push({ draftId: targetMeta.draftId, action: 'DISCARDED_TEST' });
      continue;
    }

    if (report.safeToRecover) {
      const record = loadCommitPlan_(targetMeta.draftId, targetMeta);
      executeCommitPlanRollForward_(record, ss);
      SpreadsheetApp.flush(); // ★確定直後にflushし、次draftの再診断に実状態を確実に反映
      commitLog_('未完了の保存計画を自動復旧しました: ' + targetMeta.draftId);
      resolved.push({ draftId: targetMeta.draftId, action: 'RECOVERED' });
      continue;
    }

    // 1件でも安全条件を満たせない場合（conflict、破損、先行完了状態との矛盾等）：
    // fixed commit planの勝手な書き換え・再計算は禁止。即座に新規保存を安全停止！
    const reasons = (report.resumeBlockReasons || []).concat(report.discardBlockReasons || []);
    const errMsg = '未完了の運航記録（' + targetMeta.draftId + '）に競合または不整合が検出されたため、安全のため保存を停止しました：' + reasons.join(' / ');
    commitLog_('自動解決停止: ' + errMsg);
    throw new Error(errMsg);
  }

  return resolved;
}

/**
 * 管理者用：未完了保存計画の読み取り専用診断関数
 * Apps Scriptエディタから手動実行して、現在の未完了draftの状態を診断・表示する。
 * ※完全な読み取り専用であり、SpreadsheetやProperties、Cacheを1バイトも変更しません。
 */
function diagnosePendingCommitPlans() {
  const ss = spreadsheet_();
  const properties = commitProperties_();
  const all = properties.getProperties();
  const pendingDrafts = [];

  Object.keys(all).forEach(function(key) {
    if (key.indexOf(COMMIT_V2_PREFIX) !== 0 || !/_META$/.test(key)) return;
    try {
      const meta = JSON.parse(all[key]);
      if (meta && meta.draftId && meta.state !== 'complete') {
        pendingDrafts.push(meta);
      }
    } catch (ignored) {}
  });

  if (!pendingDrafts.length) {
    const message = '【診断結果】未完了の保存計画はありません（正常な状態です）。';
    commitLog_(message);
    return [];
  }

  // 古い順に診断
  pendingDrafts.sort(function(a, b) {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return timeA - timeB;
  });

  const reports = pendingDrafts.map(function(meta) {
    return diagnoseSingleCommitPlan_(meta, ss, properties);
  });

  // commitLog_ で詳細レポートを出力
  commitLog_('================================================================');
  commitLog_('【未完了保存計画 診断レポート】 未完了件数: ' + reports.length);
  commitLog_('================================================================');
  reports.forEach(function(r, idx) {
    commitLog_('--- [' + (idx + 1) + '/' + reports.length + '] draftId: ' + r.draftId + ' ---');
    commitLog_('  状態 (state)       : ' + r.state);
    commitLog_('  進捗 (stage)       : ' + r.stage);
    commitLog_('  直前エラー (lastErr): ' + r.lastErrorStage);
    commitLog_('  作成日時           : ' + r.createdAt);
    commitLog_('  更新日時           : ' + r.updatedAt);
    commitLog_('  運航種別           : ' + (r.isAppTest ? 'アプリテスト (TEST運航)' : '通常運航'));
    commitLog_('  状態分類           : ' + r.statusCategory);
    commitLog_('  DATA chunk完全性   : ' + (r.chunksComplete ? '完全（全chunk存在）' : '異常（chunk欠落）'));
    commitLog_('  planHash整合性     : ' + (r.planHashMatches ? '一致（改ざん・破損なし）' : '不一致または未検証'));
    commitLog_('  操作進捗 (operations): 全 ' + r.operationCounts.total + ' 件中');
    commitLog_('    ├─ 書込み完了 (intended): ' + r.operationCounts.intended);
    commitLog_('    ├─ 未書込み   (before)  : ' + r.operationCounts.before);
    commitLog_('    └─ 競合変更   (conflict): ' + r.operationCounts.conflict);
    if (r.conflicts.length > 0) {
      commitLog_('    [競合詳細]: ' + JSON.stringify(r.conflicts));
    }
    commitLog_('  DATE Metadata      : ' + r.dateMetadata.matched + ' / ' + r.dateMetadata.total + ' ブロック付与済み');
    commitLog_('  BAT Metadata       : ' + r.batteryMetadata.matched + ' / ' + r.batteryMetadata.total + ' 行付与済み');
    commitLog_('  機体累計状況       : ' + (r.isAppTest ? r.aircraftTotals.note : (r.aircraftTotals.matched + ' / ' + r.aircraftTotals.targets + ' 機体反映済み')));
    commitLog_('  >> 安全復旧判定    : ' + (r.safeToRecover ? '【安全に復旧可能】' : '【自動復旧不可】 理由: ' + r.resumeBlockReasons.join(', ')));
    commitLog_('  >> TEST破棄判定    : ' + (r.safeToDiscardTest ? '【TEST安全破棄可能】' : '【破棄不可】 理由: ' + (r.discardBlockReasons || []).join(', ')));
  });
  commitLog_('================================================================');

  return reports;
}

/**
 * 画面から実行する未完了保存計画の安全な復旧関数（ロールフォワード完了）
 * 利用者がWebアプリ上の「前回の保存を安全に復旧する」ボタンを押したときに呼び出される。
 * 安全条件をすべて満たす場合のみ、同じdraftId・同じfixed commit plan・同じUUIDを維持したまま
 * roll-forwardしてcompleteまで進める。
 */
function recoverPendingCommitPlan(draftId) {
  if (!draftId) throw new Error('復旧対象のdraftIdが指定されていません。');
  return locked_(function() {
    cleanupCommitPlans_();
    const meta = readCommitMeta_(draftId);
    if (!meta) throw new Error('指定された保存計画METAが見つかりません。');
    if (meta.state === 'complete') {
      return { success: true, message: '前回の保存は既に完了しています。現在の運航を保存できます。' };
    }

    const report = diagnoseSingleCommitPlan_(meta, spreadsheet_(), commitProperties_());
    if (!report || !report.safeToRecover) {
      const reasons = report ? report.resumeBlockReasons : [];
      throw new Error('安全条件を満たさないため、自動復旧できません：' + (reasons || []).join(' / '));
    }

    const record = loadCommitPlan_(draftId, meta);
    executeCommitPlanRollForward_(record, spreadsheet_());

    return {
      success: true,
      message: '前回の保存を復旧しました。現在の運航を保存できます。'
    };
  });
}

/**
 * 画面から実行する未完了TEST保存計画の安全破棄関数
 * 利用者がWebアプリ上の「このTEST保存を破棄して解除」ボタンを押したときに呼び出される。
 * 厳格な安全条件（TEST運航、シート削除済み、BAT未書込み、Metadata 0件、累計未更新）を
 * すべて満たす場合のみ、METAとDATA chunkを削除して保留ロックを解除する。
 */
function discardPendingTestCommitPlan(draftId) {
  if (!draftId) throw new Error('破棄対象のdraftIdが指定されていません。');
  return locked_(function() {
    const meta = readCommitMeta_(draftId);
    if (!meta) throw new Error('指定された保存計画が見つかりません。すでに解除されている可能性があります。');
    if (meta.state === 'complete') {
      throw new Error('完了済みの保存計画は破棄できません。');
    }

    const report = diagnoseSingleCommitPlan_(meta, spreadsheet_(), commitProperties_());
    if (!report || !report.safeToDiscardTest) {
      const reasons = report ? report.discardBlockReasons : [];
      throw new Error('安全条件を満たさないため、破棄できません：' + (reasons || []).join(' / '));
    }

    discardPendingTestPlanInternal_(draftId, meta, commitProperties_());
    commitLog_('TEST未完了保存計画を安全に破棄しました: draftId=' + draftId);

    return {
      success: true,
      message: '保留中のテスト保存を破棄しました。現在の下書きをそのまま確定保存できます。'
    };
  });
}
