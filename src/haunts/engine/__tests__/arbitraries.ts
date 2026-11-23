/**
 * Shared fast-check generators for the haunt feature property tests.
 * Types that belong to later tasks (plan.ts, settings.ts, regions.ts) are
 * declared here as minimal structural copies of the design.
 */
import fc from 'fast-check';
import type { HauntMode } from '../ghost/mode';
import type { AttentionSignalLike, HauntSettings } from '../types';

export interface GainRequest {
  readonly key: string;
  readonly gain: number;
}
export interface RateRequest {
  readonly key: string;
  readonly rate: number;
}
export interface Rect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** Storage keys from the design (settings.ts, later task). */
export const SETTINGS_STORAGE_KEYS = [
  'rod_haunt_sound',
  'rod_haunt_mode',
  'rod_haunt_gentle',
  'rod_safety_notice_seen',
  'rod_headphones_tip_seen',
  'rod_volume_cap',
] as const;

// ---------------------------------------------------------------- events

const signalValueArb = fc.constantFrom<'present' | 'away'>('present', 'away');
/** Gap to the previous event. Zero is allowed, so timestamps may repeat. */
const gapArb = fc.integer({ min: 0, max: 20_000 });

function build(
  start: number,
  steps: ReadonlyArray<readonly [number, 'present' | 'away']>,
): AttentionSignalLike[] {
  let t = start;
  return steps.map(([gap, value]) => {
    t += gap;
    return { value, timestamp: t };
  });
}

/** Non-decreasing timestamps, duplicates allowed, any value order. May be empty. */
export const eventHistoryArb: fc.Arbitrary<AttentionSignalLike[]> = fc
  .tuple(
    fc.integer({ min: 0, max: 1_000_000 }),
    fc.array(fc.tuple(gapArb, signalValueArb), { maxLength: 12 }),
  )
  .map(([start, steps]) => build(start, steps));

/** History that ends with a run (1 to 4 events) of `value`, after an arbitrary prefix. */
export function historyEndingWith(value: 'present' | 'away'): fc.Arbitrary<AttentionSignalLike[]> {
  return fc
    .tuple(
      fc.integer({ min: 0, max: 1_000_000 }),
      fc.array(fc.tuple(gapArb, signalValueArb), { maxLength: 8 }),
      fc.array(gapArb, { minLength: 1, maxLength: 4 }),
    )
    .map(([start, prefix, run]) =>
      build(start, [...prefix, ...run.map((gap) => [gap, value] as const)]),
    );
}

export const awayHistoryArb = historyEndingWith('away');
export const presentHistoryArb = historyEndingWith('present');

// ---------------------------------------------------------------- modes

/** Any of the three modes, evenly. */
export const modeArb: fc.Arbitrary<HauntMode> = fc.constantFrom<HauntMode>('gentle', 'classic', 'nightmare');

/** Classic or Nightmare: the modes with full escalation. */
export const fullModeArb: fc.Arbitrary<HauntMode> = fc.constantFrom<HauntMode>('classic', 'nightmare');

/**
 * Gentle with weight `gentle`, otherwise Classic or Nightmare (evenly) with weight `other`.
 * Replaces the old `gentle` boolean generators with the same Gentle share.
 */
export function weightedModeArb(gentle: number, other: number): fc.Arbitrary<HauntMode> {
  return fc.oneof(
    { weight: gentle, arbitrary: fc.constant<HauntMode>('gentle') },
    { weight: other, arbitrary: fullModeArb },
  );
}

// ---------------------------------------------------------- haunt ids, rolls

/** 0 to 5 distinct haunt ids. */
export const hauntIdsArb: fc.Arbitrary<string[]> = fc.uniqueArray(
  fc.stringMatching(/^[a-z][a-z0-9-]{0,7}$/),
  { minLength: 0, maxLength: 5 },
);

/** A roll in [0, 1). */
export const rollArb: fc.Arbitrary<number> = fc.double({
  min: 0,
  max: 1,
  maxExcluded: true,
  noNaN: true,
});

export const rollsArb: fc.Arbitrary<{ lead: number; companion: number }> = fc.record({
  lead: rollArb,
  companion: rollArb,
});

// ------------------------------------------------------- gain / rate requests

