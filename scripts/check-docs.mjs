import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Change only when the documented roles themselves intentionally change.
export const formalDocs = [
  'index.md', 'architecture.md', 'code-map.md', 'invariants.md',
  'feature-guide.md', 'spreadsheet-spec.md', 'test-spec.md', 'rebuild-guide.md',
];
// One design book: add a chapter here only with its table-of-contents entry.
export const designDirectory = '01_ドローン運航記録_設計書';
export const designChapters = [
  '01_設計思想・基本方針.md', '02_法令・運用.md', '03_画面・運航フロー.md',
  '04_保存・復旧.md', '05_記録・手動補記.md', '06_機体・バッテリー・累計.md',
  '07_点検整備・管理開始.md', '08_セキュリティ・品質.md',
];
export const rootDesign = designDirectory + '/00_目次.md';
export const reportNotice = '<!-- document-kind: historical-report -->';

function prose(text) {
  return text.replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, '')
    .replace(/`[^`\n]*`/g, '');
}

// Repository Markdown: inline links/images, reference definitions, HTML href/src.
// Check local file destinations; no network requests or GitHub anchor emulation.
export function links(text) {
  const body = prose(text), result = [];
  for (const m of body.matchAll(/\]\(\s*(?:<([^>]+)>|((?:[^\s()\\]|\\.|\([^()]*\))+))(?:\s+["'][^\n]*?["'])?\s*\)/g)) result.push(m[1] ?? m[2]);
  for (const m of body.matchAll(/^\s*\[[^\]]+\]:\s*(?:<([^>]+)>|(\S+))/gm)) result.push(m[1] ?? m[2]);
  for (const m of body.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/g)) result.push(m[1]);
  return result;
}

function localTarget(root, file, url) {
  if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(url)) return null;
  const raw = url.split(/[?#]/)[0];
  if (!raw) return null;
  const decoded = decodeURIComponent(raw).replace(/\\([() ])/g, '$1');
  const target = decoded.startsWith('/') ? path.resolve(root, '.' + decoded) : path.resolve(root, path.dirname(file), decoded);
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error('repository外への参照');
  return path.relative(root, target).split(path.sep).join('/');
}

export function checkDocs(directory) {
  const root = path.resolve(directory), errors = [], docs = path.join(root, 'docs');
  if (!fs.existsSync(docs)) return ['docs/ がありません'];
  const markdown = [];
  function collect(dir, recursive) {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const file = path.posix.join(dir, entry.name);
      if (entry.isFile() && /\.md$/i.test(entry.name)) markdown.push(file);
      else if (recursive && entry.isDirectory()) collect(file, true);
    }
  }
  collect('', false); collect('docs', true);
  if (fs.existsSync(path.join(root, designDirectory))) collect(designDirectory, true);
  if (markdown.some(f => f.toLowerCase() === (designDirectory + '.md').toLowerCase())) errors.push(`${designDirectory}.md: 旧設計書配置。入口は${rootDesign}`);
  if (fs.existsSync(path.join(docs, 'design'))) errors.push(`docs/design/: 旧設計書配置。正式本文は${designDirectory}/へ`);
  for (const entry of fs.readdirSync(docs, { withFileTypes: true })) {
    if (entry.isFile() && /\.md$/i.test(entry.name) && !formalDocs.includes(entry.name)) errors.push(`docs/${entry.name}: 正式文書一覧外。履歴はdocs/reports/へ`);
  }
  const chapters = designChapters.map(f => designDirectory + '/' + f);
  const designFiles = markdown.filter(f => f.startsWith(designDirectory + '/'));
  for (const file of designFiles) {
    if (file !== rootDesign && !chapters.includes(file)) errors.push(`${file}: 設計章許可一覧外。章追加は01設計書目次・索引・許可一覧の同時更新が必要。履歴はdocs/reports/へ`);
  }
  const required = [rootDesign, ...formalDocs.map(f => 'docs/' + f), ...chapters];
  for (const f of required) if (!fs.existsSync(path.join(root, f))) errors.push(`${f}: 正式文書がありません`);
  const targets = new Map();
  for (const file of markdown) {
    const text = fs.readFileSync(path.join(root, file), 'utf8'), refs = [];
    for (const url of links(text)) {
      try {
        const target = localTarget(root, file, url);
        if (!target) continue;
        refs.push(target);
        if (!fs.existsSync(path.join(root, target))) errors.push(`${file}: リンク切れ ${url}`);
      } catch (error) { errors.push(`${file}: 不正な参照 ${url} (${error.message})`); }
    }
    targets.set(file, refs);
    if (file.startsWith(designDirectory + '/') && prose(text).includes(reportNotice)) errors.push(`${file}: 設計章に履歴注意書きがあります。${designDirectory}/は正式本文、履歴はdocs/reports/へ`);
    if (file.startsWith('docs/reports/')) {
      const head = text.split('\n').slice(0, 12).join('\n');
      if (!head.includes(reportNotice) || !head.includes('現在仕様の正本ではありません') || !head.includes('記録当時の状態')) errors.push(`${file}: 冒頭の履歴注意書きが不足`);
      const headRefs = links(head).map(url => { try { return localTarget(root, file, url); } catch { return null; } });
      if (!headRefs.includes('docs/index.md')) errors.push(`${file}: 冒頭に正式入口へのリンクが必要`);
      if (!headRefs.some(f => f !== 'docs/index.md' && required.includes(f))) errors.push(`${file}: 冒頭に担当正式文書へのリンクが必要`);
    }
  }
  const indexRefs = targets.get('docs/index.md') || [];
  for (const file of [...required.filter(f => f !== 'docs/index.md'), ...markdown.filter(f => f.startsWith('docs/reports/'))]) {
    if (!indexRefs.includes(file)) errors.push(`docs/index.md: 索引未登録 ${file}`);
  }
  const designRefs = targets.get(rootDesign) || [];
  for (const file of new Set([...chapters, ...designFiles.filter(f => f !== rootDesign)])) {
    if (!designRefs.includes(file)) errors.push(`${rootDesign}: 設計章目次未登録 ${file}`);
  }
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const errors = checkDocs(root);
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('PASS: 文書配置・設計章目次・索引・reports注意書き・ローカルリンク');
}
