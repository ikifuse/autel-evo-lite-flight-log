# Release Candidate総合監査（2026-09-10）

## 1. 判定と対象

**C. NOT READY（無条件の次期本番リリース承認は保留）**。

今回の局所修正・ローカル検証は完了した。永久complete証明が存在する記録の長期再送保護は維持されている。一方、旧30日cleanupで既に証明が消えた記録の有無と、旧pendingに欠けている帳票出力の扱いは未確認であり、全過去draftに対する安全性を保証できない。この移行条件を確認せず本番へ進めることは承認しない。現行コードで二重累計を新たに再現したという意味ではない。

開始時はmain、HEAD `c4ed81b61e422ea63cf0639ce4e283f4dffeb1d7`、working treeはクリーン。前回修正は同commitに取り込まれていた。`src/`が正本、`dist/Code.gs`はbuild生成物。分割・以前の監査は再実施せず、[前回監査](audit-2026-09-10.md)・[長期再送続報](long-term-replay-review.md)・既存試験を引き継いだ。本書はPWA作業開始前のRC時点の報告であり、後続作業のSHAと混同しない。

## 2. 今回の発見と修正

- 新規plan捕捉時に、必須ヘッダー・点検項目・飛行項目を黙って省略できた。必須項目が見つからない／ラベル右側に出力先がない場合はplan永続化前に停止する。
- 前後点検の「機体全般」「プロペラ・フレーム」は同名なので、片側の欠損を反対側で検出してしまった。実原本の前点検列・19〜29行、後点検列・19〜22行を区別した。
- 使用BATの履歴ヘッダーが壊れても固定列へ保存できた。使用するBATのみ、12行目の8見出しを確認する。
- localStorageの書込み例外が無視され、圏外時は最新の後点検入力をcaptureする前に戻っていた。入力/change/pagehideで進行中下書きを同期保存し、setItem後getItemの一致を確認する。圏外時も最新入力を保存し、確認できた場合だけ保存済みと案内する。読込み失敗・JSON破損も警告し、元の保存値は削除しない。
- 長時間開いたWebが起動時の日付で新しい運航を開始した。新規開始時に日本時間の現在日を採用する。開始済み下書きは変更しない。
- 点検項目ごとの全表読取りを、同じwriter呼出し内の1回へ集約した。current値のキャッシュ、Lock短縮、flush/readback削除は行っていない。

## 3. 帳票の必須条件

実原本は前回の読取りを再利用し、今回も日常点検のJ24:O29・Y24:AD29を読取り専用で確認した。点検実施場所、異常なし／不具合あり、不具合箇所、事象等の内容の表記を照合した。Spreadsheetへ書込みはしていない。

| 条件 | 新規保存時の扱い |
|---|---|
| 常時（TEST／通常、0飛行を含む） | 選択機体、実施日、目的、経路・場所、カテゴリー／方法、操縦者、前11・後4点検、点検実施場所、後点検結果の両見出しを必須とする |
| 1飛行以上 | 使用BAT、離着陸場所・時刻、飛行時間、総飛行時間、安全事項の8欄。使用BATシートの8見出しも必須 |
| 技能証明番号あり | 技能証明番号の出力先を必須とする |
| 後点検異常／対応する内容入力あり | 不具合箇所・事象内容の出力先を確認する。異常または処置入力時は43行目の記事見出しを確認する |
| 日付側BAT所感 | 実原本に独立欄がないため必須にしない。BAT履歴の所感欄へ保存する既存仕様を維持 |
| 0飛行 | BAT行は作らず、BATヘッダーも検査しない。既存のブロック割当が利用する「使用バッテリー」目印は引き続き必要 |
| 既存pending | 新しいwriterを呼ばず元のfixed planを復旧する。欠けたoperationを追加・再生成しない |
| complete再送 | 帳票構造を再検査して書き直す経路へ入れない。手動訂正・日付シート削除を維持 |

検出時はMETA/DATA・BAT行・公式累計を作らない。計画前の既存処理により、原本コピーだけが残る場合はある。前段で別の安全なpendingが自動復旧される既存契約も変更していない。「全Spreadsheetが無変更になる」という保証ではない。

