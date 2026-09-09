# コードマップ

機能変更時は、まず該当章の担当ファイルと主要関数だけを確認する。同じ「場所」や「累計」でも保存先と書込み経路が異なるため、対象欄を取り違えないこと。

## 関連仕様書と参照基準

変更目的に応じて、以下の仕様書・ガイドを併せて参照すること。

- **アプリの全体設計・画面遷移・一括保存アーキテクチャ**: [01_ドローン運航記録_設計書.md](../01_ドローン運航記録_設計書.md)
- **Spreadsheet帳票構造・セル配置・原本・場所表示書式**: [docs/spreadsheet-spec.md](spreadsheet-spec.md)
- **回帰テスト・障害注入・セキュリティー試験・検証仕様**: [docs/test-spec.md](test-spec.md)
- **ゼロからの環境再構築・GASデプロイ・変更時チェックリスト**: [docs/rebuild-guide.md](rebuild-guide.md)

## 1. 設定・定数

- 担当ファイル: `src/00_config.gs`
- 主要定数: `MODELS`、`BLOCKS`、`FLIGHT_PURPOSES`、点検項目、保存・セキュリティー上限
- 呼び出し関係: 全サーバーファイルから参照され、`APP_VERSION` 等はWeb出力にも渡る
- 対象Spreadsheet・欄: シート名、No.1/No.2列範囲、BAT履歴行範囲、機体別原本名を定義
- 関連機能・テスト: 全機能・全回帰テストの共通前提

## 2. サーバー共通

- 担当ファイル: `src/10_server_core.gs`
- 主要関数: `doGet`、`spreadsheet_`、`now_`、`format_`、`dateFromSheetName_`、`locked_`、`getAppState`
- 呼び出し関係: `doGet` → `getAppState` / `APP_HTML`、保存処理 → `locked_` / `spreadsheet_`
- 対象Spreadsheet・欄: 本体Spreadsheet、当日シートの存在、機体公式累計の表示値
- 関連機能・テスト: Web起動、日時変換、ScriptLock、TEST 1～15

## 3. 入力検証

- 担当ファイル: `src/11_server_validation.gs`
- 主要関数: `validateOperationSelection_`、`normalizedCommitInput_`、`validateCommitBusinessInput_`、`validateCheckMap_`、`validateStoredOperationSelection_`
- 呼び出し関係: `finishAircraft` → 正規化 → 業務入力検証、`buildFixedCommitPlan_`でも保存対象を再確認
- 対象Spreadsheet・欄: 書込み前に機体、BAT、日時、場所、点検、自由入力を検証
- 関連機能・テスト: セキュリティー入力検証、Formula Injection、上限超過時の無変更確認

## 4. 固定保存計画 / 冪等性 / roll-forward

- 担当ファイル: `src/12_commit_engine.gs`
- 主要関数: `buildFixedCommitPlan_`、`storeCommitPlan_`、`loadCommitPlan_`、`applyCommitOperations_`、`verifyCommitPlanResult_`、`finishAircraft`
- 呼び出し関係: `finishAircraft` → 入力検証 → 固定計画作成/再読込 → 段階別上書き → flush・照合 → complete
- 対象Spreadsheet・欄: 日付シート、BAT履歴、飛行後点検、機体公式累計の固定セル
- 関連機能・テスト: UUID冪等性、Propertiesチャンク、before/intended/conflict照合、T16～T23・追加障害試験

## 5. 日付シート生成とNo.1/No.2枠

- 担当ファイル: `src/20_sheet_core.gs`、割当計画は `src/12_commit_engine.gs`
- 主要関数: `getOrCreateDateSheet_`、`dateSheetStructureUsable_`、`block_`、`blockUsed_`、`chooseFixedBlock_`、`nextFixedSheetAndBlock_`
- 呼び出し関係: `buildFixedCommitPlan_` → 空きブロック探索 → 必要時に連番シート作成
- 対象Spreadsheet・欄: `日常点検` → `yyyy.M.d` / `_2...` または `TEST_yyyy.M.d` / `_2...`、No.1・No.2
- 関連機能・テスト: 1ブロック7飛行、同日連番、場所変更、機体交代、TEST 4～7

## 6. 場所表示

- 担当ファイル: 日付シートは `src/21_sheet_records.gs`、BAT履歴は `src/22_battery_totals.gs`
- 主要関数: `locationCellDisplay_`、`writeLocationCell_`、`setLocationAfterLabelInBlock_`、`writeBatteryHistoryAt_`
- 呼び出し関係: ヘッダーと飛行行は共通の場所表示処理、BAT履歴は別経路で飛行場所を書込む
- 対象Spreadsheet・欄: 日付シートの「飛行経路・場所」「離陸場所」「着陸場所」、BATシートの「飛行場所」
- 表示仕様: 名称/GPSのみは1行・通常フォント、名称+GPSは2行・通常より1pt小、いずれも水平/垂直中央。列幅・行高は不変

## 7. 飛行記録

