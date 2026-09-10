// 新規planの捕捉時だけ必須項目の省略を拒否する。既存pendingはwriterを呼ばず固定操作を復旧する。
function requireCapturedField_(present, label) {
  if (COMMIT_WRITE_CAPTURE && !present) throw new Error('必須帳票欄がありません: ' + label);
}

function locationCellDisplay_(value) {
  const raw = String(value == null ? '' : value);
  const text = raw.trim();
  const match = text.match(/^(.*?)\s*[（(]\s*((?:北緯|南緯)?\s*\d{1,3}(?:\.\d+)?)\s*[,，]\s*((?:東経|西経)?\s*\d{1,3}(?:\.\d+)?)\s*[）)]$/);
  if (!match) return { text: raw, twoLine: false };
  const coordinates = '(' + match[2].trim() + ', ' + match[3].trim() + ')';
  const name = match[1].trim();
  return { text: name ? name + '\n' + coordinates : coordinates, twoLine: !!name };
}

function writeLocationCell_(cell, value) {
  const display = locationCellDisplay_(value);
  trackedSetUserText_(cell, display.text);
  trackedSetHorizontalAlignment_(cell, 'center');
  trackedSetVerticalAlignment_(cell, 'middle');
  trackedSetWrap_(cell, display.twoLine);
  if (display.twoLine) trackedSetFontSize_(cell, Math.max(1, Number(cell.getFontSize()) - 1));
}

function setLocationAfterLabelInBlock_(sheet, blockNo, labels, value) {
  const cell = findInBlock_(sheet, blockNo, labels, false);
  if (!cell) return false;
  const merged = sheet.getRange(cell.row, cell.col).getMergedRanges();
  const labelRange = merged.length ? merged[0] : sheet.getRange(cell.row, cell.col);
  const targetCol = labelRange.getColumn() + labelRange.getNumColumns();
  if (targetCol > block_(blockNo).endCol) return false;
  writeLocationCell_(sheet.getRange(cell.row, targetCol), value);
  return true;
}

function writeHeaderFields_(sheet, session, blockNo) {
  const block = block_(blockNo);
  let selectedModelFound = false;
  for (let row = 1; row <= Math.min(10, sheet.getLastRow()); row++) {
    const cell = sheet.getRange(row, block.startCol);
    const current = String(cell.getDisplayValue() || '').replace(/^[□☑✓]\s*/, '').trim();
    if (current.indexOf('Autel Robotics Co., Ltd.') >= 0) {
      const normalized = current.replace(/\s+/g, ' ');
      const selected = normalized.indexOf('/ ' + session.model + ' /') >= 0;
      if (selected) selectedModelFound = true;
      trackedSetValue_(cell, (selected ? '☑ ' : '□ ') + current);
    }
  }

  requireCapturedField_(selectedModelFound, '使用機体');
  const dateCell = findInBlock_(sheet, blockNo, ['飛行・点検実施年月日'], true);
  if (COMMIT_WRITE_CAPTURE && !dateCell) throw new Error('必須帳票欄がありません: 飛行・点検実施年月日');
  if (dateCell) {
    const date = dateFromSheetName_(session.dateSheet, true);
    trackedSetValue_(sheet.getRange(dateCell.row, dateCell.col), '飛行・点検実施年月日：' + format_(date, 'yyyy年M月d日'));
  }
  requireCapturedField_(setUserTextAfterLabelInBlock_(sheet, blockNo, ['飛行目的（飛行概要）','飛行目的'], session.purpose), '飛行目的');
  requireCapturedField_(setLocationAfterLabelInBlock_(sheet, blockNo, ['飛行経路・場所','飛行経路'], session.route), '飛行経路・場所');
  requireCapturedField_(setUserTextAfterLabelInBlock_(sheet, blockNo, ['飛行禁止空域・飛行方法','飛行空域・方法'], session.category + ' / ' + session.method), '飛行空域・方法');

  let pilotDisplay = session.pilot;
  if (session.assistant) {
    pilotDisplay += '（補助者: ' + session.assistant + '）';
  }
  requireCapturedField_(setUserTextAfterLabelInBlock_(sheet, blockNo, ['操縦者・点検実施者','操縦者'], pilotDisplay), '操縦者');

  const certLabel = findInBlock_(sheet, blockNo, ['技能証明書番号','技能証明番号'], false);
  if (certLabel && String(sheet.getRange(certLabel.row, certLabel.col).getDisplayValue()).trim() === '技能証明番号') {
    trackedSetValue_(sheet.getRange(certLabel.row, certLabel.col), '技能証明書番号');
  }
  const certWritten = setUserTextAfterLabelInBlock_(sheet, blockNo, ['技能証明書番号','技能証明番号'], session.cert);
  if (session.cert) requireCapturedField_(certWritten, '技能証明書番号');
}

