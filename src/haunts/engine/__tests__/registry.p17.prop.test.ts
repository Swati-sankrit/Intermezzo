import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildRegistry } from '../registry';
import { moduleEntriesArb, toModuleRecord, type ModuleEntry } from './arbitraries';

const NUM_RUNS = 300;

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

interface Expected {
  /** Kept entries, in path order. */
  readonly kept: ModuleEntry[];
  /** Entries excluded as invalid. */
  readonly invalid: ModuleEntry[];
  /** Excluded duplicates, each with the entry that won its id. */
  readonly duplicates: { readonly loser: ModuleEntry; readonly winner: ModuleEntry }[];
}

/** The spec, restated: sort by path, drop invalid kinds, first path per id wins. Uses the `kind` tag, not registry code. */
function expectedOf(entries: readonly ModuleEntry[]): Expected {
  const sorted = [...entries].sort((a, b) => byCodeUnit(a.path, b.path));
  const kept: ModuleEntry[] = [];
  const invalid: ModuleEntry[] = [];
  const duplicates: Expected['duplicates'] = [];
  const winnerOf = new Map<string, ModuleEntry>();
  for (const e of sorted) {
    if (e.kind !== 'valid') {
      invalid.push(e);
      continue;
    }
    const id = (e.module as { id: string }).id;
    const winner = winnerOf.get(id);
    if (winner) duplicates.push({ loser: e, winner });
    else {
      winnerOf.set(id, e);
      kept.push(e);
    }
  }
  return { kept, invalid, duplicates };
}

/** The entries with the same paths and modules, in a random order. */
const shuffledCaseArb = moduleEntriesArb.chain((entries) =>
  fc
    .shuffledSubarray(entries, { minLength: entries.length, maxLength: entries.length })
    .map((shuffled) => ({ entries, shuffled })),
);

const warningsNaming = (warnings: readonly string[], path: string): string[] =>
  warnings.filter((w) => w.includes(path));

