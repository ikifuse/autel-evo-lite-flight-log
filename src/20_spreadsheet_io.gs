function validateCommitBusinessInput_(input) {
  const session = input.session;
  const postflight = input.postflight;
  if (typeof session.model !== 'string' || !MODELS[session.model]) throw new Error('機体を確認してください。');
  assertTextLimit_(session.route, '飛行経路・場所', SECURITY_TEXT_LIMITS.location, true);
  assertTextLimit_(session.pilot, '操縦者', SECURITY_TEXT_LIMITS.person, true);
  assertTextLimit_(postflight.inspectionLocation, '飛行後の点検実施場所', SECURITY_TEXT_LIMITS.location, true);
  assertTextLimit_(postflight.confirmer, '飛行後の点検確認者', SECURITY_TEXT_LIMITS.person, true);
  assertTextLimit_(session.purpose, '飛行目的', SECURITY_TEXT_LIMITS.purpose, true);
  assertTextLimit_(session.method, '飛行方法', SECURITY_TEXT_LIMITS.method, true);
  assertTextLimit_(session.category, '飛行カテゴリー', 20, true);
  assertTextLimit_(session.permitNo, '許可承認番号', SECURITY_TEXT_LIMITS.identifier, false);
  assertTextLimit_(session.inspectionLocation, '飛行前の点検実施場所', SECURITY_TEXT_LIMITS.location, false);
  assertTextLimit_(session.assistant, '補助者', SECURITY_TEXT_LIMITS.person, false);
  assertTextLimit_(session.cert, '技能証明書番号', SECURITY_TEXT_LIMITS.identifier, false);
  assertTextLimit_(session.preflightAbnormalDetail, '飛行前点検の異常内容', SECURITY_TEXT_LIMITS.detail, false);
  if (typeof session.forceNewLocation !== 'boolean') throw new Error('同日別現場の指定を確認してください。');
  const operationDate = dateFromSheetName_(session.operationDate || format_(now_(), 'yyyy.M.d'));

  validateStoredOperationSelection_(session);

  if (!Array.isArray(session.flights)) throw new Error('飛行記録の形式を確認してください。');
  if (session.flights.length > SECURITY_MAX_FLIGHTS) throw new Error('1運航の飛行記録は' + SECURITY_MAX_FLIGHTS + '件までです。');

  const aircraftKeys = Object.keys(session.aircrafts || {});
  if (aircraftKeys.some(function(model) { return !MODELS[model]; })) throw new Error('機体情報を確認してください。');
  aircraftKeys.forEach(function(model) {
    const ac = session.aircrafts[model];
    if (!ac || typeof ac.used !== 'boolean') throw new Error(model + 'の使用状態を確認してください。');
    validateCheckMap_(ac.preflightChecks || {}, PRE_CHECK_NAMES, model + 'の飛行前点検');
    assertTextLimit_(ac.preflightAbnormalDetail || '', model + 'の飛行前点検異常内容', SECURITY_TEXT_LIMITS.detail, false);
  });
  const usedModels = Object.keys(session.aircrafts || {}).filter(function(model) {
    return session.aircrafts[model] && session.aircrafts[model].used;
  });
  const models = usedModels.length ? usedModels : [session.model];
  if (!models.length || models.length > 2 || models.some(function(model) { return !MODELS[model]; })) {
    throw new Error('記録する機体を確認してください。');
  }
  if (models.indexOf(session.model) < 0) throw new Error('現在の機体情報を確認してください。');
  const postAircraftKeys = Object.keys(postflight.aircrafts || {});
  if (postAircraftKeys.some(function(model) { return !MODELS[model]; })) throw new Error('飛行後点検の機体情報を確認してください。');
  postAircraftKeys.forEach(function(model) {
    const post = postflight.aircrafts[model];
    if (!post || typeof post.abnormal !== 'boolean') throw new Error(model + 'の飛行後点検状態を確認してください。');
    validateCheckMap_(post.checks || {}, POST_CHECK_NAMES, model + 'の飛行後点検');
    assertTextLimit_(post.defectLocation || '', model + 'の不具合箇所', SECURITY_TEXT_LIMITS.location, false);
    assertTextLimit_(post.defectDetail || '', model + 'の不具合内容', SECURITY_TEXT_LIMITS.detail, false);
    assertTextLimit_(post.actionDetail || '', model + 'の処置内容', SECURITY_TEXT_LIMITS.detail, false);
  });
  if (Object.keys(postflight.checks || {}).length) validateCheckMap_(postflight.checks, POST_CHECK_NAMES, '飛行後点検');
  models.forEach(function(model) {
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
  let totalMinutes = 0;
  session.flights.forEach(function(flight) {
    if (models.indexOf(flight.model) < 0) throw new Error('飛行記録の機体割当を確認してください。');
    if (typeof flight.battery !== 'number' || !Number.isInteger(flight.battery) || flight.battery < 1 || flight.battery > 7) {
      throw new Error('飛行記録のバッテリーを確認してください。');
    }
    if (typeof flight.index !== 'number' || !Number.isInteger(flight.index) || flight.index < 1 || flight.index > SECURITY_MAX_FLIGHTS) {
      throw new Error('飛行記録番号を確認してください。');
    }
    assertTextLimit_(flight.takeoffLocation, '離陸場所', SECURITY_TEXT_LIMITS.location, true);
    assertTextLimit_(flight.landingLocation, '着陸場所', SECURITY_TEXT_LIMITS.location, true);
    assertTextLimit_(flight.takeoffAt, '離陸時刻', 50, true);
    assertTextLimit_(flight.landingAt, '着陸時刻', 50, true);
    if (typeof flight.cycle !== 'string') throw new Error('サイクル数の形式を確認してください。');
    assertTextLimit_(flight.cycle, 'サイクル数', 12, false);
    assertTextLimit_(flight.safetyDetail, '安全に影響した事項', SECURITY_TEXT_LIMITS.detail, false);
    assertTextLimit_(flight.batteryNote, 'バッテリー所感', SECURITY_TEXT_LIMITS.note, false);
    if (typeof flight.safetyIssue !== 'boolean') throw new Error('安全影響の指定を確認してください。');
    const takeoff = new Date(flight.takeoffAt);
    const landing = new Date(flight.landingAt);
    if (isNaN(takeoff.getTime()) || isNaN(landing.getTime()) || landing.getTime() < takeoff.getTime() || landing.getTime() - takeoff.getTime() > 86400000) {
      throw new Error('離着陸時刻を確認してください。');
    }
    if (takeoff.getTime() < operationDate.getTime() - 86400000 || takeoff.getTime() > operationDate.getTime() + 172800000) {
      throw new Error('離着陸時刻と運航日を確認してください。');
    }
    if (typeof flight.actualMinutes !== 'number' || !Number.isInteger(flight.actualMinutes) || flight.actualMinutes <= 0 || flight.actualMinutes > SECURITY_MAX_FLIGHT_MINUTES) {
      throw new Error('実飛行時間を確認してください。');
    }
    totalMinutes += flight.actualMinutes;
  });
  if (totalMinutes > SECURITY_MAX_TOTAL_MINUTES) throw new Error('1運航の合計飛行時間が上限を超えています。');
  return models;
}

function validateCheckMap_(checks, allowedNames, label) {
  if (!checks || typeof checks !== 'object' || Array.isArray(checks)) throw new Error(label + 'の形式を確認してください。');
  Object.keys(checks).forEach(function(name) {
    if (allowedNames.indexOf(name) < 0 || ['正常','異常'].indexOf(checks[name]) < 0) {
      throw new Error(label + 'の値を確認してください。');
    }
  });
}

function validateStoredOperationSelection_(session) {
  let purpose = session.purpose;
  const weatherMatch = purpose.match(/ \[気象: ([^\]]+)\]$/);
  if (weatherMatch) {
    const weatherValues = ['晴','曇','雨','強風注意'];
    const windSpeeds = ['0〜1m/s 静穏','2〜3m/s 穏やか','4〜5m/s 注意','6m/s以上 飛行不可'];
    const directions = ['北','北東','東','南東','南','南西','西','北西'];
    const allowedWeatherParts = weatherValues.slice();
    windSpeeds.forEach(function(speed) {
      allowedWeatherParts.push('風速' + speed);
      directions.forEach(function(direction) { allowedWeatherParts.push('風速' + speed + ' ' + direction); });
    });
    directions.forEach(function(direction) { allowedWeatherParts.push('風向' + direction); });
    weatherMatch[1].split(' / ').forEach(function(part) {
      if (allowedWeatherParts.indexOf(part) < 0) throw new Error('気象情報を確認してください。');
    });
    purpose = purpose.slice(0, weatherMatch.index);
  }
  if (purpose.indexOf('その他：') === 0) {
    if (!purpose.slice('その他：'.length).trim()) throw new Error('その他の飛行目的を確認してください。');
  } else if (FLIGHT_PURPOSES.indexOf(purpose) < 0 || purpose === 'その他') {
    throw new Error('飛行目的を確認してください。');
  }

  let method = session.method;
  const permitMatch = method.match(/ \[許可承認: ([^\]]+)\]$/);
  if (permitMatch) {
    if (!session.permitNo || permitMatch[1] !== session.permitNo) throw new Error('許可承認番号を確認してください。');
    method = method.slice(0, permitMatch.index);
  } else if (session.permitNo) {
    throw new Error('許可承認番号を確認してください。');
  }
  validateOperationSelection_({ purpose: '空撮', method: method.split(' / '), category: session.category });
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

function fixedBatteryRow_(sheet, reservedRows) {
  const values = sheetValues_(sheet);
  for (let row = BATTERY_FIRST_ROW; row <= BATTERY_LAST_ROW; row++) {
    if (!String((values[row - 1] || [])[0] || '').trim() && !reservedRows[sheet.getName() + '|' + row]) return row;
  }
  throw new Error(sheet.getName() + ' の履歴入力欄が上限に達しています。');
}

function writeBatteryHistoryAt_(sheet, row, session, minutes, input) {
  trackedSetValue_(sheet.getRange(row, 1), dateFromSheetName_(session.dateSheet, true));
  trackedSetValue_(sheet.getRange(row, 2), session.model);
  trackedSetUserText_(sheet.getRange(row, 3), session.purpose);
  trackedSetValue_(sheet.getRange(row, 4), minutes);
  trackedSetUserText_(sheet.getRange(row, 5), input.cycle || '');
  trackedSetUserText_(sheet.getRange(row, 6), input.batteryNote || '');
  trackedSetUserText_(sheet.getRange(row, 7), session.route);
  trackedSetValue_(sheet.getRange(row, 8), '');
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

function getOrCreateDateSheet_(spreadsheet, date, forceNew, startSequence, appTest) {
  const baseName = (appTest ? 'TEST_' : '') + format_(date, 'yyyy.M.d');
  let index = Math.max(1, Number(startSequence) || 1);
  let name = index === 1 ? baseName : baseName + '_' + index;
  while (true) {
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) {
      const template = spreadsheet.getSheetByName(TEMPLATE_NAME);
      if (!template) throw new Error('日常点検シートが見つかりません。');
      sheet = template.copyTo(spreadsheet).setName(name);
      return sheet;
    }
    if (appTest && !dateSheetStructureUsable_(sheet)) {
      index++;
      name = baseName + '_' + index;
      continue;
    }
    // forceNewが指定されていない場合、かつ空きブロック（No.1またはNo.2）があればこのシートを使用
    if (!forceNew && (!blockUsed_(sheet, 1) || !blockUsed_(sheet, 2))) {
      return sheet;
    }
    // 両ブロック使用済み、または別現場（forceNew）の場合は自動で次の連番シート（例: 2026.9.4_2）を探す
    index++;
    name = baseName + '_' + index;
  }
}

function sheetValues_(sheet) { return sheet.getDataRange().getDisplayValues(); }

function dateSheetStructureUsable_(sheet) {
  const values = sheetValues_(sheet);
  return [1, 2].every(function(blockNo) {
    const block = block_(blockNo);
    let aircraftRows = 0;
    for (let row = 0; row < Math.min(10, values.length); row++) {
      for (let col = block.startCol - 1; col < block.endCol; col++) {
        if (String((values[row] || [])[col] || '').indexOf('Autel Robotics Co., Ltd.') >= 0) aircraftRows++;
      }
    }
    return aircraftRows >= 2 &&
      !!findInBlock_(sheet, blockNo, ['飛行・点検実施年月日'], true) &&
      !!findInBlock_(sheet, blockNo, ['飛行目的（飛行概要）','飛行目的'], false) &&
      !!findInBlock_(sheet, blockNo, ['使用バッテリー'], false) &&
      PRE_CHECK_NAMES.every(function(name) {
        const labels = name === '操縦装置' ? ['操縦装置','操縦装置（プロポ）','操縦装置\n（プロポ）'] : [name];
        return !!findInBlock_(sheet, blockNo, labels, false);
      }) &&
      POST_CHECK_NAMES.every(function(name) { return !!findInBlock_(sheet, blockNo, [name], false); });
  });
}

function findInBlock_(sheet, blockNo, labels, contains) {
  const block = block_(blockNo);
  const values = sheetValues_(sheet);
  for (let row = 0; row < values.length; row++) {
    for (let col = block.startCol - 1; col < block.endCol; col++) {
      const value = String((values[row] || [])[col] || '').trim();
      if (labels.some(label => contains ? value.indexOf(label) >= 0 : value === label)) {
        return { row: row + 1, col: col + 1 };
      }
    }
  }
  return null;
}

function block_(blockNo) {
  const block = BLOCKS[blockNo];
  if (!block) throw new Error('No.' + blockNo + ' の帳票範囲を確認できません。');
  return block;
}

function blockUsed_(sheet, blockNo) {
  const block = block_(blockNo);
  const values = sheet.getRange(6, block.startCol, 35, block.endCol - block.startCol + 1).getDisplayValues();
  return values.some(row => row.some(value => {
    const text = String(value || '').trim();
    return /^[☑✓]/.test(text) || /^BAT_[1-7]$/.test(text);
  }));
}

function chooseAvailableBlock_(sheet) {
  if (!blockUsed_(sheet, 1)) return 1;
  if (!blockUsed_(sheet, 2)) return 2;
  return 0;
}

function labelColumn_(sheet, row, startCol, endCol, labels) {
  const values = sheetValues_(sheet)[row - 1] || [];
  for (let col = startCol; col <= endCol; col++) {
    if (labels.indexOf(String(values[col - 1] || '').trim()) >= 0) return col;
  }
  return 0;
}

function setAfterLabelInBlock_(sheet, blockNo, labels, value) {
  const cell = findInBlock_(sheet, blockNo, labels, false);
  if (!cell) return false;
  const merged = sheet.getRange(cell.row, cell.col).getMergedRanges();
  const labelRange = merged.length ? merged[0] : sheet.getRange(cell.row, cell.col);
  const targetCol = labelRange.getColumn() + labelRange.getNumColumns();
  if (targetCol > block_(blockNo).endCol) return false;
  trackedSetValue_(sheet.getRange(cell.row, targetCol), value == null ? '' : value);
  return true;
}

function setUserTextAfterLabelInBlock_(sheet, blockNo, labels, value) {
  const cell = findInBlock_(sheet, blockNo, labels, false);
  if (!cell) return false;
  const merged = sheet.getRange(cell.row, cell.col).getMergedRanges();
  const labelRange = merged.length ? merged[0] : sheet.getRange(cell.row, cell.col);
  const targetCol = labelRange.getColumn() + labelRange.getNumColumns();
  if (targetCol > block_(blockNo).endCol) return false;
  trackedSetUserText_(sheet.getRange(cell.row, targetCol), value);
  return true;
}

function locationCellDisplay_(value) {
  const text = String(value == null ? '' : value).trim();
  const match = text.match(/^(.*?)\s*[（(]\s*((?:北緯|南緯)?\s*\d{1,3}(?:\.\d+)?)\s*[,，]\s*((?:東経|西経)?\s*\d{1,3}(?:\.\d+)?)\s*[）)]$/);
  if (!match) return { text: text, twoLine: false };
  const coordinates = '(' + match[2].trim() + ', ' + match[3].trim() + ')';
  const name = match[1].trim();
  return { text: name ? name + '\n' + coordinates : coordinates, twoLine: !!name };
}

function writeLocationCell_(cell, value) {
  const display = locationCellDisplay_(value);
  trackedSetUserText_(cell, display.text);
  trackedSetHorizontalAlignment_(cell, 'center');
  trackedSetVerticalAlignment_(cell, 'middle');
  trackedSetWrap_(cell, display.twoLine);
  if (display.twoLine) trackedSetFontSize_(cell, Math.max(1, Number(cell.getFontSize()) - 1));
}

function setLocationAfterLabelInBlock_(sheet, blockNo, labels, value) {
  const cell = findInBlock_(sheet, blockNo, labels, false);
  if (!cell) return false;
  const merged = sheet.getRange(cell.row, cell.col).getMergedRanges();
  const labelRange = merged.length ? merged[0] : sheet.getRange(cell.row, cell.col);
  const targetCol = labelRange.getColumn() + labelRange.getNumColumns();
  if (targetCol > block_(blockNo).endCol) return false;
  writeLocationCell_(sheet.getRange(cell.row, targetCol), value);
  return true;
}

function writeHeaderFields_(sheet, session, blockNo) {
  const block = block_(blockNo);
  for (let row = 1; row <= Math.min(10, sheet.getLastRow()); row++) {
    const cell = sheet.getRange(row, block.startCol);
    const current = String(cell.getDisplayValue() || '').replace(/^[□☑✓]\s*/, '').trim();
    if (current.indexOf('Autel Robotics Co., Ltd.') >= 0) {
      const normalized = current.replace(/\s+/g, ' ');
      const selected = normalized.indexOf('/ ' + session.model + ' /') >= 0;
      trackedSetValue_(cell, (selected ? '☑ ' : '□ ') + current);
    }
  }

  const dateCell = findInBlock_(sheet, blockNo, ['飛行・点検実施年月日'], true);
  if (dateCell) {
    const date = dateFromSheetName_(session.dateSheet, true);
    trackedSetValue_(sheet.getRange(dateCell.row, dateCell.col), '飛行・点検実施年月日：' + format_(date, 'yyyy年M月d日'));
  }
  setUserTextAfterLabelInBlock_(sheet, blockNo, ['飛行目的（飛行概要）','飛行目的'], session.purpose);
  setLocationAfterLabelInBlock_(sheet, blockNo, ['飛行経路・場所','飛行経路'], session.route);
  setUserTextAfterLabelInBlock_(sheet, blockNo, ['飛行禁止空域・飛行方法','飛行空域・方法'], session.category + ' / ' + session.method);
  
  let pilotDisplay = session.pilot;
  if (session.assistant) {
    pilotDisplay += '（補助者: ' + session.assistant + '）';
  }
  setUserTextAfterLabelInBlock_(sheet, blockNo, ['操縦者・点検実施者','操縦者'], pilotDisplay);

  const certLabel = findInBlock_(sheet, blockNo, ['技能証明書番号','技能証明番号'], false);
  if (certLabel && String(sheet.getRange(certLabel.row, certLabel.col).getDisplayValue()).trim() === '技能証明番号') {
    trackedSetValue_(sheet.getRange(certLabel.row, certLabel.col), '技能証明書番号');
  }
  setUserTextAfterLabelInBlock_(sheet, blockNo, ['技能証明書番号','技能証明番号'], session.cert);
}

function writeCheckResults_(sheet, checks, section, blockNo) {
  const names = section === '飛行前点検' ? PRE_CHECK_NAMES : POST_CHECK_NAMES;
  const checkCol = block_(blockNo).startCol + (section === '飛行前点検' ? 6 : 12);
  names.forEach(name => {
    const labels = name === '操縦装置' ? ['操縦装置','操縦装置（プロポ）','操縦装置\n（プロポ）'] : [name];
    const label = findInBlock_(sheet, blockNo, labels, false);
    if (label) trackedSetValue_(sheet.getRange(label.row, checkCol), checks[name] === '正常' ? '☑' : '□');
  });
}

function flightBlocks_(sheet) {
  return [1, 2].map(blockNo => {
    const header = findInBlock_(sheet, blockNo, ['使用バッテリー'], false);
    if (!header) throw new Error('No.' + blockNo + ' の飛行記録欄を確認できません。');
    const block = block_(blockNo);
    return { blockNo: blockNo, headerRow: header.row, startCol: block.startCol,
      endCol: block.endCol, startRow: header.row + 1, endRow: header.row + 7 };
  });
}

function flightColumn_(sheet, block, labels) {
  return labelColumn_(sheet, block.headerRow, block.startCol, block.endCol, labels);
}

function writeFlightFields_(sheet, slot, fields) {
  const block = flightBlocks_(sheet).filter(item => item.blockNo === slot.blockNo)[0];
  if (!block) throw new Error('飛行記録ブロックを確認できません。');
  const aliases = {
    '使用バッテリー':['使用バッテリー'], '離陸場所':['離陸場所'], '着陸場所':['着陸場所'],
    '離陸時刻':['離陸時刻'], '着陸時刻':['着陸時刻'], '飛行時間':['飛行時間'],
    '総飛行時間':['総飛行時間','総飛行時間（累計時間）'],
    '安全に影響した事項':['安全に影響した事項','飛行の安全に影響した事項'],
    'バッテリー異常・所感':['バッテリー異常・所感']
  };
  Object.keys(fields).forEach(key => {
    const col = flightColumn_(sheet, block, aliases[key] || [key]);
    if (col) {
      const cell = sheet.getRange(slot.row, col);
      if (['離陸時刻', '着陸時刻', '飛行時間', '総飛行時間'].indexOf(key) >= 0) {
        trackedSetNumberFormat_(cell, '@');
        trackedSetValue_(cell, String(fields[key]));
      } else if (['離陸場所','着陸場所'].indexOf(key) >= 0) {
        writeLocationCell_(cell, fields[key]);
      } else if (['安全に影響した事項','バッテリー異常・所感'].indexOf(key) >= 0) {
        trackedSetUserText_(cell, fields[key]);
      } else {
        trackedSetValue_(cell, fields[key]);
      }
    }
  });
}

function writeOptionalFields_(sheet, input, blockNo, abnormal) {
  setUserTextAfterLabelInBlock_(sheet, blockNo, ['点検実施場所','点検場所'], input.inspectionLocation || '');
  setUserTextAfterLabelInBlock_(sheet, blockNo, ['不具合箇所：','不具合箇所'], input.defectLocation || '');
  setUserTextAfterLabelInBlock_(sheet, blockNo, ['事象等の内容：','事象等の内容','不具合内容'], input.defectDetail || '');

  const normalCell = findInBlock_(sheet, blockNo, ['□ 異常なし','☑ 異常なし'], false);
  const defectCell = findInBlock_(sheet, blockNo, ['□ 不具合あり','☑ 不具合あり'], false);
  if (normalCell) trackedSetValue_(sheet.getRange(normalCell.row, normalCell.col), abnormal ? '□ 異常なし' : '☑ 異常なし');
  if (defectCell) trackedSetValue_(sheet.getRange(defectCell.row, defectCell.col), abnormal ? '☑ 不具合あり' : '□ 不具合あり');

  if (abnormal || String(input.actionDetail || '').trim()) {
    const offset = block_(blockNo).startCol - 3;
    trackedSetValue_(sheet.getRange(44, 4 + offset), new Date());
    trackedSetUserText_(sheet.getRange(44, 6 + offset), input.defectDetail || input.defectLocation || '');
    if (String(input.actionDetail || '').trim()) trackedSetValue_(sheet.getRange(44, 10 + offset), new Date());
    trackedSetUserText_(sheet.getRange(44, 12 + offset), input.actionDetail || '');
    trackedSetUserText_(sheet.getRange(44, 15 + offset), input.confirmer || '');
  }
}

function aircraftTotalMinutes_(model) {
  return parseHoursMinutes_(aircraftTotalCell_(model).getDisplayValue(), model + 'の点検時の総飛行時間');
}

function aircraftTotalCell_(model) {
  const sheetName = AIRCRAFT_MAINTENANCE_SHEETS[model];
  if (!sheetName) throw new Error('機体別点検整備原本の対応を確認してください：' + model);
  const sheet = spreadsheet_().getSheetByName(sheetName);
  if (!sheet) throw new Error(sheetName + ' シートが見つかりません。');
  const values = sheet.getDataRange().getDisplayValues();
  const matches = [];
  values.forEach(function(row, rowIndex) {
    row.forEach(function(value, colIndex) {
      if (String(value || '').trim() === '点検時の総飛行時間') {
        matches.push({ row: rowIndex + 1, col: colIndex + 1 });
      }
    });
  });
  if (matches.length !== 1) {
    throw new Error(sheetName + ' の「点検時の総飛行時間」欄を一意に確認できません。');
  }
  const labelCell = sheet.getRange(matches[0].row, matches[0].col);
  const merged = labelCell.getMergedRanges();
  const labelRange = merged.length ? merged[0] : labelCell;
  const valueCol = labelRange.getColumn() + labelRange.getNumColumns();
  if (valueCol > sheet.getMaxColumns()) {
    throw new Error(sheetName + ' の「点検時の総飛行時間」の入力欄を確認できません。');
  }
  return sheet.getRange(matches[0].row, valueCol);
}

function parseHoursMinutes_(value, label) {
  const text = String(value == null ? '' : value).trim();
  const match = text.match(/^(\d{2,}):([0-5]\d)$/);
  if (!match) throw new Error((label || '累計時間') + 'はHH:MM形式で入力してください（例：00:00、105:27）。');
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const total = hours * 60 + minutes;
  if (!Number.isSafeInteger(total)) throw new Error((label || '累計時間') + 'が大きすぎます。');
  return total;
}

function commitSignature_(session) {
  const payload = JSON.stringify({
    draftId: session.draftId,
    operationDate: session.operationDate,
    purpose: session.purpose,
    route: session.route,
    flights: (session.flights || []).map(function(flight) {
      return {
        model: flight.model,
        battery: Number(flight.battery),
        takeoffAt: flight.takeoffAt,
        landingAt: flight.landingAt,
        actualMinutes: Number(flight.actualMinutes)
      };
    })
  });
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, payload, Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(digest);
}

function applyAircraftTotals_(commitPlan) {
  Object.keys(commitPlan.finalByModel || {}).forEach(function(model) {
    const current = aircraftTotalMinutes_(model);
    const starting = Number(commitPlan.startingByModel[model]);
    const finalMinutes = Number(commitPlan.finalByModel[model]);
    if (current === finalMinutes) return;
    if (current !== starting) {
      throw new Error(model + 'の機体累計時間が保存開始後に変更されています。原本を確認してください。');
    }
    const cell = aircraftTotalCell_(model);
    trackedSetNumberFormat_(cell, '@');
    trackedSetValue_(cell, formatHoursMinutes_(finalMinutes));
  });
}

function formatHoursMinutes_(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(m / 60);
  const mins = m % 60;
  return String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0');
}

function minutesLabel_(minutes) {
  const value = Math.max(0, Math.round(Number(minutes) || 0));
  return Math.floor(value / 60) + '時間' + (value % 60) + '分';
}

function appendBatteryHistory_(session, minutes, input) {
  const sheet = spreadsheet_().getSheetByName(BATTERY_SHEET_PREFIX + session.currentBattery);
  if (!sheet) throw new Error('BAT_' + session.currentBattery + ' シートが見つかりません。');
  const values = sheetValues_(sheet);
  let row = BATTERY_FIRST_ROW;
  while (row <= BATTERY_LAST_ROW && String((values[row - 1] || [])[0] || '').trim()) row++;
  if (row > BATTERY_LAST_ROW) throw new Error(sheet.getName() + ' の履歴入力欄が上限に達しています。');
  writeBatteryHistoryAt_(sheet, row, session, minutes, input);
  return { sheetName: sheet.getName(), row: row };
}
