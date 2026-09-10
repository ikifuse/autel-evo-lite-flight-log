// 機体正式累計の原本探索・読取り・固定更新計画。日付帳票の飛行時累計とは独立。

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

function captureAircraftTotals_(capture, ss, totalTargets, finalByModel) {
  totalTargets.forEach(function(target) {
    capture.stage = 'totals';
    const cell = ss.getSheetByName(target.sheetName).getRange(target.row, target.col);
    const start = capture.operations.length;
    trackedSetNumberFormat_(cell, '@');
    trackedSetValue_(cell, formatHoursMinutes_(finalByModel[target.model]));
    capture.operations.slice(start).forEach(function(operation) { operation.model = target.model; });
  });
}

function planAircraftTotals_(models, flights, appTest) {
  const startingByModel = {};
  const finalByModel = {};
  const totalTargets = [];
  models.forEach(function(model) {
    const cell = aircraftTotalCell_(model);
    startingByModel[model] = parseHoursMinutes_(cell.getDisplayValue(), model + 'の点検時の総飛行時間');
    finalByModel[model] = startingByModel[model];
    if (!appTest) totalTargets.push({ model: model, sheetName: cell.getSheet().getName(), row: cell.getRow(), col: cell.getColumn() });
  });
  (flights || []).forEach(function(flight) { finalByModel[flight.model] += Number(flight.actualMinutes); });
  return { startingByModel: startingByModel, finalByModel: finalByModel, totalTargets: totalTargets };
}
