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
  ▼ (全飛行完了後: submitAllPostflight で1回だけ送信)
[GAS サーバー (doGet / google.script.run)]
  │
  ▼
[11_server_validation.gs (入力検証)]
  │  ・型、文字数、許可リスト、配列境界、プロパティ数
  │  ・数式インジェクション (Formula Injection) 対策
  │
  ▼
[12_commit_engine.gs (固定保存計画: Fixed Commit Plan)]
  │  ・全書き込み先 (シート名, ブロック, BAT行, 累計セル) を事前確定
  │  ・計画を Script Properties へチャンク分割永続化
  │
  ▼
[スプレッドシート書き込み (段階別ロールフォワード)]
  │  ├─ Phase 1: 日常点検シート (ヘッダー・点検・飛行行)
  │  ├─ Phase 2: バッテリー個別履歴 (BAT_1〜7 + Developer Metadata)
  │  ├─ Phase 3: 飛行後点検記録
  │  └─ Phase 4: 機体公式累計更新 (点検整備記録原本 ※通常運航時のみ)
  │
  ▼
[flush & 読み戻し照合]
  │  ・全セルの値・書式・Metadataが計画値と完全一致するか確認
  │
  ▼
[完了確定 (complete)]
  │  ・Script Properties に完了証明を記録
  │  ・CacheService へ補助キャッシュ
  │
  ▼
[クライアント応答]
     ・STATE を初期状態 (active:false) へ更新
     ・LocalStorage の下書きクリア
     ・完了画面表示
```

---

## 2. ビルド構造と配布フロー

ソースコードの正本は `src/` 配下に分割管理し、単一のGAS配布物 `dist/Code.gs` を生成する。

```text
[開発・保守の正本]
  ├── src/ (GASバックエンド: 8ファイル)
  │     00_config.gs, 10_server_core.gs, 11_server_validation.gs, ...
  │
  └── src/web/ (Webクライアント部品: 7ファイル)
        30_styles.css, 31_shell.html, 32_core.js, 33_engine.js, ...

       │
       ▼ (node scripts/build.mjs)
       │  1. source-order.json の順にバックエンドGSを読み込み
       │  2. src/web/ の7ファイルをアセンブルして単一の APP_HTML 文字列を生成
       │  3. 構文チェック (JS Syntax Check)
       │  4. 単一ファイルとして結合
       │
[自動生成物 (手動編集禁止)]
  └── dist/Code.gs

       │
       ▼ (テスト検証)
  tests/regression.test.js (Node.js上のGASモック環境で回帰・障害注入試験)

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
  ▼ (buildFixedCommitPlan_)
[pending] ── 全保存先と計画セル値を確定・Properties永続化
  │
  ▼ (applyCommitOperations_)
[writing] ── 各フェーズ (シート/BAT/点検/累計) を順次書込み
  │          ※途中で失敗・例外発生時は [failed] へ移行
  │          ※同一UUIDでの再試行時は、未完了フェーズからロールフォワード
  │
  ▼ (verifyCommitPlanResult_ & flush)
[complete] ─ 全書込みの読み戻し照合が完了、完了証明を発行
             ※以降の同一UUID再送には、追加書込みなしで即座に成功応答
```

---

## 4. 関連仕様書へのリンク

* 詳細な全体仕様・各画面仕様: [01_ドローン運航記録_設計書.md](../01_ドローン運航記録_設計書.md)
* 壊してはならない設計ルール: [docs/invariants.md](invariants.md)
* 各ファイルの担当関数と索引: [docs/code-map.md](code-map.md)
* スプレッドシート帳票構造: [docs/spreadsheet-spec.md](spreadsheet-spec.md)
* テストケース・障害検証一覧: [docs/test-spec.md](test-spec.md)
* デプロイ・環境再構築手順: [docs/rebuild-guide.md](rebuild-guide.md)
