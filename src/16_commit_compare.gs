// before/intended/conflictに用いる値・書式の同値比較。純粋処理。依存: codec。

function normalizeCommitFormatValue_(val, kind) {
  const str = (val == null) ? '' : String(val).trim();
  if (kind === 'horizontalAlignment') {
    const lower = str.toLowerCase();
    if (lower === 'general' || lower === 'general-left' || lower === 'general-right' || lower === '' || lower === 'null') {
      return 'general';
    }
    return lower;
  }
  if (kind === 'verticalAlignment') {
    const lower = str.toLowerCase();
    if (lower === 'general' || lower === '' || lower === 'null') {
      return 'bottom';
    }
    return lower;
  }
  return str;
}

function sameCommitValue_(left, right, kind) {
  if (kind === 'horizontalAlignment' || kind === 'verticalAlignment') {
    return normalizeCommitFormatValue_(left, kind) === normalizeCommitFormatValue_(right, kind);
  }
  return canonicalJson_(left) === canonicalJson_(right);
}
