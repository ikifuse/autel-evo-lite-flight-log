# コードマップ

機能変更時は、まず該当章の担当ファイルと主要関数だけを確認する。同じ「場所」や「累計」でも保存先と書込み経路が異なるため、対象欄を取り違えないこと。

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
- 関連機能・テスト: UUID冪等性、Propertiesチャンク、Developer Metadata、T16～T23・追加障害試験

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

- 担当ファイル: `src/22_battery_totals.gs`、固定行・metadata管理は `src/12_commit_engine.gs`
- 主要関数: `fixedBatteryRow_`、`writeBatteryHistoryAt_`、`ensureBatteryMetadata_`、`metadataMatches_`
- 呼び出し関係: `buildFixedCommitPlan_`で行固定 → `finishAircraft`で上書き・metadata・照合
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

## 12. Webトップ画面

- 担当ファイル: `src/30_web_app.gs`
- 主要関数: `render`、`renderStartView`、`onPurposeChanged`、`onCategoryChanged`、`checkPermitExpiry`、`applyLastOperation`、`submitStartOperation`
- 関数グループ: 共通DOMは `esc` / `el` / `val` / `isChecked` / `busy`、気象は `selectWeather` / `selectWindSpeed` / `selectWindDir`
- 状態・通信: `updateNetworkStatus`、`pushDraftHistory`、`localFlightAction`、`callServer`、`captureCurrentScreenDraft`
- 共通画面制御: `clearFormErrors`、`showFormErrors`、`renderError`、`confirmResetSession`、`goBackFromAnywhere`、`sessionHeaderHtml`、`cancelSessionPrompt`、`formatTimeStr`
- 呼び出し関係: `render` → 状態別画面、トップ入力 → `localFlightAction('startAircraft')`
- 対象Spreadsheet・欄: 直接書込まず、最終保存用sessionを作成
- 関連機能: 前回条件引用、場所・目的・気象・カテゴリー・操縦者入力

## 13. GPS

- 担当ファイル: `src/30_web_app.gs`
- 主要関数: `fetchCurrentGps`
- 呼び出し関係: Geolocation → 国土地理院逆ジオコーディング → 対象入力欄へ反映
- 対象Spreadsheet・欄: 最終保存時に飛行経路、点検場所、離陸場所、着陸場所へ反映
- 関連機能: トップ、離陸前、着陸後のGPSボタン

## 14. LocalStorage / 下書き

- 担当ファイル: `src/30_web_app.gs`
- 主要関数: `createOperationDraftId`、`persistOperationDraft`、`restoreOperationDraft`、`clearOperationDraft`、`saveLastOperation`、`loadLastOperation`
- 呼び出し関係: 各画面入力をsessionへ取り込み保存、再読込時に復元、完了/破棄時に消去
- 対象Spreadsheet・欄: 直接書込まない。最終送信時に固定保存計画へ渡る
- 関連機能: UUID、オフライン下書き、前回条件引用

## 15. 飛行前点検画面

- 担当ファイル: `src/30_web_app.gs`
- 主要関数: `renderPreView`、`setAllChecks`、`onPreCheckChanged`、`submitPreflight`、`renderPreAbnormalView`
- 呼び出し関係: トップ → 飛行前画面 → 正常時READY、異常時中止分岐
- 対象Spreadsheet・欄: 最終保存時に日付シートの飛行前11項目へ反映
- 関連機能: 装着BAT、任意サイクル数、点検内容表示

## 16. BAT交換

- 担当ファイル: `src/30_web_app.gs`
- 主要関数: `renderBatteryChangeView`、`submitBatteryChange`
- 呼び出し関係: 着陸後 → 同じ機体で続行 → BAT最低限確認 → READY
- 対象Spreadsheet・欄: 次の飛行行と対象BAT履歴へ最終保存
- 関連機能: BAT番号、ロック、残量・警告確認

## 17. 飛行中

- 担当ファイル: `src/30_web_app.gs`
- 主要関数: `renderReadyView`、`submitStartFlight`、`renderFlyingView`
- 呼び出し関係: READYで離陸確定 → FLYING表示 → 着陸完了操作
- 対象Spreadsheet・欄: 離陸時刻・場所をsessionへ保持し、最終保存時に飛行行へ反映
- 関連機能: 飛行タイマー、オフライン継続

## 18. 着陸後入力

- 担当ファイル: `src/30_web_app.gs`
- 主要関数: `renderLandingView`、`updateTimerDisplay`、`onSafetyChanged`、`addSafetyTag`、`submitLandFlight`
- 呼び出し関係: 着陸完了 → 時刻確定 → 実飛行時間/安全事項入力 → flight確定
- 対象Spreadsheet・欄: 着陸場所・時刻、飛行時間、安全影響、BAT所感
- 関連機能: タイマー、自動時刻、任意GPS、安全タグ

## 19. 機体交代

- 担当ファイル: `src/30_web_app.gs`
- 主要関数: `renderAfterLandingView`、`onSwitchAircraftClick`
- 呼び出し関係: 1飛行確定後 → 別機体選択 → 対象機体の飛行前点検へ
- 対象Spreadsheet・欄: 保存計画で別No.ブロックへ機体情報・飛行記録を割当
- 関連機能: EVO Lite ↔ EVO Lite+、機体別累計

## 20. 飛行後点検・最終保存

- 担当ファイル: Webは `src/30_web_app.gs`、保存は `src/12_commit_engine.gs`
- 主要関数: `renderPostView`、`setPostChecksForModel`、`setAllPostChecksAllModels`、`onAnyPostCheckChanged`、`submitAllPostflight`、`finishAircraft`
- 呼び出し関係: 全飛行終了 → 使用機体の飛行後点検 → `callServer('finishAircraft')`
- 対象Spreadsheet・欄: 日付/TEST日付シート、BAT履歴、通常運航時の機体公式累計
- 関連機能・テスト: 一括保存、固定保存計画、roll-forward、T16～T23

## 21. Legacy互換

- 担当ファイル: `src/13_legacy_compat.gs`（通常作業では読まない）
- 主要関数: `finishAircraftLegacy_`、`commitSignature_`、`chooseAvailableBlock_`、`appendBatteryHistory_`、`applyAircraftTotals_`
- 呼び出し関係: 旧保存方式との互換専用。現行入口は `finishAircraft`
- 対象Spreadsheet・欄: 旧方式の日付シート、BAT履歴、機体累計
- 関連機能・テスト: TEST 10の旧累計再実行互換。削除・書換え禁止
