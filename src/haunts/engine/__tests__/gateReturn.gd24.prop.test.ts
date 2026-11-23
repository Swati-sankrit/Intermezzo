/**
 * Property 24 (ghost-dread): return-only features exist only inside a Return_Moment.
 *
 * The real gate (real audio adapter, return host and return visual) runs on the fake AudioContext and the
 * fake scheduler. Scripts mix beginReturnMoment, endReturnMoment (all fade arguments, repeated), openReturn
 * (jump or not), overlays of each kind, runGlitch, ops on layers of ended moments, time steps across the 3000 ms
 * guard, normal ports (some asking for a jump sound), sound and reduced-motion toggles and dispose.
 * Files: gateReturnScript.ts (scripts), gateReturnWorld.ts (the world and the model written from the
 * requirements, which does not read the gate), gateCapRef.ts (gain replayed from the recorded automation).
 *
 * Checked at every action, every timer and every boundary (2999/3000 ms after begin, 79 to 101 ms after an end):
 *  - openReturn is null exactly when no Return_Moment is active, and a refusal makes no node and no element;
 *  - createOverlay makes no element and runGlitch grants nothing and changes nothing outside a Return_Moment,
 *    also on ports kept from an earlier one; a layer of an ended moment cannot change;
 *  - while a Return_Moment is active every overlay and return channel (jump or not) is present, and no jump
 *    channel is connected, nor any overlay in the page, that the script did not open in one;
 *  - 100 ms after the end (or the 3000 ms guard) every overlay and return channel is gone, never comes back,
 *    and an overlay of an ended moment is at opacity 0 meanwhile; dispose removes everything at once;
 *  - a normal port that asks for a jump sound still rises no faster than the 300 ms fade-in floor;
 *  - the guard ends the moment 3000 ms after the begin of the first begin (a second begin changes nothing).
 * The strict test asserts the other reading of "at most 3 seconds": nothing of a Return_Moment is present
 * 3000 ms after it began.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FLAG_NAMES, ReturnWorld, newStats, type FlagName, type Stats } from './gateReturnWorld';
import { scriptArb, type Script } from './gateReturnScript';

const NUM_RUNS = 400;
/**
 * Explicit timeout for the two 400-script tests. Measured with --reporter=verbose: the property test took 2.0 s alone and 5.7 s inside the src/haunts folder run (it timed out);
 * the 3000 ms test took 1.9 s alone and 4.7 s inside the folder run. The vitest default of 5000 ms is too close to these times under parallel load.
 */
const SLOW_TEST_MS = 20_000;

const tally: Record<FlagName | 'scripts', number> = Object.fromEntries(['scripts', ...FLAG_NAMES].map((k) => [k, 0])) as Record<FlagName | 'scripts', number>;
const stats: Stats = newStats();
const strictStats: Stats = newStats();

async function runScript(script: Script, strict: boolean, into: Stats): Promise<ReadonlySet<FlagName>> {
  const w = new ReturnWorld(strict, into);
  try {
    for (const a of script) await w.perform(a);
    await w.finish();
    return w.flags;
  } finally {
    w.dispose();
  }
}

async function worldAfter(actions: Script): Promise<ReturnWorld> {
  const w = new ReturnWorld(false, newStats());
  for (const a of actions) await w.perform(a);
  return w;
}

