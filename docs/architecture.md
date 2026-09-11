# システム全体構造・アーキテクチャ

本書は、Autel EVO Lite / Lite+ ドローン運航記録システムのデータフロー、実行構造、およびビルド構造を簡潔に把握するためのアーキテクチャ概要書である。

---

## 1. 全体データフロー（運航開始から保存まで）

システムは「Webクライアントで状態を保持し、運航終了時に一括してGASサーバーへ送り、固定保存計画に基づきスプレッドシートへ書き込む」アーキテクチャを採用している。

```text
[現場操作 (スマートフォン)]
  │
  ▼
[Web UI (HTML / CSS / JavaScript)]
  │  ・画面入力、GPS取得、タイマー計測
  │  ・画面遷移ごとにクライアント内 STATE.session を更新
  │
  ▼
[Web Storage (LocalStorage)]
  │  ・運航中の下書き (draftId: op_UUID) を自動退避
  │  ・ブラウザ再読込や画面戻る操作時に即座に復元
  │
  ▼ (submitAllPostflight → controller → RPC。失敗時は同UUIDで再送)
[GAS 保存入口 (finishAircraft / google.script.run)]
  │
  ▼
[11_server_validation.gs / 05_operation_policy.gs]
  │  ・構造・文字数・UUID・許可リスト・業務条件を検証
  │
  ▼
[12_commit_engine.gs → 14_commit_plan.gs / 15_commit_store.gs]
  │  ・新規時だけ保存先・値を固定、DATAを永続化・照合してからMETAを公開
  │  ・既存pendingは元のplanを読み、completeは追加書込みなしで応答
  │
  ▼
[17_commit_recovery.gs → 24_sheet_integrity.gs → 03_gas_sheet_adapter.gs]
  │  ├─ Phase 1: 日常点検シート (ヘッダー・点検・飛行行)
  │  ├─ Phase 2: バッテリー個別履歴 (BAT_1〜7)
  │  ├─ Phase 3: 飛行後点検記録
  │  └─ Phase 4: 機体公式累計更新 (点検整備記録原本 ※通常運航時のみ)
  │
  ▼
[flush & 読み戻し照合]
  │  ・全セルの値・書式がfixed planの計画値と一致するか確認
  │
  ▼
[完了確定 (complete)]
  │  ・Script Properties に完了証明を記録
  │  ・CacheService へ補助キャッシュ
  │
  ▼
[クライアント応答]
     ・STATE を初期状態 (active:false) へ更新
     ・トップ画面の描画成功後にLocalStorageの下書きをクリア
     ・完了通知（描画失敗時は下書きを保持）
```

---

## 2. ビルド構造と配布フロー

ソースコードの正本は `src/` 配下に分割管理し、単一のGAS配布物 `dist/Code.gs` を生成する。

```text
[開発・保守の正本]
  ├── src/ (GASバックエンド)
  │     00_config.gs, 10_server_core.gs, 11_server_validation.gs, ...
  │
  └── src/web/ (Webクライアント部品)
        30_web_styles.css, 31_web_shell.html, 32_web_core.js, ...

       │
       ▼ (node scripts/build.mjs)
       │  1. scripts/source-order.json の順にバックエンドGSを読み込み
       │  2. styles/shellとscripts/web-source-order.jsonのJSをAPP_HTMLへ結合
       │  3. GASとWeb JSの構文・manifest一覧を検査
       │  4. 単一ファイルとして結合
       │
[自動生成物 (手動編集禁止)]
  └── dist/Code.gs

       │
       ▼ (テスト検証)
  tests/regression.test.js (回帰・障害注入)
  tests/refactor-compat.test.js (B基準の保存契約・GAS作用比較)
  tests/web-compat.test.js (B基準のWeb状態・表示・通信作用比較)

       │
       ▼ (手動コピー & GASエディタ貼付)
[本番環境]
  Google Apps Script (Webアプリケーション)
```

---

## 3. 保存状態遷移（Commit Plan Lifecycle）

障害発生時の安全性を保証するため、保存処理は以下のステータスで管理される。

```text
[未着手]
  │
  ▼ (buildFixedCommitPlan_ → storeCommitPlan_)
[pending] ── 全保存先と計画セル値を確定・Properties永続化
  │
  ▼ (applyCommitOperations_)
[writing] ── 各フェーズ (シート/BAT/点検/累計) を順次書込み
  │          ※途中で失敗・例外発生時は [failed] へ移行
  │          ※同一UUIDの再試行は全段階を照合し、intendedをskipして未反映分を進める
  │
  ▼ (verifyCommitPlanResult_ & flush)
[complete] ─ 全書込みの読み戻し照合が完了、完了証明を発行
             ※complete証明が残る同一UUID・同一署名の再送は、追加書込みなしで応答
```

