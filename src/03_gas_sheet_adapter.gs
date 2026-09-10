// commit operationのセル属性I/OとFormula安全出力。比較・予約・業務判断を持たない。

function commitRangeProperty_(range, kind) {
  if (kind === 'format') return range.getNumberFormat();
  if (kind === 'fontSize') return range.getFontSize();
  if (kind === 'horizontalAlignment') return range.getHorizontalAlignment();
  if (kind === 'verticalAlignment') return range.getVerticalAlignment();
  if (kind === 'wrap') return range.getWrap();
  return encodedCellValue_(range.getValue());
}

function isFormulaLikeUserText_(value) {
  return /^[\u0000-\u0020]*[=+\-@]/.test(String(value == null ? '' : value));
}

function richTextValue_(value) {
  return SpreadsheetApp.newRichTextValue().setText(String(value == null ? '' : value)).build();
}

function writeCommitRangeProperty_(range, value, kind) {
  if (kind === 'format') return range.setNumberFormat(value);
  if (kind === 'fontSize') return range.setFontSize(value);
  if (kind === 'horizontalAlignment') return range.setHorizontalAlignment(value);
  if (kind === 'verticalAlignment') return range.setVerticalAlignment(value);
  if (kind === 'wrap') return range.setWrap(value);
  if (kind === 'text') return range.setRichTextValue(richTextValue_(value));
  return range.setValue(value);
}

function writeCommitRangeValues_(range, values) { return range.setValues(values); }
