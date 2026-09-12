# 機能追加・変更ガイド（標準開発手順）

本書は、本システムに新しい入力項目、画面要素、保存データ、外部API連携、または集計ロジックを追加・変更する際の**標準手順と全層チェックリスト**を定めた文書である。

---

## 1. 変更作業の基本ステップ

AIエージェントおよび開発者は、機能追加・変更時に以下の順序で作業を進めること。

```text
Step 1: 01目次で担当設計章を特定 → コード影響範囲の特定 (docs/code-map.md)
  │
Step 2: 不変条件の確認 (docs/invariants.md)
  │
Step 3: 正本コードの修正 (src/ または src/web/)
  │
Step 4: ビルド・構文整合性・責務境界チェック
  │
Step 5: 関連テスト、最終回帰・互換確認 (docs/test-spec.md)
```

1. **Step 1: 影響範囲の特定**:
   * 設計・仕様変更ではまず [01設計書目次](../01_ドローン運航記録_設計書/00_目次.md) から担当章を選び、その章と必要な正式仕様を読む。次に [docs/code-map.md](code-map.md) で担当ファイル・主要関数を確認する。通常作業で設計書全章や関係のないファイルは読み込まない。
2. **Step 2: 不変条件の確認**:
   * [docs/invariants.md](invariants.md) を確認し、計画中の変更が「手動編集の許容」「UUID冪等性」「ロールフォワード」「アプリテスト分離」などの前提を侵害しないか検証する。
3. **Step 3: 正本コードの修正**:
   * `src/*.gs` または `src/web/*` のみ編集する（`dist/Code.gs` の直接編集は禁止）。
   * ファイル追加・移動時は `scripts/source-order.json` / `scripts/web-source-order.json` を更新する。Webの依存注入・初回起動は `43_web_bootstrap.js` に置き、最後に結合する。
   * [docs/architecture.md](architecture.md) の依存方向を守り、上位のengineやbootstrapを下位機能から直接呼び戻さない。`13_legacy_compat.gs` は新機能の変更先にしない。
4. **Step 4: ビルド実行と整合性確認**:
   * `node scripts/build.mjs` を実行して `dist/Code.gs` を生成し、`--check` で整合性を確認する。
   * `node scripts/check-boundaries.mjs` で公開入口・内部名・global重複・直接参照の循環を確認する。portsの実行時結線は別途確認する。
5. **Step 5: テスト実行**:
   * 小変更の途中は関連する確認を先に行い、最終確認では [docs/test-spec.md](test-spec.md) の回帰・障害・互換・境界チェックを実行する。必要な挙動を検証するテストだけを追加する。
   * 構造整理では `tests/refactor-compat.test.js` と `tests/web-compat.test.js` により、基準B案との保存形式・処理順・画面動作の互換性を確認する。機能変更時は意図した差と互換を維持する範囲を明示し、期待値だけを更新して通さない。
   * NodeのPASSを実GAS・実ブラウザ・実機の確認済みとは扱わない。確認した環境と残る未検証範囲を分けて報告する。

---

## 2. 入力項目追加時の「全層チェックリスト」

保存する入力項目（フォーム、チェックボックス、選択肢など）を追加する場合、データの不整合や保存漏れを防ぐため、**以下の全7層への影響を確認し、変更が必要な層だけ更新すること**。項目追加のたびにstoreやrecoveryを書き換える構造にしない。

### 層1: クライアント状態（State & UI）
- [ ] `src/web/41_web_workflow.js`:
  - `STATE.session` の初期化・ローカル操作・phase遷移に新しいプロパティを反映したか。
- [ ] `src/web/42_web_catalog.js`:
  - 公開してよい選択肢・点検名・表示説明だけを追加したか。サーバー側の非公開設定をそのまま転送していないか。
