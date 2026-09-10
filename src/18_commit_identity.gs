// 同draft内容署名・再送判定・active reservation。依存: codec/runtime/store。新規割当は行わない。

function commitSignatureV2_(normalizedInput) { return sha256Text_(canonicalJson_(normalizedInput)); }

function activeCommitReservations_(excludeDraftId) {
  const result = { blocks: {}, batteryRows: {}, activeDrafts: [] };
  const all = commitProperties_().getProperties();
  Object.keys(all).forEach(function(key) {
    if (key.indexOf(COMMIT_V2_PREFIX) !== 0 || !/_META$/.test(key)) return;
    let meta;
    try { meta = JSON.parse(all[key]); } catch (error) { return; }
    if (!meta.draftId || meta.draftId === excludeDraftId || meta.state === 'complete') return;
    result.activeDrafts.push(meta.draftId);
    const record = loadCommitPlan_(meta.draftId, meta);
    (record.plan.assignments || []).forEach(function(item) {
      result.blocks[item.sheetName + '|' + item.blockNo] = meta.draftId;
    });
    (record.plan.batteryTargets || []).forEach(function(item) {
      result.batteryRows[item.sheetName + '|' + item.row] = meta.draftId;
    });
  });
  return result;
}

function isCompleteCommit_(meta, signature) {
  if (meta.signature !== signature) {
    throw new Error('同じ運航下書きIDで送信内容が変更されています。元の内容を保持したまま管理者へ連絡してください。');
  }
  return meta.state === 'complete';
}
