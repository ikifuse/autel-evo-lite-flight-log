// 手修正後の計算継続。保存engineとは独立した、所有者が一度導入する編集トリガー。
// 生データ・過去日付行・機体原本・Properties・保存計画は変更しない。
const CALC_CONTINUITY_SHEET = '_計算継続管理';
const CALC_CONTINUITY_VERSION = 'EVO_CALC_CONTINUITY_V1';

function calculationSpecs_() {
  const specs = [];
  for (let battery = 1; battery <= 7; battery++) {
    const sheet = 'BAT_' + battery;
    const ref = "'" + sheet + "'!";
    // TESTの疑似運航は実飛行・実使用の集計に加えない。履歴そのものは残す。
    const valid = 'NOT(REGEXMATCH(' + ref + 'C13:C212,"^アプリテスト( \\[気象: .*\\])?$"))';
    specs.push({ sheet: sheet, cell: 'B7', mode: 'duration', raw: '=IFNA(SUM(FILTER(' + ref + 'D13:D212,' + valid + ')),0)' });
    specs.push({ sheet: sheet, cell: 'B8', mode: 'number', raw: '=IFNA(COUNT(FILTER(' + ref + 'D13:D212,' + valid + ')),0)' });
    specs.push({ sheet: sheet, cell: 'B9', mode: 'latest', key: '=IFNA(LOOKUP(2,1/((' + ref + 'E13:E212<>"")*' + valid + '),ROW(' + ref + 'E13:E212)&":"&' + ref + 'A13:A212&":"&' + ref + 'D13:D212&":"&' + ref + 'E13:E212),"")', raw: '=IFNA(LOOKUP(2,1/((' + ref + 'E13:E212<>"")*' + valid + '),' + ref + 'E13:E212),"")' });
    specs.push({ sheet: sheet, cell: 'E3', mode: 'latest', key: '=IFNA(LOOKUP(2,1/((' + ref + 'A13:A212<>"")*' + valid + '),ROW(' + ref + 'A13:A212)&":"&' + ref + 'A13:A212&":"&' + ref + 'D13:D212&":"&' + ref + 'E13:E212),"")', raw: '=IFNA(LOOKUP(2,1/((' + ref + 'A13:A212<>"")*' + valid + '),' + ref + 'A13:A212),"")' });
  }
  ['=COUNTA(\'バッテリー台帳\'!A5:A11)', '=COUNT(\'バッテリー台帳\'!F5:F11)', '=COUNT(\'バッテリー台帳\'!F5:F11)-COUNTIF(\'バッテリー台帳\'!F5:F11,">60")', '=COUNT(\'バッテリー台帳\'!F9:F11)', '=COUNTIF(\'バッテリー台帳\'!J5:J11,"あり")'].forEach(function(raw, index) {
    specs.push({ sheet: 'バッテリー台帳', cell: 'P' + (index + 2), mode: 'number', raw: raw });
  });
  return specs;
}

function calculationAliases_() {
  const aliases = [];
  for (let battery = 1; battery <= 7; battery++) {
    ['B9', 'B7', 'B8', 'E3', 'E4'].forEach(function(cell, index) {
      aliases.push({ sheet: 'バッテリー台帳', cell: String.fromCharCode(70 + index) + (battery + 4), targetSheet: 'BAT_' + battery, targetCell: cell });
    });
  }
  return aliases;
}

function calculationFormula_(row, mode) {
  const r = "'" + CALC_CONTINUITY_SHEET + "'!";
  const raw = r + 'D' + row, base = r + 'E' + row, at = r + 'F' + row;
  if (mode === 'latest') return '=IF(' + r + 'J' + row + '=' + r + 'K' + row + ',' + base + ',' + raw + ')';
  const value = '(' + base + '+' + raw + '-' + at + ')';
  if (mode === 'duration') return '=IF(' + value + '<0,"要確認",TEXT(INT(' + value + '/60),"00")&":"&TEXT(MOD(' + value + ',60),"00"))';
  return '=' + value;
}

