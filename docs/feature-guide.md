# 機能追加・変更ガイド（標準開発手順）

本書は、本システムに新しい入力項目、画面要素、保存データ、外部API連携、または集計ロジックを追加・変更する際の**標準手順と全層チェックリスト**を定めた文書である。

---

## 1. 変更作業の基本ステップ

AIエージェントおよび開発者は、機能追加・変更時に以下の順序で作業を進めること。

```text
Step 1: 影響範囲の特定 (docs/code-map.md)
  │
Step 2: 不変条件の確認 (docs/invariants.md)
  │
Step 3: 正本コードの修正 (src/ または src/web/)
  │
Step 4: ビルド・構文整合性チェック (node scripts/build.mjs --check)
  │
Step 5: 回帰・障害テストの更新と実行 (node tests/regression.test.js)
```

1. **Step 1: 影響範囲の特定**:
   * まず [docs/code-map.md](code-map.md) を開き、担当ファイル・主要関数を確認する。関係のないファイルは読み込まない。
2. **Step 2: 不変条件の確認**:
   * [docs/invariants.md](invariants.md) を確認し、計画中の変更が「手動編集の許容」「UUID冪等性」「ロールフォワード」「アプリテスト分離」などの前提を侵害しないか検証する。
3. **Step 3: 正本コードの修正**:
   * `src/*.gs` または `src/web/*` のみ編集する（`dist/Code.gs` の直接編集は禁止）。
4. **Step 4: ビルド実行と整合性確認**:
   * `node scripts/build.mjs` を実行して `dist/Code.gs` を生成し、`--check` で整合性を確認する。
5. **Step 5: テスト実行**:
   * `node tests/regression.test.js` を実行し、既存の全ケース（TEST 1〜15、T16〜T23）がパスすることを確認する。必要に応じて新規テストケースを追加する。

---

## 2. 入力項目追加時の「全層チェックリスト」

画面に1つでも新しい入力項目（フォーム、チェックボックス、選択肢など）を追加する場合、データの不整合や保存漏れを防ぐため、**以下の全7層を一式で確認・更新すること**。

### 層1: クライアント状態（State & UI）
- [ ] `src/web/32_web_core.js`:
  - `STATE.session` または関連オブジェクトに新しいプロパティの初期値を定義したか。
  - 定数（選択肢リストや名称マップ）が必要な場合、ここに追加したか。
- [ ] 各画面JS（`src/web/34_web_start.js`, `35_web_flight.js`, `36_web_postflight.js` 等）:
  - 画面レンダリング関数に入力要素を追加したか。
  - 入力変更イベント（`onXxxChanged`）で `STATE.session` の対象プロパティを正しく更新しているか。
  - 最低タップ領域（高さ44px以上）を確保しているか。

### 層2: クライアント下書き保存（LocalStorage）
- [ ] `src/web/32_web_core.js` / `33_web_engine.js`:
  - `persistOperationDraft` / `restoreOperationDraft` で、新しいプロパティが欠落せずLocalStorageへ保存・復元されるか。
  - ブラウザをリロードした際に、入力中の値が正しく画面に復元されるか。

### 層3: サーバー間通信・入力正規化（Validation）
- [ ] `src/11_server_validation.gs`:
  - `normalizedCommitInput_`: サーバー側で受け取ったオブジェクトから対象プロパティを抽出・型変換（string/number/boolean）しているか。
  - `validateCommitBusinessInput_`: 文字数上限、許可リスト、数値範囲などのバリデーションを追加したか。
  - 危険プロパティ（プロトタイプ汚染など）が除外されているか。

### 層4: 改ざん検知・署名（Signature）
- [ ] `src/12_commit_engine.gs`:
  - 入力署名計算（`commitSignature_` または計画ハッシュ）に新しいプロパティを含めたか。
  - 同一内容の再送時に正しく署名が一致するか。

### 層5: 固定保存計画（Fixed Commit Plan）
- [ ] `src/12_commit_engine.gs` (`buildFixedCommitPlan_`):
  - 新しい項目の保存先セル（または行）を計画段階で一意に決定しているか。
  - `operations` 配列にセル書き込み計画（保存前値、予定値、書式）が追加されているか。
  - **自由入力の場合**: 数式インジェクション（Formula Injection）防止（`RichTextValue` 化）を通しているか。

### 層6: スプレッドシート帳票書き込み（Spreadsheet Execution）
- [ ] `src/20_sheet_core.gs` / `src/21_sheet_records.gs` / `src/22_battery_totals.gs`:
  - 実際のセル書き込み処理が正しく実装されているか。
  - シート側の既存見出し文字列（「使用バッテリー」等）を壊していないか。
  - [docs/spreadsheet-spec.md](spreadsheet-spec.md) の帳票仕様と矛盾していないか。

### 層7: テストと検証（Tests）
- [ ] `tests/regression.test.js`:
  - 新規項目を含む運航データでテストを実行し、エラーなく保存されるか。
  - 障害注入テスト（T16〜T23）でも、同一UUID再送時に二重加算や二重書き込みが起きないか。

---

## 3. UIデザイン・スタイル変更時の手順

* **編集対象ファイル**: `src/web/30_web_styles.css` のみ
* **確認事項**:
  * 画面幅 430px以下（狭幅スマホ1列）、600px以上（2列）、761px以上（最大幅760px中央固定）で崩れがないか。
  * `env(safe-area-inset-*)` が確保され、スマホのノッチやホームバーと重ならないか。
  * 他のJSファイルを変更する必要がないか確認する。

---

## 4. 外部API連携時の注意（GPS・逆ジオコーディング等）

* **編集対象ファイル**: `src/web/33_web_engine.js`
* **確認事項**:
  * 国土地理院API等の外部サービス呼び出し時は、適切なタイムアウト（例: 8秒）とエラーハンドリング（失敗しても画面が止まらず手入力可能）を設けること。
  * 操縦者の個人情報や機体情報を無関係な外部サービスへ送信しないこと。