DATEブロックとBAT行のownershipは、Script Propertiesへ永続化した同一`draftId`のfixed commit plan、active reservation、Script Lock、対象セルのbefore/intended/conflict判定を正本とする。Spreadsheet上に既存のDeveloper Metadataがあっても読み書き・削除せず、保存成功・復旧・二重書込み防止の条件には使用しない。

---

## 4. 責務と依存方向

各ファイルは同一GASグローバルへ結合する。ES Modulesやファイル単位privateは導入していない。manifestは結合順であり、runtime import機構ではない。内部関数の末尾 `_` と最小の公開入口を維持する。

| ファイル（`src/`） | 責務 | 主要依存・境界 |
|---|---|---|
| `00_config.gs` | 機体・帳票・点検・上限・保存形式の定数 | 保存ロジックを追加しない |
| `01_commit_codec.gs` | Date表現、canonical JSON、UTF-8長 | 純粋処理 |
| `02_gas_runtime.gs` | Spreadsheet接続、日時、hash、ScriptLock、fault/log | GAS実行基盤 |
| `03_gas_sheet_adapter.gs` | operationの値・書式I/O、Formula安全出力 | codec、Spreadsheet Range |
| `04_commit_capture.gs` | writerをoperationへ捕捉、最初のbeforeを保持 | codec、adapter。業務セルを書かないcaptureモード |
| `05_operation_policy.gs` | 運航・点検・TESTの業務検証 | config、validation、time、runtime |
| `06_operation_time.gs` | 運航日・HH:MM・時間表示 | config。Spreadsheet非依存 |
| `07_app_state.gs` | 当日・BAT候補・正式累計の画面状態 | runtime、time、正式累計 |
| `10_server_core.gs` | `doGet`と初期HTML出力 | app state、HtmlService |
| `11_server_validation.gs` | 外部JSON構造、UUID、文字列・点検map、正規化 | config、codec |
| `12_commit_engine.gs` | 公開保存入口と新規/再送分岐 | validation、policy、plan、store、identity、retention、recovery、diagnostics |
| `13_legacy_compat.gs` | 凍結した旧方式互換 | 現行機能の追加先にしない |
| `14_commit_plan.gs` | 新規割当、容量見積、各帳票計画の組立 | policy、identity、store、帳票20～23、capture |
| `15_commit_store.gs` | Script Properties、chunk/hash照合、complete圧縮、応答cache | codec、runtime。plan生成へ逆依存しない |
| `16_commit_compare.gs` | before/intended/conflictの同値規則 | codec。純粋処理 |
| `17_commit_recovery.gs` | 段階実行、進捗、先行pending解決、復旧/TEST破棄の実行 | store、retention、diagnostics、integrity、runtime、app state |
| `18_commit_identity.gs` | 再送signature、complete判定、active reservation | codec、runtime、store |
| `19_commit_retention.gs` | complete証明の永久保持・詳細縮小と整理判断 | store、runtime |
| `20_sheet_core.gs` | 帳票構造・見出し・空きブロック・日付シート作成 | config、runtime、Spreadsheet |
| `21_sheet_records.gs` | ヘッダー・飛行・点検・場所の帳票写像 | sheet core、capture、time、runtime |
| `22_battery_history.gs` | BAT空き行選択と固定行への写像 | sheet core、capture、time |
| `23_aircraft_totals.gs` | 正式累計原本の探索・開始/最終値・更新写像 | capture、time、runtime |
| `24_sheet_integrity.gs` | operation適用と段階/最終readback | adapter、compare、codec、runtime。書込みも担当 |
| `25_commit_diagnostics.gs` | pendingの読取り診断・復旧/TEST破棄可否の説明 | store、adapter、compare、policy、time、runtime。変更を実行しない |

主要な依存方向は次のとおり（共通config/runtimeと凍結Legacyの辺は省略）。下位から公開入口を呼び返さず、循環を作らない。

```text
12 公開入口 ─┬─ 11 validation / 05 policy
             ├─ 14 plan ─┬─ 20 layout
             │           ├─ 21 date / 22 BAT / 23 totals
             │           │       └─ 04 capture → 03 adapter → 01 codec
             │           ├─ 18 identity → 15 store → 01 codec
             │           └─ 15 store（容量確認）
             ├─ 17 recovery ─┬─ 25 diagnostics → 16 compare / 03 adapter / 15 store
             │               ├─ 24 integrity → 16 compare / 03 adapter
             │               └─ 15 store / 19 retention / 07 app state
             └─ 18 identity / 19 retention / 15 store
```

