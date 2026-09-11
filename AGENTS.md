# AGENTS.md

## 正本

- 正本は `src/`。
- `dist/Code.gs` は自動生成物。直接編集禁止。
- ルートに `Code.gs` は置かない。GASへ反映する場合は `dist/Code.gs` だけを使用する。

## 作業原則

- 最初に `docs/code-map.md` から対象機能を特定する。
- ロジック変更時は、必ず `docs/invariants.md` の不変条件に違反しないことを確認する。
- 対象機能に記載されたファイルから読み、必要性が確認できるまで探索を広げない。
- 無関係なリファクタリングは禁止。
- 挙動変更を依頼されていない構造整理では、ロジックを変更しない。
- 小変更では関連テストのみ実行し、全回帰テストは最終確認時に実行する。
- 公開GAS入口・永続化済みplan形式・内部関数の末尾 `_` を構造整理で変更しない。
- 依存方向は `docs/architecture.md` に従う。比較・永続化・GAS操作をengineへ戻さない。
- 構造整理の最終確認は回帰・ビルド整合性に加え、`tests/refactor-compat.test.js` と `tests/web-compat.test.js` を実行する。
- `commit`、`push`、`deploy` は行わない。

## コード入口

- 設定・入力境界 → `src/00_config.gs`、`src/11_server_validation.gs`、`src/05_operation_policy.gs`
- 保存入口 → `src/12_commit_engine.gs`。plan/store/compare/recovery等の最短入口は `docs/code-map.md` を参照する。
- GAS実行・セル操作 → `src/02_gas_runtime.gs`、`src/03_gas_sheet_adapter.gs`
- 帳票構造・日付記録 → `src/20_sheet_core.gs`、`src/21_sheet_records.gs`
- BAT履歴・正式累計 → `src/22_battery_history.gs`、`src/23_aircraft_totals.gs`
- Web → `src/web/33_web_engine.js` はcontroller、画面は `34`～`36`。その他の責務は `docs/code-map.md` を参照する。
- 旧方式互換 → `src/13_legacy_compat.gs`（凍結。通常作業では読まない・書き換えない）
- 結合順 → `scripts/source-order.json`、`scripts/web-source-order.json`

## 仕様・ドキュメント入口

- 目的別文書インデックス → `docs/index.md`
- 壊してはいけない条件・掟 → `docs/invariants.md`
- 全体構造・データフロー → `docs/architecture.md`
- 機能追加・変更手順 → `docs/feature-guide.md`
- コード対応索引 → `docs/code-map.md`
- 全体設計・状態遷移・保存方式 → `01_ドローン運航記録_設計書.md`
- Spreadsheet・帳票・原本仕様 → `docs/spreadsheet-spec.md`
- テスト・障害検証仕様 → `docs/test-spec.md`
- 再構築・デプロイ手順 → `docs/rebuild-guide.md`

## 文書管理

- 01設計書は全体設計・共通原則・状態遷移・正式仕様の案内を持つ親文書とし、詳細や作業記録を無制限に足さない。詳細は責務単位の既存正式文書へ置き、親の各章に参照先を残す。
- 作業単位で正式文書を作らない。既存の責務に収まらない独立領域だけ新設を検討し、恒久的責務・既存文書で不足する理由・index上の位置付け・配置チェック登録を同時に整える。

- 新規文書を作る前に既存正式文書への追記で足りるか確認する。通常の変更では報告書を自動作成しない。
- `docs/` 直下は `docs/index.md` に定める正式文書専用。新規Markdownを安易に追加しない。
- 現在の仕様・制約・運用判断は既存の担当正式文書へ反映する。報告書だけに仕様判断を残さない。
- 独立した履歴が必要な監査・調査・実装記録は `docs/reports/` に置く。reportsを現在仕様の正本として扱わない。
- reports冒頭に履歴であること・状態表記は記録当時であること・正式文書へのリンクを付ける。書式と作成条件は `docs/index.md` に従う。
- 文書追加・移動時は `docs/index.md` の索引と全参照を更新し、`node scripts/check-docs.mjs` と `node tests/docs-structure.test.mjs` を実行する。
