import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { INITIAL_AWAY_COUNTER, onChapterChange, startLookAway, type AwayCounter } from '../../awayCounter';
import { chapterScriptArb as baseScriptArb, lookAwayScriptArb } from './arbitraries';
import type { ChapterOp, ChapterScript } from './arbitraries';
import { chapterKeyArb } from './scriptArbitraries';
import { lookAwayKeys, referenceScriptTrace, referenceTrace } from './awayReference';

const NUM_RUNS = 300;
const COVERAGE_RUNS = 1000;

/** Few keys and many chapter changes, so returns to an earlier chapter are common. */
const busyScriptArb: fc.Arbitrary<ChapterScript> = fc.record({
  firstChapterKey: fc.constantFrom('c1', 'c2', 'c3'),
  ops: fc.array(
    fc.oneof(
      { weight: 3, arbitrary: fc.constant<ChapterOp>({ k: 'lookAway' }) },
      { weight: 2, arbitrary: fc.constantFrom('c1', 'c2', 'c3').map((chapterKey): ChapterOp => ({ k: 'chapter', chapterKey })) },
    ),
    { minLength: 12, maxLength: 40 },
  ),
});

/** Long runs in one chapter (counts above 4), busy scripts, and the shared mixed scripts. */
const chapterScriptArb: fc.Arbitrary<ChapterScript> = fc.oneof(baseScriptArb, busyScriptArb, baseScriptArb);
/**
 * Drives the real counter over a whole script the way the engine does: `onChapterChange` for every
 * chapter op, `startLookAway` for every look-away. Returns one entry per look-away.
 */
function driveScript(script: ChapterScript) {
  let current = script.firstChapterKey;
  let counter: AwayCounter = onChapterChange(INITIAL_AWAY_COUNTER, current);
  const out: { step: number; next: AwayCounter }[] = [];
  for (const op of script.ops) {
    if (op.k === 'chapter') {
      current = op.chapterKey;
      counter = onChapterChange(counter, current);
    } else {
      const r = startLookAway(counter, current);
      counter = r.next;
      out.push(r);
    }
  }
  return out;
}

describe('awayCounter (ghost-dread)', () => {
  // Feature: ghost-dread, Property 4: Look-away counter follows the chapter
  // **Validates: Requirements 2.3, 2.4**
  it('Property 4: each step is the earlier look-aways since the last chapter change, capped at 4, and 0 after any change', () => {
    fc.assert(
      fc.property(chapterScriptArb, (script) => {
        const expected = referenceScriptTrace(script);
        const actual = driveScript(script);
        expect(actual.map((a) => a.step)).toEqual(expected.map((e) => e.step));
        actual.forEach((a, i) => {
          // The step after any chapter change, including a return to an earlier key, is 0.
          if (expected[i].changedSince) expect(a.step).toBe(0);
          expect(a.next.chapterKey).toBe(expected[i].chapterKey);
          expect(a.next.count).toBe(expected[i].earlier + 1);
        });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: ghost-dread, Property 4: Look-away counter follows the chapter
  // **Validates: Requirements 2.4**
  it('Property 4: onChapterChange resets on a different key, returns the same counter for the same key, and does not change its input', () => {
    fc.assert(
      fc.property(fc.option(chapterKeyArb, { nil: null }), fc.nat(50), chapterKeyArb, (key, count, next) => {
        const c: AwayCounter = { chapterKey: key, count };
        const snapshot = { ...c };
        const out = onChapterChange(c, next);
        expect(c).toEqual(snapshot);
        if (key === next) expect(out).toBe(c);
        else expect(out).toEqual({ chapterKey: next, count: 0 });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: ghost-dread, Property 4: Look-away counter follows the chapter
  // **Validates: Requirements 2.3, 2.4**
  it('Property 4: look-away lists tagged with a chapter follow the same reference, and the input counter is not changed', () => {
    fc.assert(
      fc.property(lookAwayScriptArb, (script) => {
        const keys = script.map((s) => s.chapterKey);
        const expected = referenceTrace(keys);
        let counter: AwayCounter = INITIAL_AWAY_COUNTER;
        keys.forEach((key, i) => {
          const snapshot = { ...counter };
          const out = startLookAway(counter, key);
          expect(counter).toEqual(snapshot);
          expect(out.step).toBe(expected[i].step);
          counter = out.next;
        });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: ghost-dread, Property 4: Look-away counter follows the chapter
  // **Validates: Requirements 2.3, 2.4**
  it('Property 4: the generator reaches chapter changes, returns to an earlier chapter, and counts above 4', () => {
    const seen = { runs: 0, changed: 0, returned: 0, capped: 0, step4: 0, firstOnly: 0, roundTrip: 0, sameKeyChange: 0 };
    fc.assert(
      fc.property(chapterScriptArb, (script) => {
        const trace = referenceTrace(lookAwayKeys(script));
        seen.runs++;
        if (trace.some((t) => t.afterChange)) seen.changed++;
        if (trace.some((t) => t.returnToPrevious)) seen.returned++;
        if (trace.some((t) => t.earlier > 4)) seen.capped++;
        if (trace.some((t) => t.step === 4)) seen.step4++;
        if (trace.length === 1) seen.firstOnly++;
        if (referenceScriptTrace(script).some((t) => t.roundTrip)) seen.roundTrip++;
        if (sameKeyChange(script)) seen.sameKeyChange++;
      }),
      { numRuns: COVERAGE_RUNS },
    );
    const msg = JSON.stringify(seen);
    for (const key of ['changed', 'returned', 'capped', 'step4', 'firstOnly', 'roundTrip', 'sameKeyChange'] as const) {
      expect(seen[key] >= seen.runs * FLOOR[key], `${key}: ${msg}`).toBe(true);
    }
  });
});

/** Minimum share of scripts that must show each shape. */
const FLOOR = { changed: 0.3, returned: 0.1, capped: 0.15, step4: 0.25, firstOnly: 0.03, roundTrip: 0.05, sameKeyChange: 0.1 } as const;

/** True when a chapter op repeats the key the reader is already in (not a change). */
function sameKeyChange(script: ChapterScript): boolean {
  let current = script.firstChapterKey;
  for (const op of script.ops) {
    if (op.k !== 'chapter') continue;
    if (op.chapterKey === current) return true;
    current = op.chapterKey;
  }
  return false;
}