**未保証**：全結合範囲、保護設定、罫線、枠移動、見出しの重複、固定記事欄の結合形状、過去シート全体。見出し検査だけであらゆる構造破損を検出したとはしない。正常時の記事欄欠損は今回の必須条件外。異常時の記事出力先は現原本の固定位置を前提とする。異なる帳票変種は新規保存が停止する可能性がある。

旧pendingに元から不足する記録を自動補完しない判断は固定plan契約を守るため。該当pendingが存在するかは未確認。ある場合は元planの完了後に人が帳票を確認・訂正するか、先に復旧を止めて業務確認するかをデプロイ前に決める。新しいplanへの作り替えは不採用。

## 4. 下書き・日付・端末

進行中のPRE／READY／BATTERY_CHANGE／LANDING／POST_ALLは、イベントで既存capture関数を呼び、同じ保存キー／session形式を保持する。戻る履歴は端末に残し、送信から除外する前回修正も維持した。同期保存を選んだのはdebounce待ち中の終了による消失窓を作らないため。保存失敗は警告し、連続した失敗で毎キー入力のalertが繰り返されないようにしている。

ローカル試験で、各画面の未確定日本語入力→イベント→storage→新しいWeb環境で復元、圏外で最終入力capture、例外／書込み無反映の検出、破損JSONを削除しない警告を確認した。これはブラウザのプロセスkill、iOSの保存領域消去、別端末、別origin、OSによるイベント省略に対する保証ではない。

残るもの：運航開始前の最初のフォームには進行中sessionがなく、自動下書き保存の対象外。GPSのプログラム代入はinputイベントを出さないため、次の操作／pagehideまで未永続の場合がある。大量の戻る履歴を含む同期保存の端末負荷、保存失敗後の実端末での復旧操作も未確認。開始前フォームは飛行実績をまだ含まないためP2、進行中のイベントが届かない強制終了は実機受入事項とする。

日付シートは設計書どおり運航開始日を基準にする。JSTの23:59:59／翌日00:10／翌年の新規開始と、開始済み運航の3日後の操作で日付を変えないことを確認した。端末時計自体の誤りは補正しない。開始前画面の「本日」表示は起動時情報のため、長時間放置時に表示だけ古い可能性がある。既に作った旧Web下書きの日付を新GASが推測で変更することもしない。離着陸時刻と運航日の範囲検証は既存のまま。

## 5. Formula readback・業務判断

| 論点 | 結論 |
|---|---|
| Formula Injection | 自由入力の=、+、-、@開始文字列をRichTextとして出力する既存防御を維持。Web→serverでも日本語・数式風入力を試験 |
| getValue / getDisplayValue | 前者をbefore/intended/current比較、後者を見出し検出に使用。表示文字列一致を保存値一致に置き換えない |
| 同じ評価結果の数式 | 現行readbackはgetFormulaを比較しない。pending中に同じ評価結果の数式へ変えた場合は区別できない。旧planにはbeforeFormulaがないため、全旧pendingに一律の数式禁止を追加しない |
| 数式比較の将来案 | 新planに数式のbefore/intended契約を追加し、旧planは別互換規則にする。既存operation/hash比較の変更を伴うため今回は未実装。完了後の手動数式編集を復元してはいけない |
| PRE_ABNORMAL | 現在のWebは中止のみ。正常な前点検後に飛行を取りやめる0-flight保存と別経路。点検異常を別帳票へ残す運用か、異常状態のまま0-flightを確定する導線を追加するかの業務判断が必要。法的な記録充足性は未判定。単に後点検へ進むボタンを足すと異常内容の機体別保存契約を取りこぼし得るため未実装 |
| 同一BAT再離陸 | 同じBAT番号で複数flightを保存でき、1飛行1行・BAT履歴も1行ずつになる。現在は継続時にBAT交換確認画面へ進むUX。保存構造の制約ではないため今回は変更しない |

## 6. 保存・長期再送・容量・障害