- 担当ファイル: `src/21_sheet_records.gs`
- 主要関数: `flightBlocks_`、`flightColumn_`、`writeFlightFields_`
- 呼び出し関係: `buildFixedCommitPlan_` → 各割当の各飛行を1行ずつ固定操作化
- 対象Spreadsheet・欄: 日付/TEST日付シートのBAT、離着陸場所・時刻、飛行時間、総飛行時間、安全影響、BAT所感
- 関連機能・テスト: TEST 1～8、11～13、No.1/No.2・7飛行単位

## 8. 飛行前・飛行後点検

- 担当ファイル: `src/21_sheet_records.gs`
- 主要関数: `writeCheckResults_`、`writeOptionalFields_`
- 呼び出し関係: `buildFixedCommitPlan_`の日付段階/飛行後点検段階から呼び出す
- 対象Spreadsheet・欄: 各No.ブロックの飛行前11項目、飛行後4項目、異常・処置・確認者
- 関連機能・テスト: TEST 14、T19、Formula Injection試験

## 9. BAT履歴

- 担当ファイル: `src/22_battery_totals.gs`、固定行・保存計画管理は `src/12_commit_engine.gs`
- 主要関数: `fixedBatteryRow_`、`writeBatteryHistoryAt_`、`activeCommitReservations_`、`applyCommitOperations_`
- 呼び出し関係: `buildFixedCommitPlan_`で行固定 → `finishAircraft`でbefore/intended照合・上書き・readback
- 対象Spreadsheet・欄: `BAT_1`～`BAT_7`の個別履歴行
- 関連機能・テスト: TEST 8・13、T17・T18、BAT行再利用・二重保存防止試験

## 10. 機体公式累計

- 担当ファイル: `src/22_battery_totals.gs`、更新実行は `src/12_commit_engine.gs`
- 主要関数: `aircraftTotalMinutes_`、`aircraftTotalCell_`、`parseHoursMinutes_`、`formatHoursMinutes_`
- 呼び出し関係: 計画作成時に開始値/最終値を固定し、通常運航の最終段階で原本へ反映
- 対象Spreadsheet・欄: `点検整備記録_EVO Lite_原本` / `点検整備記録_EVO Lite+_原本`の「点検時の総飛行時間」
- 注意: 日付シートの「総飛行時間」は各飛行時点の表示値、機体別原本は正式な累計マスターであり別物

## 11. アプリテスト

- 担当ファイル: `src/12_commit_engine.gs`、`src/20_sheet_core.gs`、`src/21_sheet_records.gs`、`src/22_battery_totals.gs`
- 主要関数: `isAppTestPurpose_`、`buildFixedCommitPlan_`、`getOrCreateDateSheet_`
- 呼び出し関係: 目的判定 → TEST用シート割当 → 通常と同じ日付/BAT記録 → 公式累計更新対象から除外
- 対象Spreadsheet・欄: `TEST_yyyy.M.d` / `_2...`、`BAT_1`～`BAT_7`。日付シート上の累計は計算するが機体別原本は更新しない
- 関連機能・テスト: アプリテスト分離、累計、再送、連番、BAT行再利用試験

## 12. Webスタイル・デザイン（CSS）

- 担当ファイル: `src/web/30_web_styles.css`
- 主な内容: モバイル最適化、Safe Area（ノッチ対応）、カード、ボタン、チップ、タイマー、入力エラー表示、メディアクエリ
- AI作業ガイド: UIデザイン、カラー、フォント、余白、レスポンシブ配置の変更時に**このファイルのみ**を参照する。他のJavaScriptファイルを読む必要はない。

## 13. Webシェル・HTML骨格

- 担当ファイル: `src/web/31_web_shell.html`
- 主な内容: `<!doctype html>`、viewport、PWAメタ設定、アイコン、タイトル、ヘッダー（`#networkBadge`、`#appStatusBadge`）、`#globalBackButton`、`#app`コンテナ、`#loading`オーバーレイ
- AI作業ガイド: ページ全体の骨格、ヘッダー固定要素、PWA設定、モーダル基盤を変更するときに**このファイルのみ**を参照する。

## 14. Webコア・共通DOM・気象・下書き管理

- 担当ファイル: `src/web/32_web_core.js`
- 主要定数・関数:
  - 定数: `STATE`、`PRE_NAMES`、`POST_NAMES`、`PRE_CHECK_DETAILS`、`POST_CHECK_DETAILS`、`PURPOSE_NAMES`、`METHOD_NAMES`、`SPECIAL_METHODS`、`METHOD_DETAILS`、`SAFETY_TAGS`
  - DOMユーティリティ: `esc`、`el`、`val`、`isChecked`、`busy`
  - 気象選択: `selectWeather`、`selectWindSpeed`、`selectWindDir`
  - LocalStorage下書き: `createOperationDraftId`、`persistOperationDraft`、`restoreOperationDraft`、`clearOperationDraft`
  - 通信状態監視: `updateNetworkStatus`、`online`/`offline`イベント
