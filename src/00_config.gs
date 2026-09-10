/**
 * ドローン運航記録システム — 設定・定数・検証上限。
 * 責務と依存方向は docs/architecture.md、変更入口は docs/code-map.md を参照。
 * 結合順は scripts/source-order.json と scripts/web-source-order.json で管理する。
 */

// ============================================================================
// 1. 基本設定・定数
// ============================================================================
const SPREADSHEET_ID = '10PMEteELQRRWnqc5mVmF6tQCfxFEJEGe2LitpDhYqk8';
const TZ = 'Asia/Tokyo';
const APP_VERSION = '2026.09.09.3';
const COMMIT_RESULT_PREFIX = 'EVO_LITE_COMMIT_RESULT_';
const COMMIT_PLAN_PREFIX = 'EVO_LITE_COMMIT_PLAN_';
const COMMIT_V2_PREFIX = 'EVO_LITE_COMMIT_V2_';
const COMMIT_PLAN_VERSION = 2;
const COMMIT_CHUNK_MAX_BYTES = 7000;
const COMMIT_COMPLETE_RETENTION_DAYS = 30;
// 未完了保存計画は日数で自動削除せず、整合性と状態（Web画面での復旧/破棄）で管理する。
const COMMIT_STALE_DAYS = 0; // 0=未完了の日数自動削除・自動failed化は行わない
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
