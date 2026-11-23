/**
 * Property 23 (ghost-dread): the real gate and the real audio adapter, against the fake AudioContext from
 * ./fakes.ts, with spatial-panner chains, Return_Moment jump channels, cap changes, sound toggles,
 * lock and unlock, reduced motion, fades and time steps in any order.
 *
 * Files: gateCapScript.ts (the scripts), gateCapWorld.ts (the actions and the spec-side model of the
 * Return_Moment and the cap), gateCapChecks.ts (the checks), gateCapRef.ts (gain replayed from the recorded
 * automation, the only source of gain numbers), gateCapRun.ts (runs one script).
 *
 * Checked at every action and every timer stop, on the forward schedule: every automation boundary, both
 * sides of it, midpoints, cap-window edges and a 10 ms grid over the next 1.5 s.
 *  - combined gain <= the highest cap in force during the previous 50 ms (+1e-9, as in the existing cap
 *    property). The 50 ms window ends before the 100 ms of Req 9.5, so a new cap lands within 100 ms.
 *  - non-jump rises last >= 300 ms (>= 1000 ms reduced); jump rises >= 20 ms (>= 300 ms reduced).
 *  - a jump rise targets at most cap minus the other channels' gain at that moment.
 *  - openReturn is null exactly outside a Return_Moment; a rejected jump channel makes no node; a
 *    Return_Moment's channels are disconnected within 100 ms of its end (3000 ms guard included).
 *  - a fade-out starts with no upward step and reaches 0 within 800 ms.
 *  - panner position changes add no gain automation and change no combined gain, and every path from a
 *    spatial source to the destination runs through the port's channel gain.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { verify } from './gateCapChecks';
import { allowedAt, capAt, makeRef } from './gateCapRef';
import { runScenario } from './gateCapRun';
import { scenarioArb } from './gateCapScript';
import { FLAG_NAMES, World, type FlagName } from './gateCapWorld';
import { FakeAudioContext, createFakeTime } from './fakes';

const NUM_RUNS = 500;
/**
 * Explicit timeout for the 500-script property test. Measured with --reporter=verbose: 2.0 s alone (1986 ms),
 * 4.3 s inside the src/haunts folder run, and 5.6 s once inside a full-folder run (it timed out at the default
 * 5000 ms). The vitest default is too close to these times under parallel load.
 */
const SLOW_TEST_MS = 20_000;

const tally: Record<FlagName | 'scenarios', number> = Object.fromEntries(
  ['scenarios', ...FLAG_NAMES].map((k) => [k, 0]),
) as Record<FlagName | 'scenarios', number>;

async function liveWorld(): Promise<World> {
  const w = new World({ capText: '0.4', soundOn: true, osReduced: false, unlockAtStart: true, steps: [] });
  w.unlockTarget.dispatchEvent(new Event('pointerdown'));
  for (let i = 0; i < 8; i++) await Promise.resolve();
  return w;
}

