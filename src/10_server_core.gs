// ============================================================================
// 2. サーバー側ロジック（全運航終了時のスプレッドシート一括書き込み）
// ============================================================================
function doGet() {
  const initialState = JSON.stringify(getAppState())
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return HtmlService.createHtmlOutput(
    APP_HTML
      .replace('__INITIAL_STATE__', initialState)
      .replace('__APP_VERSION__', APP_VERSION)
      .replace(/__APP_ICON__/g, APP_ICON_URL)
  )
    .setTitle('ドローン運航記録')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}

