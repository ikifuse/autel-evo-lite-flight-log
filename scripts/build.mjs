import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const GENERATED_HEADER = [
  '// ============================================================================',
  '// このファイルは自動生成です。手動編集禁止。',
  '// 正本は src/ 配下です。',
  '// 生成スクリプト: scripts/build.mjs',
  '// ============================================================================',
  ''
].join('\n');

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const args = new Set(process.argv.slice(2));
const checkFileArg = process.argv.slice(2).find((arg) => arg.startsWith('--check-file='));
const checkMode = args.has('--check') || Boolean(checkFileArg);
const legacyCheck = args.has('--legacy-check');
const outputRelative = checkFileArg ? checkFileArg.slice('--check-file='.length) : 'dist/Code.gs';
const outputPath = resolve(rootDir, outputRelative);
const manifestPath = resolve(scriptDir, 'source-order.json');

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

if (!existsSync(manifestPath)) fail('scripts/source-order.json が見つかりません。');

let sourceFiles;
try {
  sourceFiles = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (error) {
  fail(`結合順ファイルを読み込めません: ${error.message}`);
}

if (!Array.isArray(sourceFiles) || sourceFiles.length === 0) {
  fail('結合対象のsrcファイルが指定されていません。');
}
if (new Set(sourceFiles).size !== sourceFiles.length) {
  fail('結合順に同じsrcファイルが重複しています。');
}
if (sourceFiles.some((file) => !/^src\/[A-Za-z0-9_.-]+\.gs$/.test(file))) {
  fail('結合対象にはsrc直下の.gsファイルだけを指定してください。');
}

const actualSourceFiles = readdirSync(resolve(rootDir, 'src'))
  .filter((file) => file.endsWith('.gs'))
  .map((file) => `src/${basename(file)}`)
  .sort();
const listedSourceFiles = [...sourceFiles].sort();
if (JSON.stringify(actualSourceFiles) !== JSON.stringify(listedSourceFiles)) {
  fail('src配下の.gsファイル一覧とscripts/source-order.jsonが一致しません。');
}

console.log('使用するsrcファイル一覧と結合順:');
sourceFiles.forEach((file, index) => console.log(`${index + 1}. ${file}`));

const sourceText = sourceFiles.map((file) => {
  const fullPath = resolve(rootDir, file);
  if (!existsSync(fullPath)) fail(`${file} が見つかりません。`);
  return readFileSync(fullPath, 'utf8');
}).join('\n');

try {
  new Function(sourceText);
} catch (error) {
  fail(`結合後コードの構文検査に失敗しました: ${error.message}`);
}

if (legacyCheck) {
  const legacyPath = resolve(rootDir, 'Code.gs');
  if (!existsSync(legacyPath)) fail('比較対象の旧Code.gsが見つかりません。');
  const legacyText = readFileSync(legacyPath, 'utf8');
  console.log(`旧Code.gs SHA-256: ${sha256(legacyText)}`);
  console.log(`結合src本体 SHA-256: ${sha256(sourceText)}`);
  if (legacyText !== sourceText) fail('結合src本体が旧Code.gsと一致しません。');
  console.log('旧Code.gsとの本体一致検証: OK');
}

const generatedText = GENERATED_HEADER + sourceText;

if (checkMode) {
  if (!existsSync(outputPath)) fail(`${outputRelative} が見つかりません。`);
  const currentText = readFileSync(outputPath, 'utf8');
  console.log(`期待する生成物 SHA-256: ${sha256(generatedText)}`);
  console.log(`検証対象 SHA-256: ${sha256(currentText)}`);
  if (currentText !== generatedText) fail(`${outputRelative} がsrcの最新状態と一致しません。`);
  console.log(`${outputRelative}の一致検証: OK`);
} else {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, generatedText, 'utf8');
  console.log(`${outputRelative}を生成しました。`);
  console.log(`生成物 SHA-256: ${sha256(generatedText)}`);
}
