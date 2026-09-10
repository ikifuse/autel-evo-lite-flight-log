import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

// A lexical architecture check for this repository's plain-script convention.
// This is not a JavaScript parser, authorization check, or runtime call graph.
// Computed properties, aliases, eval, HTML event handlers, and injected ports
// need the compatibility tests and review of their composition root.
// References are conservative: local variables shadowing project globals can
// produce extra edges. Keep top-level bindings named and semicolon-terminated.
const PUBLIC_SERVER = new Set([
  'doGet', 'getAppState', 'finishAircraft', 'diagnosePendingCommitPlans',
  'recoverPendingCommitPlan', 'discardPendingTestCommitPlan'
]);
const PURE_SERVER = /\/(?:01_commit_codec|06_operation_time|16_commit_compare)\.gs$/;
const GAS_API = /^(?:SpreadsheetApp|PropertiesService|CacheService|LockService|Utilities|HtmlService|Logger|Session|ScriptApp|UrlFetchApp|DriveApp|DocumentApp|FormApp|GmailApp|MailApp|CalendarApp|ContactsApp|Maps|ContentService|Jdbc|LanguageApp|MimeType|Browser)$/;
const LEGACY = 'src/13_legacy_compat.gs';

export function tokenize(source) {
  const tokens = [];
  let offset = 0;
  function emit(value, kind = 'punct', at = offset) { tokens.push({ value, kind, at }); }
  function quoted(quote) {
    const start = offset++;
    while (offset < source.length) {
      if (source[offset] === '\\') { offset += 2; continue; }
      if (source[offset++] === quote) { emit('<literal>', 'literal', start); return; }
    }
    throw new Error('Unterminated string literal');
  }
  function template() {
    const start = offset++;
    emit('(', 'punct', start);
    while (offset < source.length) {
      if (source[offset] === '\\') { offset += 2; continue; }
      if (source[offset] === '`') { offset++; emit(')'); return; }
      if (source.startsWith('${', offset)) {
        offset += 2;
        emit('(');
        code(true);
        emit(')');
      } else offset++;
    }
    throw new Error('Unterminated template literal');
  }
  function code(interpolation = false) {
    let braces = 0;
    while (offset < source.length) {
      const char = source[offset];
      if (/\s/.test(char)) { offset++; continue; }
      if (source.startsWith('//', offset)) {
        const end = source.indexOf('\n', offset + 2);
        offset = end < 0 ? source.length : end;
        continue;
      }
      if (source.startsWith('/*', offset)) {
        const end = source.indexOf('*/', offset + 2);
        if (end < 0) throw new Error('Unterminated comment');
        offset = end + 2;
        continue;
      }
      if (char === '"' || char === "'") { quoted(char); continue; }
      if (char === '`') { template(); continue; }
      const previous = tokens.at(-1);
      const regexAllowed = !previous ||
        (previous.kind === 'punct' && ![')', ']', '}', '++', '--'].includes(previous.value)) ||
        /^(?:return|throw|case|delete|void|typeof|yield|await|in|of)$/.test(previous.value);
      if (char === '/' && regexAllowed) {
        const start = offset++;
        let inClass = false, closed = false;
        while (offset < source.length) {
          const current = source[offset++];
          if (current === '\\') { offset++; continue; }
          if (current === '[') inClass = true;
          if (current === ']') inClass = false;
          if (current === '/' && !inClass) { closed = true; break; }
          if (current === '\n') break;
        }
        if (!closed) throw new Error('Unsupported or unterminated regular expression');
        while (/[a-z]/i.test(source[offset] || '')) offset++;
        emit('<regexp>', 'literal', start);
        continue;
      }
      const identifier = source.slice(offset).match(/^[A-Za-z_$][\w$]*/);
      if (identifier) { emit(identifier[0], 'identifier'); offset += identifier[0].length; continue; }
      const number = source.slice(offset).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
      if (number) { emit(number[0], 'literal'); offset += number[0].length; continue; }
      if (char === '}' && interpolation && braces === 0) { offset++; return; }
      if (char === '{') braces++;
      if (char === '}') braces--;
      const operator = source.slice(offset).match(/^(?:===|!==|=>|\?\.|\+\+|--|&&|\|\||\?\?|==|!=|<=|>=|\+=|-=|\*=|\/=|\*\*|\.\.\.)/);
      const value = operator ? operator[0] : char;
      emit(value);
      offset += value.length;
    }
    if (interpolation) throw new Error('Unterminated template interpolation');
  }
  code();
  return tokens;
}

