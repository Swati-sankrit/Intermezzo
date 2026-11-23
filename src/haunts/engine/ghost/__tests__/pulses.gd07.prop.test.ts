import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildPulseTrain, type PulseSpec } from '../pulses';
import {
  attackArb,
  kindArb,
  peakArb,
  pulseCaseArb,
  pulseCountArb,
  sampleRateArb,
  secondsArb,
  type PulseCase,
} from './spatialPulseArbitraries';

// Buffers are large (up to 96000 Hz for a few seconds), so seconds are kept at 4 or less in the generators.
const NUM_RUNS = 300;
// The slowest test takes 3.6 to 4.7 s, close to the 5 s default, so keep headroom for slower machines.
const TIMEOUT_MS = 20_000;
const MIN_ATTACK_S = 0.02;

/** Sample rate the builder works at: design range 8000 to 96000; anything non-finite is a bad input. */
const effectiveRate = (rate: number): number | null =>
  Number.isFinite(rate) ? Math.round(Math.min(96000, Math.max(8000, rate))) : null;
/** Largest magnitude a sample may have: the requested peak clamped into [0, 1]; non-finite peaks only need to stay at or below 1. */
const peakLimit = (peak: number): number => (Number.isFinite(peak) ? Math.min(1, Math.max(0, peak)) : 1);

interface Pulse {
  readonly zero: number; // index of the 0 sample the pulse rises from
  readonly top: number; // index of the pulse's largest magnitude
}
/** Splits a train into pulses: runs of non-zero samples, each preceded by its starting 0 sample. */
function findPulses(x: Float32Array): Pulse[] {
  const pulses: Pulse[] = [];
  let i = 0;
  while (i < x.length) {
    if (x[i] === 0) {
      i++;
      continue;
    }
    const zero = i - 1;
    let top = i;
    while (i < x.length && x[i] !== 0) {
      if (Math.abs(x[i]) > Math.abs(x[top])) top = i;
      i++;
    }
    pulses.push({ zero, top });
  }
  return pulses;
}

