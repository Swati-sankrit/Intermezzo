import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildRegistry } from '../registry';

const NUM_RUNS = 300;

type Shape = 'haunt' | 'effect' | 'both' | 'neither';

interface Entry {
  readonly path: string;
  readonly module: Record<string, unknown>;
  readonly shape: Shape;
  /** True when the registry must accept the module. */
  readonly valid: boolean;
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const noop = (): void => undefined;
const span = (): null => null;

const ID_POOL = ['a', 'b', 'c', 'd'];
const FRESH_ID = 'fresh-id';
const FRESH_PATH = '/fresh/new.ts';

const idArb = fc.constantFrom(...ID_POOL);
const validModesArb = fc.subarray(['gentle', 'classic', 'nightmare'], { minLength: 1 });
const badModesArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant([]),
  fc.constant(['bogus']),
  fc.constant(['classic', 'Nightmare']),
  fc.constant('classic'),
  fc.constant(null),
  fc.constant(42),
  fc.constant([1]),
);
const badRoleArb: fc.Arbitrary<unknown> = fc.constantFrom('boss', 'Lead', '', 1, null, true);
const badMinLevelArb: fc.Arbitrary<unknown> = fc.constantFrom(0, 4, 1.5, '2', null, -1, NaN);

/** A valid optional field is either absent or valid. */
function optional<T>(arb: fc.Arbitrary<T>): fc.Arbitrary<T | undefined> {
  return fc.oneof(fc.constant(undefined), arb);
}

type Flaw = 'none' | 'role' | 'modes' | 'minLevel';

interface Spec {
  shape: Shape;
  flaw: Flaw;
  id: string;
  role: unknown;
  modes: unknown;
  minLevel: unknown;
  jumpSound: boolean | undefined;
  name: string;
}

function build(spec: Spec): Omit<Entry, 'path'> {
  const m: Record<string, unknown> = { id: spec.id, name: spec.name };
  const hasHaunt = spec.shape === 'haunt' || spec.shape === 'both';
  const hasEffect = spec.shape === 'effect' || spec.shape === 'both';
  if (hasHaunt) Object.assign(m, { start: noop, setLevel: noop, stop: noop });
  if (hasEffect) Object.assign(m, { span, begin: noop, end: noop });
  if (spec.shape === 'neither') m.helper = noop;
  if (spec.role !== undefined) m.role = spec.role;
  if (spec.modes !== undefined) m.modes = spec.modes;
  if (spec.minLevel !== undefined) m.minLevel = spec.minLevel;
  if (spec.jumpSound !== undefined) m.jumpSound = spec.jumpSound;
  return { module: m, shape: spec.shape, valid: spec.shape !== 'neither' && spec.flaw === 'none' };
}

const specArb = (idsArb: fc.Arbitrary<string>): fc.Arbitrary<Spec> =>
  fc
    .tuple(
      fc.oneof(
        { weight: 4, arbitrary: fc.constant<Shape>('haunt') },
        { weight: 2, arbitrary: fc.constant<Shape>('effect') },
        { weight: 4, arbitrary: fc.constant<Shape>('both') },
        { weight: 2, arbitrary: fc.constant<Shape>('neither') },
      ),
      fc.oneof(
        { weight: 5, arbitrary: fc.constant<Flaw>('none') },
        { weight: 2, arbitrary: fc.constant<Flaw>('role') },
        { weight: 2, arbitrary: fc.constant<Flaw>('modes') },
        { weight: 2, arbitrary: fc.constant<Flaw>('minLevel') },
      ),
      idsArb,
      fc.tuple(optional(fc.constantFrom('lead', 'layer')), badRoleArb),
      fc.tuple(optional(validModesArb), badModesArb),
      fc.tuple(optional(fc.constantFrom(1, 2, 3)), badMinLevelArb),
      optional(fc.boolean()),
      fc.stringMatching(/^[A-Za-z ]{0,10}$/),
    )
    .map(([shape, flaw0, id, [role, badRole], [modes, badModes], [minLevel, badMin], jumpSound, name]) => {
      // role and minLevel are only read on haunt-shaped modules, so a flaw there needs that shape.
      let flaw = flaw0;
      if ((flaw === 'role' || flaw === 'minLevel') && shape !== 'haunt' && shape !== 'both') flaw = 'none';
      if (flaw === 'modes' && shape === 'neither') flaw = 'none';
      return {
        shape,
        flaw,
        id,
        name,
        role: flaw === 'role' ? badRole : role,
        modes: flaw === 'modes' ? badModes : modes,
        minLevel: flaw === 'minLevel' ? badMin : minLevel,
        // jumpSound is only valid as a boolean; keep it a boolean everywhere
        jumpSound,
      };
    });

const entryArb = (idsArb: fc.Arbitrary<string>): fc.Arbitrary<Omit<Entry, 'path'>> => specArb(idsArb).map(build);