- [ ] 各画面JS（`src/web/34_web_start.js`, `35_web_flight.js`, `36_web_postflight.js` 等）:
  - 画面レンダリング関数に入力要素を追加したか。
  - 入力値をworkflowの操作または画面退避へ渡しているか。共通DOM・表示補助は `32_web_core.js`、描画の振り分けは `33_web_engine.js`、結線は `43_web_bootstrap.js` の責務を維持しているか。
  - 最低タップ領域（高さ44px以上）を確保しているか。

### 層2: クライアント下書き保存（LocalStorage）
- [ ] `src/web/37_web_storage.js`:
  - `persistOperationDraft` / `restoreOperationDraft` で、新しいプロパティが欠落せずLocalStorageへ保存・復元されるか。
  - ブラウザをリロードした際に、入力中の値が正しく画面に復元されるか。
- [ ] `35_web_flight.js` / `36_web_postflight.js` の画面退避と `33_web_engine.js` の退避呼出し:
  - 戻る・画面移動・保存失敗でも未確定の入力を保持するか。既存の保存キーと旧下書き互換を維持しているか。

### 層3: サーバー間通信・入力正規化（Validation）
- [ ] `src/web/38_web_rpc.js` と呼出し元 `33_web_engine.js`（保存）/ `40_web_diagnosis.js`（診断）:
  - 必要な項目が保存payloadに含まれ、成功・失敗時の下書き保持順を変えていないか。
- [ ] `src/11_server_validation.gs`:
  - `normalizedCommitInput_` の許可したプロパティへ追加したか。正規化だけで全ての型変換・検証が済むと仮定していないか。
  - raw入力・正規化後のサイズ/深さ/件数、UUID、危険プロパティ名の検査を迂回していないか。
- [ ] `src/05_operation_policy.gs`:
  - `validateCommitBusinessInput_` に型・文字数・許可リスト・数値範囲・点検条件を反映したか。設定値は `00_config.gs`、日付/時間変換は `06_operation_time.gs` を参照する。

### 層4: 再送同一性・plan整合性
- [ ] `src/18_commit_identity.gs` / `src/01_commit_codec.gs`:
  - 正規化した新項目が `commitSignatureV2_` の計算対象に入り、同じ内容の再送で署名が一致するか。
  - 入力署名は内容の同一性、`15_commit_store.gs` のplanHashは保存planの整合性の検査であり、利用者の認証と混同していないか。
  - Legacyの `commitSignature_` を変更入口にしていないか。保持中のpendingを現在の設定や新項目の既定値で再生成していないか。

### 層5: 固定保存計画（Fixed Commit Plan）
- [ ] `src/14_commit_plan.gs` (`buildFixedCommitPlan_`) と対象帳票writer:
  - 新しい項目の保存先セル（または行）を計画段階で一意に決定しているか。
  - `21_sheet_records.gs` / `22_battery_history.gs` / `23_aircraft_totals.gs` の該当写像から、`04_commit_capture.gs` を通してoperationsに保存前値・予定値・書式が入るか。
  - **自由入力の場合**: `trackedSetUserText_` → `03_gas_sheet_adapter.gs` のFormula Injection対策を通すか。任意の直接setterで迂回していないか。
  - `15_commit_store.gs` / `17_commit_recovery.gs` に個別項目の業務条件を追加していないか。保存形式を変える場合は旧pendingの読込・復旧契約を先に設計したか。

### 層6: スプレッドシート帳票書き込み（Spreadsheet Execution）
- [ ] 帳票構造 `20_sheet_core.gs`、日付記録 `21_sheet_records.gs`、BAT `22_battery_history.gs`、正式累計 `23_aircraft_totals.gs`:
  - 対象帳票の探索・写像・読取りを該当責務内で変更しているか。
  - シート側の既存見出し文字列（「使用バッテリー」等）を壊していないか。
  - [docs/spreadsheet-spec.md](spreadsheet-spec.md) の帳票仕様と矛盾していないか。
