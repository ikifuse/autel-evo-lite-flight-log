// BAT履歴の空き行選択と固定行への写像。再試行の行再選択は禁止。

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

function captureBatteryHistory_(capture, ss, session, batteryTargets, assignments) {
  batteryTargets.forEach(function(target, targetIndex) {
    const start = capture.operations.length;
    const flight = session.flights[target.flightIndex];
    const assignment = assignments.filter(function(item) { return item.flightIndexes.indexOf(target.flightIndex) >= 0; })[0];
    writeBatteryHistoryAt_(ss.getSheetByName(target.sheetName), target.row, {
      dateSheet: assignment.sheetName, model: flight.model, purpose: session.purpose, route: session.route
    }, Number(flight.actualMinutes), { cycle: flight.cycle || '', batteryNote: flight.batteryNote || '' });
    capture.operations.slice(start).forEach(function(operation) { operation.stage = 'battery'; operation.targetIndex = targetIndex; });
  });
}
