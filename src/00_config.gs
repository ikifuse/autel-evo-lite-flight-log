/**
 * ============================================================================
 * ドローン運航記録システム（Google Apps Script 現場運用版）
 * ============================================================================
 * 
 * 【全体構成マップ（目次）】
 * ----------------------------------------------------------------------------
 * 1. バックエンド（Google Apps Script ソース: src/*.gs）
 *    - src/00_config.gs           : 基本設定・定数・検証上限
 *    - src/10_server_core.gs      : Web入口（doGet）、状態取得、ScriptLock
 *    - src/11_server_validation.gs: 構造・業務入力検証、許可リスト
 *    - src/12_commit_engine.gs    : 固定保存計画、冪等書込み、復旧、署名
 *    - src/13_legacy_compat.gs    : 旧保存方式との互換ヘルパー
 *    - src/20_sheet_core.gs       : 日付シート生成、ブロック探索、連番管理
 *    - src/21_sheet_records.gs    : 帳票ヘッダー、点検、飛行行、場所表示
 *    - src/22_battery_totals.gs   : BAT履歴、機体累計、時刻・時間変換
 *
 * 2. クライアント（Web画面部品: src/web/* → build.mjsでアセンブル）
 *    - src/web/30_web_styles.css     : モバイル最適化・レスポンシブ・CSS
 *    - src/web/31_web_shell.html     : HTML外枠・PWA設定・ヘッダー
 *    - src/web/32_web_core.js        : 共有定数・DOM・気象・下書き管理
 *    - src/web/33_web_engine.js      : 状態遷移・通信・エラー・直前引用・GPS
 *    - src/web/34_web_start.js       : 運航開始画面（トップ）
 *    - src/web/35_web_flight.js      : 飛行前点検・BAT交換・待機・飛行・着陸
 *    - src/web/36_web_postflight.js  : 飛行後点検・一括保存・初回起動
 * ----------------------------------------------------------------------------
 */

// ============================================================================
// 1. 基本設定・定数
// ============================================================================
const SPREADSHEET_ID = '10PMEteELQRRWnqc5mVmF6tQCfxFEJEGe2LitpDhYqk8';
const TZ = 'Asia/Tokyo';
const APP_VERSION = '2026.09.09.1';
const COMMIT_RESULT_PREFIX = 'EVO_LITE_COMMIT_RESULT_';
const COMMIT_PLAN_PREFIX = 'EVO_LITE_COMMIT_PLAN_';
const COMMIT_V2_PREFIX = 'EVO_LITE_COMMIT_V2_';
const COMMIT_PLAN_VERSION = 2;
const COMMIT_CHUNK_MAX_BYTES = 7000;
const COMMIT_COMPLETE_RETENTION_DAYS = 30;
const COMMIT_STALE_DAYS = 7;
const SECURITY_MAX_FLIGHTS = 30;
const SECURITY_MAX_FLIGHT_MINUTES = 240;
const SECURITY_MAX_TOTAL_MINUTES = 1440;
const SECURITY_MAX_RAW_INPUT_BYTES = 512 * 1024;
const SECURITY_MAX_NORMALIZED_INPUT_BYTES = 128 * 1024;
const SECURITY_MAX_RAW_PROPERTIES = 5000;
const SECURITY_MAX_NORMALIZED_PROPERTIES = 500;
const SECURITY_MAX_OBJECT_DEPTH = 8;
const SECURITY_MAX_ARRAY_ITEMS = 100;
const SECURITY_MAX_PROPERTY_NAME_CHARS = 100;
const SECURITY_MAX_COMMIT_PLAN_BYTES = 300 * 1024;
const SECURITY_MAX_COMMIT_CHUNKS = 44;
const SECURITY_MAX_PROPERTY_STORE_BYTES = 400 * 1024;
const SECURITY_OPERATION_YEAR_MIN = 2022;
const SECURITY_OPERATION_YEAR_MAX = 2100;
const APP_TEST_PURPOSE = 'アプリテスト';
const SECURITY_TEXT_LIMITS = {
  person: 120,
  identifier: 100,
  purpose: 500,
  method: 500,
  location: 500,
  note: 1000,
  detail: 2000
};
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
  '趣味','研究開発','その他','操縦練習','整備後確認飛行','修理後確認飛行','アプリテスト'
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