`03`へ集約したのはoperationのセル属性I/Oであり、すべてのSpreadsheet APIではない。シート生成・見出し探索は帳票側に残る。新規planの作成はシートcopyを伴い得るため、`buildFixedCommitPlan_`は純粋関数ではない。

Webは `43_web_bootstrap.js` が依存を注入し、イベント登録→下書き復元→通信表示更新→初回renderを行う。画面ファイルのロードだけでrenderやRPCを実行しない。

```text
43 bootstrap → 33 controller/router → 41 workflow → 37 storage
                       │                   └─ 42 catalog
                       ├─ 38 RPC（通信のみ）
                       └─ 32 DOM
43 bootstrap → 34 start / 35 flight / 36 postflight → 32 DOM / 42 catalog
               34 start → 37 storage
43 bootstrap → 40 diagnosis → 38 RPC / 32 DOM / 42 catalog
             → 39 GPS → 32 DOM
```

- `STATE`は`41`が所有する。`37`は注入された`getState`、画面は`screenState()`から参照する。
- 画面は`screenAction` / `screenRender` / `screenGps` / `screenDiagnosis` / `screenCancel` / `screenReset`から注入先へ通知する。具体的なcontroller関数を呼ばない。
- `33`のroute/capture表には`43`が画面関数を登録する。画面退避は`35`/`36`が各入力欄を所有する。
- `38`は`google.script.run`の成功/失敗を転送するだけで、STATE・下書き・DOMを変更しない。

## 5. 公開入口と保存契約

| 公開GAS関数 | 担当 | 作用 |
|---|---|---|
| `doGet` | `10_server_core.gs` | 初期状態付きWebページを返す |
| `getAppState` | `07_app_state.gs` | 当日・BAT候補・正式累計を読む |
| `finishAircraft` | `12_commit_engine.gs` | 新規保存・同UUID再送・先行pending解決を統括 |
| `diagnosePendingCommitPlans` | `12` → `25_commit_diagnostics.gs` | 読取り専用診断。Sheet/Properties/Cacheを書かない |
| `recoverPendingCommitPlan` | `12` → `17_commit_recovery.gs` | 同じplanを安全条件下でroll-forward |
| `discardPendingTestCommitPlan` | `12` → `17` → `15_commit_store.gs` | 安全条件を満たすTEST計画のPropertiesだけを削除 |

構造整理の基準は`b8e1ab6723784216b119c27d6bf9c2c540e5adb5`。Propertiesキー、plan version、canonical JSON、operation順・stage順、draftId/signature/planHash、DATA→照合→META、complete→DATA削除の順、ScriptLock、flush/readback、未完了の日数非削除を維持する。2026-09-10の長期再送対策で、complete証明の30日削除だけは無期限保持・詳細縮小へ意図的に変更した。通常の保存・旧pending互換は[互換試験](test-spec.md)、長期再送は専用試験で検証する。ファイル分割による高速化は主張せず、APIバッチ化・flush削減・lock短縮は別の変更として検討する。

complete後は利用者の手動修正を尊重する。将来の出力形式・DIPS補助は現在の帳票から業務データを読む別責務として追加する構想であり、未実装である。削除済みDATAや過去planを最新の業務記録として扱わない。新しい保存backendは再試行・整合性の契約設計から行う。

## 6. セキュリティ境界と制約

入力構造・UUIDは`11`、業務許可リストは`05`、安全なセル出力は`03`/`04`、保存容量・planHashは`15`、予約と再送同一性は`18`、比較は`16`、診断と実行は`25`/`17`が担当する。signatureとplanHashは同一性・破損検査であり、呼出者認証や秘密鍵署名ではない。

- 復旧・TEST破棄は通常保存と同じUUID検証をLock前に行う。
- 破損META・キーとdraftIdの不一致・不正IDは、診断および新規保存前の列挙で明示エラーとなる。診断も未知versionを復旧・破棄不可とする。
- cleanupはMETAの解析失敗をDATA削除の根拠にしない。METAキーが存在するDATAを保護し、不正ID・未知versionから完了圧縮しない。
- 診断詳細はHTMLエスケープし、ボタンのIDはdata属性と固定イベント処理で扱う。
- WebのnavigationHistoryは端末に保持し、RPC送信からだけ除外する。入力上限は維持する。
- 自由入力のRichText保護と値・書式readbackを維持する。pending中に同じ評価結果の数式へ変更されても、getFormulaを比較しないため区別できない。旧planのbeforeFormulaを推測して追加しない。
- META検査・planHash一致は、任意の壊れたplan構造すべての検証や実GASの認証・権限検証を意味しない。