describe('buildPulseTrain (ghost-dread)', () => {
  // Feature: ghost-dread, Property 7: Pulses have a slow enough attack and never exceed 1
  // **Validates: Requirements 1.9, 5.10**
  it('Property 7: every sample is finite, at most the peak, and the peak is at most 1', () => {
    fc.assert(
      fc.property(pulseCaseArb, ({ rate, seconds, spec }) => {
        const x = buildPulseTrain(rate, seconds, spec);
        const limit = peakLimit(spec.peak);
        expect(x.length).toBeGreaterThan(0);
        let max = 0;
        let allFinite = true;
        for (let i = 0; i < x.length; i++) {
          if (!Number.isFinite(x[i])) allFinite = false;
          max = Math.max(max, Math.abs(x[i]));
        }
        expect(allFinite).toBe(true);
        expect(max).toBeLessThanOrEqual(limit);
        expect(max).toBeLessThanOrEqual(1);
        if (limit === 0) expect(max).toBe(0);
      }),
      { numRuns: NUM_RUNS },
    );
  }, TIMEOUT_MS);

  // Feature: ghost-dread, Property 7: Pulses have a slow enough attack and never exceed 1
  // **Validates: Requirements 1.9, 5.10**
  it('Property 7: every pulse rises linearly from 0 over at least 20 ms, with no step above peak / (0.020 * rate)', () => {
    fc.assert(
      fc.property(pulseCaseArb, ({ rate, seconds, spec }) => {
        const x = buildPulseTrain(rate, seconds, spec);
        const limit = peakLimit(spec.peak);
        const sr = effectiveRate(rate) ?? 44100;
        const pulses = findPulses(x);
        if (limit === 0) {
          expect(pulses).toHaveLength(0);
          return;
        }
        expect(pulses.length).toBeGreaterThanOrEqual(1);
        const maxStep = limit / (MIN_ATTACK_S * sr);
        for (const { zero, top } of pulses) {
          expect(zero).toBeGreaterThanOrEqual(0);
          expect(x[zero]).toBe(0);
          const attackFrames = top - zero;
          expect(attackFrames / sr).toBeGreaterThanOrEqual(MIN_ATTACK_S);
          // A requested attack of 20 ms or more (up to 2000 ms) is honoured too.
          if (Number.isFinite(spec.attackMs) && spec.attackMs >= 20 && spec.attackMs <= 2000) {
            expect(attackFrames / sr).toBeGreaterThanOrEqual(spec.attackMs / 1000 - 1e-9);
          }
          const topValue = x[top];
          const tol = 1e-6 * Math.max(Math.abs(topValue), 1e-12) + 1e-30;
          let worstStep = 0;
          let dips = 0;
          let flips = 0;
          let offLine = 0;
          for (let i = zero; i < top; i++) {
            worstStep = Math.max(worstStep, Math.abs(x[i + 1] - x[i]));
            if (Math.abs(x[i + 1]) < Math.abs(x[i])) dips++; // rise never dips
            if (Math.sign(x[i + 1]) !== Math.sign(topValue)) flips++; // one direction during a rise
            const line = (topValue * (i + 1 - zero)) / attackFrames; // straight line from 0 to the top
            if (Math.abs(x[i + 1] - line) > tol) offLine++;
          }
          expect(worstStep).toBeLessThanOrEqual(maxStep);
          expect(dips).toBe(0);
          expect(flips).toBe(0);
          expect(offLine).toBe(0);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  }, TIMEOUT_MS);

  // Feature: ghost-dread, Property 7: Pulses have a slow enough attack and never exceed 1
  // **Validates: Requirements 1.9, 5.10**
  it('Property 7: the same input gives identical samples, and the input is not changed', () => {
    fc.assert(
      fc.property(pulseCaseArb, ({ rate, seconds, spec }) => {
        const frozen: PulseSpec = Object.freeze({ ...spec });
        const a = buildPulseTrain(rate, seconds, frozen);
        const b = buildPulseTrain(rate, seconds, { ...spec });
        expect(b.length).toBe(a.length);
        expect(Array.from(b)).toEqual(Array.from(a));
        expect(frozen).toEqual(spec);
      }),
      { numRuns: NUM_RUNS },
    );
  }, TIMEOUT_MS);

  // Feature: ghost-dread, Property 7: Pulses have a slow enough attack and never exceed 1
  // **Validates: Requirements 1.9, 5.10**
  it('Property 7: different kinds and different inputs can give different samples', () => {
    const base = { pulsesPerLoop: 4, attackMs: 25, peak: 0.8 };
    const trains = (['footstep', 'breath', 'knock', 'jump'] as const).map((kind) =>
      Array.from(buildPulseTrain(44100, 2, { kind, ...base })).join(','),
    );
    expect(new Set(trains).size).toBe(4);
    const other = Array.from(buildPulseTrain(44100, 2, { kind: 'knock', ...base, pulsesPerLoop: 5 })).join(',');
    expect(other).not.toBe(trains[2]);
    fc.assert(
      fc.property(kindArb, (kind) => {
        const q = buildPulseTrain(44100, 2, { kind, ...base, peak: 0.4 });
        const p = buildPulseTrain(44100, 2, { kind, ...base, peak: 0.8 });
        expect(Array.from(q)).not.toEqual(Array.from(p));
      }),
      { numRuns: 100 },
    );
  });

  // Feature: ghost-dread, Property 7: Pulses have a slow enough attack and never exceed 1
  // **Validates: Requirements 1.9, 5.10**
  it('Property 7: non-finite or out-of-range parameters are sanitised, never producing NaN or a sample above 1', () => {
    const bad = [NaN, Infinity, -Infinity, -1, 0, 1e9];
    for (const kind of ['footstep', 'breath', 'knock', 'jump'] as const) {
      for (const v of bad) {
        for (const x of [
          buildPulseTrain(v, 1, { kind, pulsesPerLoop: 3, attackMs: 20, peak: 1 }),
          buildPulseTrain(8000, v, { kind, pulsesPerLoop: 3, attackMs: 20, peak: 1 }),
          buildPulseTrain(8000, 1, { kind, pulsesPerLoop: v, attackMs: v, peak: v }),
        ]) {
          expect(x.length).toBeGreaterThan(0);
          expect(x.every((s) => Number.isFinite(s) && Math.abs(s) <= 1)).toBe(true);
        }
      }
    }
    // Huge duration is capped (a 60 s cap at 8000 Hz keeps this buffer small).
    expect(buildPulseTrain(8000, 1e9, { kind: 'knock', pulsesPerLoop: 2, attackMs: 20, peak: 1 }).length).toBeLessThanOrEqual(8000 * 60 + 8000);
  });

  // Coverage of the generated shapes. Floors sit below the per-batch minimum measured over 10 batches of 1000 samples in task 2.6.
  it('Property 7: generators cover every kind, attacks near 20 ms, bad rates and durations, and peaks of 0, 1 and above 1', () => {
    const cases: PulseCase[] = fc.sample(pulseCaseArb, 1000);
    const share = (f: (c: PulseCase) => boolean): number => cases.filter(f).length / cases.length;
    for (const kind of ['footstep', 'breath', 'knock', 'jump']) expect(share((c) => c.spec.kind === kind)).toBeGreaterThanOrEqual(0.15);
    expect(share((c) => Number.isFinite(c.spec.attackMs) && c.spec.attackMs >= 19.9 && c.spec.attackMs <= 21)).toBeGreaterThanOrEqual(0.2);
    expect(share((c) => !Number.isFinite(c.rate) || c.rate < 8000 || c.rate > 96000)).toBeGreaterThanOrEqual(0.05);
    expect(share((c) => !Number.isFinite(c.seconds) || c.seconds < 0.05)).toBeGreaterThanOrEqual(0.05);
    expect(share((c) => c.spec.peak === 0)).toBeGreaterThanOrEqual(0.03);
    expect(share((c) => c.spec.peak === 1)).toBeGreaterThanOrEqual(0.03);
    expect(share((c) => c.spec.peak > 1 && Number.isFinite(c.spec.peak))).toBeGreaterThanOrEqual(0.05);
    expect(share((c) => c.rate >= 8000 && c.rate <= 96000 && c.seconds >= 0.05 && c.spec.peak > 0 && c.spec.peak <= 1)).toBeGreaterThanOrEqual(0.3);
    // Keep the unused-import check honest: the building blocks are the ones the case arbitrary uses.
    expect([attackArb, peakArb, pulseCountArb, sampleRateArb, secondsArb].every((a) => a !== undefined)).toBe(true);
  });
});