const entriesArb: fc.Arbitrary<Entry[]> = fc
  .oneof(
    { weight: 1, arbitrary: fc.constant(0) },
    { weight: 9, arbitrary: fc.integer({ min: 2, max: 10 }) },
  )
  .chain((n) => fc.uniqueArray(fc.stringMatching(/^[a-z]{1,6}$/), { minLength: n, maxLength: n }))
  .chain((names) =>
    fc
      .array(entryArb(idArb), { minLength: names.length, maxLength: names.length })
      .map((es) => es.map((e, i) => ({ ...e, path: `./h/${names[i]}.ts` }))),
  );

function toRecord(entries: readonly Entry[]): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const e of entries) r[e.path] = e.module;
  return r;
}

interface Expected {
  readonly haunts: Entry[];
  readonly effects: Entry[];
  readonly skipped: Entry[];
}

/** The spec restated: sort by path, drop invalid, first path per id wins. Uses the generator's tags. */
function expectedOf(entries: readonly Entry[]): Expected {
  const sorted = [...entries].sort((a, b) => byCodeUnit(a.path, b.path));
  const haunts: Entry[] = [];
  const effects: Entry[] = [];
  const skipped: Entry[] = [];
  const seen = new Set<string>();
  for (const e of sorted) {
    const id = e.module.id as string;
    if (!e.valid || seen.has(id)) {
      skipped.push(e);
      continue;
    }
    seen.add(id);
    if (e.shape === 'haunt' || e.shape === 'both') haunts.push(e);
    if (e.shape === 'effect' || e.shape === 'both') effects.push(e);
  }
  return { haunts, effects, skipped };
}

const ids = (es: readonly Entry[]): unknown[] => es.map((e) => e.module.id);

