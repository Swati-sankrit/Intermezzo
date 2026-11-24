/**
 * Script types and generators for Property 28 (engine.gd28.prop.test.ts).
 * A script holds the fake haunts, fake layers, fake return effects, both random seeds and the steps.
 */
import fc from 'fast-check';
import type { HauntMode } from '../types';

/** 'all' = no `modes` field; 'cn' = Classic and Nightmare; 'c' = Classic only; 'n' = Nightmare only. */
export type ModesSpec = 'all' | 'cn' | 'c' | 'n';
export const MODES: Record<ModesSpec, readonly HauntMode[] | undefined> = {
  all: undefined,
  cn: ['classic', 'nightmare'],
  c: ['classic'],
  n: ['nightmare'],
};
export function modesAllow(spec: ModesSpec, mode: HauntMode): boolean {
  const modes = MODES[spec];
  return modes === undefined || modes.includes(mode);
}

export interface LayerSpec {
  readonly modes: ModesSpec;
  readonly minLevel: 1 | 2 | 3;
}
export type SpanSpec =
  | { readonly kind: 'full' }
  | { readonly kind: 'none' }
  | { readonly kind: 'window'; readonly start: number; readonly end: number };
export interface EffectSpec {
  readonly modes: ModesSpec;
  readonly span: SpanSpec;
}

export type Op =
  | { readonly k: 'present' }
  | { readonly k: 'away' }
  | { readonly k: 'advance'; readonly ms: number }
  | { readonly k: 'fire' }
  | { readonly k: 'mode'; readonly mode: HauntMode }
  | { readonly k: 'chapter'; readonly key: string; readonly notify: boolean }
  | { readonly k: 'reduced'; readonly on: boolean }
  | { readonly k: 'arm' }
  | { readonly k: 'stop' };

export interface Script {
  readonly leads: readonly ModesSpec[];
  readonly layers: readonly LayerSpec[];
  /** Effect 0 always has no `modes`, so every Return_Moment hands its plan to at least one effect. */
  readonly effects: readonly EffectSpec[];
  /** Seeds for `random` (lead and companion) and `extraRandom` (start and return rolls). Read in a cycle. */
  readonly random: readonly number[];
  readonly extra: readonly number[];
  /** Whether the reading context has `subscribeChapter`. */
  readonly chapterCallback: boolean;
  readonly initial: {
    readonly signal: 'present' | 'away' | null;
    /** The subscribe-time signal is stamped this many ms in the past. */
    readonly ageMs: number;
    readonly mode: HauntMode;
    readonly armed: boolean;
    readonly reduced: boolean;
    readonly chapter: string;
  };
  readonly ops: readonly Op[];
}

const unitArb = fc.integer({ min: 0, max: 999_999 }).map((n) => n / 1_000_000);
const seedArb = (max: number) => fc.array(unitArb, { minLength: 2, maxLength: max });

const modeArb: fc.Arbitrary<HauntMode> = fc.constantFrom('gentle', 'classic', 'nightmare');
const nonGentleArb: fc.Arbitrary<HauntMode> = fc.constantFrom('classic', 'nightmare');
const keyArb = fc.constantFrom('A', 'B', 'C');

const leadModesArb: fc.Arbitrary<ModesSpec> = fc.oneof(
  { weight: 5, arbitrary: fc.constant<ModesSpec>('all') },
  { weight: 2, arbitrary: fc.constant<ModesSpec>('cn') },
  { weight: 1, arbitrary: fc.constantFrom<ModesSpec>('c', 'n') },
);
const layerArb: fc.Arbitrary<LayerSpec> = fc.record({
  modes: fc.oneof(
    { weight: 3, arbitrary: fc.constant<ModesSpec>('cn') },
    { weight: 2, arbitrary: fc.constant<ModesSpec>('all') },
    { weight: 1, arbitrary: fc.constantFrom<ModesSpec>('c', 'n') },
  ),
  minLevel: fc.oneof(
    { weight: 3, arbitrary: fc.constant<1 | 2 | 3>(3) },
    { weight: 2, arbitrary: fc.constant<1 | 2 | 3>(1) },
    { weight: 1, arbitrary: fc.constant<1 | 2 | 3>(2) },
  ),
});