function calculationAnchor_(value, display, mode) {
  if (mode === 'latest') {
    if (value instanceof Date) {
      if (!Number.isFinite(value.getTime())) throw new Error('日付を確認してください。');
      return new Date(value.getTime());
    }
    if (typeof value === 'string' && isFormulaLikeUserText_(value)) throw new Error('計算欄には値を入力してください。');
    return value;
  }
  if (value === '' || value == null) return 0;
  if (mode === 'duration') {
    const match = String(display || value).trim().match(/^(\d+):([0-5]\d)$/);
    if (!match) throw new Error('累計は00:00のように時間:分で入力してください。');
    const minutes = Number(match[1]) * 60 + Number(match[2]);
    if (!Number.isSafeInteger(minutes)) throw new Error('累計時間が大きすぎます。');
    return minutes;
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error('回数・本数は0以上の整数で入力してください。');
  return number;
}

function calculationAliasFormula_(alias) {
  const ref = "'" + alias.targetSheet + "'!" + alias.targetCell;
  return '=IF(' + ref + '="","",' + ref + ')';
}

function calculationCellInRange_(cell, range) {
  return cell.getSheet().getSheetId() === range.getSheet().getSheetId() &&
    cell.getRow() >= range.getRow() && cell.getRow() <= range.getLastRow() &&
    cell.getColumn() >= range.getColumn() && cell.getColumn() <= range.getLastColumn();
}

// GASエディタから所有者が一度実行する。既存の計算継続管理がある場合は再初期化しない。
function installCalculationContinuity_() {
  return locked_(function() {
    const ss = spreadsheet_(), specs = calculationSpecs_(), aliases = calculationAliases_();
    let helper = ss.getSheetByName(CALC_CONTINUITY_SHEET);
    if (helper && helper.getRange(1, 1).getValue() !== CALC_CONTINUITY_VERSION) throw new Error('同名の別シートがあります。上書きしません。');
    if (!helper) {
      const snapshots = specs.map(function(spec) {
        const sheet = ss.getSheetByName(spec.sheet);
        if (!sheet) throw new Error(spec.sheet + ' が見つかりません。');
        const cell = sheet.getRange(spec.cell);
        if (/^#/.test(cell.getDisplayValue())) throw new Error(spec.sheet + '!' + spec.cell + ' に計算エラーがあります。');
        return { spec: spec, display: cell.getDisplayValue(), formula: cell.getFormula(), anchor: calculationAnchor_(cell.getValue(), cell.getDisplayValue(), spec.mode) };
      });
      aliases.forEach(function(alias) {
        const cell = ss.getSheetByName(alias.sheet).getRange(alias.cell);
        if (!cell.getFormula()) throw new Error(alias.sheet + '!' + alias.cell + ' は既に値へ変更されています。導入前に基準値を確認してください。');
      });
      helper = ss.insertSheet(CALC_CONTINUITY_SHEET);
      // 書込み失敗時も、既存表示欄に触れる前の状態で停止する。
      const rows = [[CALC_CONTINUITY_VERSION, 'cell', 'mode', 'raw', 'corrected', 'raw_at_edit', 'updated', 'original_formula', 'original_display']];
      snapshots.forEach(function(item) {
        rows.push([item.spec.sheet, item.spec.cell, item.spec.mode, '', item.anchor, '', new Date(), item.formula ? "'" + item.formula : '', item.display]);
      });
      helper.getRange(1, 1, rows.length, 9).setValues(rows);
      helper.getRange('K1').setValue('PREPARING');
    }
    let stage = helper.getRange('K1').getValue();
    if (stage !== 'PREPARING' && stage !== 'PREPARED' && stage !== 'READY') throw new Error('導入途中の管理シートを確認してください。再初期化はしません。');
    specs.forEach(function(spec, i) {
      if (helper.getRange(i + 2, 1).getValue() !== spec.sheet || helper.getRange(i + 2, 2).getValue() !== spec.cell) throw new Error('管理表の対応が変わっています。自動で上書きしません。');
    });
    if (stage === 'PREPARING') {
      specs.forEach(function(spec, i) { helper.getRange(i + 2, 4).setFormula(spec.raw); if (spec.key) helper.getRange(i + 2, 10).setFormula(spec.key); });
      SpreadsheetApp.flush();
      const baselines = specs.map(function(spec, i) {
        const cell = helper.getRange(i + 2, 4);
        if (/^#/.test(cell.getDisplayValue())) throw new Error('計算式を確認できません。既存表示欄は変更していません。');
        return [cell.getValue()];
      });
      helper.getRange(2, 6, baselines.length, 1).setValues(baselines);
      specs.forEach(function(spec, i) { if (spec.key) helper.getRange(i + 2, 11).setValue(helper.getRange(i + 2, 10).getValue()); });
      helper.getRange('K1').setValue('PREPARED');
      stage = 'PREPARED';
    }
    const handler = 'continueCalculationsAfterEdit_';
    if (!ScriptApp.getProjectTriggers().some(function(t) { return t.getHandlerFunction() === handler && t.getTriggerSourceId() === ss.getId(); })) {
      ScriptApp.newTrigger(handler).forSpreadsheet(ss).onEdit().create();
    }
    if (stage === 'PREPARED') {
      specs.forEach(function(spec, i) {
        const cell = ss.getSheetByName(spec.sheet).getRange(spec.cell);
        const intended = calculationFormula_(i + 2, spec.mode);
        if (cell.getFormula() === intended) return;
        const oldFormula = String(helper.getRange(i + 2, 8).getValue()).replace(/^'/, '');
        const oldDisplay = String(helper.getRange(i + 2, 9).getValue());
        if (cell.getFormula() !== oldFormula || cell.getDisplayValue() !== oldDisplay) throw new Error(spec.sheet + '!' + spec.cell + ' が導入開始後に変更されました。値を保持して停止します。');
        cell.setFormula(intended);
      });
      helper.getRange('K1').setValue('READY');
    }
    helper.hideSheet();
    return '計算継続を導入しました。現在値と過去履歴は維持しています。';
  });
}

function continueCalculationsAfterEdit_(event) {
  if (!event || !event.range || !event.source || event.source.getId() !== SPREADSHEET_ID) return;
  return locked_(function() {
    const ss = event.source, helper = ss.getSheetByName(CALC_CONTINUITY_SHEET);
    if (!helper || helper.getRange(1, 1).getValue() !== CALC_CONTINUITY_VERSION) throw new Error('計算継続管理を確認できません。修正値はそのまま保持しています。');
    if (helper.getRange('K1').getValue() !== 'READY') throw new Error('計算継続は導入途中です。入力値を保持しています。');
    const specs = calculationSpecs_(), aliases = calculationAliases_(), changes = [];
    specs.forEach(function(spec, i) {
      const sheet = ss.getSheetByName(spec.sheet);
      if (!sheet) return;
      const cell = sheet.getRange(spec.cell);
      if (calculationCellInRange_(cell, event.range) && !cell.getFormula()) changes.push({ spec: spec, row: i + 2, cell: cell, origin: cell });
    });
    aliases.forEach(function(alias) {
      const sheet = ss.getSheetByName(alias.sheet);
      if (!sheet) return;
      const cell = sheet.getRange(alias.cell);
      if (!calculationCellInRange_(cell, event.range) || cell.getFormula()) return;
      const targetSheet = ss.getSheetByName(alias.targetSheet);
      if (!targetSheet) throw new Error(alias.targetSheet + ' がないため修正値を保持して停止します。');
      const i = specs.findIndex(function(s) { return s.sheet === alias.targetSheet && s.cell === alias.targetCell; });
      changes.push({ spec: i < 0 ? { mode: 'latest' } : specs[i], row: i < 0 ? 0 : i + 2, cell: targetSheet.getRange(alias.targetCell), origin: cell, alias: alias });
    });
    changes.forEach(function(change) {
      if (change.row && (helper.getRange(change.row, 1).getValue() !== change.spec.sheet || helper.getRange(change.row, 2).getValue() !== change.spec.cell)) throw new Error('管理表の対応が変わっています。修正値を保持して停止します。');
    });
    // 複数セル貼付けも、全入力を検証してから変更する。独自に入力された数式は尊重する。
    changes.forEach(function(change) {
      change.value = change.origin.getValue();
      change.display = change.origin.getDisplayValue();
      change.anchor = calculationAnchor_(change.value, change.display, change.spec.mode);
      if (change.row) {
        change.raw = helper.getRange(change.row, 4).getValue();
        change.key = helper.getRange(change.row, 10).getValue();
        if (typeof change.raw === 'string' && /^#/.test(change.raw)) throw new Error('参照先の計算エラーです。入力値を保持して停止します。');
      }
    });
    changes.forEach(function(change) {
      if (change.row) {
        helper.getRange(change.row, 5, 1, 3).setValues([[change.anchor, change.raw, new Date()]]);
        if (change.spec.key) helper.getRange(change.row, 11).setValue(change.key);
        change.cell.setFormula(calculationFormula_(change.row, change.spec.mode));
      } else {
        change.cell.setValue(change.value);
      }
      if (change.alias) change.origin.setFormula(calculationAliasFormula_(change.alias));
    });
  });
}
