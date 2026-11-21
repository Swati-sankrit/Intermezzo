/**
 * Property 7: Non-finite angles behave as no face found.
 * **Validates: Requirements 4.12**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decide, initialDecisionState, isAwaySample, stepDecision } from '../decision';
import type { DecisionState } from '../decision';
import type { DecisionConfig, PoseSample } from '../types';
import { arbPoseSample, arbThresholds } from './arbitraries';

const arbConfig: fc.Arbitrary<DecisionConfig> = fc.record({
  thresholds: arbThresholds,
  debounceMs: fc.integer({ min: 0, max: 5000 }),
  returnMs: fc.integer({ min: 0, max: 5000 }),
});

const arbNonFinite = fc.constantFrom(NaN, Infinity, -Infinity);

/** A sequence, one position in it, which angle(s) to corrupt, and the bad value. */
const arbCase = fc
  .tuple(
    arbPoseSample({ outOfOrder: true }).filter((s) => s.length > 0),
    arbConfig,
    fc.integer({ min: 0, max: 100_000 }),
    fc.nat(),
    fc.constantFrom<'yaw' | 'pitch' | 'both'>('yaw', 'pitch', 'both'),
    arbNonFinite,
    arbNonFinite,
  )
  .map(([samples, cfg, startT, pos, which, badYaw, badPitch]) => ({
    samples,
    cfg,
    startT,
    index: pos % samples.length,
    which,
    badYaw,
    badPitch,
  }));

interface Case {
  samples: PoseSample[];
  cfg: DecisionConfig;
  startT: number;
  index: number;
  which: 'yaw' | 'pitch' | 'both';
  badYaw: number;
  badPitch: number;
}

/** Corrupt the chosen angle(s) at `index`, and a twin with `faceFound: false` instead. */
function build(c: Case): { corrupted: PoseSample[]; noFace: PoseSample[] } {
  const orig = c.samples[c.index];
  const bad: PoseSample = {
    ...orig,
    yaw: c.which === 'pitch' ? orig.yaw : c.badYaw,
    pitch: c.which === 'yaw' ? orig.pitch : c.badPitch,
  };
  const twin: PoseSample = { ...orig, faceFound: false };
  const withAt = (s: PoseSample) => c.samples.map((x, i) => (i === c.index ? s : x));
  return { corrupted: withAt(bad), noFace: withAt(twin) };
}

function foldStates(samples: readonly PoseSample[], c: Case): DecisionState[] {
  const states: DecisionState[] = [];
  let state = initialDecisionState(c.startT);
  for (const s of samples) {
    state = stepDecision(state, s, c.cfg);
    states.push(state);
  }
  return states;
}

describe('Property 7: non-finite angles behave as no face found', () => {
  it('a Facing-looking sample with a non-finite angle is Away', () => {
    fc.assert(
      fc.property(arbCase, (c) => {
        const { corrupted } = build(c);
        const s = { ...corrupted[c.index], faceFound: true, tabActive: true };
        expect(isAwaySample(s, c.cfg.thresholds)).toBe(true);
        expect(isAwaySample({ ...s, faceFound: false }, c.cfg.thresholds)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it('every intermediate decision state matches the faceFound:false twin', () => {
    fc.assert(
      fc.property(arbCase, (c) => {
        const { corrupted, noFace } = build(c);
        expect(foldStates(corrupted, c)).toEqual(foldStates(noFace, c));
      }),
      { numRuns: 500 },
    );
  });

  it('decide returns the same final signal as the faceFound:false twin', () => {
    fc.assert(
      fc.property(arbCase, (c) => {
        const { corrupted, noFace } = build(c);
        expect(decide(corrupted, c.cfg, c.startT)).toEqual(decide(noFace, c.cfg, c.startT));
      }),
      { numRuns: 500 },
    );
  });
});