const spanArb: fc.Arbitrary<SpanSpec> = fc.oneof(
  { weight: 3, arbitrary: fc.constant<SpanSpec>({ kind: 'full' }) },
  { weight: 1, arbitrary: fc.constant<SpanSpec>({ kind: 'none' }) },
  {
    weight: 5,
    arbitrary: fc
      .tuple(
        fc.constantFrom(-50, 0, 0, 100, 500, 1000, 1999, 2000, 2400, 2950, 4000),
        fc.constantFrom(-300, 0, 1, 300, 800, 1500, 2500, 6000),
      )
      .map(([start, len]): SpanSpec => ({ kind: 'window', start, end: start + len })),
  },
);
const effectArb: fc.Arbitrary<EffectSpec> = fc.record({
  modes: fc.oneof(
    { weight: 3, arbitrary: fc.constant<ModesSpec>('all') },
    { weight: 2, arbitrary: fc.constant<ModesSpec>('cn') },
    { weight: 1, arbitrary: fc.constantFrom<ModesSpec>('c', 'n') },
  ),
  span: spanArb,
});

// ------------------------------------------------------------------ ops

const away: Op = { k: 'away' };
const present: Op = { k: 'present' };
const advance = (ms: number): Op => ({ k: 'advance', ms });
const mode = (m: HauntMode): Op => ({ k: 'mode', mode: m });

const msArb = fc.oneof(
  fc.integer({ min: 0, max: 60 }),
  fc.integer({ min: 61, max: 900 }),
  fc.integer({ min: 901, max: 7000 }),
  fc.integer({ min: 7001, max: 15_000 }),
  fc.constantFrom(1, 799, 800, 801, 1999, 2000, 2001, 2899, 2900, 2901, 2999, 3000, 3001, 4999, 5000, 5001, 11_999, 12_000),
);

const opArb: fc.Arbitrary<Op> = fc.oneof(
  { weight: 3, arbitrary: fc.constant<Op>(present) },
  { weight: 3, arbitrary: fc.constant<Op>(away) },
  { weight: 5, arbitrary: msArb.map(advance) },
  { weight: 3, arbitrary: fc.constant<Op>({ k: 'fire' }) },
  { weight: 3, arbitrary: modeArb.map(mode) },
  { weight: 2, arbitrary: fc.tuple(keyArb, fc.boolean()).map(([key, notify]): Op => ({ k: 'chapter', key, notify })) },
  { weight: 1, arbitrary: fc.boolean().map((on): Op => ({ k: 'reduced', on })) },
  { weight: 1, arbitrary: fc.constant<Op>({ k: 'arm' }) },
);

/** Something that happens while a Return_Moment is running (or while a look-away runs). */
const midArb: fc.Arbitrary<Op[]> = fc.oneof(
  { weight: 3, arbitrary: fc.constant<Op[]>([away]) },
  { weight: 3, arbitrary: fc.constant<Op[]>([mode('gentle')]) },
  { weight: 4, arbitrary: nonGentleArb.map((m) => [mode(m)]) },
  { weight: 3, arbitrary: fc.boolean().map((on): Op[] => [{ k: 'reduced', on }]) },
  { weight: 2, arbitrary: fc.tuple(keyArb, fc.boolean()).map(([key, notify]): Op[] => [{ k: 'chapter', key, notify }]) },
  { weight: 4, arbitrary: fc.constant<Op[]>([{ k: 'stop' }]) },
  { weight: 1, arbitrary: fc.constant<Op[]>([present]) },
);
const setupArb: fc.Arbitrary<Op[]> = fc.oneof(
  { weight: 3, arbitrary: fc.constant<Op[]>([]) },
  { weight: 1, arbitrary: fc.constant<Op[]>([{ k: 'arm' }]) },
  { weight: 2, arbitrary: nonGentleArb.map((m) => [mode(m)]) },
  { weight: 2, arbitrary: nonGentleArb.map((m) => [{ k: 'arm' } as Op, mode(m)]) },
);
const awayMsArb = fc.oneof(
  { weight: 3, arbitrary: fc.integer({ min: 10_000, max: 14_000 }) },
  { weight: 1, arbitrary: fc.integer({ min: 0, max: 9999 }) },
);

