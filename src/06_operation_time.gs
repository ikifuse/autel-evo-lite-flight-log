// 運航日・HH:MM・時間表示の変換。Spreadsheetや保存状態に依存しない。

function dateFromSheetName_(sheetName, allowTestPrefix) {
  const pattern = allowTestPrefix
    ? /^(?:TEST_)?(\d{4})\.(\d{1,2})\.(\d{1,2})(?:_\d+)?$/
    : /^(\d{4})\.(\d{1,2})\.(\d{1,2})(?:_\d+)?$/;
  const match = String(sheetName || '').match(pattern);
  if (!match) throw new Error('日付シート名を日付へ変換できません：' + sheetName);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < SECURITY_OPERATION_YEAR_MIN || year > SECURITY_OPERATION_YEAR_MAX || month < 1 || month > 12) {
    throw new Error('運航日を確認してください。');
  }
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error('運航日を確認してください。');
  }
  return date;
}

function parseHoursMinutes_(value, label) {
  const text = String(value == null ? '' : value).trim();
  const match = text.match(/^(\d{2,}):([0-5]\d)$/);
  if (!match) throw new Error((label || '累計時間') + 'はHH:MM形式で入力してください（例：00:00、105:27）。');
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const total = hours * 60 + minutes;
  if (!Number.isSafeInteger(total)) throw new Error((label || '累計時間') + 'が大きすぎます。');
  return total;
}

function formatHoursMinutes_(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(m / 60);
  const mins = m % 60;
  return String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0');
}

function minutesLabel_(minutes) {
  const value = Math.max(0, Math.round(Number(minutes) || 0));
  return Math.floor(value / 60) + '時間' + (value % 60) + '分';
}
