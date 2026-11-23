import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { INITIAL_AWAY_COUNTER, startLookAway, type AwayCounter } from '../../awayCounter';
import { chapterScriptArb as baseScriptArb, lookAwayScriptArb } from './arbitraries';
import type { ChapterOp, ChapterScript } from './arbitraries';
import { lookAwayKeys, referenceTrace } from './awayReference';

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
/** Drives the real counter over the chapter keys of the look-aways, in order. */
function drive(keys: readonly string[]) {
  let counter: AwayCounter = INITIAL_AWAY_COUNTER;
  return keys.map((key) => {
    const before = counter;
    const out = startLookAway(counter, key);
    counter = out.next;
    return { before, ...out };
  });
}

describe('awayCounter (ghost-dread)', () => {
  // Feature: ghost-dread, Property 4: Look-away counter follows the chapter
  // **Validates: Requirements 2.3, 2.4**
  it('Property 4: each step is the earlier look-aways in the chapter, capped at 4, and 0 after a chapter change', () => {
    fc.assert(
      fc.property(chapterScriptArb, (script) => {
        const keys = lookAwayKeys(script);
        const expected = referenceTrace(keys);
        const actual = drive(keys);
        expect(actual.map((a) => a.step)).toEqual(expected.map((e) => e.step));
        actual.forEach((a, i) => {
          if (i === 0 || expected[i].afterChange) expect(a.step).toBe(0);
          expect(a.next.chapterKey).toBe(keys[i]);
          expect(a.next.count).toBe(expected[i].earlier + 1);
        });
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
    const seen = { runs: 0, changed: 0, returned: 0, capped: 0, step4: 0, firstOnly: 0 };
    fc.assert(
      fc.property(chapterScriptArb, (script) => {
        const trace = referenceTrace(lookAwayKeys(script));
        seen.runs++;
        if (trace.some((t) => t.afterChange)) seen.changed++;
        if (trace.some((t) => t.returnToPrevious)) seen.returned++;
        if (trace.some((t) => t.earlier > 4)) seen.capped++;
        if (trace.some((t) => t.step === 4)) seen.step4++;
        if (trace.length === 1) seen.firstOnly++;
      }),
      { numRuns: COVERAGE_RUNS },
    );
    const msg = JSON.stringify(seen);
    for (const key of ['changed', 'returned', 'capped', 'step4', 'firstOnly'] as const) {
      expect(seen[key] >= seen.runs * FLOOR[key], `${key}: ${msg}`).toBe(true);
    }
  });
});

/** Minimum share of scripts that must show each shape. */
const FLOOR = { changed: 0.3, returned: 0.1, capped: 0.15, step4: 0.25, firstOnly: 0.03 } as const;