### 6.1 進行中下書きと日付

PRE / READY / BATTERY_CHANGE / LANDING / POST_ALLの入力はinput・change・pagehideで同期退避し、setItem後のgetItem一致を確認する。圏外の確定でも最新入力をcaptureし、保存を確認できた場合だけ保持済みと案内する。読込失敗・JSON破損は警告し、元データを削除しない。保存キー・session形式は維持する。

開始前フォームはsessionがなく退避対象外。GPSのプログラム代入は次の操作/pagehideまで未保存の場合がある。OSによるイベント省略、ブラウザデータ削除、大量履歴の同期保存負荷は自動退避だけでは解決しない。新規運航日は開始時の端末時計によるJST日付を採用し、開始済み下書きの日付を変更しない。端末時計の補正や旧下書きの日付推測はしない。開始前の「本日」表示は起動時のままの場合がある。

### 6.2 計算継続の独立した責務

`26_sheet_calculation_continuity.gs` は所有者が導入する編集トリガーと集計補正を担当する。config・runtimeのLock/Spreadsheet・adapterの入力判定を使い、Web保存engineから呼ばない。非表示管理シートと対象集計を扱い、保存plan・Properties・機体正式累計の更新とは分離する。セル定義と制約は [Spreadsheet仕様8](spreadsheet-spec.md#8-手修正後の計算継続導入型) に集約する。

---

## 7. 関連仕様書へのリンク

* 詳細な全体仕様・各画面仕様: [01_ドローン運航記録_設計書.md](../01_ドローン運航記録_設計書.md)
* 壊してはならない設計ルール: [docs/invariants.md](invariants.md)
* 各ファイルの担当関数と索引: [docs/code-map.md](code-map.md)
* スプレッドシート帳票構造: [docs/spreadsheet-spec.md](spreadsheet-spec.md)
* テストケース・障害検証一覧: [docs/test-spec.md](test-spec.md)
* デプロイ・環境再構築手順: [docs/rebuild-guide.md](rebuild-guide.md)

## 8. sessionのデータ契約

再構築時に必要な主要フィールドは次のとおりである。

| 分類 | フィールド |
|---|---|
| 識別 | `draftId`, `operationDate`, `dateSheet`, `forceNewLocation` |
| 運航条件 | `model`, `currentModel`, `purpose`, `route`, `method`, `category`, `permitNo`, `inspectionLocation` |
| 人 | `pilot`, `assistant`, `cert` |
| 進行 | `phase`, `blockNo`, `flightIndex`, `navigationHistory` |
| BAT | `currentBattery`, `selectedBattery`, `selectedBatteryCycle` |
| 飛行 | `startedAt`, `flights`, `totalMinutes` |
| 点検 | `preflightChecks`, `aircrafts` |
| 入力復元 | `pendingFlightInput`, `pendingBatteryChangeInput`, `pendingLandingInput`, `pendingPostflightInput` |

`aircrafts` の各要素は `model`, `used`, `preflightDone`, `flightCount`, `totalMinutes`, `preflightChecks` を持つ。各 `flight` は `model`, `index`, `battery`, `cycle`, `takeoffLocation`, `takeoffAt`, `landingLocation`, `landingAt`, `actualMinutes`, `safetyIssue`, `safetyDetail`, `batteryNote` を持つ。

## 9. 固定保存計画の詳細契約

### 9.1 目的

Google Sheetsには複数シート・複数行をまたぐ一般的なトランザクションがない。このため、途中失敗後にロールバックするのではなく、最初に全保存先と書込内容を固定し、同じ場所へロールフォワードする。

### 9.2 保存開始前に固定するもの

- 入力署名と運航識別子
- 日付シート名、No.1 / No.2、連番番号
- ヘッダー、飛行前点検、各飛行行、飛行後点検のセル操作
- 各BAT履歴の固定行と内部識別子
- 各機体累計セル、開始値、加算値、最終値
- 各セルの保存前値、保存予定値、値種別・書式操作

計画作成時に、別の未完了draftが同じ保存先を予約していないか確認する。再試行時に新しい保存先を探さない。

### 9.3 plan状態と進捗

状態は `pending`, `writing`, `failed`, `complete`。進捗は日付帳票、BAT履歴、飛行後点検、機体累計、最終照合などの段階単位で永続化する。各セル操作は次の判定で処理する。

- 現在値が保存前値: 保存予定値を上書きする。
- 現在値が保存予定値: 既に成功済みとして進む。
- どちらでもない: 第三者変更・競合として停止する。

これにより、同じ固定セルへの再実行が冪等になる。

### 9.4 PropertiesService

計画はScript Propertiesへ保存する。METAに状態、署名、ハッシュ、チャンク数、進捗等を置き、DATAはUTF-8で最大7000バイト相当に分割する。読み出し時にバージョン、チャンク欠落、件数、SHA-256を検査し、不完全・改ざん状態では書込みを開始しない。

上限は、正規化後計画300KiB、最大44チャンク、Properties全体400KiBである。complete後は詳細チャンクを削除する。30日後は詳細METAを同一キーの小さな完了証明へ置換し、証明自体は無期限保持する。容量不足時も証明は削除せず、新規保存を停止する。

### 9.5 CacheService

CacheServiceはcomplete応答の高速化だけに使う補助層で、保持は最大21600秒である。取得・保存失敗は無視でき、正本はPropertiesのcomplete証明である。キャッシュ消失によって二重保存は起きない。

### 9.6 DATE/BAT ownership

DATEブロックとBAT行のownershipは、`draftId`、Script Propertiesへ永続化したfixed commit plan、`planHash`、active reservation、Script Lockを正本とする。

- 日付シート: fixed planへ`sheetName`と`blockNo`を固定し、同じpendingの再試行では再選択しない。
- BAT履歴: fixed planへ`sheetName`、`row`、`flightIndex`を固定し、同じpendingの再試行では別行へ追記しない。
- 書込み時は各対象セルの現在値をbefore/intendedと比較し、intendedなら既書込みとしてskip、beforeなら書込み、それ以外は第三者変更として競合停止する。

Spreadsheetに既に存在するDeveloper Metadataは削除しないが、新しい保存・診断・復旧・新規行選択・二重書込み防止では読み書きせず、必須条件にも使用しない。表示セルを保存完了後に利用者が空欄化した場合、将来の新しいUUIDは空き領域を再利用できる。pending中の対象セル変更と別active pendingの固定予約だけを競合として止める。

### 9.7 flushと読取検証

主要段階の書込み後に `SpreadsheetApp.flush()` を実行し、セル値・書式を読み戻す。すべての対象がfixed planどおりであることを最終確認してからcompleteへ進む。機体累計も開始値または予定最終値だけを許し、複数機体は計画順にロールフォワードする。

### 9.8 古い計画の整理

- complete証明: 無期限保持。30日後はversion/draftId/signature/state/stage/chunkCount/completedAtだけを同一METAキーへ残す。削除してから移行しない。詳細のplanHash/resultHash等はこの時点で省略するが、pendingのplan/hashには触れない。
- pending / writing / failed: 経過日数だけでは削除・failed化しない。数週間、数か月、1年後でも、計画・実データ・競合状態を再診断する。
- 安全復旧可能なら同じfixed planをロールフォワードする。
- TESTかつfixed plan対象の実データ・公式累計変更がない場合だけ、安全破棄を許可する。
- 部分保存または第三者値がある場合は削除せず、安全停止する。
- 孤立したDATAチャンクは整理対象。

## 10. 入力境界の詳細

最終保存入口で、SpreadsheetまたはPropertiesの変更前に、未加工JSONと正規化後データを検証する。

| 項目 | 上限・条件 |
|---|---|
| model | EVO Lite / EVO Lite+のみ |
| battery | 整数1～7 |
| draftId | `op_`付きUUID v4 |
| 日付 | 実在日、2022～2100年 |
| 1飛行時間 | 整数1～240分 |
| 1運航合計 | 最大1440分 |
| 飛行数 | 最大30 |
| 元JSON | 最大512KiB |
| 正規化JSON | 最大128KiB |
| オブジェクト深度 | 最大8 |
| 配列長 | 最大100 |
| 元プロパティ数 | 最大5000 |
| 正規化後プロパティ数 | 最大500 |
| プロパティ名 | 最大100文字 |
| 人名 | 最大120文字 |
| 登録・証明等ID | 最大100文字 |
| 目的・方法・場所 | 各最大500文字 |
| 所感等 | 最大1000文字 |
| 詳細 | 最大2000文字 |

モデル、目的、カテゴリー、飛行方法、点検結果は許可リストで検証する。`__proto__`, `constructor`, `prototype` 等の危険キー、過剰階層、不要プロパティ大量投入を拒否する。異常入力は計画作成、日付シート作成、BAT履歴、機体累計より前に停止する。
