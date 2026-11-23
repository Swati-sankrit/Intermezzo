// Feature: ghost-dread, Property 26: Fade floors under reduced motion
/**
 * Validates: Requirements 2.9, 3.10, 5.12, 7.17, 9.10
 *
 * design.md Property 26: with `reduced` true, `planOverlayFade` returns at least 1000 for ghost and
 * jumpscare, 500 for glitch and evidence, 300 for card, and is finite, for any request (undefined, negative,
 * non-finite included). With `reduced` false it never returns less than the request or a negative value.
 *
 * The reference table below is typed from design.md (Property 26), not read from returnRules.ts.
 * Also covered (design "Jump channel and the cap guarantee", haunt-safety): jump attack of at least 20 ms
 * (300 ms under reduced motion), and jump headroom within [0, min(1, cap)] so that the other channels plus
 * the headroom never pass the cap.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { jumpHeadroom, planJumpAttack, planOverlayFade, type FadeKind } from '../gate/returnRules';

const NUM_RUNS = 400;
const COVERAGE_RUNS = 5000;

// BEGIN-SHAPING
/** Floors from design.md Property 26. */
const DESIGN_FLOORS: Readonly<Record<FadeKind, number>> = {
  ghost: 1000,
  jumpscare: 1000,
  glitch: 500,
  evidence: 500,
  card: 300,
};
const KINDS: readonly FadeKind[] = ['ghost', 'jumpscare', 'glitch', 'evidence', 'card'];
/** Design wording for the jump attack: at least 20 ms, at least 300 ms under reduced motion. */
const ATTACK_MIN = 20;
const ATTACK_MIN_REDUCED = 300;

type Shape = 'undefined' | 'nan' | 'posInf' | 'negInf' | 'negative' | 'zero' | 'below' | 'above';
const SHAPES: readonly Shape[] = ['undefined', 'nan', 'posInf', 'negInf', 'negative', 'zero', 'below', 'above'];
const OTHER_SHAPES: readonly Shape[] = ['undefined', 'nan', 'posInf', 'negInf', 'negative', 'zero'];

/** Classifies a request relative to a floor, from the value alone (independent of how it was generated). */
function shapeOf(req: number | undefined, floor: number): Shape {
  if (req === undefined) return 'undefined';
  if (Number.isNaN(req)) return 'nan';
  if (req === Infinity) return 'posInf';
  if (req === -Infinity) return 'negInf';
  if (req < 0) return 'negative';
  if (req === 0) return 'zero';
  return req < floor ? 'below' : 'above';
}

/** Requests of every shape. Below/above are weighted up so each kind x reduced cell is reached often. */
function requestArb(floor: number): fc.Arbitrary<number | undefined> {
  return fc.oneof(
    { weight: 2, arbitrary: fc.constant(undefined) },
    { weight: 2, arbitrary: fc.constant(Number.NaN) },
    { weight: 2, arbitrary: fc.constant(Infinity) },
    { weight: 2, arbitrary: fc.constant(-Infinity) },
    {
      weight: 2,
      arbitrary: fc.oneof(
        fc.double({ min: -1e9, max: -1e-9, noNaN: true }),
        fc.integer({ min: -5000, max: -1 }),
        fc.constant(-Number.MAX_VALUE),
      ),
    },
    { weight: 2, arbitrary: fc.constantFrom(0, -0) },
    {
      weight: 5,
      arbitrary: fc.oneof(
        fc.integer({ min: 1, max: floor - 1 }),
        fc.double({ min: 1e-9, max: floor - 1e-6, noNaN: true }),
      ),
    },
    {
      weight: 5,
      arbitrary: fc.oneof(
        fc.constant(floor),
        fc.integer({ min: floor, max: floor + 10_000 }),
        fc.double({ min: floor, max: 1e9, noNaN: true }),
        fc.constant(Number.MAX_VALUE),
      ),
    },
  );
}

interface FadeCase {
  readonly kind: FadeKind;
  readonly reduced: boolean;
  readonly req: number | undefined;
}
const fadeCaseArb: fc.Arbitrary<FadeCase> = fc
  .tuple(fc.constantFrom(...KINDS), fc.boolean())
  .chain(([kind, reduced]) => requestArb(DESIGN_FLOORS[kind]).map((req) => ({ kind, reduced, req })));

interface AttackCase {
  readonly reduced: boolean;
  readonly req: number | undefined;
}
const attackCaseArb: fc.Arbitrary<AttackCase> = fc
  .boolean()
  .chain((reduced) =>
    requestArb(reduced ? ATTACK_MIN_REDUCED : ATTACK_MIN).map((req) => ({ reduced, req })),
  );

/** Reference model for the fade, written from the design statement. */
function referenceFade(kind: FadeKind, req: number | undefined, reduced: boolean): number {
  const asked = req !== undefined && Number.isFinite(req) && req > 0 ? req : 0;
  return reduced ? Math.max(DESIGN_FLOORS[kind], asked) : asked;
}
/** Reference model for the jump attack. */
function referenceAttack(req: number | undefined, reduced: boolean): number {
  const min = reduced ? ATTACK_MIN_REDUCED : ATTACK_MIN;
  return req !== undefined && Number.isFinite(req) ? Math.max(min, req) : min;
}
// END-SHAPING

function isClean(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && !Object.is(n, -0);
}