/** A look-away, a return, something during the return, then time to let it run on. */
const returnMacro: fc.Arbitrary<Op[]> = fc
  .tuple(setupArb, awayMsArb, fc.integer({ min: 0, max: 1500 }), midArb, fc.integer({ min: 0, max: 3300 }))
  .map(([setup, a, b, mid, c]) => [...setup, away, advance(a), present, advance(b), ...mid, advance(c)]);

/** A long look-away that reaches level 3, with a switch to or from Gentle in the middle. */
const layerMacro: fc.Arbitrary<Op[]> = fc
  .tuple(
    nonGentleArb,
    fc.oneof({ weight: 4, arbitrary: fc.integer({ min: 12_001, max: 14_000 }) }, { weight: 1, arbitrary: fc.integer({ min: 5001, max: 12_000 }) }),
    fc.integer({ min: 0, max: 900 }),
    modeArb,
    modeArb,
  )
  .map(([m0, a, b, m1, m2]) => [{ k: 'arm' } as Op, mode(m0), away, advance(a), mode(m1), advance(b), mode(m2), advance(b), present, advance(800)]);

/** Gentle first, then a long look-away: layers limited to Classic and Nightmare must stay out. */
const gentleMacro: fc.Arbitrary<Op[]> = fc
  .tuple(fc.integer({ min: 1000, max: 13_000 }), fc.integer({ min: 0, max: 900 }), nonGentleArb)
  .map(([a, b, m]) => [{ k: 'arm' } as Op, mode('gentle'), away, advance(a), mode(m), advance(b), present, advance(b)]);

/** Look-aways in several chapters, with and without the chapter callback, returning to earlier chapters. */
const chapterMacro: fc.Arbitrary<Op[]> = fc
  .array(fc.tuple(keyArb, fc.boolean(), fc.integer({ min: 0, max: 3200 })), { minLength: 2, maxLength: 5 })
  .map((rounds) => [
    { k: 'arm' } as Op,
    ...rounds.flatMap(([key, notify, ms]): Op[] => [{ k: 'chapter', key, notify }, away, advance(ms), present, advance(ms)]),
  ]);

const chunkArb: fc.Arbitrary<Op[]> = fc.oneof(
  { weight: 7, arbitrary: opArb.map((o) => [o]) },
  { weight: 5, arbitrary: returnMacro },
  { weight: 3, arbitrary: layerMacro },
  { weight: 2, arbitrary: gentleMacro },
  { weight: 4, arbitrary: chapterMacro },
);

export const scriptArb: fc.Arbitrary<Script> = fc.record({
  leads: fc.oneof(
    { weight: 1, arbitrary: fc.constant<ModesSpec[]>([]) },
    { weight: 6, arbitrary: fc.array(leadModesArb, { minLength: 1, maxLength: 3 }) },
  ),
  layers: fc.oneof(
    { weight: 1, arbitrary: fc.constant<LayerSpec[]>([]) },
    { weight: 8, arbitrary: fc.array(layerArb, { minLength: 1, maxLength: 4 }) },
  ),
  effects: fc.tuple(spanArb, fc.array(effectArb, { minLength: 0, maxLength: 3 })).map(([span, rest]) => [{ modes: 'all' as ModesSpec, span }, ...rest]),
  random: seedArb(8),
  extra: seedArb(16),
  chapterCallback: fc.oneof({ weight: 5, arbitrary: fc.constant(true) }, { weight: 1, arbitrary: fc.constant(false) }),
  initial: fc.record({
    signal: fc.oneof(
      { weight: 1, arbitrary: fc.constant<'present' | 'away' | null>(null) },
      { weight: 2, arbitrary: fc.constant<'present' | 'away' | null>('present') },
      { weight: 2, arbitrary: fc.constant<'present' | 'away' | null>('away') },
    ),
    ageMs: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 14_000 })),
    mode: fc.oneof(
      { weight: 1, arbitrary: fc.constant<HauntMode>('gentle') },
      { weight: 3, arbitrary: nonGentleArb },
    ),
    armed: fc.oneof({ weight: 4, arbitrary: fc.constant(true) }, { weight: 1, arbitrary: fc.constant(false) }),
    reduced: fc.boolean(),
    chapter: keyArb,
  }),
  ops: fc.array(chunkArb, { minLength: 2, maxLength: 12, size: 'large' }).map((chunks) => chunks.flat()),
});
