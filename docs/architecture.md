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
| `19_commit_retention.gs` | complete保持期限と整理判断 | store、runtime |
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

構造整理の基準は`b8e1ab6723784216b119c27d6bf9c2c540e5adb5`。Propertiesキー、plan version、canonical JSON、operation順・stage順、draftId/signature/planHash、DATA→照合→META、complete→DATA削除の順、ScriptLock、flush/readback、30日complete保持、未完了の日数非削除を維持する。変更は[互換試験](test-spec.md)で基準と比較する。ファイル分割による高速化は主張せず、APIバッチ化・flush削減・lock短縮は別の変更として検討する。

complete後は利用者の手動修正を尊重する。将来の出力形式・DIPS補助は現在の帳票から業務データを読む別責務として追加する構想であり、未実装である。削除済みDATAや過去planを最新の業務記録として扱わない。新しい保存backendは再試行・整合性の契約設計から行う。

## 6. セキュリティ境界と今回の変更範囲

入力構造・UUIDは`11`、業務許可リストは`05`、安全なセル出力は`03`/`04`、保存容量・planHashは`15`、予約と再送同一性は`18`、比較は`16`、診断と実行の境界は`25`/`17`が担当する。signatureとplanHashは同一性・破損検査であり、呼出者認証や暗号学的な改ざん証明ではない。

今回の安全面での挙動変更は、`40_web_diagnosis.js`の競合詳細`JSON.stringify(r.conflicts, null, 2)`を`esc(...)`してHTMLへ表示する修正だけである。以下は分割で修正したとは扱わず、別件の挙動変更として検証する未変更事項である。

- 復旧/TEST破棄入口のdraftIdは未指定判定のみで、`finishAircraft`と同じUUID形式検証へは統一していない。
- 保存済みMETA/planの構造・深さ・件数検証の追加、破損META列挙時の扱いは変更していない。
- `loadCommitPlan_`はMETAのversionを検査するが、診断のchunk読込み経路には同じ検査がない。この非対称は維持している。
- cleanupは読み込めないMETAを予約表へ登録せず、そのDATAを孤立chunkとして削除し得る。破損META/DATAの保全方針は今回変更していない。
- Formula InjectionのRichText出力は維持するが、保存時readbackへ`getFormula()`検査は追加していない。
- 認証・認可、Properties容量上限、予約、conflict条件、Lock/flush/readback、cache・保持期間は変更していない。

---

## 7. 関連仕様書へのリンク

* 詳細な全体仕様・各画面仕様: [01_ドローン運航記録_設計書.md](../01_ドローン運航記録_設計書.md)
* 壊してはならない設計ルール: [docs/invariants.md](invariants.md)
* 各ファイルの担当関数と索引: [docs/code-map.md](code-map.md)
* スプレッドシート帳票構造: [docs/spreadsheet-spec.md](spreadsheet-spec.md)
* テストケース・障害検証一覧: [docs/test-spec.md](test-spec.md)
* デプロイ・環境再構築手順: [docs/rebuild-guide.md](rebuild-guide.md)