/** Any double: negative, NaN, +/-Infinity and huge values all occur. */
const hostileNumberArb = fc.oneof(
  { weight: 4, arbitrary: fc.double({ min: 0, max: 1, noNaN: true }) },
  { weight: 2, arbitrary: fc.double({ noDefaultInfinity: true, noNaN: true }) },
  { weight: 1, arbitrary: fc.constantFrom(NaN, Infinity, -Infinity, -0, -1, 0) },
);

const requestKeysArb = fc.uniqueArray(fc.stringMatching(/^[a-z]{1,6}$/), {
  minLength: 0,
  maxLength: 6,
});

export const gainRequestsArb: fc.Arbitrary<GainRequest[]> = requestKeysArb.chain((keys) =>
  fc
    .array(hostileNumberArb, { minLength: keys.length, maxLength: keys.length })
    .map((gains) => keys.map((key, i) => ({ key, gain: gains[i] }))),
);

export const rateRequestsArb: fc.Arbitrary<RateRequest[]> = requestKeysArb.chain((keys) =>
  fc
    .array(hostileNumberArb, { minLength: keys.length, maxLength: keys.length })
    .map((rates) => keys.map((key, i) => ({ key, rate: rates[i] }))),
);

/** A usable Volume_Cap number, 0 to 1 inclusive. */
export const capArb: fc.Arbitrary<number> = fc
  .double({ min: 0, max: 1, noNaN: true })
  .map((n) => n + 0); // turns -0 into 0, so text round trips compare equal

/** Requested fade durations, including undefined and bad numbers. */
export const fadeMsArb: fc.Arbitrary<number | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.integer({ min: -5000, max: 20_000 }),
  fc.constantFrom(NaN, Infinity, -Infinity),
);

// ------------------------------------------------------------- Volume_Cap raw

/** A number in [0, 1] and its decimal text. */
export const validCapTextArb: fc.Arbitrary<{ value: number; text: string }> = capArb.map((value) => ({
  value,
  text: String(value),
}));

export const emptyCapTextArb: fc.Arbitrary<string> = fc.constantFrom('', ' ', '\t', '\n');

/** Non-empty text that does not parse to any number. */
export const nonNumericCapTextArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 12 })
  .filter((s) => s.trim() !== '' && Number.isNaN(Number(s)));

/** Text of finite numbers outside [0, 1], plus infinities. */
export const outOfRangeCapTextArb: fc.Arbitrary<string> = fc.oneof(
  fc.double({ min: 1, max: 1e9, minExcluded: true, noNaN: true }).map(String),
  // -0 prints as "0", so stop just below zero instead of excluding 0.
  fc.double({ min: -1e9, max: -Number.MIN_VALUE, noNaN: true }).map(String),
  fc.constantFrom('Infinity', '-Infinity', '2', '-0.01', '1.0000001'),
);

export const nonStringCapArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.double(),
  fc.boolean(),
  fc.array(fc.string(), { maxLength: 2 }),
  fc.dictionary(fc.string({ maxLength: 4 }), fc.string({ maxLength: 4 }), { maxKeys: 2 }),
);

/** Any raw value a caller might pass to parseVolumeCap. */
export const volumeCapRawArb: fc.Arbitrary<unknown> = fc.oneof(
  validCapTextArb.map((v) => v.text),
  emptyCapTextArb,
  nonNumericCapTextArb,
  outOfRangeCapTextArb,
  nonStringCapArb,
  fc.string(),
);

// ------------------------------------------------------------------ settings

export const hauntSettingsArb: fc.Arbitrary<HauntSettings> = fc.record({
  sound: fc.boolean(),
  mode: fc.constantFrom<HauntMode>('gentle', 'classic', 'nightmare'),
  noticeSeen: fc.boolean(),
  headphonesTipSeen: fc.boolean(),
});

const storageValueArb = fc.oneof(
  fc.constantFrom('true', 'false', 'TRUE', '1', '0', 'yes', ''),
  fc.string({ maxLength: 10 }),
  fc.constant(null),
);

/** Arbitrary storage contents: the real keys sometimes, other keys always possible. */
export const storageMapArb: fc.Arbitrary<Record<string, string | null>> = fc.dictionary(
  fc.oneof(fc.constantFrom(...SETTINGS_STORAGE_KEYS), fc.string({ maxLength: 10 })),
  storageValueArb,
  { maxKeys: 8 },
);

// ------------------------------------------------------------ viewport, column

