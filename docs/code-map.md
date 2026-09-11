# コードマップ

機能変更時は、まず該当章の担当ファイルと主要関数だけを確認する。同じ「場所」や「累計」でも保存先と書込み経路が異なるため、対象欄を取り違えないこと。

## 関連仕様書と参照基準

変更目的に応じて、以下の仕様書・ガイドを併せて参照すること。

- **アプリの全体設計・画面遷移・一括保存アーキテクチャ**: [01_ドローン運航記録_設計書.md](../01_ドローン運航記録_設計書.md)
- **Spreadsheet帳票構造・セル配置・原本・場所表示書式**: [docs/spreadsheet-spec.md](spreadsheet-spec.md)
- **回帰テスト・障害注入・セキュリティー試験・検証仕様**: [docs/test-spec.md](test-spec.md)
- **ゼロからの環境再構築・GASデプロイ・変更時チェックリスト**: [docs/rebuild-guide.md](rebuild-guide.md)

## 0. 不具合・変更目的別の最短入口

次の2～4ファイルを出発点とし、呼出契約に影響すると分かった場合だけ読む範囲を広げる。以下の番号はファイル名の先頭番号であり、結合順ではない。全体の責務・公開入口・依存方向は[architecture.md](architecture.md)、実行順は`source-order.json` / `web-source-order.json`を参照する。

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

- 担当ファイル: `src/00_config.gs`
- 主要定数: `MODELS`、`BLOCKS`、`FLIGHT_PURPOSES`、点検項目、保存・セキュリティー上限
- 呼び出し関係: 全サーバーファイルから参照され、`APP_VERSION` 等はWeb出力にも渡る
- 対象Spreadsheet・欄: シート名、No.1/No.2列範囲、BAT履歴行範囲、機体別原本名を定義
- 関連機能・テスト: 全機能・全回帰テストの共通前提

## 2. Web配信・画面状態・GAS実行基盤

- 担当ファイル: `src/10_server_core.gs`（`doGet`）、`src/07_app_state.gs`（`getAppState`）、`src/02_gas_runtime.gs`（`spreadsheet_` / `now_` / `format_` / `locked_` / `sha256Text_` / fault/log）
- 時間変換は `src/06_operation_time.gs` の `dateFromSheetName_` / `parseHoursMinutes_` / `formatHoursMinutes_` / `minutesLabel_`。
- 呼び出し関係: `doGet` → `getAppState` / `APP_HTML`、保存処理 → runtime。`getAppState`は正式累計readerを使う。
- 対象Spreadsheet・欄: 本体Spreadsheet、当日シートの存在、機体公式累計の表示値
- 関連機能・テスト: Web起動、日時変換、ScriptLockの作用順、TEST 1～15

## 3. 入力検証

- 担当ファイル: `src/11_server_validation.gs`（構造・正規化）、`src/05_operation_policy.gs`（業務条件・TEST判定）
- validation関数: `assertInputComplexity_`、`validateDraftId_`、`normalizedCommitInput_`、`validateCheckMap_`。
- policy関数: `validateOperationSelection_`、`validateCommitBusinessInput_`、`validateStoredOperationSelection_`、`isAppTestPurpose_`。
- 呼び出し関係: `finishAircraft` → 正規化 → 業務入力検証、`buildFixedCommitPlan_`でも保存対象を再確認
- 対象Spreadsheet・欄: 書込み前に機体、BAT、日時、場所、点検、自由入力を検証。自由入力のRichText出力は`04_commit_capture.gs` / `03_gas_sheet_adapter.gs`が担当する。
- 関連機能・テスト: 入力境界、Formula Injection、上限超過時の無変更確認

## 4. 固定保存計画 / 冪等性 / roll-forward

