function getOrCreateDateSheet_(spreadsheet, date, forceNew, startSequence, appTest) {
  const baseName = (appTest ? 'TEST_' : '') + format_(date, 'yyyy.M.d');
  let index = Math.max(1, Number(startSequence) || 1);
  let name = index === 1 ? baseName : baseName + '_' + index;
  while (true) {
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) {
      const template = spreadsheet.getSheetByName(TEMPLATE_NAME);
      if (!template) throw new Error('日常点検シートが見つかりません。');
      sheet = template.copyTo(spreadsheet).setName(name);
      return sheet;
    }
    if (appTest && !dateSheetStructureUsable_(sheet)) {
      index++;
      name = baseName + '_' + index;
      continue;
    }
    // forceNewが指定されていない場合、かつ空きブロック（No.1またはNo.2）があればこのシートを使用
    if (!forceNew && (!blockUsed_(sheet, 1) || !blockUsed_(sheet, 2))) {
      return sheet;
    }
    // 両ブロック使用済み、または別現場（forceNew）の場合は自動で次の連番シート（例: 2026.9.4_2）を探す
    index++;
    name = baseName + '_' + index;
  }
}

function sheetValues_(sheet) { return sheet.getDataRange().getDisplayValues(); }

function dateSheetStructureUsable_(sheet) {
  const values = sheetValues_(sheet);
  return [1, 2].every(function(blockNo) {
    const block = block_(blockNo);
    let aircraftRows = 0;
    for (let row = 0; row < Math.min(10, values.length); row++) {
      for (let col = block.startCol - 1; col < block.endCol; col++) {
        if (String((values[row] || [])[col] || '').indexOf('Autel Robotics Co., Ltd.') >= 0) aircraftRows++;
      }
    }
    return aircraftRows >= 2 &&
      !!findInBlock_(sheet, blockNo, ['飛行・点検実施年月日'], true) &&
      !!findInBlock_(sheet, blockNo, ['飛行目的（飛行概要）','飛行目的'], false) &&
      !!findInBlock_(sheet, blockNo, ['使用バッテリー'], false) &&
      PRE_CHECK_NAMES.every(function(name) {
        const labels = name === '操縦装置' ? ['操縦装置','操縦装置（プロポ）','操縦装置\n（プロポ）'] : [name];
        return !!findInBlock_(sheet, blockNo, labels, false);
      }) &&
      POST_CHECK_NAMES.every(function(name) { return !!findInBlock_(sheet, blockNo, [name], false); });
  });
}

function findInBlock_(sheet, blockNo, labels, contains) {
  const block = block_(blockNo);
  const values = sheetValues_(sheet);
  for (let row = 0; row < values.length; row++) {
    for (let col = block.startCol - 1; col < block.endCol; col++) {
      const value = String((values[row] || [])[col] || '').trim();
      if (labels.some(label => contains ? value.indexOf(label) >= 0 : value === label)) {
        return { row: row + 1, col: col + 1 };
      }
    }
  }
  return null;
}

function block_(blockNo) {
  const block = BLOCKS[blockNo];
  if (!block) throw new Error('No.' + blockNo + ' の帳票範囲を確認できません。');
  return block;
}

function blockUsed_(sheet, blockNo) {
  const block = block_(blockNo);
  const values = sheet.getRange(6, block.startCol, 35, block.endCol - block.startCol + 1).getDisplayValues();
  return values.some(row => row.some(value => {
    const text = String(value || '').trim();
    return /^[☑✓]/.test(text) || /^BAT_[1-7]$/.test(text);
  }));
}

function labelColumn_(sheet, row, startCol, endCol, labels) {
  const values = sheetValues_(sheet)[row - 1] || [];
  for (let col = startCol; col <= endCol; col++) {
    if (labels.indexOf(String(values[col - 1] || '').trim()) >= 0) return col;
  }
  return 0;
}

function setAfterLabelInBlock_(sheet, blockNo, labels, value) {
  const cell = findInBlock_(sheet, blockNo, labels, false);
  if (!cell) return false;
  const merged = sheet.getRange(cell.row, cell.col).getMergedRanges();
  const labelRange = merged.length ? merged[0] : sheet.getRange(cell.row, cell.col);
  const targetCol = labelRange.getColumn() + labelRange.getNumColumns();
  if (targetCol > block_(blockNo).endCol) return false;
  trackedSetValue_(sheet.getRange(cell.row, targetCol), value == null ? '' : value);
  return true;
}

function setUserTextAfterLabelInBlock_(sheet, blockNo, labels, value) {
  const cell = findInBlock_(sheet, blockNo, labels, false);
  if (!cell) return false;
  const merged = sheet.getRange(cell.row, cell.col).getMergedRanges();
  const labelRange = merged.length ? merged[0] : sheet.getRange(cell.row, cell.col);
  const targetCol = labelRange.getColumn() + labelRange.getNumColumns();
  if (targetCol > block_(blockNo).endCol) return false;
  trackedSetUserText_(sheet.getRange(cell.row, targetCol), value);
  return true;
}

function flightBlocks_(sheet) {
  return [1, 2].map(blockNo => {
    const header = findInBlock_(sheet, blockNo, ['使用バッテリー'], false);
    if (!header) throw new Error('No.' + blockNo + ' の飛行記録欄を確認できません。');
    const block = block_(blockNo);
    return { blockNo: blockNo, headerRow: header.row, startCol: block.startCol,
      endCol: block.endCol, startRow: header.row + 1, endRow: header.row + 7 };
  });
}

function flightColumn_(sheet, block, labels) {
  return labelColumn_(sheet, block.headerRow, block.startCol, block.endCol, labels);
}

