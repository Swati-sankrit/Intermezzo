// Static source scan (task 5.4). Reads the real source files at test time with node:fs.
// Comments are stripped before matching (strings are kept, so ".mp3" in a string is still found
// and a "//" inside a string is not mistaken for a comment). Patterns use word boundaries.
// Known limit: a regex literal containing quotes could confuse the stripper; none exist here,
// and the self-checks below would not hide a real match in code.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HAUNTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = resolve(HAUNTS_DIR, '..');

/** Remove // and block comments, keeping string and template contents intact. */
export function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 2;
      out += ' ';
    } else if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

interface Rule { label: string; re: RegExp }

const HAUNT_FILE_RULES: Rule[] = [
  { label: 'document', re: /\bdocument\b/ },
  { label: 'window', re: /\bwindow\b/ },
  { label: 'AudioContext(', re: /\bAudioContext\s*\(/ },
  { label: '.destination', re: /\.\s*destination\b/ },
  { label: 'fetch', re: /\bfetch\b/ },
  { label: 'Audio(', re: /\bAudio\s*\(/ },
  { label: 'speechSynthesis', re: /\bspeechSynthesis\b/i },
  { label: '@keyframes', re: /@keyframes/ },
  { label: 'animation', re: /animation/i },
  { label: 'setInterval', re: /\bsetInterval\b/ },
  { label: 'setTimeout', re: /\bsetTimeout\b/ },
  { label: 'localStorage', re: /\blocalStorage\b/ },
];

const PURE_LOGIC_RULES: Rule[] = [
  { label: 'document', re: /\bdocument\b/ },
  { label: 'window', re: /\bwindow\b/ },
  { label: 'Date', re: /\bDate\b/ },
  { label: 'performance', re: /\bperformance\b/ },
  { label: 'setTimeout', re: /\bsetTimeout\b/ },
  { label: 'Math.random', re: /\bMath\s*\.\s*random\b/ },
];

/** Pure-logic rules plus the network APIs, for every file in engine/ghost/. */
const GHOST_FILE_RULES: Rule[] = [
  ...PURE_LOGIC_RULES,
  { label: 'fetch', re: /\bfetch\b/ },
  { label: 'XMLHttpRequest', re: /\bXMLHttpRequest\b/ },
];

const MEDIA_FILE_RE = /\.(?:mp3|wav|ogg|m4a)\b/i;
const FORBIDDEN_IMPORT_RE = /attention|(?:^|[/\\])ui(?:[/\\]|$)|camera|video|detector|mediapipe/i;

/** Specifiers a haunt file (src/haunts/*.ts) may import. hauntAudio holds types only. */
const ALLOWED_HAUNT_IMPORTS = ['./engine/types', './engine/noise', './engine/hauntAudio'];
/** Any module under engine/ghost/ may also be imported by a haunt file. */
const ALLOWED_HAUNT_IMPORT_PREFIX = './engine/ghost/';

function isAllowedHauntImport(spec: string): boolean {
  return (
    ALLOWED_HAUNT_IMPORTS.includes(spec) ||
    (spec.startsWith(ALLOWED_HAUNT_IMPORT_PREFIX) && spec.length > ALLOWED_HAUNT_IMPORT_PREFIX.length && !spec.includes('..'))
  );
}

interface Found { rule: string; line: number }

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

export function scanRules(code: string, rules: Rule[]): Found[] {
  const found: Found[] = [];
  for (const { label, re } of rules) {
    const m = new RegExp(re.source, re.flags.replace('g', '') + 'g');
    for (let r = m.exec(code); r; r = m.exec(code)) found.push({ rule: label, line: lineOf(code, r.index) });
  }
  return found;
}

interface ImportRef { spec: string; typeOnly: boolean; line: number }

export function findImports(code: string): ImportRef[] {
  const refs: ImportRef[] = [];
  const stmt = /\b(?:import|export)\b([^;'"]*?)\bfrom\s*(['"])([^'"]+)\2/g;
  const bare = /\bimport\s*(['"])([^'"]+)\1/g;
  const dynamic = /\b(?:import|require)\s*\(\s*(['"`])([^'"`]+)\1/g;
  for (let m = stmt.exec(code); m; m = stmt.exec(code)) {
    refs.push({ spec: m[3], typeOnly: /^\s*type\b/.test(m[1]), line: lineOf(code, m.index) });
  }
  for (let m = bare.exec(code); m; m = bare.exec(code)) refs.push({ spec: m[2], typeOnly: false, line: lineOf(code, m.index) });
  for (let m = dynamic.exec(code); m; m = dynamic.exec(code)) refs.push({ spec: m[2], typeOnly: false, line: lineOf(code, m.index) });
  return refs;
}

/** Problems with the imports of a haunt file; empty when all are allowed. */
export function hauntImportProblems(code: string): string[] {
  return findImports(code).flatMap((r) => {
    if (!isAllowedHauntImport(r.spec)) return [`line ${r.line}: import from '${r.spec}' is not allowed`];
    if (r.spec === './engine/hauntAudio' && !r.typeOnly) return [`line ${r.line}: hauntAudio must be a type-only import`];
    return [];
  });
}

function isTestFile(path: string): boolean {
  return /[/\\]__tests__[/\\]/.test(path) || /\.test\.tsx?$/.test(path) || /\.d\.ts$/.test(path);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function sourceFiles(dir: string): string[] {
  return walk(dir).filter((p) => /\.tsx?$/.test(p) && !isTestFile(p));
}

function load(path: string): string {
  return stripComments(readFileSync(path, 'utf8'));
}

const rel = (p: string): string => relative(SRC_DIR, p).split('\\').join('/');
const describeFound = (path: string, f: Found[]): string[] => f.map((x) => `${rel(path)}:${x.line} ${x.rule}`);

const hauntsSources = sourceFiles(HAUNTS_DIR);
const hauntFiles = hauntsSources.filter((p) => dirname(p) === HAUNTS_DIR);
const GHOST_DIR = join(HAUNTS_DIR, 'engine', 'ghost');
const ghostFiles = sourceFiles(GHOST_DIR);
const byName = (name: string): string[] => hauntsSources.filter((p) => p.split(/[/\\]/).pop() === name);

describe('static source scan: scanner self-checks', () => {
  it('flags every pattern in a synthetic bad sample', () => {
    const bad = [
      'document.body; window.x; new AudioContext(); ctx.destination; fetch(u); new Audio(u);',
      'speechSynthesis.speak(); const k = "@keyframes x"; el.animation; setInterval(f); setTimeout(f);',
      'localStorage.getItem(k); Date.now(); performance.now(); Math.random();',
    ].join('\n');
    const labels = new Set(
      [...scanRules(bad, HAUNT_FILE_RULES), ...scanRules(bad, PURE_LOGIC_RULES), ...scanRules(`${bad}\nnew XMLHttpRequest();`, GHOST_FILE_RULES)].map((f) => f.rule),
    );
    for (const r of [...HAUNT_FILE_RULES, ...PURE_LOGIC_RULES, ...GHOST_FILE_RULES]) expect(labels.has(r.label), r.label).toBe(true);
    expect(MEDIA_FILE_RE.test('const u = "sound.mp3"')).toBe(true);
    expect(MEDIA_FILE_RE.test("x.m4a")).toBe(true);
  });

  it('does not flag look-alike identifiers or comments', () => {
    const ok = stripComments([
      'const update = 1; const windowed = 2; const documented = 3; const candidate = 4;',
      '// document window Date setTimeout Math.random .destination',
      '/* fetch(); localStorage */ const url = "http://x"; const d = new Dates();',
    ].join('\n'));
    expect(scanRules(ok, HAUNT_FILE_RULES)).toEqual([]);
    expect(scanRules(ok, PURE_LOGIC_RULES)).toEqual([]);
    expect(scanRules(ok, GHOST_FILE_RULES)).toEqual([]);
  });

  it('flags disallowed imports and allows the permitted ones', () => {
    const bad = "import { x } from './engine/levelLogic';\nimport '../attention/signal';\nconst m = import('../ui/App');";
    expect(hauntImportProblems(bad)).toHaveLength(3);
    const good = "import type { A } from './engine/types';\nimport { noise } from './engine/noise';\nimport type { C } from './engine/hauntAudio';";
    expect(hauntImportProblems(good)).toEqual([]);
    expect(hauntImportProblems("import { C } from './engine/hauntAudio';")).toHaveLength(1);
    expect(hauntImportProblems("import { m } from './engine/ghost/mode';\nimport type { P } from './engine/ghost/plan';")).toEqual([]);
    expect(hauntImportProblems("import { x } from './engine/ghost/';")).toHaveLength(1);
    expect(hauntImportProblems("import { x } from './engine/ghost/../levelLogic';")).toHaveLength(1);
    expect(hauntImportProblems("import { x } from './engine/ghosts/mode';")).toHaveLength(1);
    expect(FORBIDDEN_IMPORT_RE.test('../../ui/App')).toBe(true);
    expect(FORBIDDEN_IMPORT_RE.test('../../attention')).toBe(true);
    expect(FORBIDDEN_IMPORT_RE.test('./engine/types')).toBe(false);
  });
});

describe('static source scan: real source', () => {
  it('finds the files it is meant to scan (not vacuous)', () => {
    expect(hauntFiles.map((p) => p.split(/[/\\]/).pop())).toContain('candle.ts');
    expect(byName('levelLogic.ts')).toHaveLength(1);
    expect(byName('plan.ts')).toHaveLength(1);
    expect(ghostFiles.map((p) => p.split(/[/\\]/).pop())).toContain('mode.ts');
    expect(byName('audioAdapter.ts')).toHaveLength(1);
    expect(byName('audioGraph.ts')).toHaveLength(1);
    expect(hauntsSources.every((p) => !isTestFile(p))).toBe(true);
  });

  it('haunt files (src/haunts/*.ts) use no forbidden APIs', () => {
    const hits = hauntFiles.flatMap((p) => describeFound(p, scanRules(load(p), HAUNT_FILE_RULES)));
    expect(hits).toEqual([]);
  });

  it('haunt files import only from ./engine/types, ./engine/noise and (types only) ./engine/hauntAudio', () => {
    const problems = hauntFiles.flatMap((p) => hauntImportProblems(load(p)).map((m) => `${rel(p)} ${m}`));
    expect(problems).toEqual([]);
  });

  it('levelLogic.ts and plan.ts are pure (no DOM, clock or randomness)', () => {
    const files = [...byName('levelLogic.ts'), ...byName('plan.ts')];
    const hits = files.flatMap((p) => describeFound(p, scanRules(load(p), PURE_LOGIC_RULES)));
    expect(hits).toEqual([]);
  });

  it('every file in engine/ghost/ is pure (no DOM, clock, randomness or network)', () => {
    const hits = ghostFiles.flatMap((p) => describeFound(p, scanRules(load(p), GHOST_FILE_RULES)));
    expect(hits).toEqual([]);
  });

  it('nothing under src/haunts imports attention, ui, camera or video code', () => {
    const hits = hauntsSources.flatMap((p) =>
      findImports(load(p))
        .filter((r) => FORBIDDEN_IMPORT_RE.test(r.spec))
        .map((r) => `${rel(p)}:${r.line} imports '${r.spec}'`),
    );
    expect(hits).toEqual([]);
  });

  it('.destination appears only in audioAdapter.ts and audioGraph.ts (whole src tree)', () => {
    const allowed = new Set(['haunts/engine/gate/audioAdapter.ts', 'haunts/engine/gate/audioGraph.ts']);
    const withDestination = sourceFiles(SRC_DIR)
      .filter((p) => scanRules(load(p), [HAUNT_FILE_RULES[3]]).length > 0)
      .map(rel);
    expect(withDestination.filter((f) => !allowed.has(f))).toEqual([]);
    // Proves the pattern matches real code: the graph file does use it.
    expect(withDestination).toContain('haunts/engine/gate/audioGraph.ts');
  });

  it('no .mp3, .wav, .ogg or .m4a string appears under src/haunts', () => {
    const hits = hauntsSources.flatMap((p) =>
      scanRules(load(p), [{ label: 'audio file extension', re: MEDIA_FILE_RE }]).map((f) => `${rel(p)}:${f.line}`),
    );
    expect(hits).toEqual([]);
  });
});
