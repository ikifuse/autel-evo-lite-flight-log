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

// PNG is canonical under src; root icon.png is the existing public delivery path.
const iconBytes = readFileSync(resolve(rootDir, 'src/web/assets/icon.png'));
if (iconBytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    iconBytes.readUInt32BE(16) !== 512 || iconBytes.readUInt32BE(20) !== 512 || iconBytes[25] !== 2) {
  fail('専用アイコンは512×512の不透明RGB PNGである必要があります。');
}
const iconRevision = createHash('sha256').update(iconBytes).digest('hex').slice(0, 16);
const publicIconPath = resolve(rootDir, 'icon.png');
if (checkMode) {
  if (!existsSync(publicIconPath) || !readFileSync(publicIconPath).equals(iconBytes)) fail('icon.pngがsrcの専用アイコンと一致しません。');
} else {
  writeFileSync(publicIconPath, iconBytes);
}

console.log('使用するsrcファイル一覧と結合順:');
sourceFiles.forEach((file, index) => console.log(`${index + 1}. ${file}`));

function assembleWebSource(root) {
  const webDir = resolve(root, 'src/web');
  const webManifestPath = resolve(root, 'scripts/web-source-order.json');
  if (!existsSync(webManifestPath)) fail('scripts/web-source-order.json が見つかりません。');
  let webSourceFiles;
  try {
    webSourceFiles = JSON.parse(readFileSync(webManifestPath, 'utf8'));
  } catch (error) {
    fail(`Web結合順ファイルを読み込めません: ${error.message}`);
  }
  if (!Array.isArray(webSourceFiles) || !webSourceFiles.length ||
      new Set(webSourceFiles).size !== webSourceFiles.length ||
      webSourceFiles.some((file) => !/^src\/web\/[A-Za-z0-9_.-]+\.js$/.test(file))) {
    fail('Web結合順にはsrc/web直下の.jsファイルを重複なく指定してください。');
  }
  const actualWebFiles = readdirSync(webDir).filter((file) => file.endsWith('.js'))
    .map((file) => 'src/web/' + file).sort();
  if (JSON.stringify(actualWebFiles) !== JSON.stringify([...webSourceFiles].sort())) {
    fail('src/webの.jsファイル一覧とscripts/web-source-order.jsonが一致しません。');
  }
  for (const file of ['src/web/30_web_styles.css', 'src/web/31_web_shell.html'].concat(webSourceFiles)) {
    if (!existsSync(resolve(root, file))) fail(`Web部品ファイルが見つかりません: ${file}`);
  }
  const cssContent = readFileSync(resolve(webDir, '30_web_styles.css'), 'utf8');
  const shellContent = readFileSync(resolve(webDir, '31_web_shell.html'), 'utf8').trimEnd();
  const combinedScripts = webSourceFiles.map((file) => readFileSync(resolve(root, file), 'utf8')).join('\n');
  try {
    new Function(combinedScripts);
  } catch (error) {
    fail(`Webスクリプトの構文検査に失敗しました: ${error.message}`);
  }
  const assembledHtml = shellContent
    .replace('/* __APP_STYLES__ */\n', cssContent)
    .replace('/* __APP_SCRIPTS__ */\n', combinedScripts);

  const headerContent = '// ============================================================================\n' +
    '// 3. 画面構造（HTML）＆ モバイルデザインスタイル（CSS）\n' +
    '// ============================================================================\n' +
    'const APP_HTML = String.raw`';

  return headerContent + assembledHtml + '`;\n';
}

const sourceText = sourceFiles
  .map((file) => {
    const fullPath = resolve(rootDir, file);
    if (!existsSync(fullPath)) fail(`${file} が見つかりません。`);
    return readFileSync(fullPath, 'utf8');
  })
  .concat([assembleWebSource(rootDir)])
  .join('\n').replaceAll('__ICON_REVISION__', iconRevision);

try {
  new Function(sourceText);
} catch (error) {
  fail(`結合後コードの構文検査に失敗しました: ${error.message}`);
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
