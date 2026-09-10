// ============================================================================
// 2. サーバー側ロジック（全運航終了時のスプレッドシート一括書き込み）
// ============================================================================
function doGet() {
  // HtmlServiceの外側ページへ設定する。root icon.pngはbuild生成・別途公開が必要。
  // faviconは画像拡張子で形式を示すため、クエリを付けない。
  const faviconUrl = APP_ICON_URL;
  const appIconUrl = APP_ICON_URL + '?v=__ICON_REVISION__';
  const initialState = JSON.stringify(getAppState())
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return HtmlService.createHtmlOutput(
    APP_HTML
      .replace('__INITIAL_STATE__', initialState)
      .replace('__APP_VERSION__', APP_VERSION)
      .replace(/__APP_ICON__/g, appIconUrl)
  )
    .setTitle('ドローン運航記録')
    .setFaviconUrl(faviconUrl)
    .addMetaTag('mobile-web-app-capable', 'yes')
    .addMetaTag('apple-mobile-web-app-capable', 'yes')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

