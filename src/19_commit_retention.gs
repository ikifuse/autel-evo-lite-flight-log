// complete証明は期限で削除しない。30日後は同じキーの小さな証明へ縮小する。

function cleanupCommitPlans_() {
  const properties = commitProperties_();
  const all = properties.getProperties();
  const nowMillis = now_().getTime();
  const completeLimit = COMMIT_COMPLETE_RETENTION_DAYS * 86400000;
  Object.keys(all).forEach(function(key) {
    if (key.indexOf(COMMIT_V2_PREFIX) !== 0 || !/_META$/.test(key)) return;
    try {
      const meta = JSON.parse(all[key]);
      if (!meta || commitMetaKey_(meta.draftId) !== key || Number(meta.version) !== COMMIT_PLAN_VERSION) return;
      validateDraftId_(meta.draftId);
      if (meta.state === 'complete' && Number(meta.chunkCount || 0) > 0) {
        for (let index = 0; index < Number(meta.chunkCount); index++) properties.deleteProperty(commitDataKey_(meta.draftId, index));
        meta.chunkCount = 0;
        writeCommitMeta_(meta);
      }
      if (meta.state === 'complete' && meta.completedAt && nowMillis - new Date(meta.completedAt).getTime() > completeLimit) {
        // 書込み済みの事実と入力同一性だけを永久保持する。先に削除しない。
        // 置換失敗なら旧METAが残り、置換後の応答消失でも新証明で再送を止める。
        if (typeof meta.signature !== 'string' || !meta.signature) return;
        const proof = {
          version: meta.version, draftId: meta.draftId, signature: meta.signature,
          state: 'complete', stage: 'COMPLETE', chunkCount: 0, completedAt: meta.completedAt
        };
        const text = JSON.stringify(proof);
        if (JSON.stringify(meta) !== text) properties.setProperty(key, text);
      }
      // 未完了保存計画（meta.state !== 'complete'）は日数で勝手に削除・変更しない。
      // Web画面上の診断（diagnosePendingCommitPlans）と復旧/安全破棄操作で管理する。
    } catch (ignored) {}
  });
  Object.keys(all).forEach(function(key) {
    const match = key.match(new RegExp('^' + COMMIT_V2_PREFIX + '(.+)_DATA_\\d+$'));
    // JSON破損やdraftId不一致でも、METAキーが存在するDATAは孤児ではない。
    // 復旧の証拠を失わないよう、METAの解析結果を削除根拠にしない。
    if (match && !Object.prototype.hasOwnProperty.call(all, commitMetaKey_(match[1]))) properties.deleteProperty(key);
  });
}