function declarations(tokens, file) {
  let depth = 0;
  const found = [];
  tokens.forEach((token, index) => {
    const previous = tokens[index - 1]?.value;
    const expression = token.value === 'function' && previous && ![';', '}', 'async'].includes(previous);
    if (depth === 0 && !expression && ['function', 'const', 'let', 'var', 'class'].includes(token.value)) {
      const name = tokens[index + 1];
      if (!name || name.kind !== 'identifier') throw new Error(`${file}: use named top-level declarations`);
      found.push({ name: name.value, kind: token.value, at: name.at, file });
      if (['const', 'let', 'var'].includes(token.value)) {
        let nesting = 0;
        for (let cursor = index + 2; cursor < tokens.length; cursor++) {
          const current = tokens[cursor].value;
          if (nesting === 0 && current === ';') break;
          if (nesting === 0 && current === ',') {
            const next = tokens[cursor + 1];
            if (next?.kind !== 'identifier') throw new Error(`${file}: use named top-level declarations`);
            found.push({ name: next.value, kind: token.value, at: next.at, file });
          }
          if (['(', '[', '{'].includes(current)) nesting++;
          if ([')', ']', '}'].includes(current)) nesting--;
        }
      }
    }
    if (token.value === '{') depth++;
    if (token.value === '}') depth--;
  });
  return found;
}

export function inspectNamespace(sources, server = true) {
  const errors = [], owners = new Map(), units = [];
  for (const [file, source] of sources) {
    try {
      new Function(source);
      const tokens = tokenize(source), declared = declarations(tokens, file);
      units.push({ file, source, tokens, declared });
      for (const declaration of declared) {
        if (owners.has(declaration.name)) errors.push(`Duplicate global ${declaration.name}: ${owners.get(declaration.name).file}, ${file}`);
        else owners.set(declaration.name, declaration);
        if (server && declaration.kind === 'function' && !declaration.name.endsWith('_') && !PUBLIC_SERVER.has(declaration.name)) {
          errors.push(`Unexpected public server function: ${file}: ${declaration.name}`);
        }
      }
    } catch (error) { errors.push(`${file}: ${error.message}`); }
  }
  if (server) for (const name of PUBLIC_SERVER) {
    if (owners.get(name)?.kind !== 'function') errors.push(`Missing public server function: ${name}`);
  }
  const graph = new Map(units.map(unit => [unit.file, new Map()]));
  for (const { file, source, tokens, declared } of units) {
    const declarationOffsets = new Set(declared.map(item => item.at));
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index], previous = tokens[index - 1]?.value, next = tokens[index + 1]?.value;
      if (token.kind !== 'identifier' || declarationOffsets.has(token.at) || previous === '.' || previous === '?.' || next === ':') continue;
      if (server && PURE_SERVER.test(file) && GAS_API.test(token.value)) errors.push(`GAS API in pure module: ${file}: ${token.value}`);
      const owner = owners.get(token.value);
      if (!owner || owner.file === file) continue;
      const line = source.slice(0, token.at).split('\n').length;
      if (server && PURE_SERVER.test(file) && !PURE_SERVER.test(owner.file) && owner.file !== 'src/00_config.gs') {
        errors.push(`Non-pure dependency: ${file}:${line} -> ${owner.file} (${token.value})`);
      }
      if (server && owner.file === LEGACY) errors.push(`Current code must not depend on frozen Legacy: ${file}:${line} -> ${token.value}`);
      const edge = graph.get(file);
      if (!edge.has(owner.file)) edge.set(owner.file, { symbol: token.value, line });
    }
  }
  const complete = new Set(), active = [];
  function visit(file) {
    const cycleAt = active.indexOf(file);
    if (cycleAt >= 0) {
      errors.push(`Dependency cycle: ${active.slice(cycleAt).concat(file).join(' -> ')}`);
      return;
    }
    if (complete.has(file)) return;
    active.push(file);
    for (const target of graph.get(file)?.keys() || []) visit(target);
    active.pop();
    complete.add(file);
  }
  for (const file of graph.keys()) visit(file);
  return {
    errors: [...new Set(errors)], globals: owners.size,
    dependencies: Object.fromEntries([...graph].map(([file, edges]) => [file, Object.fromEntries(edges)]))
  };
}

function readManifest(root, manifest, extension, directory) {
  const paths = JSON.parse(readFileSync(resolve(root, manifest), 'utf8'));
  if (!Array.isArray(paths) || !paths.every(path => typeof path === 'string')) throw new Error(`${manifest}: expected a string array`);
  if (new Set(paths).size !== paths.length) throw new Error(`${manifest}: duplicate paths`);
  const selected = paths.filter(path => path.endsWith(extension));
  const actual = readdirSync(resolve(root, directory)).filter(path => path.endsWith(extension)).map(path => `${directory}/${path}`).sort();
  if (JSON.stringify([...selected].sort()) !== JSON.stringify(actual)) throw new Error(`${manifest}: ${extension} file inventory mismatch`);
  return selected.map(path => [path, readFileSync(resolve(root, path), 'utf8')]);
}