- 公開入口: `src/12_commit_engine.gs` の `finishAircraft`、`diagnosePendingCommitPlans`、`recoverPendingCommitPlan`、`discardPendingTestCommitPlan`。
- 新規計画: `src/14_commit_plan.gs` の `buildFixedCommitPlan_`。写像を`21`/`22`/`23`、捕捉を`04_commit_capture.gs`へ委譲する。
- 永続化: `src/15_commit_store.gs` の `storeCommitPlan_` / `loadCommitPlan_` / `compactCompletePlan_`。codecは`01_commit_codec.gs`、再送・予約は`18_commit_identity.gs`、保持整理は`19_commit_retention.gs`。
- 実行: `src/17_commit_recovery.gs` の `executeCommitPlanRollForward_` / `resolvePendingCommitPlansBeforeSave_`。`src/24_sheet_integrity.gs` の `applyCommitOperations_` / `verifyCommitPlanResult_`で適用・readbackする。
- 比較・診断: `src/16_commit_compare.gs` の `sameCommitValue_`、`src/25_commit_diagnostics.gs` の `diagnoseSingleCommitPlan_`。診断は変更を実行しない。
- 対象Spreadsheet・欄: 日付シート、BAT履歴、飛行後点検、機体公式累計の固定セル
- 関連機能・テスト: UUID、Properties chunk、before/intended/conflict、T16～23、B基準pending/complete互換

## 5. 日付シート生成とNo.1/No.2枠

- 担当ファイル: `src/20_sheet_core.gs`、割当計画は `src/14_commit_plan.gs`
- 主要関数: `getOrCreateDateSheet_`、`dateSheetStructureUsable_`、`block_`、`blockUsed_`、`chooseFixedBlock_`、`nextFixedSheetAndBlock_`
- 呼び出し関係: `buildFixedCommitPlan_` → 空きブロック探索 → 必要時に連番シート作成
- 対象Spreadsheet・欄: `日常点検` → `yyyy.M.d` / `_2...` または `TEST_yyyy.M.d` / `_2...`、No.1・No.2
- 関連機能・テスト: 1ブロック7飛行、同日連番、場所変更、機体交代、TEST 4～7

## 6. 場所表示

- 担当ファイル: 日付シートは `src/21_sheet_records.gs`、BAT履歴は `src/22_battery_history.gs`
- 主要関数: `locationCellDisplay_`、`writeLocationCell_`、`setLocationAfterLabelInBlock_`、`writeBatteryHistoryAt_`
- 呼び出し関係: ヘッダーと飛行行は共通の場所表示処理、BAT履歴は別経路で飛行場所を書込む
- 対象Spreadsheet・欄: 日付シートの「飛行経路・場所」「離陸場所」「着陸場所」、BATシートの「飛行場所」
- 表示仕様: 名称/GPSのみは1行・通常フォント、名称+GPSは2行・通常より1pt小、いずれも水平/垂直中央。列幅・行高は不変

## 7. 飛行記録

- 担当ファイル: `src/21_sheet_records.gs`（写像）、`src/20_sheet_core.gs`（ブロック・列探索）
- 主要関数: `captureDateRecords_`、`writeFlightFields_`、`flightBlocks_`、`flightColumn_`
- 呼び出し関係: `14`の`buildFixedCommitPlan_` → `21`の`captureDateRecords_` → 各飛行を1行ずつ固定操作化
- 対象Spreadsheet・欄: 日付/TEST日付シートのBAT、離着陸場所・時刻、飛行時間、総飛行時間、安全影響、BAT所感
- 関連機能・テスト: TEST 1～8、11～13、No.1/No.2・7飛行単位

## 8. 飛行前・飛行後点検

- 担当ファイル: `src/21_sheet_records.gs`
- 主要関数: `writeCheckResults_`、`writeOptionalFields_`
- 呼び出し関係: `buildFixedCommitPlan_` → `captureDateRecords_` / `capturePostflightRecords_`から呼び出す
- 対象Spreadsheet・欄: 各No.ブロックの飛行前11項目、飛行後4項目、異常・処置・確認者
- 関連機能・テスト: TEST 14、T19、Formula Injection試験

## 9. BAT履歴

