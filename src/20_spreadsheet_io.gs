function getOrCreateDateSheet_(spreadsheet, date, forceNew, startSequence) {
  const baseName = format_(date, 'yyyy.M.d');
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
    const date = dateFromSheetName_(session.dateSheet);
    trackedSetValue_(sheet.getRange(dateCell.row, dateCell.col), '飛行・点検実施年月日：' + format_(date, 'yyyy年M月d日'));
  }
  setAfterLabelInBlock_(sheet, blockNo, ['飛行目的（飛行概要）','飛行目的'], session.purpose);
  setAfterLabelInBlock_(sheet, blockNo, ['飛行経路・場所','飛行経路'], session.route);
  setAfterLabelInBlock_(sheet, blockNo, ['飛行禁止空域・飛行方法','飛行空域・方法'], session.category + ' / ' + session.method);
  
  let pilotDisplay = session.pilot;
  if (session.assistant) {
    pilotDisplay += '（補助者: ' + session.assistant + '）';
  }
  setAfterLabelInBlock_(sheet, blockNo, ['操縦者・点検実施者','操縦者'], pilotDisplay);

  const certLabel = findInBlock_(sheet, blockNo, ['技能証明書番号','技能証明番号'], false);
  if (certLabel && String(sheet.getRange(certLabel.row, certLabel.col).getDisplayValue()).trim() === '技能証明番号') {
    trackedSetValue_(sheet.getRange(certLabel.row, certLabel.col), '技能証明書番号');
  }
  setAfterLabelInBlock_(sheet, blockNo, ['技能証明書番号','技能証明番号'], session.cert);
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
      } else {
        trackedSetValue_(cell, fields[key]);
      }
    }
  });
}

function writeOptionalFields_(sheet, input, blockNo, abnormal) {
  setAfterLabelInBlock_(sheet, blockNo, ['点検実施場所','点検場所'], input.inspectionLocation || '');
  setAfterLabelInBlock_(sheet, blockNo, ['不具合箇所：','不具合箇所'], input.defectLocation || '');
  setAfterLabelInBlock_(sheet, blockNo, ['事象等の内容：','事象等の内容','不具合内容'], input.defectDetail || '');

  const normalCell = findInBlock_(sheet, blockNo, ['□ 異常なし','☑ 異常なし'], false);
  const defectCell = findInBlock_(sheet, blockNo, ['□ 不具合あり','☑ 不具合あり'], false);
  if (normalCell) trackedSetValue_(sheet.getRange(normalCell.row, normalCell.col), abnormal ? '□ 異常なし' : '☑ 異常なし');
  if (defectCell) trackedSetValue_(sheet.getRange(defectCell.row, defectCell.col), abnormal ? '☑ 不具合あり' : '□ 不具合あり');

  if (abnormal || String(input.actionDetail || '').trim()) {
    const offset = block_(blockNo).startCol - 3;
    trackedSetValue_(sheet.getRange(44, 4 + offset), new Date());
    trackedSetValue_(sheet.getRange(44, 6 + offset), input.defectDetail || input.defectLocation || '');
    if (String(input.actionDetail || '').trim()) trackedSetValue_(sheet.getRange(44, 10 + offset), new Date());
    trackedSetValue_(sheet.getRange(44, 12 + offset), input.actionDetail || '');
    trackedSetValue_(sheet.getRange(44, 15 + offset), input.confirmer || '');
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
  trackedSetValues_(sheet.getRange(row, 1, 1, 8), [[
    dateFromSheetName_(session.dateSheet), session.model, session.purpose, minutes,
    input.cycle || '', input.batteryNote || '', session.route, ''
  ]]);
  return { sheetName: sheet.getName(), row: row };
}