function selfTest() {
  let count = 0;
  const check = (name, work) => { work(); count++; console.log(`  OK ${name}`); };
  const inspect = pairs => inspectNamespace(new Map(pairs), false);
  const rpc = [...PUBLIC_SERVER].map(name => `function ${name}(){}`).join('\n');
  const server = pairs => inspectNamespace(new Map([['src/12_commit_engine.gs', rpc], ...pairs]));
  check('comments, quoted strings and regexp classes do not create edges', () => {
    const result = inspect([
      ['a.js', 'function a(){const text="b()"; /* b(); */ // b();\nreturn /b[\\/]/.test(text) + 1 / 2;}'],
      ['b.js', 'function b(){return a();}']
    ]);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(Object.keys(result.dependencies['a.js']), []);
  });
  check('template raw text is ignored and interpolation is inspected', () => {
    const names = tokenize('function a(){return `ignored() ${actual()}`;}').map(token => token.value);
    assert.ok(names.includes('actual'));
    assert.ok(!names.includes('ignored'));
  });
  check('function calls create cycles', () => {
    assert.ok(inspect([['a.js', 'function a(){b();}'], ['b.js', 'function b(){a();}']]).errors.some(error => error.includes('Dependency cycle')));
  });
  check('duplicate globals are rejected', () => {
    assert.ok(inspect([['a.js', 'function a(){}'], ['b.js', 'function a(){}']]).errors.some(error => error.includes('Duplicate global')));
  });
  check('multiple mutable declarations own reference edges', () => {
    const result = inspect([['a.js', 'let FIRST=0, SECOND={x:[1,2]}; function a(){b();}'], ['b.js', 'function b(){return SECOND;}']]);
    assert.equal(result.globals, 4);
    assert.ok(result.errors.some(error => error.includes('Dependency cycle')));
  });
  check('property ports and an IIFE composition root do not create reverse edges', () => {
    assert.deepEqual(inspect([
      ['ports.js', 'const Port={go:null};'], ['feature.js', 'function feature(){Port.go();}'],
      ['bootstrap.js', 'Port.go=feature; (function(){feature();})();']
    ]).errors, []);
  });
  check('exactly the six named public server functions are allowed', () => {
    assert.deepEqual(server([]).errors, []);
    assert.ok(server([['src/03_gas_sheet_adapter.gs', 'function accidental(){}']]).errors.some(error => error.includes('Unexpected public')));
    assert.ok(inspectNamespace(new Map()).errors.some(error => error.includes('Missing public')));
  });
  check('pure modules reject direct GAS APIs', () => {
    assert.ok(server([['src/01_commit_codec.gs', 'function pure_(){return SpreadsheetApp.flush();}']]).errors.some(error => error.includes('GAS API in pure')));
  });
  check('pure modules reject indirect non-pure dependencies', () => {
    assert.ok(server([['src/01_commit_codec.gs', 'function pure_(){runtime_();}'], ['src/02_gas_runtime.gs', 'function runtime_(){}']]).errors.some(error => error.includes('Non-pure dependency')));
  });
  check('frozen Legacy can depend outward but current code cannot call it', () => {
    assert.deepEqual(server([[LEGACY, 'function old_(){getAppState();}']]).errors, []);
    assert.ok(server([[LEGACY, 'function old_(){}'], ['src/18_commit_identity.gs', 'function current_(){old_();}']]).errors.some(error => error.includes('frozen Legacy')));
  });
  console.log(`Boundary checker self-test: ${count} scenarios passed`);
}

function main() {
  if (process.argv.includes('--self-test')) { selfTest(); return; }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const results = {
    server: inspectNamespace(readManifest(root, 'scripts/source-order.json', '.gs', 'src'))
  };
  if (existsSync(resolve(root, 'scripts/web-source-order.json'))) {
    results.web = inspectNamespace(readManifest(root, 'scripts/web-source-order.json', '.js', 'src/web'), false);
  }
  if (process.argv.includes('--json')) console.log(JSON.stringify(results, null, 2));
  else {
    for (const [name, result] of Object.entries(results)) {
      console.log(`${name}: ${result.errors.length ? 'FAIL' : 'OK'} (${Object.keys(result.dependencies).length} files, ${result.globals} globals)`);
      result.errors.forEach(error => console.error(`  ${error}`));
    }
    console.log('Scope: direct lexical global references; dynamic/port/HTML bindings and runtime behavior require separate verification.');
  }
  if (Object.values(results).some(result => result.errors.length)) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(`ERROR: ${error.message}`); process.exitCode = 1; }
}