describe('Property 24: return-only features exist only inside a Return_Moment', () => {
  describe('control: the checks detect what they are meant to detect', () => {
    it('flags an overlay element in the page that no Return_Moment made', async () => {
      const w = await worldAfter([{ k: 'unlock' }]);
      const stray = document.createElement('div');
      stray.className = 'haunt-overlay';
      w.root.append(stray);
      expect(() => w.observe()).toThrow(/overlay in the page/);
      w.dispose();
    });

    it('flags a jump channel that is still connected after its Return_Moment was over for 100 ms', async () => {
      const w = await worldAfter([{ k: 'unlock' }, { k: 'begin' }, { k: 'rOpen', jump: true }, { k: 'end', ms: 80 }, { k: 'step', ms: 150 }]);
      const [jump] = w.jumpNodes();
      expect(jump).toBeDefined();
      jump.connect(w.masterForTest());
      expect(() => w.observe()).toThrow(/still present|came back/);
      w.dispose();
    });

    it('flags a channel that is missing while its Return_Moment is active', async () => {
      const w = await worldAfter([{ k: 'unlock' }, { k: 'begin' }, { k: 'rOpen', jump: true }]);
      const [jump] = w.jumpNodes();
      jump.disconnect(w.masterForTest());
      expect(() => w.observe()).toThrow(/missing while/);
      w.dispose();
    });

    it('flags a gate that ends the Return_Moment behind the model (openReturn would be null while the model says open)', async () => {
      const w = await worldAfter([{ k: 'unlock' }, { k: 'begin' }]);
      w.gate.endReturnMoment(0);
      expect(() => w.observe()).toThrow(/openReturn is open/);
      w.dispose();
    });

    it('flags a normal channel that rises in 20 ms, as a jump channel would', async () => {
      const w = await worldAfter([{ k: 'unlock' }, { k: 'open', tryJump: true }]);
      const ctx = w.contextForTest();
      const [node] = w.normalNodes();
      node.gain.cancelScheduledValues(ctx.currentTime);
      node.gain.setValueAtTime(0, ctx.currentTime);
      node.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.02);
      expect(() => w.checkRises()).toThrow(/rose/);
      w.dispose();
    });

    it('flags an overlay that is still in the page 100 ms after the end', async () => {
      const w = await worldAfter([{ k: 'unlock' }, { k: 'begin' }, { k: 'rOpen', jump: false }, { k: 'overlay', who: 0, kind: 'ghost' }, { k: 'end', ms: 80 }, { k: 'step', ms: 150 }]);
      const el = document.createElement('div');
      el.className = 'haunt-overlay';
      el.setAttribute('data-overlay-kind', 'ghost');
      w.root.append(el);
      expect(() => w.observe()).toThrow(/overlay in the page/);
      w.dispose();
    });
  });

  // Feature: ghost-dread, Property 24: Return-only features exist only inside a Return_Moment
  // **Validates: Requirements 5.11, 6.9, 9.7, 9.8**
  it('holds for any script of Return_Moment calls, overlays, glitches, time steps, normal ports, toggles and dispose', async () => {
    await fc.assert(
      fc.asyncProperty(scriptArb, async (script) => {
        const flags = await runScript(script, false, stats);
        tally.scripts++;
        for (const f of flags) tally[f]++;
      }),
      { numRuns: NUM_RUNS },
    );
    if (process.env.GD24_TALLY) console.info('GD24 tally', JSON.stringify(tally), 'bounds', JSON.stringify(stats));
    // The observed bounds, stated in the requirements' terms: gone within 100 ms of the end.
    expect(stats.maxSinceEnd).toBeLessThan(100);
  }, SLOW_TEST_MS);

  // Feature: ghost-dread, Property 24: Return-only features exist only inside a Return_Moment
  // **Validates: Requirements 3.2, 5.13, 9.8 (haunt-safety: a Return_Moment lasts at most 3 seconds)**
  it('no overlay and no return channel is present 3000 ms after its Return_Moment began', async () => {
    await fc.assert(
      fc.asyncProperty(scriptArb, async (script) => {
        await runScript(script, true, strictStats);
      }),
      { numRuns: NUM_RUNS },
    );
  }, SLOW_TEST_MS);

  // Runs after the property above: the tallies come from its scripts.
  it('coverage: the generated scripts contain every shape the property is about, with margin', () => {
    const n = tally.scripts;
    expect(n).toBe(NUM_RUNS);
    for (const f of FLAG_NAMES) expect(tally[f], `scripts with: ${f}`).toBeGreaterThanOrEqual(Math.floor(n * COVER[f]));
  });
});

/**
 * Share of scripts with each shape. Measured over 10 batches of 400 scripts (seeds 1000 to 1009); each floor is
 * more than 4 standard deviations below the measured mean (the margins are in the task report).
 */
const COVER: Record<FlagName, number> = {
  inGhost: 0.38, inJumpscare: 0.4, inCard: 0.38, inGlitch: 0.4, outGhost: 0.28, outJumpscare: 0.6, outCard: 0.25, outGlitch: 0.26,
  jumpChannel: 0.7, jumpRejected: 0.75, guardCross: 0.45, guardEndsWithEffects: 0.45, doubleEnd: 0.17, disposeMid: 0.09, reducedMoment: 0.2,
  normalTryJump: 0.3, secondBegin: 0.28, glitchOut: 0.65, glitchIn: 0.18, beginInFade: 0.18, staleLayerOp: 0.3, soundToggleJump: 0.4,
};
