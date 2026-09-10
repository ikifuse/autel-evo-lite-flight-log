# ホーム画面アイコン・GAS配信の実装結果

RC監査を完了し、[RC最終報告](release-candidate-audit-2026-09-10.md)を提示した後に開始した第2課題。RC完了時の生成物SHAは`f12dbc8afff9e4e386e18501671cd9551e759d31007c4354ff71333b69ae03a7`。保存系の問題をこの作業へ混ぜていない。

## 1. 最終判定

**選択肢3：技術的な確認事項が残り、このまま無条件に本番deployすべきではない。**

画像・GAS対応コード・build・自動試験はローカル実装済み。ただし「deployだけでPixel/iPhoneに新アイコンが必ず届く」とは判定しない。新しいPNGはまだ公開しておらず、公開URLは現在も旧画像を返す。GAS外側ページでSafariがどのアイコンを採用するか、両端末のホーム画面起動も未確認。画像品質不足で止まっているのではない。

実装済みの範囲で一度受入を行うには、別途承認後に画像を既存公開先へ反映し、画像の取得確認をしてからGASを更新する必要がある。RC側の本番移行条件も引き続き残る。今回commit/push/deployは行っていない。

## 2. 旧icon.pngの実測と評価

旧HEADの`icon.png`はPNG、1254×1254、正方形、RGB、不透明、1,556,153bytes。黒い角は透過ではなく画素として描かれていた。機体写真、EVO Lite／Flight Log／AUTELの文字が入り、プロペラが左右端近くまで伸びる。32/48/64/96/128pxの縮小・円形マスクをローカル表示して確認した。

写真は大きく表示すれば判別できるが、小サイズでは文字が細かく、円形では機体端が切れる。新しい図案には企業ロゴ・写真・細かい文字を転用せず、オリジナルの四ローター図形、記録線、チェック印を使用した。旧画像はGitのHEADから復元可能であり、repository内へ別名の不要コピーは追加していない。

## 3. 画像セット

| ファイル | 寸法・形式 | 役割 |
|---|---|---|
| `src/web/assets/icon.svg` | viewBox 512×512、852bytes | 編集用オリジナル図案。文字・外部参照・商標ロゴなし |
| `src/web/assets/icon.png` | 512×512、8bit RGB PNG、13,784bytes | 配布画像の正本。Pixel/iPhone共用 |
| `icon.png` | 上記PNGと同一bytes | 既存公開URLのパスを維持するbuild生成コピー |

512pxの1画像をfavicon候補／Apple Touch Iconとして共用する。180pxはiPhoneの典型的な推奨寸法だが、より大きいPNGからの縮小を許すAppleの選択規則に沿って512pxを供給する。現GAS構成に有効なtop-level manifestを追加しないため、192pxや別のmaskable512pxなど未参照ファイルを増やさない。[Appleのアイコン選択規則](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)

