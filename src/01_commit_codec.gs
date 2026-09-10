// 永続値の表現・正規JSON・UTF-8長。純粋処理。hash入力とDate表現を変更しない。

function encodedCellValue_(value) {
  if (value instanceof Date) return { __commitDate: value.toISOString() };
  return value == null ? '' : value;
}

function decodedCellValue_(value) {
  return value && typeof value === 'object' && value.__commitDate ? new Date(value.__commitDate) : value;
}

function decodedCommitOperationValue_(value, kind) {
  if (['format','fontSize','horizontalAlignment','verticalAlignment','wrap'].indexOf(kind) >= 0) return value;
  return decodedCellValue_(value);
}

function canonicalValue_(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue_);
  if (value && typeof value === 'object') {
    const result = {};
    Object.keys(value).sort().forEach(function(key) { result[key] = canonicalValue_(value[key]); });
    return result;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('保存内容に不正な数値があります。');
  return value;
}

function canonicalJson_(value) { return JSON.stringify(canonicalValue_(value)); }

function commitOperationValue_(value, kind) {
  if (['format','horizontalAlignment','verticalAlignment'].indexOf(kind) >= 0) return String(value);
  if (kind === 'fontSize') return Number(value);
  if (kind === 'wrap') return !!value;
  return encodedCellValue_(value);
}

function utf8Length_(text) { return unescape(encodeURIComponent(String(text))).length; }