- [ ] `24_sheet_integrity.gs` / `16_commit_compare.gs` / `03_gas_sheet_adapter.gs`:
  - intendedはskip、beforeだけ書込み、第三値はconflict停止という既存契約を保つか。readbackを省略していないか。
  - 保存完了後の手動編集を過去planで復元していないか。

新しい出力形式は、完了後に手動編集された現在の帳票を読む独立した責務として設計する。新しい保存backendは、永続化・予約・復旧・容量・結果照合の契約を別途定義する。ファイル分割やadapterの差替えだけで同じ安全性が得られると扱わない。

### 層7: テストと検証（Tests）
- [ ] `tests/regression.test.js`:
  - 新規項目を含む運航データでテストを実行し、エラーなく保存されるか。
  - 障害注入テスト（T16〜T23）でも、同一UUID再送時に二重加算や二重書き込みが起きないか。
- [ ] 構造整理のサーバー/Web互換・責務境界試験:
  - 旧pendingのplan JSON・hashを維持して復旧でき、complete後の手動編集を保持するか。
  - 新しい画面やportsを `43_web_bootstrap.js` に結線し、起動・戻る・下書き退避・保存後の状態遷移を検証したか。
  - checker自体を変更した場合は `node scripts/check-boundaries.mjs --self-test` を実行したか。

---

## 3. UIデザイン・スタイル変更時の手順

* **最初に読むファイル**: `src/web/30_web_styles.css`。HTML構造の変更が必要ならシェルまたは対象画面も確認する。
* **確認事項**:
  * Pixel 6aの縦向きを基準に、ページ本体は最大幅760px。430px以下は1列優先、431〜599pxは基本1列、600px以上は既存の2列入力グループを2列、761px以上は幅760pxで中央固定する。文字・余白を詰めすぎず、各幅で崩れがないか。
  * `env(safe-area-inset-*)` が確保され、スマホのノッチやホームバーと重ならないか。
  * 他のJSファイルを変更する必要がないか確認する。

---

## 4. 外部API連携時の注意（GPS・逆ジオコーディング等）

* **GPSの編集対象ファイル**: `src/web/39_web_gps.js`（サーバーRPC共通は `38_web_rpc.js`）
* **確認事項**:
  * 現行は `navigator.geolocation.getCurrentPosition` を高精度で呼び、8秒timeoutはその位置取得に対する指定であり、逆ジオコーディングの `fetch` に同じtimeoutがあるとは扱わない。通信制御の追加は責務分割と分けて検証する。
  * 国土地理院API等の失敗時に座標表示へfallbackできることと、GPS権限拒否時のエラー表示・手入力を確認する。
  * 操縦者の個人情報や機体情報を無関係な外部サービスへ送信しないこと。

## 5. 文書更新を完了条件にする

追加実装・仕様変更では、01目次で特定した担当章に必要な設計変更を反映し、次に [文書索引の役割表](index.md) に従って必要な既存正式文書を更新する。通常の修正で報告書を自動作成しない。独立した履歴を残す条件・reports冒頭書式は [文書管理ルール](index.md#文書更新の恒久ルール) に従う。報告で確定した仕様・制約を報告だけに残さない。

文書追加・移動時には索引と参照元を更新し、`node scripts/check-docs.mjs` と `node tests/docs-structure.test.mjs` を実行する。レビューでは正式仕様への反映漏れと過去報告への依存がないかを確認する。

レビューでは01設計書が「01_ドローン運航記録_設計書/内の00_目次.md＋8章」で一冊として維持され、必要章だけ読めるかを確認する。通常は新章を作らない。既存8章に収まらない独立した恒久的設計領域だけ新設を検討し、責務・既存章で不足する理由を説明して01目次・index・designChapters許可一覧へ同時登録する。既存正式docsの責務と詳細の集約を維持し、各章から必要な専門docsを参照する。通常の追加実装のたびに新しいdocsを作らない。
