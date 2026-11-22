import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { runScript, scriptArb } from './engineScript';
import type { ScriptStats } from './engineScript';

const NUM_RUNS = 200;
/** Coverage test only: enough scripts that each share below sits about 4 SD above its floor. */
const COVERAGE_RUNS = 1000;

describe('Haunt engine: rules hold for any script', () => {
  // Feature: haunt-feature, Property 20: Engine keeps haunts within its rules for any script
  // **Validates: Requirements 1.5, 1.7, 2.2, 2.3, 2.4, 3.4, 7.2, 8.4, 11.3, 16.2**
  it('Property 20: level, running set, fades, start/stop pairing and engine.stop() obey the rules', () => {
    // The runner checks, after every step: level in [0, 3]; level never rises while present;
    // running is the lead and companion of the current look-away plus retiring haunts inside their
    // window (800 ms after present or gentle on, 50 ms after a new look-away); at most one haunt
    // and no companion with gentle on; level 0 and nothing running while not armed; the lead and
    // companion do not change within a look-away; nothing runs 800 ms after present; no haunt is
    // started twice without a stop; every start has exactly one stop and every port is closed,
    // also when stop, start or setLevel throw; after engine.stop() nothing runs, no timer is
    // pending, both subscriptions are removed and later signals start nothing.
    fc.assert(
      fc.property(scriptArb, (script) => {
        runScript(script);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 20: Engine keeps haunts within its rules for any script
  // **Validates: Requirements 1.5, 1.7, 2.2, 2.3, 2.4, 3.4, 7.2, 8.4, 11.3, 16.2**
  it('Property 20: the generated scripts reach the deep states the clauses are about', () => {
    const seen: Record<keyof ScriptStats, number> = {
      level3WithCompanion: 0,
      gentleOnAtLevel3: 0,
      gentleOffRestoresLevel3: 0,
      presentDuringFade: 0,
      newAwayDuringFade: 0,
      throwingStop: 0,
      throwingStartOrSetLevel: 0,
      signalWhileNotArmed: 0,
      armedWhileAway: 0,
      engineStopMidLookAway: 0,
      opsAfterEngineStop: 0,
    };
    let runs = 0;
    fc.assert(
      fc.property(scriptArb, (script) => {
        const stats = runScript(script);
        runs++;
        for (const key of Object.keys(seen) as (keyof ScriptStats)[]) if (stats[key]) seen[key]++;
      }),
      { numRuns: COVERAGE_RUNS },
    );
    const msg = JSON.stringify({ runs, ...seen });
    const atLeast = (key: keyof ScriptStats, share: number) => seen[key] >= runs * share;
    expect(atLeast('level3WithCompanion', 0.25), `level 3 with companion: ${msg}`).toBe(true);
    expect(atLeast('gentleOnAtLevel3', 0.15), `gentle on at level 3: ${msg}`).toBe(true);
    expect(atLeast('gentleOffRestoresLevel3', 0.15), `gentle off restores level 3: ${msg}`).toBe(true);
    expect(atLeast('presentDuringFade', 0.06), `present during a fade: ${msg}`).toBe(true);
    expect(atLeast('newAwayDuringFade', 0.3), `new look-away during a fade: ${msg}`).toBe(true);
    expect(atLeast('throwingStop', 0.3), `a stop threw: ${msg}`).toBe(true);
    expect(atLeast('throwingStartOrSetLevel', 0.15), `a start or setLevel threw: ${msg}`).toBe(true);
    expect(atLeast('signalWhileNotArmed', 0.25), `signal while not armed: ${msg}`).toBe(true);
    expect(atLeast('armedWhileAway', 0.05), `armed while away: ${msg}`).toBe(true);
    expect(atLeast('engineStopMidLookAway', 0.3), `engine.stop() mid look-away: ${msg}`).toBe(true);
    expect(atLeast('opsAfterEngineStop', 0.12), `signals after engine.stop(): ${msg}`).toBe(true);
  });
});
