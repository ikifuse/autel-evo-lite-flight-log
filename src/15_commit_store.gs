// Script Properties永続化・容量・完了圧縮とcomplete応答cache。DATA→照合→META、complete→DATA削除を維持。

function commitCache_() { return CacheService.getScriptCache(); }

function commitProperties_() { return PropertiesService.getScriptProperties(); }

function commitMetaKey_(draftId) { return COMMIT_V2_PREFIX + draftId + '_META'; }

function commitDataKey_(draftId, index) { return COMMIT_V2_PREFIX + draftId + '_DATA_' + index; }

function propertyStorageBytes_() {
  const all = commitProperties_().getProperties();
  return Object.keys(all).reduce(function(total, key) {
    return total + utf8Length_(key) + utf8Length_(all[key]);
  }, 0);
}

function splitCommitChunks_(text) {
  const chunks = [];
  let current = '';
  Array.from(String(text)).forEach(function(character) {
    if (current && utf8Length_(current + character) > COMMIT_CHUNK_MAX_BYTES) {
      chunks.push(current);
      current = '';
    }
    current += character;
  });
  if (current || !chunks.length) chunks.push(current);
  return chunks;
}

function readCommitMeta_(draftId) {
  const raw = commitProperties_().getProperty(commitMetaKey_(draftId));
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch (error) { throw new Error('保存計画METAが破損しています。同じ運航記録を保持したまま管理者へ連絡してください。'); }
}

function writeCommitMeta_(meta) {
  meta.updatedAt = now_().toISOString();
  commitProperties_().setProperty(commitMetaKey_(meta.draftId), JSON.stringify(meta));
}

function storeCommitPlan_(plan, signature) {
  const text = canonicalJson_(plan);
  const chunks = splitCommitChunks_(text);
  if (utf8Length_(text) > SECURITY_MAX_COMMIT_PLAN_BYTES || chunks.length > SECURITY_MAX_COMMIT_CHUNKS) {
    throw new Error('保存計画の容量が上限を超えています。');
  }
  const properties = commitProperties_();
  const additionalBytes = chunks.reduce(function(total, chunk, index) {
    return total + utf8Length_(commitDataKey_(plan.draftId, index)) + utf8Length_(chunk);
  }, 0) + utf8Length_(commitMetaKey_(plan.draftId)) + 2000;
  if (propertyStorageBytes_() + additionalBytes > SECURITY_MAX_PROPERTY_STORE_BYTES) {
    throw new Error('保存用領域の空き容量が不足しています。入力内容を保持し、保存領域の保守を依頼してください。重複防止のため過去の完了証明は削除しないでください。');
  }
  chunks.forEach(function(chunk, index) { properties.setProperty(commitDataKey_(plan.draftId, index), chunk); });
  const reread = chunks.map(function(_chunk, index) {
    const value = properties.getProperty(commitDataKey_(plan.draftId, index));
    if (value == null) throw new Error('保存計画DATAの永続化に失敗しました。');
    return value;
  }).join('');
  const planHash = sha256Text_(text);
  if (sha256Text_(reread) !== planHash) throw new Error('保存計画DATAの整合性確認に失敗しました。');
  const meta = {
    version: COMMIT_PLAN_VERSION,
    draftId: plan.draftId,
    signature: signature,
    state: 'pending',
    stage: 'PLAN_READY',
    chunkCount: chunks.length,
    planHash: planHash,
    createdAt: now_().toISOString(),
    updatedAt: now_().toISOString(),
    completedAt: '',
    lastErrorStage: '',
    resultHash: ''
  };
  writeCommitMeta_(meta);
  return { meta: meta, plan: plan };
}

function loadCommitPlan_(draftId, meta) {
  meta = meta || readCommitMeta_(draftId);
  if (!meta) return null;
  if (Number(meta.version) !== COMMIT_PLAN_VERSION) throw new Error('保存計画のバージョンを確認できません。');
  if (meta.state === 'complete' && !meta.chunkCount) return { meta: meta, plan: null };
  const chunks = [];
  for (let index = 0; index < Number(meta.chunkCount || 0); index++) {
    const value = commitProperties_().getProperty(commitDataKey_(draftId, index));
    if (value == null) throw new Error('保存計画DATAが不足しています。自動再保存せず管理者へ連絡してください。');
    chunks.push(value);
  }
  const text = chunks.join('');
  if (!text || sha256Text_(text) !== meta.planHash) {
    throw new Error('保存計画DATAのハッシュが一致しません。自動再保存せず管理者へ連絡してください。');
  }
  try { return { meta: meta, plan: JSON.parse(text) }; }
  catch (error) { throw new Error('保存計画DATAを読み込めません。自動再保存せず管理者へ連絡してください。'); }
}

function compactCompletePlan_(record, resultHash) {
  const properties = commitProperties_();
  record.meta.state = 'complete';
  record.meta.stage = 'COMPLETE';
  record.meta.completedAt = now_().toISOString();
  record.meta.resultHash = resultHash;
  // completeを先に確定する。以降で停止しても同じdraftIdは再書込みされない。
  writeCommitMeta_(record.meta);
  commitFault_('AFTER_COMPLETE_META');
  const chunkCount = Number(record.meta.chunkCount || 0);
  for (let index = 0; index < chunkCount; index++) {
    properties.deleteProperty(commitDataKey_(record.meta.draftId, index));
  }
  record.meta.chunkCount = 0;
  writeCommitMeta_(record.meta);
}

function safeCommitCacheGet_(key) {
  try { return key ? commitCache_().get(key) : ''; } catch (error) { return ''; }
}

function safeCommitCachePut_(key, value) {
  try { if (key) commitCache_().put(key, value, 21600); } catch (error) {}
}

function getCommitStorageStats_() {
  const all = commitProperties_().getProperties();
  const result = { propertyCount: 0, approximateBytes: 0, states: {} };
  Object.keys(all).forEach(function(key) {
    if (key.indexOf(COMMIT_V2_PREFIX) !== 0) return;
    result.propertyCount++;
    result.approximateBytes += utf8Length_(key) + utf8Length_(all[key]);
    if (/_META$/.test(key)) {
      try {
        const state = JSON.parse(all[key]).state || 'unknown';
        result.states[state] = Number(result.states[state] || 0) + 1;
      } catch (error) { result.states.corrupt = Number(result.states.corrupt || 0) + 1; }
    }
  });
  return result;
}

function discardPendingTestPlanInternal_(draftId, meta, properties) {
  const props = properties || commitProperties_();
  const chunkCount = Number(meta.chunkCount || 0);
  for (let index = 0; index < chunkCount; index++) {
    props.deleteProperty(commitDataKey_(draftId, index));
  }
  props.deleteProperty(commitMetaKey_(draftId));
}
