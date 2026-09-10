// 固定計画の割当・組立・容量見積。帳票写像は21/22/23、捕捉は04へ。再試行では再構築しない。

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
    throw new Error('保存用領域の空き容量が不足しています。入力内容を保持し、保存領域の保守を依頼してください。重複防止のため過去の完了証明は削除しないでください。');
  }
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

  const totals = planAircraftTotals_(models, session.flights, appTest);
  const startingByModel = totals.startingByModel;
  const finalByModel = totals.finalByModel;
  const totalTargets = totals.totalTargets;

  const capture = { stage: '', operations: [], byKey: {} };
  COMMIT_WRITE_CAPTURE = capture;
  try {
    captureDateRecords_(capture, ss, session, models, assignments, startingByModel);

    captureBatteryHistory_(capture, ss, session, batteryTargets, assignments);

    capturePostflightRecords_(capture, ss, session, postflight, assignments);

    captureAircraftTotals_(capture, ss, totalTargets, finalByModel);

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
