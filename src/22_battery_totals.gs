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

