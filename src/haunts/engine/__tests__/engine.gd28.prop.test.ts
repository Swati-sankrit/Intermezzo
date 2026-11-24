import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { runScript } from './engineGd28Run';
import type { Gd28Stats } from './engineGd28Run';
import { scriptArb } from './engineGd28Script';

const NUM_RUNS = 500;
/** Coverage test: each floor below sits at least 4 SD under the share measured over 10 batches of 500 scripts. */
const COVERAGE_RUNS = 500;

describe('Haunt engine: ghosts and returns stay inside their rules', () => {
  // Feature: ghost-dread, Property 28: The engine runs ghosts and returns inside their rules
  // **Validates: Requirements 1.3, 1.14, 2.4, 2.13, 3.1, 3.5, 3.6, 3.7, 3.9, 3.11, 4.7, 5.3, 8.10, 9.8, 9.9, 9.13**
  it('Property 28: layers, returns, ghost steps and fades follow the reference model for any script', () => {
    // After every step the runner checks, against a model kept outside the engine: layers start only
    // while armed and away, in a mode they allow, never in Gentle, at or above their minLevel, and at
    // most once per look-away; a layer the rules require has started; haunts stop within the fade
    // deadlines after present, a mode change and a new look-away; a Return_Moment begins exactly on a
    // present that follows an away outside Gentle, at most one runs, and it ends only by a new away
    // (same call, fade of 100 ms or less), a switch to Gentle (same call, fade of 800 ms or less),
    // stop(), or its planned duration (at most 3000 ms); other mode changes, chapter changes,
    // reduced-motion toggles and arming leave it running; every effect begins and ends once, inside
    // the moment and its span; StartInfo.ghostStep equals the model's Ghost_Distance, which resets
    // on a chapter change the engine can see; after stop() nothing runs and no timer or subscription remains.
    fc.assert(
      fc.property(scriptArb, (script) => {
        runScript(script);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: ghost-dread, Property 28: The engine runs ghosts and returns inside their rules
  // **Validates: Requirements 1.3, 1.14, 2.4, 2.13, 3.1, 3.5, 3.6, 3.7, 3.9, 3.11, 4.7, 5.3, 8.10, 9.8, 9.9, 9.13**
  it('Property 28: the generated scripts reach the shapes the clauses are about', () => {
    const seen: Record<keyof Gd28Stats, number> = {
      momentStarted: 0,
      abortedByAway: 0,
      abortedByGentle: 0,
      modeChangeMidMoment: 0,
      minLevel3LayerStarted: 0,
      cnLayerSkippedInGentle: 0,
      chapterWithCallback: 0,
      chapterWithoutCallback: 0,
      returnToEarlierChapter: 0,
      reducedDuringMoment: 0,
      stopMidMoment: 0,
    };
    let runs = 0;
    fc.assert(
      fc.property(scriptArb, (script) => {
        const stats = runScript(script);
        runs++;
        for (const key of Object.keys(seen) as (keyof Gd28Stats)[]) if (stats[key]) seen[key]++;
      }),
      { numRuns: COVERAGE_RUNS },
    );
    const msg = JSON.stringify({ runs, ...seen });
    const atLeast = (key: keyof Gd28Stats, share: number) => seen[key] >= runs * share;
    expect(atLeast('momentStarted', 0.5), `Return_Moments started: ${msg}`).toBe(true);
    expect(atLeast('abortedByAway', 0.2), `aborted by away: ${msg}`).toBe(true);
    expect(atLeast('abortedByGentle', 0.1), `aborted by Gentle: ${msg}`).toBe(true);
    expect(atLeast('modeChangeMidMoment', 0.2), `mode change mid-moment, not to Gentle: ${msg}`).toBe(true);
    expect(atLeast('minLevel3LayerStarted', 0.3), `minLevel 3 layer started: ${msg}`).toBe(true);
    expect(atLeast('cnLayerSkippedInGentle', 0.1), `Classic/Nightmare layer skipped in Gentle: ${msg}`).toBe(true);
    expect(atLeast('chapterWithCallback', 0.3), `chapter change with the callback: ${msg}`).toBe(true);
    expect(atLeast('chapterWithoutCallback', 0.3), `chapter change without the callback: ${msg}`).toBe(true);
    expect(atLeast('returnToEarlierChapter', 0.2), `return to an earlier chapter: ${msg}`).toBe(true);
    expect(atLeast('reducedDuringMoment', 0.2), `reduced motion during a moment: ${msg}`).toBe(true);
    expect(atLeast('stopMidMoment', 0.1), `stop() mid-moment: ${msg}`).toBe(true);
  });
});