function writeCheckResults_(sheet, checks, section, blockNo) {
  const names = section === '飛行前点検' ? PRE_CHECK_NAMES : POST_CHECK_NAMES;
  const checkCol = block_(blockNo).startCol + (section === '飛行前点検' ? 6 : 12);
  const values = sheetValues_(sheet);
  names.forEach(name => {
    const labels = name === '操縦装置' ? ['操縦装置','操縦装置（プロポ）','操縦装置\n（プロポ）'] : [name];
    const startCol = block_(blockNo).startCol + (section === '飛行前点検' ? 0 : 7);
    let label = null;
    for (let row = 19; row <= (section === '飛行前点検' ? 29 : 22); row++) {
      if (labels.indexOf(String((values[row - 1] || [])[startCol - 1] || '').trim()) >= 0) {
        label = { row: row, col: startCol };
        break;
      }
    }
    requireCapturedField_(!!label, section + ': ' + name);
    if (label) trackedSetValue_(sheet.getRange(label.row, checkCol), checks[name] === '正常' ? '☑' : '□');
  });
}

function writeFlightFields_(sheet, slot, fields) {
  const block = flightBlocks_(sheet).filter(item => item.blockNo === slot.blockNo)[0];
  if (!block) throw new Error('飛行記録ブロックを確認できません。');
  const aliases = {
    '使用バッテリー':['使用バッテリー'], '離陸場所':['離陸場所'], '着陸場所':['着陸場所'],
    '離陸時刻':['離陸時刻'], '着陸時刻':['着陸時刻'], '飛行時間':['飛行時間'],
    '総飛行時間':['総飛行時間','総飛行時間（累計時間）'],
    '安全に影響した事項':['安全に影響した事項','飛行の安全に影響した事項','飛行の安全に影響のあった事項'],
    'バッテリー異常・所感':['バッテリー異常・所感']
  };
  Object.keys(fields).forEach(key => {
    const col = flightColumn_(sheet, block, aliases[key] || [key]);
    if (key !== 'バッテリー異常・所感') requireCapturedField_(!!col, key);
    if (col) {
      const cell = sheet.getRange(slot.row, col);
      if (['離陸時刻', '着陸時刻', '飛行時間', '総飛行時間'].indexOf(key) >= 0) {
        trackedSetNumberFormat_(cell, '@');
        trackedSetValue_(cell, String(fields[key]));
      } else if (['離陸場所','着陸場所'].indexOf(key) >= 0) {
        writeLocationCell_(cell, fields[key]);
      } else if (['安全に影響した事項','バッテリー異常・所感'].indexOf(key) >= 0) {
        trackedSetUserText_(cell, fields[key]);
      } else {
        trackedSetValue_(cell, fields[key]);
      }
    }
  });
}