背景は全面`#112a43`、図形は白、チェック背景は`#f97316`。焼き込んだ角丸や透過はない。主要画素の中心からの最大距離は171.54pxで、Androidの最小安全円半径204.8px内に全て収まる。これは画像の適性検査であり、Androidがこの画像を`purpose:maskable`として取得した実証ではない。[Androidの安全領域](https://web.dev/articles/maskable-icon)

PNGのCRC、全圧縮データの展開、寸法、RGB、余分なmetadataがないこと、ファイルサイズ、公開コピーとの一致を自動検査した。SVGの編集後にPNGを再生成する場合は、SVGから512pxへ高品質縮小し、不透明RGB・metadataなしとして保存する。画像生成・比較の一時スクリプトは/private/tmpのみ。通常buildはPNGを再描画せず正本からコピーする。

## 4. PWAの分類

**完全なinstallable PWA（A）ではない。** 旧コードはHTML内のdata URL manifestにname/short_name、`start_url:"."`、`display:"standalone"`、色、192pxと宣言した1254px画像を記載していた。scopeはなく、Service Worker・offline shellもなかった。

GAS HtmlServiceはGoogle管理の外側ページのiframe内でHTMLを実行する。manifestの取得処理はtop-levelの文書が対象なので、この内側manifestを追加するだけで外側のGAS URLをPWAにできない。旧版はChromeや旧SafariではC（ページショートカット）相当になり得る。iOS 26は通常のサイトもホーム画面Webアプリとして開けるため、機種名だけでB/Cを断定しない。[GASのiframe制約](https://developers.google.com/apps-script/guides/html/restrictions)、[HTML manifest取得規則](https://html.spec.whatwg.org/multipage/links.html#link-type-manifest)、[iOS 26のWebアプリ起動](https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/)

修正後は、**B：ホーム画面追加を使うWebアプリを意図したGAS対応metaを設定する方式**。端末で実際にBになるか、Cのブラウザ起動になるかはNOT_CHECKED。Service Workerは新設していない。ネットワークなしで新たにGAS画面をロードできるoffline shellを提供したわけではない。既に開いている画面内のローカル運航操作とは区別する。

## 5. 発見事項とHTML／GAS修正

Google公式仕様では、HTMLに直書きしたfavicon・meta・titleは外側ページの設定として使えない。`HtmlOutput`の対応APIを使う。許可metaは限定されており、theme-color、Appleのstatus-bar-style、apple-mobile-web-app-titleを勝手に`addMetaTag`へ渡さない。[HtmlOutput公式仕様](https://developers.google.com/apps-script/reference/html/html-output)

- `doGet()`に`setFaviconUrl(iconUrl)`を追加。
- `addMetaTag`で`mobile-web-app-capable=yes`と`apple-mobile-web-app-capable=yes`を設定。
- viewportは`width=device-width, initial-scale=1, viewport-fit=cover`。拡大禁止を外し、既存CSSのsafe-areaを利用する。実機のキーボード・status bar・余白は未検証。
- ページ／ホーム画面候補名は既存の`setTitle('ドローン運航記録')`を維持。追加画面で利用者が名前を編集できる。
- shellから効かないfaviconとname metaの重複を削除。charsetとtitleはHTMLの構造として維持。
- shellの`apple-touch-icon`は1個、明示的な512×512 PNG URLへ揃えた。ただしこれをGASが外側へ伝える保証はなく、iPhoneでの採用は未確認。
- 誤解を招くiframe内のdata URL manifestを削除。start_url、scope、display、theme/background colorの有効なmanifestを用意したとは報告しない。

Androidでは、採用される場合はGASの外側faviconがホーム画面用候補になる。maskable宣言によるWebAPKインストールを保証していない。iPhoneでは一般サイトのapple-touch-iconはmanifest iconより優先されるが、本件ではiframe境界があるため、取得できるPNG URLとホーム画面アイコン採用を同一視しない。未採用時はOSのフォールバック（文字等）になる可能性がある。[WebKitのアイコン規則](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)

## 6. このrepositoryの画像配信

既存URLは`https://raw.githubusercontent.com/ikifuse/autel-evo-lite-flight-log/main/icon.png`。新たなホスティングサービスや相対`/icon.png`を追加せず、既存パスを維持する。repositoryのファイルをGASへ置いただけでは画像URLにならない。

buildがPNGのSHA-256先頭16桁を`?v=80452b105a504553`としてdoGetへ埋め込み、faviconとtouch iconに同じURLを使う。公開パス本体・このquery付きURLの双方をHEADで確認し、HTTP200、Content-Type:image/png、CORS:*、cross-origin許可、max-age=300を確認した。ログインなしの公開画像として到達可能だが、**その時点のContent-Lengthは1,556,153bytesで旧画像のまま**。ローカル新画像を既に配信したとは報告しない。

queryはキャッシュ更新用であって、immutableなcommit固定ではない。mainの画像は可変で、GitHubの障害、repositoryの非公開化／削除、branchやパスの変更で表示されなくなる。旧GAS版も同じmainパスの画像変更の影響を受け得る。今回確認していない将来commitのURLを捏造してHTMLへ入れることはしなかった。

採らなかった方式：

- 相対URL：GASのoriginにはrepository静的ファイルがない。
- data URL：GAS外側favicon API・Safariホーム画面での採用が保証できない。
- ContentServiceでPNG返却：現doGetはHtmlOutputであり、通常の静的PNG配信へ無条件に置き換えない。
- 外部の別HTMLランチャー／iframeラッパー：origin・認証・起動URL・保存中下書きの運用が増えるため、アイコン目的だけでは新設しない。
- 新manifest／Service Worker：外側文書とscopeを制御する別構成が必要。本課題の最小変更に含めない。

## 7. buildと自動検証

`src/web/assets/icon.png`が正本。buildは512×512のRGB PNGを確認してroot `icon.png`を生成コピーし、画像revisionを結合コードへ反映する。`--check`は画像とdistの双方が正本に一致するか検査する。GAS24ファイル／Web12 JSのsource-orderは変更していない。

新規`tests/pwa-icons.test.js`はPNGの完全性と安全円、同一コピー、実際のdoGet関数からHtmlServiceへのfavicon/meta呼出し、title、touch linkのURL・寸法・重複・空値、未置換トークン、manifest/SWを偽装していないことを検査する。厳密なHtmlService mockは許可されたmeta名だけを受け付ける。Googleの実際の外側DOMやスマートフォンを再現する試験ではない。

PWA段階の検証結果：

- PNG／HtmlService／build統合試験：PASS。
- RC生成物との比較：doGet以外のserverコードと、全Web JSがbyte一致。保存engine、Properties、pending/recovery、readback、Lock、帳票/BAT/累計の仕様はPWA段階で変更していない。
- Web compatibility：PASS。RCで認めた差分以外を追加していない。
- build、--check、結合構文、境界／duplicate-global、git diff --check：PASS。
- APP_HTMLの承認済みsnapshot hashを新shellへ更新し、最終regression（security・TEST／通常・障害注入を含む）もPASS、終了コード0。
- RC時点のrefactor compatibility・audit safety・long-term replay・release-candidate試験はPASS。保存コード／Web JS一致の証拠と合わせて再利用する。実機PASSとして数えない。

## 8. 利用者の確認手順（公開・GAS更新を別途承認した後）

**Pixel 6a**：ChromeでいつものWebアプリを開く→メニューの「ホーム画面に追加」（版によってはインストール）→アイコンと名前を確認→追加したアイコンを押す。濃紺背景に白いドローンとオレンジのチェックが見えるか、通常画面に戻れるか、アドレスバーの有無を確認する。結果が違えば、追加画面と起動後のスクリーンショットを残す。Chromeの版で文言・起動方法が変わるため、WebAPKになるとは約束しない。[Chromeのインストール条件について](https://developer.chrome.com/blog/update-install-criteria)

**iPhone 16 Pro Max**：SafariでいつものWebアプリを開く→共有→「ホーム画面に追加」→アイコンと名前を確認→追加→アイコンから起動する。「Webアプリとして開く」が表示されるOSではオンにする。文字アイコンになる／画像が違う／Safariの通常タブへ戻る場合はスクリーンショットを残す。[Appleの操作案内](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios)

入力途中の運航があるときに、アイコン再追加やブラウザデータ消去を試さない。先に記録を確定してから行う。内部関数・draftId・Propertiesの操作は不要。アイコン検査だけではSpreadsheetへ記録を送る必要はない。

## 9. キャッシュと公開順序

新しいコードだけGASへ反映しても、GitHubの画像が旧版なら旧アイコンが表示される。まず公開画像が新図案になったことを確認する。mainへの画像反映とGAS更新は今回実行していない。

既存ホーム画面アイコンは端末に保持されるため、自動更新を前提にしない。新画像が公開済みなのに古ければ、入力がない状態で旧ホーム画面アイコンを外し、Chrome/SafariでいつものGAS URLを開き直して再追加する。これでも変わらない場合は少し時間を置き、追加画面の時点で古いか確認する。query更新やHTTP max-ageは端末のホーム画面キャッシュまで確実に消すものではない。

ブラウザのサイトデータ全消去は初手にしない。localStorageの運航下書き・引用履歴を失うおそれがある。既存GAS deploymentを更新して同じ/exec URLを保つ場合と、新deploymentでURLが変わる場合は別。新URLでは旧アイコンが旧アプリを開き続けるので、URLを確かめて再追加する。これは必ずしもコード不具合ではない。

## 10. 変更一覧・未確認・SHA

第2課題の変更は、`src/10_server_core.gs`の配信設定、`src/web/31_web_shell.html`、`src/web/assets/icon.svg`と`icon.png`、root `icon.png`、`scripts/build.mjs`、`tests/pwa-icons.test.js`、regressionのHTML snapshot、関連docs、生成`dist/Code.gs`。

**NOT_CHECKED**：新画像公開後のGET実bytes、実GAS外側DOM、Safariのtouch icon昇格／選択、Pixelのfavicon採用・丸型処理、ホーム画面名称・standalone起動、iPhoneの角丸・status bar・高DPIの実表示、両機種のsafe-area／キーボード／キャッシュ再追加。ローカル画像の円形縮小を実端末検証とはしない。

最終dist SHA-256：`4103cb0e3b1b976b3f9ab90207fa9030fb274a34157b41516e0399cc1937572d`。

PNG SHA-256：`80452b105a50455388da0f2ddf469144953f3ee69d6a53ca08dae61a26bb59f6`。

commit/push/deploy、実Spreadsheet・実Properties・pendingへの変更は行っていない。RCの局所修正は保持している。一般公開画像URLのHEAD確認だけを行った。
