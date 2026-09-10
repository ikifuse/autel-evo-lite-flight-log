// 未完了保存の診断・復旧・TEST破棄モーダル。

function openCommitDiagnosisModal(){
  var existing = el('commitDiagnosisModal');
  if(existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'commitDiagnosisModal';
  overlay.className = 'diag-modal-overlay';
  overlay.onclick = function(e){
    if(e.target === overlay) closeCommitDiagnosisModal();
  };

  overlay.innerHTML =
    '<div class="diag-modal-content" onclick="event.stopPropagation()">' +
      '<div class="diag-modal-header">' +
        '<h3>📋 保存状態の診断</h3>' +
        '<button type="button" class="diag-modal-close" onclick="closeCommitDiagnosisModal()" aria-label="閉じる">✕</button>' +
      '</div>' +
      '<div class="diag-modal-body" id="diagModalBody">' +
        '<div style="text-align:center;padding:24px 8px;">' +
          '<div style="font-size:15px;font-weight:600;color:#1e40af;margin-bottom:8px;">スプレッドシートの保存状態を確認中...</div>' +
          '<div style="font-size:12px;color:#64748b;">読み取り専用で安全に確認しています（変更はされません）</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  runCommitDiagnosis();
}

function closeCommitDiagnosisModal(){
  var modal = el('commitDiagnosisModal');
  if(modal) modal.remove();
}

function runCommitDiagnosis(){
  var body = el('diagModalBody');
  if(!body) return;

  runServerRequest('diagnosePendingCommitPlans', undefined, function(reports){
      renderCommitDiagnosisResult(reports);
    }, function(err){
      var msg = err && err.message ? err.message : String(err);
      if(!el('diagModalBody')) return;
      el('diagModalBody').innerHTML =
        '<div class="warn-box" style="margin-bottom:12px;">' +
          '<strong style="color:#b91c1c;">⚠️ 診断処理でエラーが発生しました</strong>' +
          '<div style="margin-top:6px;font-size:13px;color:#475569;">' + esc(msg) + '</div>' +
        '</div>' +
        '<button type="button" class="btn btn-secondary diag-footer-btn" onclick="runCommitDiagnosis()">再試行する</button>' +
        '<button type="button" class="btn diag-footer-btn" style="background:#e2e8f0;color:#334155;margin-top:8px;" onclick="closeCommitDiagnosisModal()">閉じる</button>';
    });
}

function renderCommitDiagnosisResult(reports){
  var body = el('diagModalBody');
  if(!body) return;

  if(!reports || reports.length === 0){
    body.innerHTML =
      '<div class="diag-item-card is-ok">' +
        '<div style="font-weight:700;font-size:15px;color:#065f46;margin-bottom:6px;">✅ 未完了の保存はありません</div>' +
        '<div style="font-size:13px;color:#047857;">すべての運航記録は正常に保存・完了しています。<br>スプレッドシートとの競合や保留データはありません。</div>' +
      '</div>' +
      '<button type="button" class="btn btn-primary diag-footer-btn" onclick="closeCommitDiagnosisModal()">閉じる</button>';
    return;
  }

  var html = '<div style="margin-bottom:10px;font-weight:700;color:#991b1b;font-size:14px;">⚠️ 保留中・未完了の保存が ' + reports.length + ' 件見つかりました</div>';

  reports.forEach(function(r, idx){
    var stateText = r.state === 'failed' ? '失敗（途中で停止）' : (r.state === 'writing' ? '処理中（または通信切断）' : esc(r.state));
    var stageText = STAGE_HUMAN_NAMES[r.stage] || r.stage || '(不明)';
    var lastErrStageText = r.lastErrorStage ? (STAGE_HUMAN_NAMES[r.lastErrorStage] || r.lastErrorStage) : '(なし)';
    var stoppedAtText = r.lastErrorStage && r.lastErrorStage !== '(なし)' ? lastErrStageText + ' で停止' : stageText;

    var counts = r.operationCounts || { intended: 0, before: 0, conflict: 0, total: 0 };
    var hasCorruption = !r.chunksComplete || !r.planHashMatches;
    var corruptionText = hasCorruption ? '⚠️ 異常あり（データ欠落・破損の疑い）' : 'なし（正常）';

    var isSafe = !!r.safeToRecover;
    var recoveryStatusText = isSafe ? 'あり（安全に復旧可能）' : '不可';

    var detailId = 'diagDetail_' + idx;

    html +=
      '<div class="diag-item-card has-pending">' +
        '<div style="font-weight:700;font-size:14px;color:#9f1239;margin-bottom:6px;">' +
          '【保存計画 ' + (idx + 1) + '】 前回の保存が途中で止まっています' +
        '</div>' +
        '<div class="diag-grid">' +
          '<div class="diag-grid-label">状態</div><div class="diag-grid-value"><strong>' + esc(stateText) + '</strong></div>' +
          '<div class="diag-grid-label">止まった場所</div><div class="diag-grid-value"><strong>' + esc(stoppedAtText) + '</strong></div>' +
          '<div class="diag-grid-label">未書込み</div><div class="diag-grid-value">' + counts.before + ' 件</div>' +
          '<div class="diag-grid-label">書込み済み</div><div class="diag-grid-value">' + counts.intended + ' 件（全' + counts.total + '件中）</div>' +
          '<div class="diag-grid-label">競合件数</div><div class="diag-grid-value">' + (counts.conflict > 0 ? '<span style="color:#dc2626;font-weight:700;">' + counts.conflict + ' 件</span>' : '0 件') + '</div>' +
          '<div class="diag-grid-label">データ破損の有無</div><div class="diag-grid-value">' + esc(corruptionText) + '</div>' +
          '<div class="diag-grid-label">安全に復旧できるか</div><div class="diag-grid-value"><strong style="color:' + (isSafe ? '#15803d' : '#b91c1c') + ';">' + recoveryStatusText + '</strong></div>' +
        '</div>';

    if(r.statusCategory === 'SAFE_TO_RECOVER'){
      html +=
        '<div style="margin-top:12px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:12px;text-align:center;">' +
          '<div style="font-size:13px;font-weight:700;color:#065f46;margin-bottom:4px;">✨ 前回の保存を安全に復旧できます</div>' +
          '<div style="font-size:12px;color:#047857;margin-bottom:10px;line-height:1.4;">' +
            '前回の続きの書き込みを安全に完了し、保留状態を解除します。<br>（重複記録や累計の二重加算は発生しません）' +
          '</div>' +
          '<button type="button" class="btn btn-success" style="font-size:15px;padding:13px;width:100%;font-weight:700;" onclick="executeCommitRecovery(\'' + esc(r.draftId) + '\')">' +
            '🚀 前回の保存を安全に復旧する' +
          '</button>' +
        '</div>';
    } else if(r.statusCategory === 'SAFE_TO_DISCARD_TEST'){
      html +=
        '<div style="margin-top:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;text-align:center;">' +
          '<div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:4px;">💡 このTEST保存は安全に破棄できます</div>' +
          '<div style="font-size:12px;color:#b45309;margin-bottom:10px;line-height:1.4;">' +
            'TEST日付シートは既に削除されており、BAT履歴や機体累計にも書き込まれていません。<br>' +
            'このテスト保存計画を破棄して保留ロックを解除し、現在の入力内容を保存できるようにします。' +
          '</div>' +
          '<button type="button" class="btn btn-danger" style="font-size:15px;padding:13px;width:100%;font-weight:700;background:#dc2626;color:#ffffff;border:none;border-radius:6px;" onclick="executeTestCommitDiscard(\'' + esc(r.draftId) + '\')">' +
            '🗑️ このTEST保存を破棄して解除' +
          '</button>' +
        '</div>';
    } else {
      html +=
        '<div class="warn-box" style="margin-top:10px;background:#fef2f2;border-left:4px solid #ef4444;padding:10px;">' +
          '<strong style="color:#b91c1c;">⚠️ 自動処理できません。詳細を確認してください</strong>' +
          '<div style="font-size:12px;color:#7f1d1d;margin-top:4px;">' +
            '理由: ' + esc((r.resumeBlockReasons || []).concat(r.discardBlockReasons || []).filter(function(v,i,a){return a.indexOf(v)===i;}).join(' / ') || '競合またはデータ不整合') +
          '</div>' +
        '</div>';
    }

    html +=
        '<button type="button" class="diag-detail-toggle" onclick="toggleDiagDetail(\'' + detailId + '\')">▶ 詳しい技術情報（draftIdなど）を見る</button>' +
        '<div id="' + detailId + '" class="diag-detail-box" style="display:none;">' +
          'draftId: ' + esc(r.draftId) + '\n' +
          '運航種別: ' + (r.isAppTest ? 'アプリテスト (TEST運航)' : '通常運航') + '\n' +
          '状態分類: ' + esc(r.statusCategory || '') + '\n' +
          '目的: ' + esc(r.purpose || '') + '\n' +
          '作成日時: ' + esc(r.createdAt) + '\n' +
          '更新日時: ' + esc(r.updatedAt) + '\n' +
          'DATA chunks: ' + (r.chunksComplete ? '完全' : '一部欠落') + '\n' +
          'planHash一致: ' + (r.planHashMatches ? '一致' : '不一致') + '\n' +
          'セル状態: intended ' + r.operationCounts.intended + ' / before ' + r.operationCounts.before + ' / conflict ' + r.operationCounts.conflict + ' 件\n' +
          '機体累計状況: ' + (r.isAppTest ? r.aircraftTotals.note : (r.aircraftTotals.matched + ' / ' + r.aircraftTotals.targets + ' 件')) + '\n' +
          (r.conflicts && r.conflicts.length > 0 ? ('\n[競合詳細]:\n' + esc(JSON.stringify(r.conflicts, null, 2))) : '') +
        '</div>' +
      '</div>';
  });

  html +=
    '<button type="button" class="btn btn-secondary diag-footer-btn" onclick="closeCommitDiagnosisModal()">閉じる</button>';

  body.innerHTML = html;
}

function executeCommitRecovery(draftId){
  var body = el('diagModalBody');
  if(!body) return;

  body.innerHTML =
    '<div style="text-align:center;padding:32px 12px;">' +
      '<div style="font-size:16px;font-weight:700;color:#1e40af;margin-bottom:8px;">前回の保存を復旧中...</div>' +
      '<div style="font-size:13px;color:#64748b;margin-bottom:12px;">スプレッドシートの残りの書き込みを安全に完了しています</div>' +
      '<div class="text-sm" style="color:#0369a1;">（端末に入力中の下書きは保持されています）</div>' +
    '</div>';

  runServerRequest('recoverPendingCommitPlan', draftId, function(res){
      if(!el('diagModalBody')) return;
      el('diagModalBody').innerHTML =
        '<div class="diag-item-card is-ok" style="padding:16px;text-align:center;">' +
          '<div style="font-weight:700;font-size:16px;color:#065f46;margin-bottom:8px;">' +
            '✅ 前回の保存を復旧しました。現在の運航を保存できます' +
          '</div>' +
          '<div style="font-size:13px;color:#047857;line-height:1.5;margin-bottom:14px;">' +
            '前回の保存は正常に完了し、保留状態が解除されました。<br>' +
            '端末の入力内容はそのまま保持されていますので、このまま「運航日誌を確定する」を押して保存してください。' +
          '</div>' +
          '<button type="button" class="btn btn-primary diag-footer-btn" onclick="closeCommitDiagnosisModal()">閉じる</button>' +
        '</div>';
    }, function(err){
      var msg = err && err.message ? err.message : String(err);
      if(!el('diagModalBody')) return;
      el('diagModalBody').innerHTML =
        '<div class="warn-box" style="margin-bottom:12px;">' +
          '<strong style="color:#b91c1c;">⚠️ 復旧処理でエラーが発生しました</strong>' +
          '<div style="margin-top:6px;font-size:13px;color:#475569;">' + esc(msg) + '</div>' +
        '</div>' +
        '<button type="button" class="btn btn-secondary diag-footer-btn" onclick="runCommitDiagnosis()">もう一度確認する</button>' +
        '<button type="button" class="btn diag-footer-btn" style="background:#e2e8f0;color:#334155;margin-top:8px;" onclick="closeCommitDiagnosisModal()">閉じる</button>';
    });
}

function executeTestCommitDiscard(draftId){
  var body = el('diagModalBody');
  if(!body) return;

  body.innerHTML =
    '<div style="text-align:center;padding:32px 12px;">' +
      '<div style="font-size:16px;font-weight:700;color:#991b1b;margin-bottom:8px;">テスト保存計画を破棄中...</div>' +
      '<div style="font-size:13px;color:#64748b;margin-bottom:12px;">保留ロックを安全に解除しています</div>' +
      '<div class="text-sm" style="color:#0369a1;">（端末に入力中の下書きは保持されています）</div>' +
    '</div>';

  runServerRequest('discardPendingTestCommitPlan', draftId, function(res){
      if(!el('diagModalBody')) return;
      el('diagModalBody').innerHTML =
        '<div class="diag-item-card is-ok" style="padding:16px;text-align:center;">' +
          '<div style="font-weight:700;font-size:16px;color:#065f46;margin-bottom:8px;">' +
            '✅ 保留中のテスト保存を破棄しました' +
          '</div>' +
          '<div style="font-size:13px;color:#047857;margin-bottom:16px;line-height:1.5;">' +
            '保留ロックが解除されました。<br>入力中の下書きは保持されています。<br>「閉じる」を押して、そのまま一括保存を実行できます。' +
          '</div>' +
          '<button type="button" class="btn btn-primary diag-footer-btn" onclick="closeCommitDiagnosisModal()">閉じる</button>' +
        '</div>';
    }, function(err){
      var msg = err && err.message ? err.message : String(err);
      if(!el('diagModalBody')) return;
      el('diagModalBody').innerHTML =
        '<div class="warn-box" style="margin-bottom:12px;">' +
          '<strong style="color:#b91c1c;">⚠️ 破棄処理でエラーが発生しました</strong>' +
          '<div style="margin-top:6px;font-size:13px;color:#475569;">' + esc(msg) + '</div>' +
        '</div>' +
        '<button type="button" class="btn btn-secondary diag-footer-btn" onclick="runCommitDiagnosis()">再試行する</button>' +
        '<button type="button" class="btn diag-footer-btn" style="background:#e2e8f0;color:#334155;margin-top:8px;" onclick="closeCommitDiagnosisModal()">閉じる</button>';
    });
}

function toggleDiagDetail(id){
  var elBox = el(id);
  if(!elBox) return;
  var isHidden = elBox.style.display === 'none';
  elBox.style.display = isHidden ? 'block' : 'none';
}
