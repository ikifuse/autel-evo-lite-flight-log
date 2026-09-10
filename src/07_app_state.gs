// 画面用状態の読取りと組立。依存: runtime/time/aircraft totals。保存判定を持たない。

function getAppState() {
  const today = format_(now_(), 'yyyy.M.d');
  const ss = spreadsheet_();
  const todaySheet = ss.getSheetByName(today);
  const totalLite = aircraftTotalMinutes_('EVO Lite');
  const totalLitePlus = aircraftTotalMinutes_('EVO Lite+');

  return {
    active: false,
    today: today,
    hasTodaySheet: !!todaySheet,
    batteries: Array.from({ length: 7 }, (_, index) => ({ value: index + 1, label: 'BAT_' + (index + 1) })),
    totals: {
      'EVO Lite': { minutes: totalLite, label: minutesLabel_(totalLite) },
      'EVO Lite+': { minutes: totalLitePlus, label: minutesLabel_(totalLitePlus) }
    },
    session: null
  };
}