永久証明、30日後の同一キー縮小、容量不足時の新規拒否を維持。31／366／3660日、TEST／通常、同じdraft、入力変更拒否、手動訂正、日付シート削除、長期pending、旧B版complete/pending、complete書込み前後の障害、縮小前後のProperties障害は既存long-term試験を再利用して最終版で検証した。

証明はNode測定でkey+value約280bytes/件。400KiB枠を証明だけで割れば約1460件だが、新規plan・pending・他Propertiesが必要なので運用可能件数ではない。約399KiB（408800bytes）時には既存complete再送を許し、新規保存を止め、証明を追い出さない。長期間利用しないだけでは件数は増えない。今後の容量保守は全履歴照会を維持する設計が必要で、単純な古い証明削除は不可。

旧コードで既に削除されたUUID証明は復元できない。UUID v4の未送信下書きと消失済み完了記録を入力だけから区別できず、Spreadsheetを不変DB扱いして推測しない。実Propertiesを読んだ／存在確認したとは報告しない。証明欠落があれば信頼できるバックアップからの証明復元、または旧入力の受付境界を変更する別設計が必要。旧TTL版へのロールバックも不可。

今回追加したProperties getProperty/getProperties失敗、flush各位置（最後のLock解放前を含む）と、既存のchunk途中／DATE／BAT／POSTFLIGHT／累計／FINAL_FLUSH／VERIFIED後／complete前後／応答消失／cache障害／META・DATA破損／unknown version／UUID不正／第三値競合を組み合わせて確認した。段階的な部分保存はあり得るが、同じplanの再送で重複行・二重累計を作らない。Script Lockの実競合・待ち時間はNodeでは証明しない。

## 7. 性能・API・責務・security

同じ更新済みfixtureを旧HEADとRCへ渡した30飛行・2機体測定では、getDataRange/getDisplayValuesが538/551回から460/473回へ減少。getRange3851、getValue2720、openById8、flush6、operation1000、plan124079bytesは一致。過去の3695/2600回は簡略fixtureの値なので直接比較しない。これらはNode mock呼出し回数であり、リモートRPC数や実行秒数ではない。

残る主要因は、captureDateRecords→flightBlocks/findInBlock、飛行の各field→flightColumn/labelColumn、各flight→fixedBatteryRow、各stageのapply/verify、cleanup・容量計算のProperties全読取り。chunk分割はcurrent+character全体のUTF-8長を繰り返し計算する。これらの追加最適化は今回実装せず、実GAS測定後の候補とする。