function writeOptionalFields_(sheet, input, blockNo, abnormal) {
  requireCapturedField_(setUserTextAfterLabelInBlock_(sheet, blockNo, ['点検実施場所','点検場所'], input.inspectionLocation || ''), '点検実施場所');
  const defectLocationWritten = setUserTextAfterLabelInBlock_(sheet, blockNo, ['不具合箇所：','不具合箇所'], input.defectLocation || '');
  if (abnormal || input.defectLocation) requireCapturedField_(defectLocationWritten, '不具合箇所');
  const defectDetailWritten = setUserTextAfterLabelInBlock_(sheet, blockNo, ['事象等の内容：','事象等の内容','不具合内容'], input.defectDetail || '');
  if (abnormal || input.defectDetail) requireCapturedField_(defectDetailWritten, '事象等の内容');

  const normalCell = findInBlock_(sheet, blockNo, ['□ 異常なし','☑ 異常なし'], false);
  const defectCell = findInBlock_(sheet, blockNo, ['□ 不具合あり','☑ 不具合あり'], false);
  requireCapturedField_(!!normalCell && !!defectCell, '飛行後点検結果');
  if (normalCell) trackedSetValue_(sheet.getRange(normalCell.row, normalCell.col), abnormal ? '□ 異常なし' : '☑ 異常なし');
  if (defectCell) trackedSetValue_(sheet.getRange(defectCell.row, defectCell.col), abnormal ? '☑ 不具合あり' : '□ 不具合あり');

  if (abnormal || String(input.actionDetail || '').trim()) {
    const offset = block_(blockNo).startCol - 3;
    [[4,'発生年月日'],[6,'不具合事情'],[10,'処置年月日'],[12,'処置その他'],[15,'確認']].forEach(function(item) {
      requireCapturedField_(String(sheet.getRange(43, item[0] + offset).getDisplayValue()).trim() === item[1], item[1]);
    });
    trackedSetValue_(sheet.getRange(44, 4 + offset), new Date());
    trackedSetUserText_(sheet.getRange(44, 6 + offset), input.defectDetail || input.defectLocation || '');
    if (String(input.actionDetail || '').trim()) trackedSetValue_(sheet.getRange(44, 10 + offset), new Date());
    trackedSetUserText_(sheet.getRange(44, 12 + offset), input.actionDetail || '');
    trackedSetUserText_(sheet.getRange(44, 15 + offset), input.confirmer || '');
  }
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

function captureDateRecords_(capture, ss, session, models, assignments, startingByModel) {
  captureCommitStage_(capture, 'date', function() {
    const cumulative = {};
    models.forEach(function(model) { cumulative[model] = startingByModel[model]; });
    assignments.forEach(function(assignment, assignmentIndex) {
      const sheet = ss.getSheetByName(assignment.sheetName);
      const modelSession = Object.assign({}, session, { model: assignment.model, dateSheet: assignment.sheetName, blockNo: assignment.blockNo });
      writeHeaderFields_(sheet, modelSession, assignment.blockNo);
      const ac = session.aircrafts && session.aircrafts[assignment.model];
      writeCheckResults_(sheet, (ac && ac.preflightChecks) || {}, '飛行前点検', assignment.blockNo);
      const block = flightBlocks_(sheet).filter(function(item) { return item.blockNo === assignment.blockNo; })[0];
      assignment.flightIndexes.forEach(function(flightIndex, rowIndex) {
        const flight = session.flights[flightIndex];
        const minutes = Number(flight.actualMinutes);
        cumulative[assignment.model] += minutes;
        writeFlightFields_(sheet, { blockNo: assignment.blockNo, row: block.startRow + rowIndex }, {
          '使用バッテリー': 'BAT_' + Number(flight.battery),
          '離陸場所': flight.takeoffLocation, '着陸場所': flight.landingLocation,
          '離陸時刻': format_(flight.takeoffAt, 'HH:mm'), '着陸時刻': format_(flight.landingAt, 'HH:mm'),
          '飛行時間': formatHoursMinutes_(minutes), '総飛行時間': formatHoursMinutes_(cumulative[assignment.model]),
          '安全に影響した事項': flight.safetyIssue ? (flight.safetyDetail || 'あり') : 'なし',
          'バッテリー異常・所感': flight.batteryNote || ''
        });
      });
    });
  });
}

function capturePostflightRecords_(capture, ss, session, postflight, assignments) {
  captureCommitStage_(capture, 'postflight', function() {
    assignments.forEach(function(assignment) {
      const sheet = ss.getSheetByName(assignment.sheetName);
      const acInput = (postflight.aircrafts || {})[assignment.model] || postflight;
      const checks = acInput.checks || postflight.checks || {};
      const abnormal = POST_CHECK_NAMES.some(function(name) { return checks[name] !== '正常'; });
      writeCheckResults_(sheet, checks, '飛行後点検', assignment.blockNo);
      writeOptionalFields_(sheet, {
        inspectionLocation: postflight.inspectionLocation || session.inspectionLocation,
        defectLocation: acInput.defectLocation || '', defectDetail: acInput.defectDetail || '',
        actionDetail: acInput.actionDetail || '', confirmer: postflight.confirmer || session.pilot
      }, assignment.blockNo, abnormal);
    });
  });
}
