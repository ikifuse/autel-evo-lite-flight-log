# AGENTS.md

## 正本

- 正本は `src/`。
- `dist/Code.gs` は自動生成物。直接編集禁止。
- ルートに `Code.gs` は置かない。GASへ反映する場合は `dist/Code.gs` だけを使用する。

## 作業原則

- 最初に `docs/code-map.md` から対象機能を特定する。
- 対象機能に記載されたファイルから読み、必要性が確認できるまで探索を広げない。
- 無関係なリファクタリングは禁止。
- 挙動変更を依頼されていない構造整理では、ロジックを変更しない。
- 小変更では関連テストのみ実行し、全回帰テストは最終確認時に実行する。
- `commit`、`push`、`deploy` は行わない。

## コード入口

- 設定・定数 → `src/00_config.gs`
- サーバー共通 → `src/10_server_core.gs`
- 入力検証 → `src/11_server_validation.gs`
- 現行保存・冪等性・復旧 → `src/12_commit_engine.gs`
- 旧方式互換 → `src/13_legacy_compat.gs`（通常作業では読まない）
- 帳票構造 → `src/20_sheet_core.gs`
- 日付シートへの記録・表示 → `src/21_sheet_records.gs`
- BAT履歴・機体累計 → `src/22_battery_totals.gs`
- Web画面 → `src/30_web_app.gs`

Web側の詳細な対象関数は `docs/code-map.md` を確認すること。

## 仕様・ドキュメント入口

- 全体設計・状態遷移・保存方式 → `01_ドローン運航記録_設計書.md`
- Spreadsheet・帳票・原本仕様 → `docs/spreadsheet-spec.md`
- テスト・障害検証仕様 → `docs/test-spec.md`
- 再構築・デプロイ手順 → `docs/rebuild-guide.md`
