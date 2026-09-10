// 保存計画の保持期限・整理判断。既存30日complete保持と未完了の日数非削除を維持。

function cleanupCommitPlans_() {
  const properties = commitProperties_();
  const all = properties.getProperties();
  const nowMillis = now_().getTime();
  const completeLimit = COMMIT_COMPLETE_RETENTION_DAYS * 86400000;
  const metaByDraft = {};
  Object.keys(all).forEach(function(key) {
    if (key.indexOf(COMMIT_V2_PREFIX) !== 0 || !/_META$/.test(key)) return;
    try {
      const meta = JSON.parse(all[key]);
      metaByDraft[meta.draftId] = meta;
      if (meta.state === 'complete' && Number(meta.chunkCount || 0) > 0) {
        for (let index = 0; index < Number(meta.chunkCount); index++) properties.deleteProperty(commitDataKey_(meta.draftId, index));
        meta.chunkCount = 0;
        writeCommitMeta_(meta);
      }
      if (meta.state === 'complete' && meta.completedAt && nowMillis - new Date(meta.completedAt).getTime() > completeLimit) {
        properties.deleteProperty(key);
      }
      // 未完了保存計画（meta.state !== 'complete'）は日数で勝手に削除・変更しない。
      // Web画面上の診断（diagnosePendingCommitPlans）と復旧/安全破棄操作で管理する。
    } catch (ignored) {}
  });
  Object.keys(all).forEach(function(key) {
    const match = key.match(new RegExp('^' + COMMIT_V2_PREFIX + '(.+)_DATA_\\d+$'));
    if (match && !metaByDraft[match[1]]) properties.deleteProperty(key);
  });
}