- 担当ファイル: `src/22_battery_history.gs`。固定計画組立は`src/14_commit_plan.gs`、予約は`src/18_commit_identity.gs`、適用は`src/24_sheet_integrity.gs`。
- 主要関数: `fixedBatteryRow_`、`writeBatteryHistoryAt_`、`captureBatteryHistory_`、`activeCommitReservations_`
- 呼び出し関係: `buildFixedCommitPlan_`で行固定 → `captureBatteryHistory_`で写像 → recoveryのBAT段階でbefore/intended照合・上書き・readback
- 対象Spreadsheet・欄: `BAT_1`～`BAT_7`の個別履歴行
- 関連機能・テスト: TEST 8・13、T17・T18、BAT行再利用・二重保存防止試験

## 10. 機体公式累計

- 担当ファイル: `src/23_aircraft_totals.gs`。時間表現は`src/06_operation_time.gs`、更新実行は`17`/`24`。
- 主要関数: `aircraftTotalMinutes_`、`aircraftTotalCell_`、`planAircraftTotals_`、`captureAircraftTotals_`
- 呼び出し関係: `14`の計画作成時に開始値/最終値を固定し、通常運航の最終段階で原本へ反映。画面用読取りは`07_app_state.gs`。
- 対象Spreadsheet・欄: `点検整備記録_EVO Lite_原本` / `点検整備記録_EVO Lite+_原本`の「点検時の総飛行時間」
- 注意: 日付シートの「総飛行時間」は各飛行時点の表示値、機体別原本は正式な累計マスターであり別物

## 11. アプリテスト

- 最初に読むファイル: `src/05_operation_policy.gs`（TEST判定）、`src/14_commit_plan.gs`（割当）、`src/23_aircraft_totals.gs`（正式累計の除外）。帳票・BATの詳細は各担当へ。
- 主要関数: `isAppTestPurpose_`、`buildFixedCommitPlan_`、`planAircraftTotals_`、`getOrCreateDateSheet_`
- 呼び出し関係: 目的判定 → TEST用シート割当 → 通常と同じ日付/BAT記録 → 公式累計更新対象から除外
- 対象Spreadsheet・欄: `TEST_yyyy.M.d` / `_2...`、`BAT_1`～`BAT_7`。日付シート上の累計は計算するが機体別原本は更新しない
- 関連機能・テスト: TEST分離、気象付き目的、累計、再送、連番、BAT行再利用、0-flight

## 12. Webスタイル・デザイン（CSS）

- 担当ファイル: `src/web/30_web_styles.css`
- 主な内容: モバイル最適化、Safe Area（ノッチ対応）、カード、ボタン、チップ、タイマー、入力エラー表示、メディアクエリ
- AI作業ガイド: UIデザイン、カラー、フォント、余白、レスポンシブ配置の変更時に**最初にこのファイル**を参照する。HTML構造が関係する場合はシェルまたは対象画面へ進む。

## 13. Webシェル・HTML骨格

- 担当ファイル: `src/web/31_web_shell.html`
- 主な内容: `<!doctype html>`、viewport、PWAメタ設定、アイコン、タイトル、ヘッダー（`#networkBadge`、`#appStatusBadge`）、`#globalBackButton`、`#app`コンテナ、`#loading`オーバーレイ
- AI作業ガイド: ページ全体の骨格、ヘッダー固定要素、PWA設定、モーダル基盤を変更するときに**最初にこのファイル**を参照する。

## 14. Web共通DOM・画面port

- 担当ファイル: `src/web/32_web_core.js`
- 主要関数: `esc`、`el`、`val`、`isChecked`、`busy`、`clearFormErrors`、`showFormErrors`、`updateNetworkStatus`、`sessionHeaderHtml`、`formatTimeStr`。
- 画面port: `configureScreenPorts`、`screenState`、`screenAction`、`screenRender`、`screenGps`、`screenDiagnosis`、`screenCancel`、`screenReset`。具体的な通知先は`43`から注入する。
- AI作業ガイド: 共通表示・入力エラー・通信バッジを扱う。STATE定義は`41`、選択肢は`42`、LocalStorageは`37`、気象選択は`34`を先に読む。

