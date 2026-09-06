/**
 * ============================================================================
 * ドローン運航記録システム（Google Apps Script 単一ファイル完全版）
 * ============================================================================
 * 
 * 【全体構成マップ（目次）】
 * ----------------------------------------------------------------------------
 * 1. 基本設定・定数（機体型式、登録記号、法令点検項目）         : 40行付近〜
 * 2. サーバー側ロジック（全運航終了時の一括書き込み）          : 100行付近〜
 *    - 運航開始（同日複数現場の連番シート対応）
 *    - 飛行前点検（ワンタップ全て正常）
 *    - 離陸・着陸・バッテリー個別履歴記録
 *    - 機体交代（Lite ↔ Lite+）
 *    - 同一現場・同一目的の連続飛行後に行う飛行後点検まとめ
 * 3. 画面構造（HTMLテンプレート）
 * 4. 画面スタイル（モバイル最適化・CSSデザイン）
 * 5. 画面操作スクリプト（Vanilla JavaScript）
 * ----------------------------------------------------------------------------
 */

// ============================================================================
// 1. 基本設定・定数
// ============================================================================
const SPREADSHEET_ID = '10PMEteELQRRWnqc5mVmF6tQCfxFEJEGe2LitpDhYqk8';
const TZ = 'Asia/Tokyo';
const APP_VERSION = '2026.09.06.2';
const COMMIT_RESULT_PREFIX = 'EVO_LITE_COMMIT_RESULT_';
const COMMIT_PLAN_PREFIX = 'EVO_LITE_COMMIT_PLAN_';
const COMMIT_V2_PREFIX = 'EVO_LITE_COMMIT_V2_';
const COMMIT_PLAN_VERSION = 2;
const COMMIT_CHUNK_MAX_BYTES = 7000;
const COMMIT_COMPLETE_RETENTION_DAYS = 30;
const COMMIT_STALE_DAYS = 7;
const BATTERY_COMMIT_METADATA_KEY = 'EVO_FLIGHT_COMMIT';
const TEMPLATE_NAME = '日常点検';
const BATTERY_SHEET_PREFIX = 'BAT_';
const BATTERY_FIRST_ROW = 13;
const BATTERY_LAST_ROW = 212;

const MODELS = {
  'EVO Lite': 'JU3268805C02',
  'EVO Lite+': 'JU3269B165D2'
};

const AIRCRAFT_MAINTENANCE_SHEETS = {
  'EVO Lite': '点検整備記録_EVO Lite_原本',
  'EVO Lite+': '点検整備記録_EVO Lite+_原本'
};

const BLOCKS = {
  1: { startCol: 3, endCol: 15 },
  2: { startCol: 18, endCol: 30 }
};

const FLIGHT_PURPOSES = [
  '空撮','報道取材','警備','農林水産業','測量','環境調査','設備メンテナンス',
  'インフラ点検・保守','資材管理','輸送・宅配','自然観測','事故・災害対応等',
  '趣味','研究開発','その他','操縦練習','整備後確認飛行','修理後確認飛行'
];

const SPECIAL_FLIGHT_METHODS = [
  '空港等周辺','150m以上','DID','夜間','目視外','30m未満',
  '催し場所上空','危険物輸送','物件投下'
];

const PRE_CHECK_NAMES = [
  '機体全般','プロペラ・フレーム','通信系統','推進系統','電源系統',
  '自動制御系統','バッテリー','操縦装置','灯火','カメラ','リモートID'
];

const POST_CHECK_NAMES = ['機体全般','プロペラ・フレーム','発熱','その他'];
const APP_ICON_URL = 'https://raw.githubusercontent.com/ikifuse/autel-evo-lite-flight-log/main/icon.png';

let LOCK_DEPTH = 0;
let COMMIT_WRITE_CAPTURE = null;
let COMMIT_FAULT_INJECTOR = null;
