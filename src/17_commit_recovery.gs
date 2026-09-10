// 既存固定計画のroll-forward・進捗管理・先行pendingの順次解決。flush/readback/Lock境界を維持。

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
    setCommitProgress_(record, 'writing', currentStage);

    currentStage = 'BAT_HISTORY_WRITTEN';
    record.plan.batteryTargets.forEach(function(target, index) {
      applyCommitOperations_(record.plan.operations.battery.filter(function(operation) {
        return operation.targetIndex === index;
      }), false, ss);
      commitFault_('AFTER_BAT_' + target.battery);
      commitFault_('AFTER_BAT_WRITE_BEFORE_PROGRESS');
    });
    SpreadsheetApp.flush();
    applyCommitOperations_(record.plan.operations.battery, true, ss);
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

function recoverPendingCommitPlan_(draftId) {
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

function discardPendingTestCommitPlan_(draftId) {
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