describe('Property 26: fade floors under reduced motion', () => {
  it('reduced: result meets the design floor for the kind, is finite, and equals the reference', () => {
    fc.assert(
      fc.property(fadeCaseArb, ({ kind, req }) => {
        const out = planOverlayFade(kind, req, true);
        expect(isClean(out)).toBe(true);
        expect(out).toBeGreaterThanOrEqual(DESIGN_FLOORS[kind]);
        if (req !== undefined && Number.isFinite(req) && req > DESIGN_FLOORS[kind]) {
          expect(out).toBeGreaterThanOrEqual(req);
        }
        expect(out).toBe(referenceFade(kind, req, true));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('not reduced: finite non-negative requests come back unchanged', () => {
    fc.assert(
      fc.property(fadeCaseArb, ({ kind, req }) => {
        fc.pre(req !== undefined && Number.isFinite(req) && req >= 0);
        const out = planOverlayFade(kind, req, false);
        expect(out === req).toBe(true);
        expect(Object.is(out, -0)).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('not reduced: any request gives a clean non-negative number no smaller than a finite request, equal to the reference', () => {
    fc.assert(
      fc.property(fadeCaseArb, ({ kind, req }) => {
        const out = planOverlayFade(kind, req, false);
        expect(isClean(out)).toBe(true);
        if (req !== undefined && Number.isFinite(req)) expect(out).toBeGreaterThanOrEqual(req);
        if (req === undefined || !Number.isFinite(req) || req < 0) expect(out).toBe(0);
        expect(out).toBe(referenceFade(kind, req, false));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('jump attack: at least 20 ms (300 ms under reduced), finite, equals the reference', () => {
    fc.assert(
      fc.property(attackCaseArb, ({ reduced, req }) => {
        const out = planJumpAttack(req, reduced);
        expect(isClean(out)).toBe(true);
        expect(out).toBeGreaterThanOrEqual(reduced ? ATTACK_MIN_REDUCED : ATTACK_MIN);
        if (req !== undefined && Number.isFinite(req)) expect(out).toBeGreaterThanOrEqual(req);
        expect(out).toBe(referenceAttack(req, reduced));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  const gainArb = fc.oneof(
    { weight: 6, arbitrary: fc.double({ min: 0, max: 1, noNaN: true }) },
    { weight: 1, arbitrary: fc.constantFrom(Number.NaN, Infinity, -Infinity, -0.5, -0, 2) },
  );
  const capArb = fc.oneof(
    { weight: 6, arbitrary: fc.double({ min: 0, max: 1, noNaN: true }) },
    { weight: 2, arbitrary: fc.double({ min: 1, max: 1e6, noNaN: true }) },
    { weight: 1, arbitrary: fc.constantFrom(Number.NaN, Infinity, -Infinity, -0.25, -0, 0) },
  );
  const sane = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0);

  it('jump headroom: within [0, min(1, cap)], and other channels plus headroom never pass the cap', () => {
    fc.assert(
      fc.property(capArb, fc.array(gainArb, { maxLength: 8 }), (cap, others) => {
        const h = jumpHeadroom(cap, others);
        const limit = Math.min(1, sane(cap));
        const sum = others.reduce((s, g) => s + sane(g), 0);
        expect(isClean(h)).toBe(true);
        expect(h).toBeLessThanOrEqual(limit);
        // Valid others that fit under the cap: others + headroom stays at or below the cap (1 ulp-scale slack).
        if (sum <= limit) expect(sum + h).toBeLessThanOrEqual(limit + 1e-9);
        // Others already at or over the cap: no headroom at all.
        if (sum >= limit) expect(h).toBe(0);
        expect(h).toBeCloseTo(Math.max(0, limit - sum), 9);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('coverage: generated shapes reach every kind, reduced value and request shape', () => {
    const fades = fc.sample(fadeCaseArb, { numRuns: COVERAGE_RUNS });
    const cell = (k: FadeKind, r: boolean, s: Shape) =>
      fades.filter((c) => c.kind === k && c.reduced === r && shapeOf(c.req, DESIGN_FLOORS[k]) === s).length;
    for (const k of KINDS) {
      for (const r of [true, false]) {
        expect(cell(k, r, 'below'), `${k} reduced=${r} below`).toBeGreaterThanOrEqual(3);
        expect(cell(k, r, 'above'), `${k} reduced=${r} above`).toBeGreaterThanOrEqual(3);
      }
      expect(fades.filter((c) => c.kind === k).length).toBeGreaterThanOrEqual(600);
    }
    for (const r of [true, false]) {
      expect(fades.filter((c) => c.reduced === r).length).toBeGreaterThanOrEqual(2000);
    }
    for (const s of OTHER_SHAPES) {
      const n = fades.filter((c) => shapeOf(c.req, DESIGN_FLOORS[c.kind]) === s).length;
      expect(n, `shape ${s}`).toBeGreaterThanOrEqual(200);
    }
    const attacks = fc.sample(attackCaseArb, { numRuns: COVERAGE_RUNS });
    for (const r of [true, false]) {
      for (const s of SHAPES) {
        const n = attacks.filter((c) => c.reduced === r && shapeOf(c.req, r ? ATTACK_MIN_REDUCED : ATTACK_MIN) === s).length;
        expect(n, `attack reduced=${r} ${s}`).toBeGreaterThanOrEqual(50);
      }
    }
  });
});
