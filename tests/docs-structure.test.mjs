import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkDocs, formalDocs, rootDesign, reportNotice, links } from '../scripts/check-docs.mjs';

function fixture(change, expected) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evo-doc-check-'));
  const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), text); };
  try {
    for (const name of formalDocs) write('docs/' + name, '# formal\n');
    write(rootDesign, '# design');
    write('docs/reports/history.md', `# history\n${reportNotice}\n> 現在仕様の正本ではありません。記録当時の状態。\n> [入口](../index.md) [仕様](../invariants.md)\n`);
    write('docs/index.md', [rootDesign, ...formalDocs.filter(f => f !== 'index.md').map(f => 'docs/' + f), 'docs/reports/history.md'].map(f => `[doc](${path.relative('docs', f)})`).join('\n'));
    change(write, root);
    const errors = checkDocs(root);
    if (expected) assert.ok(errors.some(e => e.includes(expected)), JSON.stringify(errors));
    else assert.deepEqual(errors, []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
fixture(() => {});
fixture(w => w('docs/new-report.md', '# report'), '正式文書一覧外');
fixture(w => w('docs/REPORT.MD', '# report'), '正式文書一覧外');
fixture(w => w('README.md', '[old](docs/history.md)'), 'リンク切れ');
fixture(w => w('docs/index.md', '[missing](absent.md)'), 'リンク切れ');
fixture(w => w('docs/reports/history.md', '# history'), '履歴注意書き');
fixture(w => w('docs/reports/extra.md', '# history'), '索引未登録');
fixture((w, root) => { const file = path.join(root, 'docs/index.md'); w('docs/index.md', fs.readFileSync(file, 'utf8').replace('[doc](architecture.md)', '')); }, '索引未登録 docs/architecture.md');
fixture(w => w('docs/reports/history.md', `# history\n${reportNotice}\n現在仕様の正本ではありません。記録当時の状態。\n[入口](../index.md) [仕様](../absent.md)`), '担当正式文書');
fixture((w, root) => fs.unlinkSync(path.join(root, 'docs/invariants.md')), '正式文書がありません');
fixture(w => { w('docs/with space.md.txt', 'asset'); w('README.md', '[asset](docs/with%20space.md.txt)\n[asset](<docs/with space.md.txt>)\n![icon](https://example.invalid/icon.png)\n```md\n[x](absent.md)\n```'); });
fixture(w => w('README.md', '<img src="docs/missing.png">'), 'リンク切れ');
fixture(w => w('README.md', '[sample][ref]\n[ref]: docs/missing.pdf'), 'リンク切れ');
fixture(w => w('README.md', '[bad](../outside.md)'), 'repository外');
assert.deepEqual(links('[a](x(y).md) [b](<with space.md>)'), ['x(y).md', 'with space.md']);
console.log('PASS: 文書チェック自己試験（14 fixtures + link syntax）');