describe('Property 23: the cap with spatial layers and a jump channel', () => {
  describe('control: the checks detect what they are meant to detect', () => {
    it('reference: sums connected channels only and honours the 50 ms window after a cap drop', () => {
      const { clock } = createFakeTime();
      const ctx = new FakeAudioContext({ clock });
      const master = ctx.createGain();
      const compressor = ctx.createDynamicsCompressor();
      master.connect(compressor);
      compressor.connect(ctx.destination);
      const a = ctx.createGain();
      const b = ctx.createGain();
      a.connect(master);
      b.connect(master);
      a.gain.setValueAtTime(0.1, 0);
      b.gain.setValueAtTime(0.25, 0);
      expect(makeRef(ctx).combined(0.5)).toBeCloseTo(0.35, 12);
      b.disconnect(master);
      expect(makeRef(ctx).combined(0.5)).toBeCloseTo(0.1, 12);
      const h = { base: 0.5, changes: [{ t: 1, cap: 0.2 }] };
      expect(capAt(h, 1.03)).toBe(0.2);
      expect(allowedAt(h, 1.03)).toBe(0.5);
      expect(allowedAt(h, 1.06)).toBe(0.2);
    });

    it('flags a channel gain above the cap', async () => {
      const w = await liveWorld();
      await w.perform({ k: 'open' });
      await w.perform({ k: 'setGain', who: 0, v: 0.2 });
      await w.advance(400, () => undefined);
      expect(() => verify(w)).not.toThrow();
      const node = w.ports[0].node;
      const ctx = w.ctx();
      if (node === null || ctx === undefined) throw new Error('expected a live channel');
      node.gain.cancelScheduledValues(ctx.currentTime);
      node.gain.setValueAtTime(0.9, ctx.currentTime);
      expect(() => verify(w)).toThrow(/combined gain/);
      w.dispose();
    });

    it('flags a 20 ms rise on a normal channel and a 5 ms rise on a jump channel', async () => {
      const w = await liveWorld();
      await w.perform({ k: 'open' });
      await w.perform({ k: 'rBegin' });
      await w.perform({ k: 'rOpen', jump: true });
      verify(w);
      const ctx = w.ctx();
      const [normal, jump] = [w.ports[0].node, w.ports[1].node];
      if (normal === null || jump === null || ctx === undefined) throw new Error('expected two live channels');
      const t = ctx.currentTime;
      normal.gain.cancelScheduledValues(t);
      normal.gain.setValueAtTime(0, t);
      normal.gain.linearRampToValueAtTime(0.1, t + 0.02);
      expect(() => verify(w)).toThrow(/rise/);
      jump.gain.cancelScheduledValues(t);
      jump.gain.setValueAtTime(0, t);
      jump.gain.linearRampToValueAtTime(0.1, t + 0.005);
      expect(() => verify(w)).toThrow(/rise/);
      w.dispose();
    });

    it('flags a jump target above the headroom, and a jump channel still connected after its Return_Moment', async () => {
      const w = await liveWorld();
      await w.perform({ k: 'open' });
      await w.perform({ k: 'setGain', who: 0, v: 0.3 });
      await w.advance(400, () => undefined);
      await w.perform({ k: 'rBegin' });
      await w.perform({ k: 'rOpen', jump: true });
      verify(w);
      const ctx = w.ctx();
      const jump = w.ports[1].node;
      const master = ctx === undefined ? null : makeRef(ctx).master;
      if (jump === null || ctx === undefined || master === null) throw new Error('expected a live jump channel');
      const t = ctx.currentTime;
      jump.gain.cancelScheduledValues(t);
      jump.gain.setValueAtTime(0, t);
      jump.gain.linearRampToValueAtTime(0.3, t + 0.02); // only 0.1 of the 0.4 cap is free
      expect(() => verify(w)).toThrow(/jump target|combined gain/);
      const w2 = await liveWorld();
      await w2.perform({ k: 'rBegin' });
      await w2.perform({ k: 'rOpen', jump: true });
      await w2.perform({ k: 'rEnd', ms: 80 });
      await w2.advance(150, () => undefined);
      verify(w2);
      const c2 = w2.ctx();
      const j2 = w2.ports[0].node;
      const m2 = c2 === undefined ? null : makeRef(c2).master;
      if (j2 === null || m2 === null) throw new Error('expected a live jump channel');
      j2.connect(m2);
      expect(() => verify(w2)).toThrow(/still connected/);
      w.dispose();
      w2.dispose();
    });

    it('flags a spatial source wired around the port channel', async () => {
      const w = await liveWorld();
      await w.perform({ k: 'open' });
      await w.perform({ k: 'setGain', who: 0, v: 0.2 });
      await w.perform({ k: 'panner', who: 0 });
      await w.advance(400, () => undefined);
      verify(w);
      const ctx = w.ctx();
      if (ctx === undefined || w.ports[0].panners.length === 0) throw new Error('expected a spatial chain');
      const master = makeRef(ctx).master;
      if (master === null) throw new Error('expected a master gain');
      const stray = ctx.createPanner();
      stray.connect(master);
      w.ports[0].panners.push({ ...w.ports[0].panners[0], raw: stray });
      expect(() => verify(w)).toThrow(/panner/);
      w.dispose();
    });
  });

  // Feature: ghost-dread, Property 23: Combined gain stays at or below the cap with spatial layers and a jump channel
  // **Validates: Requirements 1.7, 1.8, 1.12, 1.16, 5.10, 9.4, 9.5, 9.6, 9.7, 13.7**
  it('holds for any script of opens, jump channels, cap changes, sound toggles, locks, reduced-motion toggles, fades and time steps', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (s) => {
        const flags = await runScenario(s);
        tally.scenarios++;
        for (const f of flags) tally[f]++;
      }),
      { numRuns: NUM_RUNS },
    );
  }, SLOW_TEST_MS);

  // Runs after the property above: the tallies come from its scripts.
  it('coverage: the generated scripts contain every shape the property is about, with margin', () => {
    const floor = (n: number, p: number): number => Math.max(1, Math.floor(n * p - 4 * Math.sqrt(n * p * (1 - p))));
    const n = tally.scenarios;
    expect(n).toBe(NUM_RUNS);
    if (process.env.GD23_TALLY) console.info('GD23 tally', JSON.stringify(tally));
    for (const f of FLAG_NAMES) expect(tally[f], `scripts with: ${f}`).toBeGreaterThanOrEqual(floor(n, COVER[f]));
  });
});

/** Share of scripts with each shape, from the measurement in docs/BUILD_LOG.md (10 batches of 500). */
const COVER: Record<FlagName, number> = {
  jumpRise: 0.25, jumpPlaying: 0.25, capLow: 0.3, capHigh: 0.25, reducedJump: 0.12, soundToggleJump: 0.12, spatial: 0.85,
  several: 0.04, endWhileRising: 0.08, pannerMoved: 0.4, capChangeJump: 0.09,
};