## 15. Web controller / router

- 担当ファイル: `src/web/33_web_engine.js`
- 主要関数: `callServer`、`renderError`、`confirmResetSession`、`cancelSessionPrompt`、`goBackFromAnywhere`、`captureCurrentScreenDraft`、`configureWebRoutes`、`render`。
- 呼び出し関係: ローカルactionは`41`、RPCは`38`へ委譲。route/capture関数は`43`で登録する。
- 保存成功の順: サーバー状態採用 → render → 下書き消去 → 成功通知。RPC失敗とrender失敗では下書きを消去しない。
- AI作業ガイド: 保存payload・成功/失敗処理・画面登録を扱う。個々のphase更新は`41`、画面入力の退避は`35`/`36`が所有する。

## 16. 運航開始画面（トップ）

- 担当ファイル: `src/web/34_web_start.js`
- 主要関数: `renderStartView`、`onPurposeChanged`、`onCategoryChanged`、`showCategoryAutoNotice`、`checkPermitExpiry`、`onMethodChanged`、`getSelectedMethods`、`syncCategoryAuto`、`applyLastOperation`、`submitStartOperation`、気象選択、補助者候補の表示・選択。
- 呼び出し関係: 注入route → `renderStartView`、入力送信 → `screenAction('startAircraft')`。LocalStorage履歴は`37`を利用する。
- 対象Spreadsheet・欄: 直接書込まず、セッション初期データ（機体、場所、目的、カテゴリー、許可番号、操縦者、補助者等）を作成
- AI作業ガイド: 運航開始時の入力項目、カテゴリー自動昇格判定、許可証期限チェック、前回条件引用ボタンの変更時に**最初にこのファイル**を参照する。

## 17. 飛行前点検・BAT交換・待機・飛行・着陸

- 担当ファイル: `src/web/35_web_flight.js`
- 主要関数:
  - 飛行前点検: `renderPreView`、`setAllChecks`、`onPreCheckChanged`、`submitPreflight`、`renderPreAbnormalView`
  - バッテリー交換: `renderBatteryChangeView`、`submitBatteryChange`
  - 離陸待機: `renderReadyView`、`submitStartFlight`
  - 飛行中: `renderFlyingView`、`updateTimerDisplay`、`stopFlightTimer`
  - 着陸後入力: `renderLandingView`、`onSafetyChanged`、`addSafetyTag`、`submitLandFlight`
  - 着陸後選択・機体交代: `renderAfterLandingView`、`onSwitchAircraftClick`
  - 画面退避: `captureFlightScreenDraft`（PRE / BATTERY_CHANGE / READY / LANDING）
- 対象Spreadsheet・欄: 各飛行のBAT、離着陸場所・時刻、実飛行時間、安全影響事項、BAT所感をsessionへ蓄積
- AI作業ガイド: 飛行前点検UI、離陸待機、飛行中タイマー、着陸後入力項目、機体交代操作の変更時に**最初にこのファイル**を参照する。

## 18. 飛行後点検・一括保存・終了

- 担当ファイル: `src/web/36_web_postflight.js`（上位保存制御はWeb `33`、GAS入口は`src/12_commit_engine.gs`）
- 主要関数:
  - 飛行後点検: `renderPostView`、`setPostChecksForModel`、`setAllPostChecksAllModels`、`onAnyPostCheckChanged`、`submitAllPostflight`
  - 画面退避: `capturePostflightScreenDraft`。中止は`33`、時刻表示は`32`、初回起動は`43`。
