// 保存系公開入口。入力・新規/再送の分岐・Lock内の処理順を統括する。
// 依存: validation/policy/plan/store/identity/retention/recovery/diagnostics。永続化済みplanは再構築しない。

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
      cleanupCommitPlans_();
      let existingMeta = readCommitMeta_(session.draftId);
      if (!existingMeta) ensureCommitPlanCapacity_(normalizedInput);
      if (existingMeta) {
        if (isCompleteCommit_(existingMeta, signature)) {
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
        // 新規保存の前に、過去の未完了draftを時系列順に直前再診断しながら自動解決（TEST安全残骸の自動整理 / 本番の安全自動復旧）
        resolvePendingCommitPlansBeforeSave_(session.draftId, spreadsheet_(), commitProperties_());

        const plan = buildFixedCommitPlan_(normalizedInput);
        record = storeCommitPlan_(plan, signature);
        commitFault_('AFTER_PLAN_PERSISTED');
      }

      return executeCommitPlanRollForward_(record, spreadsheet_());
    } catch (error) {
      if (record && record.meta.state !== 'complete') {
        failCommitProgress_(record, record.meta.stage || 'PLAN_READY', error);
      }
      throw error;
    }
  });
}

function diagnosePendingCommitPlans() { return diagnosePendingCommitPlans_(); }

function recoverPendingCommitPlan(draftId) { return recoverPendingCommitPlan_(draftId); }

function discardPendingTestCommitPlan(draftId) { return discardPendingTestCommitPlan_(draftId); }
