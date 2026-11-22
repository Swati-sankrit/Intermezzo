import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { discovered } from '../discover';
import { buildRegistry, loadHaunts } from '../registry';

const hauntsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** `.ts` files directly in src/haunts, minus tests and declaration files. */
function onDiskHauntFiles(): string[] {
  return readdirSync(hauntsDir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts') && !n.endsWith('.d.ts'))
    .sort();
}

/** Glob keys look like `../candle.ts`; reduce to a bare file name. */
function normaliseKey(key: string): string {
  return key.replace(/\\/g, '/').replace(/^(\.\.?\/)+/, '');
}

describe('haunt discovery', () => {
  it('finds exactly the haunt files on disk (non-vacuous)', () => {
    const onDisk = onDiskHauntFiles();
    expect(onDisk.length).toBeGreaterThan(0);
    expect(onDisk).toContain('candle.ts');
    const keys = Object.keys(discovered).map(normaliseKey).sort();
    expect(keys).toEqual(onDisk);
  });

  it('contains no test file and nothing under engine/ or __tests__/', () => {
    const keys = Object.keys(discovered);
    expect(keys.length).toBeGreaterThan(0);
    for (const raw of keys) {
      const key = normaliseKey(raw);
      expect(key).not.toMatch(/\.test\.ts$/);
      expect(key).not.toMatch(/\.d\.ts$/);
      expect(key).not.toContain('/');
      expect(raw).not.toMatch(/engine\//);
      expect(raw).not.toMatch(/__tests__/);
    }
  });

  it('loadHaunts returns a haunt for each valid file (candle)', () => {
    const warnings: string[] = [];
    const haunts = loadHaunts((m) => warnings.push(m));
    expect(haunts.map((h) => h.id)).toContain('candle');
    expect(warnings).toEqual([]);
    expect(haunts).toHaveLength(Object.keys(discovered).length);
  });

  it('a synthetic extra valid module appears without any engine change', () => {
    const synthetic = {
      id: 'synthetic-test-haunt',
      name: 'Synthetic',
      start: () => undefined,
      setLevel: () => undefined,
      stop: () => undefined,
    };
    const { haunts, warnings } = buildRegistry({ ...discovered, '../synthetic.ts': synthetic });
    expect(warnings).toEqual([]);
    expect(haunts.map((h) => h.id)).toContain('synthetic-test-haunt');
    expect(haunts.map((h) => h.id)).toContain('candle');
    expect(haunts).toHaveLength(Object.keys(discovered).length + 1);
  });
});