全srcのメソッド呼出しを走査し、Range/Sheet/Spreadsheet/RichText/Lock/Properties/Cache/Utilities/HtmlServiceの利用を前回の公式API照合と突合した。getEntireRowやDeveloper Metadata依存はない。追加したAPIは既存のgetDisplayValue/getDisplayValuesと標準JavaScript・localStorage。Node通過をGAS実行成功とみなさない。参照：[Range](https://developers.google.com/apps-script/reference/spreadsheet/range)、[Properties](https://developers.google.com/apps-script/reference/properties/properties)、[割当制限](https://developers.google.com/apps-script/guides/services/quotas)。

24 server／12 Web JSの境界を維持。必須帳票検査はrecords/BAT、保存検証はstorage、イベント配線はbootstrap、日付決定はworkflow。engineへGAS比較・永続化を戻していない。公開RPC6個、内部末尾_、plan version、Propertiesキー、固定operationの永続形式を維持した。

securityは既存の入力境界、prototype系キー拒否、UUID、自由入力RichText、診断HTML escapingを再確認。新しい外部送信先・権限は追加していない。テスト内の「PIXEL」はシナリオ名であり実Pixelの結果ではない。

## 8. ローカル最終検証

最終結果はすべてPASS（テスト終了コード0）。

| 検証 | 結果 |
|---|---|
| build / --check、source-order / web-source-order一致、結合Web構文 | PASS |
| 結合GASのNode構文検査 | PASS（実GAS実行ではない） |
| tests/regression.test.js | PASS：全回帰・security・TEST／通常・既存障害注入 |
| tests/refactor-compat.test.js | PASS：旧B基準の正常plan/hashとpending/complete移行 |
| tests/web-compat.test.js | PASS：意図したRC差分は専用試験へ分離 |
| tests/audit-safety.test.js | PASS：前回局所修正・Web→server 0〜30飛行 |
| tests/long-term-replay.test.js | PASS：長期再送・容量・手動修正・永久証明 |
| tests/release-candidate.test.js | PASS：今回の必須欄・Web永続化・JST・複合入力・追加障害注入 |
| 責務境界／duplicate-global | PASS：server24ファイル162globals、Web12ファイル114globals |
| 境界検査ツールの自己試験 | 10ケースPASS |
| git diff --check | PASS |

RC生成物 `dist/Code.gs` SHA-256：
`f12dbc8afff9e4e386e18501671cd9551e759d31007c4354ff71333b69ae03a7`

変更ファイル：

- `src/21_sheet_records.gs`、`src/22_battery_history.gs`
- `src/web/32_web_core.js`、`33_web_engine.js`、`37_web_storage.js`、`41_web_workflow.js`、`43_web_bootstrap.js`
- `dist/Code.gs`（build生成）
- `tests/regression.test.js`、`tests/web-compat.test.js`、新規`tests/release-candidate.test.js`
- `docs/index.md`、`docs/invariants.md`、`docs/test-spec.md`、`docs/long-term-replay-review.md`、本報告

一時ログは `/private/tmp/evo-rc-verified-*.log` ほか `/private/tmp/evo-rc-*`。PWA段階へ渡す前の生成物コピーとチェックポイントも同ディレクトリ側へ保持する。

## 9. 実機で未確認・受入手順

**NOT_CHECKED**：実GAS実行時間、Spreadsheetリモート待ち、Lock待ち、実Properties残量・証明集合、flush latency、実RichText・merge・format出力、Pixel 6a Chrome、iPhone 16 Pro Max Safari／ホーム画面起動、キーボード・safe area・viewport、GPS権限／逆ジオコーダー、OSのkill・復帰・保存領域消去。今回PWA作業はまだ着手していない。

移行条件を解消して別途デプロイを承認した後、利用者が行う最小受入：

1. PixelとiPhoneの両方でWebを開く。目的は必ず「アプリテスト」。通常の点検入力から0飛行で確定し、TEST日付シートに点検が入り、正式累計が変わらないことを目視確認する。
2. 1飛行を入力し、離陸／着陸場所、日本語の安全事項・所感を保存する。TEST帳票とBAT履歴に1行ずつ、正式累計は不変を確認する。
3. 入力途中で別アプリへ移動して戻る。再読込みでも入力・点検選択が戻るか確認する。異常時は画面を閉じずスクリーンショットを残す。
4. 最終画面で機内モードにして確定を押す。入力が残ることを確認し、通信復帰後に同じ画面から確定する。TEST/BATが重複していないか確認する。
5. 両端末でキーボード表示、最下部ボタン、戻る、GPS許可／拒否、ホーム画面から復帰を確認する。

利用者へdraftId、Properties操作、内部関数実行を要求しない。TESTでもBAT履歴には実際に行を作るため、受入は別途承認された時点だけ行う。

## 10. 残存リスク・未修正の理由

- **リリース前条件**：消失済みcomplete証明・既存pendingの出力不足の有無と対処方針。運用証拠／業務判断が必要。
- **高〜中**：PRE_ABNORMAL記録の業務方針、旧Webで既に作った日付誤りの扱い。自動変更すると既存入力・署名を変えてしまう。
- **中**：pending中の同値数式差異、帳票の結合／枠移動等、実端末での下書き保存保証、同期保存負荷。固定plan契約や実環境の確認が必要。
- **P2**：開始前フォームの未確定入力、放置時の日付表示、同一BAT再離陸の操作負担、GPS代入直後の永続化窓。
- **将来保守**：永久証明の容量増加、cleanupと大規模planの実時間。安全停止を安易な削除で回避しない。

commit／push／deploy、実Properties・pending・本番Spreadsheetの変更は行っていない。一時probe／ログは/private/tmp配下で、repositoryには正式回帰試験と文書のみを追加した。
