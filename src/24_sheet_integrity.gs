// 固定operationの適用・readbackと診断用読取。依存: adapter/compare/codec/runtime。complete再送から呼ばない。

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
    writeCommitRangeProperty_(range, decodedCommitOperationValue_(operation.value, operation.kind), operation.kind);
    if (!verifyOnly) commitFault_('AFTER_' + String(operation.stage || 'WRITE').toUpperCase() + '_OP_' + operationIndex);
  });
}

function verifyCommitPlanResult_(plan, spreadsheet) {
  const ss = spreadsheet || spreadsheet_();
  ['date','battery','postflight','totals'].forEach(function(stage) {
    applyCommitOperations_(plan.operations[stage] || [], true, ss);
  });
  return sha256Text_(canonicalJson_({ operations: plan.operations, batteryTargets: plan.batteryTargets, assignments: plan.assignments }));
}