describe('Registry: invalid and duplicate files are excluded, first path wins', () => {
  // Feature: haunt-feature, Property 17: Registry excludes invalid and duplicate files, and the first path wins
  // **Validates: Requirements 4.2, 4.7, 4.8, 5.2, 5.3**
  it('Property 17: the kept haunts are exactly the valid, first-per-id files in path order, with unique ids', () => {
    fc.assert(
      fc.property(moduleEntriesArb, (entries) => {
        const { haunts } = buildRegistry(toModuleRecord(entries));
        const { kept } = expectedOf(entries);
        expect(haunts.map((h) => h.id)).toEqual(kept.map((e) => (e.module as { id: string }).id));
        expect(haunts.map((h) => h.name)).toEqual(kept.map((e) => (e.module as { name: string }).name));
        expect(new Set(haunts.map((h) => h.id)).size).toBe(haunts.length);
        for (const h of haunts) {
          expect(h.id).not.toBe('');
          expect(typeof h.start).toBe('function');
          expect(typeof h.setLevel).toBe('function');
          expect(typeof h.stop).toBe('function');
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 17: Registry excludes invalid and duplicate files, and the first path wins
  // **Validates: Requirements 4.7, 4.8, 5.3**
  it('Property 17: every excluded path is named in a warning, and a duplicate warning names both paths', () => {
    fc.assert(
      fc.property(moduleEntriesArb, (entries) => {
        const { warnings } = buildRegistry(toModuleRecord(entries));
        const { invalid, duplicates } = expectedOf(entries);
        expect(warnings.length).toBe(invalid.length + duplicates.length);
        for (const e of invalid) {
          expect(warningsNaming(warnings, e.path), `invalid ${e.path}: ${JSON.stringify(warnings)}`).not.toHaveLength(0);
        }
        for (const { loser, winner } of duplicates) {
          const named = warnings.filter((w) => w.includes(loser.path) && w.includes(winner.path));
          expect(named, `duplicate ${loser.path} vs ${winner.path}: ${JSON.stringify(warnings)}`).not.toHaveLength(0);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 17: Registry excludes invalid and duplicate files, and the first path wins
  // **Validates: Requirements 4.8**
  it('Property 17: the result does not depend on the insertion order of the record', () => {
    fc.assert(
      fc.property(shuffledCaseArb, ({ entries, shuffled }) => {
        const a = buildRegistry(toModuleRecord(entries));
        const b = buildRegistry(toModuleRecord(shuffled));
        expect(b.warnings).toEqual(a.warnings);
        expect(b.haunts.map((h) => [h.id, h.name, h.start, h.setLevel, h.stop])).toEqual(
          a.haunts.map((h) => [h.id, h.name, h.start, h.setLevel, h.stop]),
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 17: Registry excludes invalid and duplicate files, and the first path wins
  // **Validates: Requirements 5.2**
  it('Property 17: kept haunts are copies of the module values, unaffected by later changes to the module', () => {
    fc.assert(
      fc.property(moduleEntriesArb, (entries) => {
        const { haunts } = buildRegistry(toModuleRecord(entries));
        const { kept } = expectedOf(entries);
        expect(haunts).toHaveLength(kept.length);
        haunts.forEach((h, i) => {
          const mod = kept[i].module as Record<string, unknown>;
          expect(h).not.toBe(mod);
          expect(h.start).toBe(mod.start);
          expect(h.setLevel).toBe(mod.setLevel);
          expect(h.stop).toBe(mod.stop);
          const { id, name } = h;
          mod.id = 'changed-after';
          mod.name = 'changed-after';
          mod.start = undefined;
          expect(h.id).toBe(id);
          expect(h.name).toBe(name);
          expect(typeof h.start).toBe('function');
        });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 17: Registry excludes invalid and duplicate files, and the first path wins
  // **Validates: Requirements 4.2, 4.7, 4.8, 5.3**
  it('Property 17: the generated inputs reach every region the property is about', () => {
    const seen = {
      runs: 0, empty: 0, hasValid: 0, hasMissing: 0, hasWrongType: 0, hasEmptyId: 0, hasHelper: 0,
      hasDuplicate: 0,
    };
    fc.assert(
      fc.property(moduleEntriesArb, (entries) => {
        seen.runs++;
        const kinds = new Set(entries.map((e) => e.kind));
        if (entries.length === 0) seen.empty++;
        if (kinds.has('valid')) seen.hasValid++;
        if (kinds.has('missing-field')) seen.hasMissing++;
        if (kinds.has('wrong-type')) seen.hasWrongType++;
        if (kinds.has('empty-id')) seen.hasEmptyId++;
        if (kinds.has('helper-like')) seen.hasHelper++;
        const exp = expectedOf(entries);
        if (exp.duplicates.length > 0) seen.hasDuplicate++;
        // keep the run meaningful: the registry agrees with the independent expectation
        expect(buildRegistry(toModuleRecord(entries)).haunts).toHaveLength(exp.kept.length);
      }),
      { numRuns: NUM_RUNS },
    );
    const msg = JSON.stringify(seen);
    // Shares measured over 20000 cases: empty 12%, valid 71%, missing-field 51%, wrong-type 51%,
    // empty-id 31%, helper-like 31%, duplicate 24%. Each floor sits about 4 SD below its mean at 300 runs.
    const floors: [string, number, number][] = [
      ['empty record', seen.empty, 0.045],
      ['has valid', seen.hasValid, 0.55],
      ['has missing-field', seen.hasMissing, 0.35],
      ['has wrong-type', seen.hasWrongType, 0.35],
      ['has empty-id', seen.hasEmptyId, 0.18],
      ['has helper-like', seen.hasHelper, 0.18],
      ['has duplicate', seen.hasDuplicate, 0.1],
    ];
    for (const [name, count, share] of floors) {
      expect(count, `${name}: ${msg}`).toBeGreaterThanOrEqual(NUM_RUNS * share);
    }
    expect(seen.runs, msg).toBe(NUM_RUNS);
  });
});