- 呼び出し関係: 全飛行終了 → `renderPostView` → 一括入力検証 → `screenAction('finishAircraft')` → controller/RPC → スプレッドシート一括保存
- 対象Spreadsheet・欄: 日付シート（点検結果・飛行行・ヘッダー）、BAT履歴、機体公式累計
- AI作業ガイド: 飛行後点検の確認項目、全機体一括正常ボタン、最終保存トリガー、飛行後点検の下書き退避の変更時に参照する。

## 19. Legacy互換

- 担当ファイル: `src/13_legacy_compat.gs`（通常作業では読まない）
- 主要関数: `finishAircraftLegacy_`、`commitSignature_`、`chooseAvailableBlock_`、`appendBatteryHistory_`、`applyAircraftTotals_`
- 呼び出し関係: 旧保存方式との互換専用。現行入口は `finishAircraft`
- 対象Spreadsheet・欄: 旧方式の日付シート、BAT履歴、機体累計
- 関連機能・テスト: TEST 10の旧累計再実行互換。削除・書換え禁止

## 20. Web下書き・直前履歴

- 担当ファイル: `src/web/37_web_storage.js`
- 主要関数: `configureDraftStorage`、`persistOperationDraft`、`restoreOperationDraft`、`clearOperationDraft`、`saveLastOperation`、`loadLastOperation`、`loadAssistantHistory`、`saveAssistantHistory`、`rememberAssistantName`、`assistantCandidates`。
- 契約: `EVO_LITE_ACTIVE_OPERATION_V2` / `EVO_LITE_LAST_OPERATION` / `EVO_LITE_ASSISTANT_HISTORY_V1`を維持。運航状態は注入された`getState`で読み、controllerを呼ばない。UUID生成は`41`。
- テスト: 旧READYのBAT引継ぎ・PREへ戻す補完、Storage障害、再読込、補助者の重複除去。

## 21. Web RPC

- 担当ファイル: `src/web/38_web_rpc.js`
- 主要関数: `runServerRequest(name, arg, onSuccess, onFailure)`。
- 契約: `google.script.run`だけを扱う。引数省略、成功/失敗callbackを転送し、STATE・DOM・LocalStorageを変更しない。
- 呼び出し元: `33_web_engine.js`、`40_web_diagnosis.js`。

## 22. Web GPS

- 担当ファイル: `src/web/39_web_gps.js`
- 主要関数: `fetchCurrentGps`。
- 契約: Geolocationと国土地理院逆ジオコーディング、入力欄更新・失敗時の手入力継続。8秒設定はGeolocation側のtimeout。
- 呼び出し元: `43`が`screenGps`へ注入。テストはGPS成功、住所取得失敗、権限拒否。

## 23. Web保存診断・復旧・TEST破棄

- 担当ファイル: `src/web/40_web_diagnosis.js`
- 主要関数: `openCommitDiagnosisModal`、`closeCommitDiagnosisModal`、`runCommitDiagnosis`、`renderCommitDiagnosisResult`、`executeCommitRecovery`、`executeTestCommitDiscard`、`toggleDiagDetail`。
- 契約: 診断DTOを表示し、`38`経由で公開診断/復旧/TEST破棄を呼ぶ。安全性の最終判定はGAS `25`/`17`。端末の現下書きは変更しない。
- 今回の安全修正: 競合詳細JSONを`esc(JSON.stringify(...))`で表示する。他のsecurity条件は構造整理で変更していない（[architecture.md](architecture.md)）。

## 24. Web運航workflow

- 担当ファイル: `src/web/41_web_workflow.js`
- 主要定数・関数: `STATE`、`LOCAL_FLIGHT_ACTIONS`、`configureWorkflowPorts`、`cloneData`、`createOperationDraftId`、`pushDraftHistory`、`localFlightAction`。
- 契約: draftId生成、phase・運航履歴・機体/BATの状態遷移を所有する。永続化は`37`、render/通知は注入callback。画面のDOMを読まない。
- テスト: 運航全phase、機体交代、BAT交換、戻る、0-flight、下書き再開。

## 25. Webカタログ