- AI作業ガイド: 法令点検項目名、飛行区分定義、気象チップ選択肢、下書き復元ロジック、通信バッジを変更するときに参照する。画面レイアウトや通信処理の変更時は不要。

## 15. Webエンジン・状態遷移・通信・GPS・ディスパッチャ

- 担当ファイル: `src/web/33_web_engine.js`
- 主要関数:
  - 状態遷移・履歴: `pushDraftHistory`、`localFlightAction`
  - サーバー通信・エラー: `callServer`、`clearFormErrors`、`showFormErrors`、`renderError`、`confirmResetSession`
  - 画面戻る・下書き保持: `goBackFromAnywhere`、`captureCurrentScreenDraft`
  - 直前引用・補助者履歴: `STORAGE_KEY_LAST`、`saveLastOperation`、`loadLastOperation`、`loadAssistantHistory`、`rememberAssistantName`、`assistantOptionsHtml`、`selectedAssistantName`
  - GPS自動取得: `fetchCurrentGps`（国土地理院API逆ジオコーディング）
  - メイン描画ディスパッチャ: `render`
- AI作業ガイド: クライアント状態遷移（phase制御）、サーバー呼び出し共通処理、GPS取得、直前履歴、画面ルーティングを変更するときに参照する。各個別画面の詳細UI変更時は不要。

## 16. 運航開始画面（トップ）

- 担当ファイル: `src/web/34_web_start.js`
- 主要関数: `renderStartView`、`onPurposeChanged`、`onCategoryChanged`、`showCategoryAutoNotice`、`checkPermitExpiry`、`onMethodChanged`、`getSelectedMethods`、`syncCategoryAuto`、`applyLastOperation`、`submitStartOperation`
- 呼び出し関係: `render` → `renderStartView`、入力送信 → `callServer('startAircraft')`
- 対象Spreadsheet・欄: 直接書込まず、セッション初期データ（機体、場所、目的、カテゴリー、許可番号、操縦者、補助者等）を作成
- AI作業ガイド: 運航開始時の入力項目、カテゴリー自動昇格判定、許可証期限チェック、前回条件引用ボタンの変更時に**このファイルのみ**を参照する。

## 17. 飛行前点検・BAT交換・待機・飛行・着陸

- 担当ファイル: `src/web/35_web_flight.js`
- 主要関数:
  - 画面共通ヘッダー: `sessionHeaderHtml`
  - 飛行前点検: `renderPreView`、`setAllChecks`、`onPreCheckChanged`、`submitPreflight`、`renderPreAbnormalView`
  - バッテリー交換: `renderBatteryChangeView`、`submitBatteryChange`
  - 離陸待機: `renderReadyView`、`submitStartFlight`
  - 飛行中: `renderFlyingView`、`updateTimerDisplay`
  - 着陸後入力: `renderLandingView`、`onSafetyChanged`、`addSafetyTag`、`submitLandFlight`
  - 着陸後選択・機体交代: `renderAfterLandingView`、`onSwitchAircraftClick`
- 対象Spreadsheet・欄: 各飛行のBAT、離着陸場所・時刻、実飛行時間、安全影響事項、BAT所感をsessionへ蓄積
- AI作業ガイド: 飛行前点検UI、離陸待機、飛行中タイマー、着陸後入力項目、機体交代操作の変更時に**このファイルのみ**を参照する。

## 18. 飛行後点検・一括保存・終了

- 担当ファイル: `src/web/36_web_postflight.js`（保存処理本体は `src/12_commit_engine.gs`）
- 主要関数:
  - 飛行後点検: `renderPostView`、`setPostChecksForModel`、`setAllPostChecksAllModels`、`onAnyPostCheckChanged`、`submitAllPostflight`
  - 中止・補助・起動: `cancelSessionPrompt`、`formatTimeStr`、初回起動スクリプト（`restoreOperationDraft`、`updateNetworkStatus`、`render`）
- 呼び出し関係: 全飛行終了 → `renderPostView` → 一括入力検証 → `callServer('finishAircraft')` → スプレッドシート一括保存
- 対象Spreadsheet・欄: 日付シート（点検結果・飛行行・ヘッダー）、BAT履歴、機体公式累計
- AI作業ガイド: 飛行後点検の確認項目、全機体一括正常ボタン、最終保存トリガー、運航中止プロンプト、時刻フォーマットの変更時に参照する。

## 19. Legacy互換

- 担当ファイル: `src/13_legacy_compat.gs`（通常作業では読まない）
- 主要関数: `finishAircraftLegacy_`、`commitSignature_`、`chooseAvailableBlock_`、`appendBatteryHistory_`、`applyAircraftTotals_`
- 呼び出し関係: 旧保存方式との互換専用。現行入口は `finishAircraft`
- 対象Spreadsheet・欄: 旧方式の日付シート、BAT履歴、機体累計
- 関連機能・テスト: TEST 10の旧累計再実行互換。削除・書換え禁止
