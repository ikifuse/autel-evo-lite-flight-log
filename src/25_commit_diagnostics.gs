// 未完了planの読取り専用診断・説明・復旧/TEST破棄可否。書込み・削除・復旧の実行をしない。

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

  // 3. 機体累計の状態診断（read-only）
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

  // 4. ロールフォワード再開・安全復旧可能かどうかの厳格判定
  if (report.operationCounts.conflict > 0) {
    report.resumeBlockReasons.push('セル競合（conflict）が ' + report.operationCounts.conflict + ' 件検出されました');
  }
  report.safeToRecover = (report.resumeBlockReasons.length === 0);
  report.canResumeRollForward = report.safeToRecover;

  // 5. TESTで安全に破棄可能かどうかの厳格判定（すべて満たす場合のみ許可）
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

  // DATE operations の実データ書き込みチェック
  // （TESTシートが存在していても、該当ブロックに実データ書き込みがなければ安全破棄可能）
  let dateHasRealData = false;
  (plan.assignments || []).forEach(function(assignment) {
    const dSheet = ss.getSheetByName(assignment.sheetName);
    if (!dSheet) return;

    // DATE operations の実データチェック（実データ書き込みが1セルでもあれば破棄禁止）
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

function diagnosePendingCommitPlans_() {
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
    commitLog_('  機体累計状況       : ' + (r.isAppTest ? r.aircraftTotals.note : (r.aircraftTotals.matched + ' / ' + r.aircraftTotals.targets + ' 機体反映済み')));
    commitLog_('  >> 安全復旧判定    : ' + (r.safeToRecover ? '【安全に復旧可能】' : '【自動復旧不可】 理由: ' + r.resumeBlockReasons.join(', ')));
    commitLog_('  >> TEST破棄判定    : ' + (r.safeToDiscardTest ? '【TEST安全破棄可能】' : '【破棄不可】 理由: ' + (r.discardBlockReasons || []).join(', ')));
  });
  commitLog_('================================================================');

  return reports;
}
