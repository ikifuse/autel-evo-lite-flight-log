// 帳票writerの操作捕捉。依存: codec/adapter。捕捉中はセルを書かず、操作順と最初のbeforeを保持。

function recordCommitCell_(range, value, kind) {
  const sheet = range.getSheet();
  const key = kind + '|' + sheet.getName() + '|' + range.getRow() + '|' + range.getColumn();
  let operation = COMMIT_WRITE_CAPTURE.byKey[key];
  if (!operation) {
    operation = {
      kind: kind,
      stage: COMMIT_WRITE_CAPTURE.stage,
      sheetName: sheet.getName(),
      row: range.getRow(),
      col: range.getColumn(),
      before: commitRangeProperty_(range, kind),
      value: commitOperationValue_(value, kind)
    };
    COMMIT_WRITE_CAPTURE.byKey[key] = operation;
    COMMIT_WRITE_CAPTURE.operations.push(operation);
  } else {
    operation.value = commitOperationValue_(value, kind);
  }
}

function trackedSetValue_(range, value) {
  if (COMMIT_WRITE_CAPTURE) {
    recordCommitCell_(range, value, 'value');
    return range;
  }
  return writeCommitRangeProperty_(range, value, 'value');
}

function trackedSetUserText_(range, value) {
  const text = String(value == null ? '' : value);
  if (!isFormulaLikeUserText_(text)) return trackedSetValue_(range, text);
  if (COMMIT_WRITE_CAPTURE) {
    recordCommitCell_(range, text, 'text');
    return range;
  }
  return writeCommitRangeProperty_(range, text, 'text');
}

function trackedSetValues_(range, values) {
  if (COMMIT_WRITE_CAPTURE) {
    values.forEach(function(line, rowOffset) {
      line.forEach(function(value, colOffset) {
        recordCommitCell_(range.getSheet().getRange(range.getRow() + rowOffset, range.getColumn() + colOffset), value, 'value');
      });
    });
    return range;
  }
  return writeCommitRangeValues_(range, values);
}

function trackedSetNumberFormat_(range, format) {
  if (COMMIT_WRITE_CAPTURE) {
    recordCommitCell_(range, format, 'format');
    return range;
  }
  return writeCommitRangeProperty_(range, format, 'format');
}

function trackedSetFontSize_(range, size) {
  if (COMMIT_WRITE_CAPTURE) {
    recordCommitCell_(range, size, 'fontSize');
    return range;
  }
  return writeCommitRangeProperty_(range, size, 'fontSize');
}

function trackedSetHorizontalAlignment_(range, alignment) {
  if (COMMIT_WRITE_CAPTURE) {
    recordCommitCell_(range, alignment, 'horizontalAlignment');
    return range;
  }
  return writeCommitRangeProperty_(range, alignment, 'horizontalAlignment');
}

function trackedSetVerticalAlignment_(range, alignment) {
  if (COMMIT_WRITE_CAPTURE) {
    recordCommitCell_(range, alignment, 'verticalAlignment');
    return range;
  }
  return writeCommitRangeProperty_(range, alignment, 'verticalAlignment');
}

function trackedSetWrap_(range, wrap) {
  if (COMMIT_WRITE_CAPTURE) {
    recordCommitCell_(range, wrap, 'wrap');
    return range;
  }
  return writeCommitRangeProperty_(range, wrap, 'wrap');
}

function captureCommitStage_(capture, stage, work) {
  capture.stage = stage;
  const start = capture.operations.length;
  work();
  return capture.operations.slice(start);
}

let COMMIT_WRITE_CAPTURE = null;