export interface ViewportColumn {
  readonly width: number;
  readonly height: number;
  readonly column: Rect;
}

/** A viewport and a column rectangle fully inside it (edges may touch the viewport). */
export const viewportColumnArb: fc.Arbitrary<ViewportColumn> = fc
  .tuple(fc.integer({ min: 0, max: 4000 }), fc.integer({ min: 0, max: 3000 }))
  .chain(([width, height]) =>
    fc
      .tuple(
        fc.integer({ min: 0, max: width }),
        fc.integer({ min: 0, max: width }),
        fc.integer({ min: 0, max: height }),
        fc.integer({ min: 0, max: height }),
      )
      .map(([a, b, c, d]) => ({
        width,
        height,
        column: {
          left: Math.min(a, b),
          right: Math.max(a, b),
          top: Math.min(c, d),
          bottom: Math.max(c, d),
        },
      })),
  );

// ------------------------------------------------------------- module records

export type ModuleKind =
  | 'valid'
  | 'missing-field'
  | 'wrong-type'
  | 'empty-id'
  | 'helper-like';

export interface ModuleEntry {
  readonly path: string;
  readonly module: unknown;
  readonly kind: ModuleKind;
}

const noop = (): void => {};
const ID_POOL = ['candle', 'whispers', 'shadow', 'mirror'] as const;
const CONTRACT_FIELDS = ['id', 'name', 'start', 'setLevel', 'stop'] as const;

function validModule(id: string, name: string): Record<string, unknown> {
  return { id, name, start: noop, setLevel: noop, stop: noop };
}

const wrongValueArb: Record<(typeof CONTRACT_FIELDS)[number], fc.Arbitrary<unknown>> = {
  id: fc.constantFrom(1, null, undefined, {}, []),
  name: fc.constantFrom(1, null, undefined, {}, []),
  start: fc.constantFrom('start', 1, null, undefined, {}),
  setLevel: fc.constantFrom('setLevel', 1, null, undefined, {}),
  stop: fc.constantFrom('stop', 1, null, undefined, {}),
};

const idArb = fc.constantFrom(...ID_POOL);
const nameArb = fc.string({ maxLength: 12 });
const fieldArb = fc.constantFrom(...CONTRACT_FIELDS);

const moduleArb: fc.Arbitrary<{ module: unknown; kind: ModuleKind }> = fc.oneof(
  { weight: 4, arbitrary: fc.tuple(idArb, nameArb).map(([id, name]) => ({ module: validModule(id, name), kind: 'valid' as const })) },
  {
    weight: 2,
    arbitrary: fc.tuple(idArb, nameArb, fieldArb).map(([id, name, field]) => {
      const m = validModule(id, name);
      delete m[field];
      return { module: m, kind: 'missing-field' as const };
    }),
  },
  {
    weight: 2,
    arbitrary: fc
      .tuple(idArb, nameArb, fieldArb)
      .chain(([id, name, field]) =>
        wrongValueArb[field].map((bad) => ({
          module: { ...validModule(id, name), [field]: bad },
          kind: 'wrong-type' as const,
        })),
      ),
  },
  {
    weight: 1,
    arbitrary: nameArb.map((name) => ({ module: validModule('', name), kind: 'empty-id' as const })),
  },
  {
    weight: 1,
    arbitrary: fc.constantFrom(
      { module: { createNoiseBuffer: noop }, kind: 'helper-like' as const },
      { module: { default: noop }, kind: 'helper-like' as const },
      { module: {}, kind: 'helper-like' as const },
    ),
  },
);

/** Entries with unique paths, in arbitrary order. Ids come from a small pool, so duplicates are common. */
export const moduleEntriesArb: fc.Arbitrary<ModuleEntry[]> = fc
  .uniqueArray(fc.stringMatching(/^[a-z]{1,6}$/), { minLength: 0, maxLength: 8 })
  .chain((names) =>
    fc
      .array(moduleArb, { minLength: names.length, maxLength: names.length })
      .map((mods) => names.map((n, i) => ({ path: `../${n}.ts`, ...mods[i] }))),
  );

/** The record shape `buildRegistry` takes: path to module namespace. */
export function toModuleRecord(entries: readonly ModuleEntry[]): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const e of entries) record[e.path] = e.module;
  return record;
}

export const moduleRecordArb: fc.Arbitrary<Record<string, unknown>> = moduleEntriesArb.map(toModuleRecord);
