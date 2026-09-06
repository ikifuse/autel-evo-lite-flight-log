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
    if (sameCommitValue_(current, operation.value)) return;
    if (verifyOnly) throw new Error('保存後の読取確認に失敗しました：' + operation.sheetName + '!' + range.getA1Notation());
    if (!sameCommitValue_(current, operation.before)) {
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
      let existingMeta = readCommitMeta_(session.draftId);
      if (!existingMeta) ensureCommitPlanCapacity_(normalizedInput);
      cleanupCommitPlans_();
      existingMeta = readCommitMeta_(session.draftId);
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