- 担当ファイル: `src/web/42_web_catalog.js`
- 主要定数: `PRE_NAMES`、`POST_NAMES`、点検説明、`PURPOSE_NAMES`、`METHOD_NAMES`、`SPECIAL_METHODS`、`METHOD_DETAILS`、`SAFETY_TAGS`、`STAGE_HUMAN_NAMES`。
- 契約: クライアントの表示・選択肢。サーバーの許可リストを代替しない。点検/法規変更は`00`/`05`/`21`への影響も確認する。

## 26. Web初回起動・依存の組立

- 担当ファイル: `src/web/43_web_bootstrap.js`、結合順は`scripts/web-source-order.json`。
- 主な内容: online/offlineイベント、storage/workflow/screen/routerの注入、`restoreOperationDraft` → `updateNetworkStatus` → `render`。
- 契約: 必ずWeb JSの最後に結合する。新画面はrouteと必要なcapture関数を登録し、下位画面からcontrollerの具体関数を参照しない。
- テスト: Web全体の起動、route/action/capture、保存後render失敗の下書き保持。

## 27. 将来拡張時の変更範囲

以下は実装済みの設定化を保証する表ではなく、変更開始点である。現在の機体2種、BAT1～7、メーカー行・帳票ラベルの前提は残っており、カタログ1本の変更だけで追加できるとは扱わない。

| 変更 | 最初の担当範囲 | 追加で確認する契約 |
|---|---|---|
| 新しい機体 | `00_config.gs` / `07_app_state.gs` / `23_aircraft_totals.gs` / Web `41` | Web `34`/`35`の2機選択、原本対応、帳票メーカー行。既存pendingは再計算しない |
| BAT本数追加 | `00_config.gs` / `05_operation_policy.gs` / `07_app_state.gs` / `20_sheet_core.gs` | `22`の履歴シート、1～7固定検証・使用済み判定、Web候補 |
| 点検項目・法規 | `00_config.gs` / `05_operation_policy.gs` / `21_sheet_records.gs` / Web `42` | 対象画面の入力・退避、帳票ラベル、過去pendingの元plan |
| 新しい画面 | 新画面 / Web `33` / `43`、状態追加時は`41` | route/action/capture契約、初回ロード副作用なし |
| 新しい記録項目 | Web対象画面 / `11_server_validation.gs` / `05_operation_policy.gs` / 帳票`21`～`23` | `14`の組立に必要な入力、下書き移行、Formula安全出力 |
| 新しい出力形式・DIPS補助 | 将来の出力専用機能＋`20`～`23`の現在帳票reader | 未実装。complete後の人手修正を含む現在値を読み、過去planを最新値として使わない |
| 新しい保存形式 | `15_commit_store.gs` / `01_commit_codec.gs` / `17_commit_recovery.gs` / `24_sheet_integrity.gs` | 未実装。key/version/旧pending移行・原子性・再送契約を先に設計する |
| TEST運用拡張 | `05_operation_policy.gs` / `14_commit_plan.gs` / `23_aircraft_totals.gs` / `25_commit_diagnostics.gs` | 正式累計非更新、BAT履歴、TEST破棄条件を維持 |
| 複数端末 | `18_commit_identity.gs` / `17_commit_recovery.gs` / `02_gas_runtime.gs` / Web `37` | 現行の単一pending保護。端末間下書き同期は未実装、Lock短縮・予約変更は別設計 |

## 手修正後の計算継続（導入型）

- 担当: `src/26_sheet_calculation_continuity.gs`
- 入口: 所有者が `installCalculationContinuity_` を実行し、`continueCalculationsAfterEdit_` の編集トリガーを導入する。Web保存入口からは呼ばない。
- 対象: BAT集計とバッテリー台帳の68式。機体正式累計・過去飛行行は対象外。
- 仕様・導入状態・制約: [計算継続](calculation-continuity-2026-09-12.md)。未導入時に本番で動作すると解釈しない。
- 試験: `tests/calculation-continuity.test.js`、既存保存回帰・互換試験。
