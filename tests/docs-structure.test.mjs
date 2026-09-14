import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { checkDocs, rootMarkdown, formalDocs, designDirectory, designChapters, rootDesign, reportNotice, links } from '../scripts/check-docs.mjs';

const chapterPaths = designChapters.map(f => designDirectory + '/' + f);
let fixtureCount = 0;

function fixture(change, expected) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evo-doc-check-'));
  const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), text); };
  try {
    for (const name of rootMarkdown) write(name, '# root\n');
    for (const name of formalDocs) write('docs/' + name, '# formal\n');
    for (const file of chapterPaths) write(file, '# design chapter\n[目次](00_目次.md)\n');
    write(rootDesign, '# design\n' + designChapters.map(f => `[chapter](${f})`).join('\n'));
    write('docs/reports/history.md', `# history\n${reportNotice}\n> 現在仕様の正本ではありません。記録当時の状態。\n> [入口](../index.md) [仕様](../invariants.md)\n`);
    write('docs/index.md', [rootDesign, ...formalDocs.filter(f => f !== 'index.md').map(f => 'docs/' + f), 'docs/reports/history.md'].map(f => `[doc](${path.relative('docs', f)})`).join('\n'));
    change(write, root);
    const errors = checkDocs(root);
    if (expected) {
      for (const message of [expected].flat()) assert.ok(errors.some(e => e.includes(message)), JSON.stringify(errors));
    }
    else assert.deepEqual(errors, []);
    fixtureCount++;
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
fixture(() => {});
fixture(w => w('extra.md', '# extra'), 'ルートMarkdown許可一覧外');
fixture(w => w('EXTRA.MD', '# extra'), 'ルートMarkdown許可一覧外');
fixture(w => w('docs/new-report.md', '# report'), '正式文書一覧外');
fixture(w => w('docs/REPORT.MD', '# report'), '正式文書一覧外');
fixture(w => w('docs/notes/extra.md', '# extra'), '正式文書一覧外');
fixture(w => w('docs/notes/nested/EXTRA.MD', '# extra'), '正式文書一覧外');
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

// Chapters require both explicit permission and a root table-of-contents link.
fixture(w => w(designDirectory + '/extra.md', '# extra'), ['設計章許可一覧外', '設計章目次未登録 ' + designDirectory + '/extra.md']);
fixture(w => w(designDirectory + '/EXTRA.MD', '# extra'), '設計章許可一覧外');
fixture(w => w(designDirectory + '/nested/extra.md', '# extra'), '設計章許可一覧外');
fixture(w => w(designDirectory + '/nested/EXTRA.MD', '# extra'), '設計章許可一覧外');
fixture((w, root) => {
  w(designDirectory + '/extra.md', '# extra');
  w(rootDesign, fs.readFileSync(path.join(root, rootDesign), 'utf8') + '\n[extra](extra.md)');
  w('docs/index.md', fs.readFileSync(path.join(root, 'docs/index.md'), 'utf8') + '\n[extra](../' + designDirectory + '/extra.md)');
}, '設計章許可一覧外');
fixture((w, root) => w(rootDesign, fs.readFileSync(path.join(root, rootDesign), 'utf8').replace(`[chapter](${designChapters[0]})`, '')), '設計章目次未登録 ' + chapterPaths[0]);
fixture((w, root) => fs.unlinkSync(path.join(root, chapterPaths[0])), chapterPaths[0] + ': 正式文書がありません');
fixture((w, root) => w('docs/index.md', fs.readFileSync(path.join(root, 'docs/index.md'), 'utf8').replace(`[doc](../${rootDesign})`, '')), '索引未登録 ' + rootDesign);
fixture(w => w(chapterPaths[0], '[broken chapter](missing.md)'), chapterPaths[0] + ': リンク切れ');
fixture(w => w(chapterPaths[0], '[broken detail](../missing.md)'), chapterPaths[0] + ': リンク切れ');

// Formal chapters and historical reports keep separate roles.
fixture(w => w(chapterPaths[0], `# chapter\n${reportNotice}\n`), '設計章に履歴注意書き');
fixture(w => w(chapterPaths[0], '# chapter\n```markdown\n' + reportNotice + '\n```\n'));
fixture(w => w('docs/reports/history.md', `# history\n${reportNotice}\n> 現在仕様の正本ではありません。記録当時の状態。\n> [入口](../index.md) [設計章](../../${chapterPaths[0]})\n`));

// The old split locations must not reappear beside the single design-book folder.
fixture(w => w(designDirectory + '.md', '# old entry'), '旧設計書配置');
fixture(w => w('docs/design/old.md', '# old chapter'), 'docs/design/: 旧設計書配置');
fixture((w, root) => fs.unlinkSync(path.join(root, rootDesign)), rootDesign + ': 正式文書がありません');
assert.deepEqual(links('[a](x(y).md) [b](<with space.md>)'), ['x(y).md', 'with space.md']);

// Exercise the actual workflow classifier without running Git or writing CI files.
const workflow = fs.readFileSync(new URL('../.github/workflows/build-dist.yml', import.meta.url), 'utf8');
const classifier = workflow.match(/node <<'NODE'\n([\s\S]*?)\n          NODE/);
assert.ok(classifier, 'workflow classifier is missing');
const baseSha = 'a'.repeat(40), headSha = 'b'.repeat(40);
let ciFixtureCount = 0;
function ciFixture(eventName, event, files, expected, diffFails = false) {
  let output = '', diffCalls = 0;
  vm.runInNewContext(classifier[1], {
    process: { env: { GITHUB_EVENT_NAME: eventName, GITHUB_EVENT_PATH: 'event.json', GITHUB_SHA: headSha, GITHUB_OUTPUT: 'output' } },
    console: { log() {}, warn() {} },
    require(name) {
      if (name === 'node:fs') return {
        readFileSync(file) { assert.equal(file, 'event.json'); return JSON.stringify(event); },
        appendFileSync(file, text) { assert.equal(file, 'output'); output += text; },
      };
      assert.equal(name, 'node:child_process');
      return { execFileSync(command, args) {
        diffCalls++;
        assert.equal(command, 'git');
        assert.deepEqual(Array.from(args), ['diff', '--name-only', '--no-renames', '-z', baseSha, headSha]);
        if (diffFails) throw new Error('base is unavailable');
        return files.map(file => file + '\0').join('');
      } };
    },
  });
  assert.equal(output, 'docs_only=' + expected + '\n');
  if (eventName === 'workflow_dispatch' || event.before === '0'.repeat(40) || (!event.before && !event.pull_request)) assert.equal(diffCalls, 0);
  ciFixtureCount++;
}
ciFixture('push', { before: baseSha }, ['README.md', 'docs/index.md'], true);
ciFixture('pull_request', { pull_request: { base: { sha: baseSha } } }, [rootDesign, 'docs/EXAMPLE.MD'], true);
ciFixture('push', { before: baseSha }, ['scripts/check-docs.mjs', 'tests/docs-structure.test.mjs'], true);
ciFixture('push', { before: baseSha }, ['README.md', 'src/12_commit_engine.gs'], false);
ciFixture('push', { before: baseSha }, ['.github/workflows/build-dist.yml'], false);
ciFixture('push', { before: baseSha }, ['src/old.gs', 'docs/renamed.md'], false);
ciFixture('push', { before: baseSha }, [], false);
ciFixture('workflow_dispatch', { before: baseSha }, ['README.md'], false);
ciFixture('push', { before: '0'.repeat(40) }, ['README.md'], false);
ciFixture('push', {}, ['README.md'], false);
ciFixture('push', { before: 'invalid' }, ['README.md'], false);
ciFixture('push', { before: baseSha }, ['README.md'], false, true);

// Every application step, including automatic dist publication, must honor the gate.
const applicationSteps = workflow.split('      - name: ').slice(1).filter(step =>
  !/^(?:Checkout repository|Set up Node\.js|Classify changed paths|Verify documentation structure and links)\n/.test(step));
assert.equal(applicationSteps.length, 8);
for (const step of applicationSteps) assert.match(step, /^        if: steps\.changes\.outputs\.docs_only != 'true'/m);
console.log(`PASS: 文書チェック自己試験（${fixtureCount} fixtures + link syntax + CI ${ciFixtureCount} cases）`);