describe('Registry: the extended contract is accepted and bad files are still rejected', () => {
  // Feature: ghost-dread, Property 22: The registry accepts the extended contract and still rejects bad files
  // **Validates: Requirements 1.14**
  it('Property 22: a lone valid module is classified as a haunt, an effect or both, with its optional fields kept', () => {
    const validOnly = specArb(fc.constant('x')).filter((s) => s.flaw === 'none' && s.shape !== 'neither');
    fc.assert(
      fc.property(validOnly, (spec) => {
        const e = build(spec);
        const r = buildRegistry({ './h/only.ts': e.module });
        const isHaunt = spec.shape === 'haunt' || spec.shape === 'both';
        const isEffect = spec.shape === 'effect' || spec.shape === 'both';
        expect(r.warnings).toEqual([]);
        expect(r.haunts).toHaveLength(isHaunt ? 1 : 0);
        expect(r.effects).toHaveLength(isEffect ? 1 : 0);
        const m = e.module;
        if (isHaunt) {
          const h = r.haunts[0] as unknown as Record<string, unknown>;
          expect(h.id).toBe(m.id);
          expect(h.start).toBe(m.start);
          expect(h.role).toBe(m.role);
          expect(h.minLevel).toBe(m.minLevel);
          expect(h.modes).toEqual(m.modes);
        }
        if (isEffect) {
          const f = r.effects[0] as unknown as Record<string, unknown>;
          expect(f.id).toBe(m.id);
          expect(f.span).toBe(m.span);
          expect(f.jumpSound).toBe(m.jumpSound);
          expect(f.modes).toEqual(m.modes);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: ghost-dread, Property 22: The registry accepts the extended contract and still rejects bad files
  // **Validates: Requirements 1.14**
  it('Property 22: a lone module with an invalid role, modes or minLevel, or no contract, is skipped with a warning naming its path', () => {
    const flawed = specArb(fc.constant('x')).filter((s) => s.flaw !== 'none' || s.shape === 'neither');
    fc.assert(
      fc.property(flawed, (spec) => {
        const r = buildRegistry({ './h/bad.ts': build(spec).module });
        expect(r.haunts).toHaveLength(0);
        expect(r.effects).toHaveLength(0);
        expect(r.warnings).toHaveLength(1);
        expect(r.warnings[0]).toContain('./h/bad.ts');
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: ghost-dread, Property 22: The registry accepts the extended contract and still rejects bad files
  // **Validates: Requirements 1.14**
  it('Property 22: over any record, accepted modules are exactly the valid first-per-id ones in path order, skipped ones are warned about', () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const r = buildRegistry(toRecord(entries));
        const exp = expectedOf(entries);
        expect(r.haunts.map((h) => h.id)).toEqual(ids(exp.haunts));
        expect(r.effects.map((f) => f.id)).toEqual(ids(exp.effects));
        expect(r.warnings).toHaveLength(exp.skipped.length);
        for (const e of exp.skipped) {
          expect(r.warnings.filter((w) => w.includes(e.path)), `${e.path}: ${JSON.stringify(r.warnings)}`).not.toHaveLength(0);
        }
        // ids are unique within each list, and every accepted module has its own id
        expect(new Set(r.haunts.map((x) => x.id)).size).toBe(r.haunts.length);
        expect(new Set(r.effects.map((x) => x.id)).size).toBe(r.effects.length);
        expect(new Set([...r.haunts, ...r.effects].map((x) => x.id)).size).toBe(
          new Set([...exp.haunts, ...exp.effects]).size,
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: ghost-dread, Property 22: The registry accepts the extended contract and still rejects bad files
  // **Validates: Requirements 1.14**
  it('Property 22: adding a valid module with a fresh id adds exactly that module and changes nothing else', () => {
    const freshArb = specArb(fc.constant(FRESH_ID)).filter((s) => s.flaw === 'none' && s.shape !== 'neither');
    fc.assert(
      fc.property(entriesArb, freshArb, (entries, spec) => {
        const before = buildRegistry(toRecord(entries));
        const added = build(spec);
        const after = buildRegistry({ ...toRecord(entries), [FRESH_PATH]: added.module });
        const isHaunt = spec.shape === 'haunt' || spec.shape === 'both';
        const isEffect = spec.shape === 'effect' || spec.shape === 'both';
        expect(after.haunts.filter((h) => h.id !== FRESH_ID)).toEqual(before.haunts);
        expect(after.effects.filter((f) => f.id !== FRESH_ID)).toEqual(before.effects);
        expect(after.haunts.filter((h) => h.id === FRESH_ID)).toHaveLength(isHaunt ? 1 : 0);
        expect(after.effects.filter((f) => f.id === FRESH_ID)).toHaveLength(isEffect ? 1 : 0);
        expect(after.warnings).toEqual(before.warnings);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: ghost-dread, Property 22: The registry accepts the extended contract and still rejects bad files
  // **Validates: Requirements 1.14**
  it('Property 22: the result does not depend on the insertion order of the record', () => {
    const shuffledArb = entriesArb.chain((entries) =>
      fc
        .shuffledSubarray(entries, { minLength: entries.length, maxLength: entries.length })
        .map((shuffled) => ({ entries, shuffled })),
    );
    fc.assert(
      fc.property(shuffledArb, ({ entries, shuffled }) => {
        const a = buildRegistry(toRecord(entries));
        const b = buildRegistry(toRecord(shuffled));
        expect(b.warnings).toEqual(a.warnings);
        expect(b.haunts.map((h) => h.id)).toEqual(a.haunts.map((h) => h.id));
        expect(b.effects.map((f) => f.id)).toEqual(a.effects.map((f) => f.id));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: ghost-dread, Property 22: The registry accepts the extended contract and still rejects bad files
  // **Validates: Requirements 1.14**
  it('Property 22: the generated inputs reach every region the property is about', () => {
    const seen = { haunt: 0, effect: 0, both: 0, neither: 0, badRole: 0, badModes: 0, badMin: 0, dup: 0, validModes: 0 };
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const shapes = new Set(entries.filter((e) => e.valid).map((e) => e.shape));
        if (shapes.has('haunt')) seen.haunt++;
        if (shapes.has('effect')) seen.effect++;
        if (shapes.has('both')) seen.both++;
        if (entries.some((e) => e.shape === 'neither')) seen.neither++;
        if (entries.some((e) => !e.valid && e.shape !== 'neither' && 'role' in e.module && ![undefined, 'lead', 'layer'].includes(e.module.role as string))) seen.badRole++;
        if (entries.some((e) => !e.valid && e.shape !== 'neither' && 'modes' in e.module && !Array.isArray(e.module.modes))) seen.badModes++;
        if (entries.some((e) => !e.valid && e.shape !== 'neither' && 'minLevel' in e.module && ![1, 2, 3].includes(e.module.minLevel as number))) seen.badMin++;
        if (expectedOf(entries).skipped.some((e) => e.valid)) seen.dup++;
        if (entries.some((e) => e.valid && Array.isArray(e.module.modes))) seen.validModes++;
        expect(buildRegistry(toRecord(entries)).haunts).toHaveLength(expectedOf(entries).haunts.length);
      }),
      { numRuns: NUM_RUNS },
    );
    const msg = JSON.stringify(seen);
    const floors: [string, number, number][] = [
      ['valid haunt', seen.haunt, 0.4],
      ['valid effect', seen.effect, 0.4],
      ['valid both', seen.both, 0.4],
      ['neither', seen.neither, 0.4],
      ['bad role', seen.badRole, 0.15],
      ['bad modes', seen.badModes, 0.15],
      ['bad minLevel', seen.badMin, 0.15],
      ['duplicate id', seen.dup, 0.3],
      ['valid modes', seen.validModes, 0.4],
    ];
    for (const [name, count, share] of floors) {
      expect(count, `${name}: ${msg}`).toBeGreaterThanOrEqual(NUM_RUNS * share);
    }
  });
});
