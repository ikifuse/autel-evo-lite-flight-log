# コードマップ

本書は変更目的から対象コード・関連試験へ進む索引である。まず最短入口表、必要なら該当節の関数から読み、全ファイル・全関数を一括探索しない。同じ「場所」や「累計」でも保存先と書込み経路が異なるため、対象欄を取り違えないこと。

## 関連仕様書と参照基準

設計・仕様判断が必要なら [01設計書目次](../01_ドローン運航記録_設計書/00_目次.md) から担当章を読む。技術契約は [architecture](architecture.md)、試験の選択・実行は [test-spec](test-spec.md#8-テスト実行コマンドと合否判定) が正本。以下の関連テスト欄は選択の手掛かりであり、全件実行の指示ではない。

## 0. 不具合・変更目的別の最短入口

次の2～4ファイルを出発点とし、呼出契約に影響すると分かった場合だけ読む範囲を広げる。以下の番号はファイル名の先頭番号であり、結合順ではない。依存方向は[architecture 4](architecture.md#4-責務と依存方向)、公開入口は[architecture 5](architecture.md#5-公開入口と保存契約)、実行順は`source-order.json` / `web-source-order.json`を参照する。

| 変更・不具合 | 最初に読む担当ファイル（`src/`。Webは`src/web/`） | 関連テスト |
|---|---|---|
| 保存入口・新規/再送の分岐 | `12_commit_engine.gs` + `18_commit_identity.gs` | 同UUID、pending署名、complete再送 |
| plan・保存先・新しい記録項目 | `14_commit_plan.gs` + 対象の`21_sheet_records.gs` / `22_battery_history.gs` / `23_aircraft_totals.gs` | plan JSON、operation順、0-flight、複数機体 |
| JSON・chunk・Properties容量 | `15_commit_store.gs` + `01_commit_codec.gs`。事前見積は`14_commit_plan.gs` | chunk欠落・境界・容量・planHash |
| recovery安全条件・conflict | `25_commit_diagnostics.gs` + `16_commit_compare.gs`。実行は`17_commit_recovery.gs` | T16～23、先行draft再診断、第三者変更 |
| 読戻し・セル属性API | `24_sheet_integrity.gs` + `03_gas_sheet_adapter.gs` | 値/書式照合、Formula安全出力、GAS API境界 |
| ScriptLock・flush位置 | `02_gas_runtime.gs` + `17_commit_recovery.gs` | 互換試験の呼出順。実時間・同時実行は実GASで別検証 |
| active reservation | `18_commit_identity.gs` + `14_commit_plan.gs` | BAT行/No.枠予約、他pending保護 |
| complete証明・保持整理 | `19_commit_retention.gs` + `15_commit_store.gs` | 無期限証明・30日後詳細縮小、未完了非削除、complete後の手動編集 |
| JSON/UUID入力・業務規則 | `11_server_validation.gs` + `05_operation_policy.gs` | 入力境界・無変更拒否 |
| 型・時間表現 | `01_commit_codec.gs` + `06_operation_time.gs` | canonical JSON、Date、HH:MM |
| 下書き復元・画面戻る | `37_web_storage.js` + `41_web_workflow.js` + 対象画面`35`/`36` | 旧READY、Storage障害、各画面capture |
| 保存ボタン・通信エラー | `33_web_engine.js` + `38_web_rpc.js` + `36_web_postflight.js` | offline、失敗保持、render→clear→通知 |
| 診断/復旧/TEST破棄画面 | `40_web_diagnosis.js` + `38_web_rpc.js`。サーバー条件は`25`/`17` | 診断RPC、復旧/破棄UI、競合詳細escaping |
| GPS・逆ジオコーディング | `39_web_gps.js` + `32_web_core.js` | GPS成功、権限拒否、住所取得失敗 |
| 新画面・route登録 | 対象画面 + `33_web_engine.js` + `43_web_bootstrap.js`。状態追加は`41` | Web全体起動、route/action/capture |
| 点検・選択肢の説明文 | `42_web_catalog.js` + 対象画面。サーバー規則は`00`/`05` | UI表示と許可リスト・保存互換 |

## 1. 設定・定数

- 入口: `src/00_config.gs` の `MODELS`、`BLOCKS`、`FLIGHT_PURPOSES`。機体・帳票・点検・保存上限を定義し、`APP_VERSION`はWeb出力にも使う。
- 確認範囲: 変更する定数の参照元から追う。対象シート・原本の契約は [Spreadsheet仕様2](spreadsheet-spec.md#2-必須シートと原本構成)。

## 2. Web配信・画面状態・GAS実行基盤

- 入口: `src/10_server_core.gs` の `doGet`、`src/07_app_state.gs` の `getAppState`。外側ページのviewport・PWAメタ・faviconは`doGet`、当日・BAT候補・正式累計は`getAppState`を読む。
- 共通基盤: `src/02_gas_runtime.gs`（Spreadsheet接続・Lock・hash・fault/log）。日付・HH:MM変換は `src/06_operation_time.gs`。
- 関連試験: Web起動、日時変換、ScriptLock作用順、TEST 1～15、`tests/pwa-icons.test.js`。

## 3. 入力検証

- 入口: `src/11_server_validation.gs` の `normalizedCommitInput_` / `validateDraftId_`、`src/05_operation_policy.gs` の `validateCommitBusinessInput_`。構造・正規化から業務許可リストへ進む。
- 数式として扱わせない出力は `src/04_commit_capture.gs` / `src/03_gas_sheet_adapter.gs`。上限の正本は [architecture 10](architecture.md#10-入力境界の詳細)。
- 関連試験: 入力境界、Formula Injection、上限超過時の無変更確認。

## 4. 固定保存計画 / 冪等性 / roll-forward

- 入口: `src/12_commit_engine.gs` の `finishAircraft`。公開診断・復旧・TEST破棄もこの入口から追う。公開APIの契約は [architecture 5](architecture.md#5-公開入口と保存契約)。
- 新規planは `src/14_commit_plan.gs` の `buildFixedCommitPlan_`、段階実行は `src/17_commit_recovery.gs` の `executeCommitPlanRollForward_` / `resolvePendingCommitPlansBeforeSave_`。永続化・比較などの個別変更は [最短入口表](#0-不具合変更目的別の最短入口) へ。
- 関連試験: UUID、Properties chunk、before/intended/conflict、T16～23、B基準pending/complete互換。技術契約は [architecture 9](architecture.md#9-固定保存計画の詳細契約)。

## 5. 日付シート生成とNo.1/No.2枠

- 入口: `src/20_sheet_core.gs` の `getOrCreateDateSheet_`、`src/14_commit_plan.gs` の `nextFixedSheetAndBlock_`。空き枠の探索と必要時のシート生成を追う。
- 対象・試験: 日付/TEST日付のNo.枠、同日連番、場所変更、機体交代、7飛行単位、TEST 4～7。配置・命名は [Spreadsheet仕様3](spreadsheet-spec.md#3-日常点検シート仕様)。

## 6. 場所表示

- 入口: 日付シートは `src/21_sheet_records.gs` の `locationCellDisplay_` / `writeLocationCell_`、BAT履歴は `src/22_battery_history.gs` の `writeBatteryHistoryAt_`。ヘッダー・離着陸欄とBATの飛行場所は別経路を通る。
- 名称/GPSの表示・フォント・配置と、列幅/行高を変えない条件は [Spreadsheet仕様7](spreadsheet-spec.md#7-セル内の場所表示と書式ルール)。

## 7. 飛行記録

- 入口: `src/21_sheet_records.gs` の `captureDateRecords_` / `writeFlightFields_`。ブロック・列探索に関わる場合は `src/20_sheet_core.gs`。
- 対象・試験: BAT、離着陸場所・時刻、飛行時間・累計、安全影響、BAT所感の行への写像。TEST 1～8・11～13、No.1/No.2・7飛行単位。

## 8. 飛行前・飛行後点検

- 入口: `src/21_sheet_records.gs` の `writeCheckResults_` / `writeOptionalFields_`。前点検は`captureDateRecords_`、後点検は`capturePostflightRecords_`から呼ぶ。
- 対象・試験: 前後点検、異常・処置・確認者の帳票写像。TEST 14、T19、Formula Injection。

## 9. BAT履歴

- 入口: `src/22_battery_history.gs` の `fixedBatteryRow_` / `captureBatteryHistory_`。計画組立は`14`、予約は`18`、適用・照合は`24`へ進む。
- 対象・試験: BAT個別履歴、TEST 8・13、T17・T18、行再利用・二重保存防止。セル配置は [Spreadsheet仕様5](spreadsheet-spec.md#5-バッテリー個別シートbat_1--bat_7仕様)。

## 10. 機体公式累計

- 入口: `src/23_aircraft_totals.gs` の `aircraftTotalMinutes_` / `planAircraftTotals_`。時間表現は`06`、画面表示は`07`、更新実行は`17`/`24`。
- 対象: 機体別原本の正式累計。日付シートの各飛行時点の表示を直す場合は [飛行記録](#7-飛行記録) へ。原本・計算規則は [Spreadsheet仕様6](spreadsheet-spec.md#6-機体原本と機体累計時間仕様)。

## 11. アプリテスト

- 入口: `src/05_operation_policy.gs` の `isAppTestPurpose_`、`src/14_commit_plan.gs`（割当）、`src/23_aircraft_totals.gs`（正式累計の除外）。
- 関連試験: TEST分離、気象付き目的、累計、再送、連番、BAT行再利用、0-flight。記録対象と除外条件は [Spreadsheet仕様4](spreadsheet-spec.md#4-test日付シート仕様)、検証目的は [test-spec 5](test-spec.md#5-アプリテストの検証仕様)。

## 12. Webスタイル・デザイン（CSS）

- 入口: `src/web/30_web_styles.css`。色・フォント・余白・Safe Area・レスポンシブ配置を扱う。HTML構造が関わる場合だけシェル・対象画面へ進む。
- 端末幅・タップ領域の仕様は [第3章](../01_ドローン運航記録_設計書/03_画面・運航フロー.md#端末幅と操作性)、作業手順は [feature-guide 3](feature-guide.md#3-uiデザインスタイル変更時の手順)。

## 13. Webシェル・HTML骨格

- 入口: `src/web/31_web_shell.html`。touch icon、ヘッダーの通信・状態バッジ、戻るボタン、`#app`、loadingのHTML骨格を扱う。
- 外側ページのviewport・PWAメタ・faviconを変更する場合は [Web配信](#2-web配信画面状態gas実行基盤) の`doGet`を読む。

## 14. Web共通DOM・画面port

- 入口: `src/web/32_web_core.js` の `configureScreenPorts` / `showFormErrors` / `esc`。共通DOM・時刻表示・入力エラー・通信バッジを扱う。
- `screenState`・`screenAction`等のportと注入契約は [architecture 4](architecture.md#4-責務と依存方向)。STATEは`41`、選択肢は`42`、保存は`37`、気象入力は`34`へ進む。

## 15. Web controller / router

- 入口: `src/web/33_web_engine.js` の `callServer` / `render` / `captureCurrentScreenDraft`。保存payload・成功/失敗処理・戻る/中止/リセット・画面登録を扱う。
- phase更新は`41`、RPCは`38`、画面退避は`35`/`36`、route登録は`43`。保存成功時の状態・render・下書き消去順は [architecture 6.1](architecture.md#61-進行中下書きと日付)。

## 16. 運航開始画面（トップ）

- 入口: `src/web/34_web_start.js` の `renderStartView` / `submitStartOperation` / `applyLastOperation`。開始条件・カテゴリー判定・許可期限・気象・補助者候補を扱う。
- 送信は`screenAction('startAircraft')`、前回条件/氏名履歴は`37`。Spreadsheetへ直接書かずsession初期データを作る。

## 17. 飛行前点検・BAT交換・待機・飛行・着陸

- 入口: `src/web/35_web_flight.js`。対象phaseの`render*View` / `submit*`から読む。タイマー、安全タグ、機体交代の画面操作も担当する。
- 入力退避は`captureFlightScreenDraft`（PRE / BATTERY_CHANGE / READY / LANDING）。状態遷移を変える場合は`41`へ進む。運航フロー・各入力の意味は [設計第3章](../01_ドローン運航記録_設計書/03_画面・運航フロー.md)。

## 18. 飛行後点検・一括保存・終了

- 入口: `src/web/36_web_postflight.js` の `renderPostView` / `submitAllPostflight` / `capturePostflightScreenDraft`。機体ごとの点検・全機体正常選択・下書き退避を扱う。
- 保存経路は`screenAction('finishAircraft')` → Web`33`/`38` → GAS`12`。中止は`33`、時刻表示は`32`、初回起動は`43`。

## 19. Legacy互換

- 入口: `src/13_legacy_compat.gs` の `finishAircraftLegacy_`。通常作業では読まない。旧方式の日付・BAT・累計互換専用で、現行入口は`finishAircraft`。
- TEST 10は旧累計再実行互換を扱う。凍結対象であり、削除・書換え禁止。

## 20. Web下書き・直前履歴

- 入口: `src/web/37_web_storage.js` の `persistOperationDraft` / `restoreOperationDraft`。前回条件と補助者候補の履歴処理も担当し、UUID生成・メモリ内の戻る履歴は`41`。
- 保存キー・復元・失敗時の契約は [architecture 6.1](architecture.md#61-進行中下書きと日付)。試験は旧READYのBAT引継ぎ・PREへの補完、Storage障害、再読込、補助者の重複除去。

## 21. Web RPC

- 入口: `src/web/38_web_rpc.js` の `runServerRequest`。呼出元は`33`/`40`、引数省略と成功/失敗callbackを確認する。
- STATE・DOM・LocalStorageへ作用しない通信境界は [architecture 4](architecture.md#4-責務と依存方向)。

## 22. Web GPS

- 入口: `src/web/39_web_gps.js` の `fetchCurrentGps`。`43`が`screenGps`へ注入する。DOM操作に関わる場合は`32`。
- 取得先・timeout・手入力継続の仕様は [第3章](../01_ドローン運航記録_設計書/03_画面・運航フロー.md#場所入力とgps)。試験はGPS成功、住所取得失敗、権限拒否。

## 23. Web保存診断・復旧・TEST破棄

- 入口: `src/web/40_web_diagnosis.js` の `runCommitDiagnosis` / `renderCommitDiagnosisResult`。復旧/破棄も`38`経由で呼び、安全性の最終判定はGAS`25`/`17`が行う。
- 診断DTOの画面表示は現下書きを変更しない。競合詳細のescaping等は [architecture 6](architecture.md#6-セキュリティ境界と制約)。

## 24. Web運航workflow

- 入口: `src/web/41_web_workflow.js` の `localFlightAction` / `pushDraftHistory` / `createOperationDraftId`。STATE、draftId、phase、機体/BAT、戻る履歴を所有する。
- 永続化は`37`、render/通知は注入callback。DOMを読まない境界は [architecture 4](architecture.md#4-責務と依存方向)。試験は全phase、機体交代、BAT交換、戻る、0-flight、下書き再開。

## 25. Webカタログ

- 入口: `src/web/42_web_catalog.js`。点検・目的・方法・安全タグ・保存段階の表示名と説明を扱う。
- サーバー許可リストとは別のため、点検/法規変更は`00`/`05`/`21`への影響も確認する。

## 26. Web初回起動・依存の組立

- 入口: `src/web/43_web_bootstrap.js`。online/offlineイベントと各port・route・captureを登録する。Web JSの最後に結合する順序は`scripts/web-source-order.json`で定める。
- 初回復元・renderと依存の契約は [architecture 4](architecture.md#4-責務と依存方向)。試験はWeb起動、route/action/capture、保存後render失敗時の下書き保持。

## 27. 将来拡張時の変更範囲

以下は実装済みの設定化を保証する表ではなく、変更開始点である。現在の機体2種、BAT1～7、メーカー行・帳票ラベルの前提は残っており、カタログ1本の変更だけで追加できるとは扱わない。

| 変更 | 最初の担当範囲 | 追加で確認する契約 |
|---|---|---|
| 新しい機体 | `00_config.gs` / `07_app_state.gs` / `23_aircraft_totals.gs` / Web `41` | Web `34`/`35`の2機選択、原本対応、帳票メーカー行。既存pendingは再計算しない |
| BAT本数追加 | `00_config.gs` / `05_operation_policy.gs` / `07_app_state.gs` / `20_sheet_core.gs` | `22`の履歴シート、1～7固定検証・使用済み判定、Web候補 |
| 点検項目・法規 | `00_config.gs` / `05_operation_policy.gs` / `21_sheet_records.gs` / Web `42` | 対象画面の入力・退避、帳票ラベル、過去pendingの元plan |
| 新しい画面 | 新画面 / Web `33` / `43`、状態追加時は`41` | route/action/capture契約、初回ロード副作用なし |
| 新しい記録項目 | Web対象画面 / `11_server_validation.gs` / `05_operation_policy.gs` / 帳票`21`～`23` | `14`の組立に必要な入力、下書き移行、Formula安全出力 |
| 新しい出力形式・DIPS補助 | 将来の出力専用機能＋`20`～`23`の現在帳票reader | 未実装。[現在帳票を読む契約](architecture.md#5-公開入口と保存契約)を守る |
| 新しい保存形式 | `15_commit_store.gs` / `01_commit_codec.gs` / `17_commit_recovery.gs` / `24_sheet_integrity.gs` | 未実装。key/version/旧pending移行・原子性・再送契約を先に設計する |
| TEST運用拡張 | `05_operation_policy.gs` / `14_commit_plan.gs` / `23_aircraft_totals.gs` / `25_commit_diagnostics.gs` | 正式累計非更新、BAT履歴、TEST破棄条件を維持 |
| 複数端末 | `18_commit_identity.gs` / `17_commit_recovery.gs` / `02_gas_runtime.gs` / Web `37` | 既存pendingを順に再診断・解決する[保存契約](architecture.md#93-plan状態と進捗)。端末間下書き同期は未実装、Lock短縮・予約変更は別設計 |

## 手修正後の計算継続（導入型）

- 担当: `src/26_sheet_calculation_continuity.gs`
- 入口: 所有者が `installCalculationContinuity_` を実行し、`continueCalculationsAfterEdit_` の編集トリガーを導入する。Web保存入口からは呼ばない。
- 仕様・制約: [Spreadsheet仕様8](spreadsheet-spec.md#8-手修正後の計算継続導入型)。導入手順・状態: [再構築ガイド](rebuild-guide.md#計算継続の導入と確認)。未導入時に本番で動作すると解釈しない。
- 試験: `tests/calculation-continuity.test.js`、既存保存回帰・互換試験。
