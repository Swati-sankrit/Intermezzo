import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { scaleGains } from '../gate/plan';
import { capArb, gainRequestsArb } from './arbitraries';

const NUM_RUNS = 300;
const EPS = 1e-9;
const RATIO_FLOOR = 1e-200;

/** Independent model of the clamp step: non-finite and negative become 0, then at most cap. */
const clampedOf = (gain: number, cap: number): number =>
  Number.isFinite(gain) && gain > 0 ? Math.min(gain, cap) : 0;

const inputArb = fc.tuple(gainRequestsArb, capArb);

describe('Safety_Gate scaleGains: combined gain never exceeds the Volume_Cap', () => {
  // Feature: haunt-feature, Property 9: Combined gain never exceeds the Volume_Cap
  // **Validates: Requirements 6.2, 6.6, 6.17**
  it('Property 9: each gain is in [0, cap] and the sum is at most cap', () => {
    fc.assert(
      fc.property(inputArb, ([requests, cap]) => {
        const out = scaleGains(requests, cap);
        let sum = 0;
        for (const r of out) {
          expect(Number.isFinite(r.gain)).toBe(true);
          expect(r.gain).toBeGreaterThanOrEqual(0);
          expect(r.gain).toBeLessThanOrEqual(cap);
          sum += r.gain;
        }
        expect(sum).toBeLessThanOrEqual(cap + EPS);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 9: Combined gain never exceeds the Volume_Cap
  // **Validates: Requirements 6.2, 6.6, 6.17**
  it('Property 9: keys and order are kept, and no gain is raised above its clamped request', () => {
    fc.assert(
      fc.property(inputArb, ([requests, cap]) => {
        const out = scaleGains(requests, cap);
        expect(out.map((r) => r.key)).toEqual(requests.map((r) => r.key));
        out.forEach((r, i) => {
          expect(r.gain).toBeLessThanOrEqual(clampedOf(requests[i].gain, cap));
        });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 9: Combined gain never exceeds the Volume_Cap
  // **Validates: Requirements 6.2, 6.6, 6.17**
  it('Property 9: when the clamped sum exceeds the cap, the scaled sum equals the cap', () => {
    fc.assert(
      fc.property(inputArb, ([requests, cap]) => {
        const clamped = requests.map((r) => clampedOf(r.gain, cap));
        const clampedSum = clamped.reduce((a, b) => a + b, 0);
        fc.pre(clampedSum > cap);
        const sum = scaleGains(requests, cap).reduce((a, r) => a + r.gain, 0);
        expect(Math.abs(sum - cap)).toBeLessThanOrEqual(EPS);
      }),
      { numRuns: NUM_RUNS, maxSkipsPerRun: 1000 },
    );
  });

  // Feature: haunt-feature, Property 9: Combined gain never exceeds the Volume_Cap
  // **Validates: Requirements 6.2, 6.6, 6.17**
  it('Property 9: when the clamped sum fits under the cap, gains equal the clamped requests', () => {
    fc.assert(
      fc.property(inputArb, ([requests, cap]) => {
        const clamped = requests.map((r) => clampedOf(r.gain, cap));
        fc.pre(clamped.reduce((a, b) => a + b, 0) <= cap);
        const out = scaleGains(requests, cap);
        expect(out.map((r) => r.gain)).toEqual(clamped);
      }),
      { numRuns: NUM_RUNS, maxSkipsPerRun: 1000 },
    );
  });

  // Feature: haunt-feature, Property 9: Combined gain never exceeds the Volume_Cap
  // **Validates: Requirements 6.2, 6.6, 6.17**
  it('Property 9: the ratio between any two non-zero gains matches their clamped requests', () => {
    fc.assert(
      fc.property(inputArb, ([requests, cap]) => {
        const out = scaleGains(requests, cap);
        for (let i = 0; i < out.length; i++) {
          for (let j = i + 1; j < out.length; j++) {
            if (out[i].gain === 0 || out[j].gain === 0) continue;
            const ci = clampedOf(requests[i].gain, cap);
            const cj = clampedOf(requests[j].gain, cap);
            // Ratio is only compared for gains >= RATIO_FLOOR. Subnormal doubles (e.g. 5e-324)
            // lose precision when scaled (5e-324 * ~0.5 rounds back to 5e-324), which shifts the
            // ratio by ~2x. This is floating-point underflow, not a scaleGains defect. Real gains
            // are in 0..1. Cap and sum guarantees are still checked for all values elsewhere.
            if (ci < RATIO_FLOOR || cj < RATIO_FLOOR) continue;
            const before = ci / cj;
            const after = out[i].gain / out[j].gain;
            expect(Math.abs(after - before)).toBeLessThanOrEqual(1e-9 * Math.max(1, before));
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 9: Combined gain never exceeds the Volume_Cap
  // **Validates: Requirements 6.2, 6.6, 6.17**
  it('Property 9: generated inputs cover both the over-cap and under-cap regions', () => {
    const seen = { runs: 0, over: 0, under: 0, hostile: 0, singleOverCap: 0 };
    fc.assert(
      fc.property(inputArb, ([requests, cap]) => {
        seen.runs++;
        const clampedSum = requests.reduce((a, r) => a + clampedOf(r.gain, cap), 0);
        if (clampedSum > cap) seen.over++;
        else seen.under++;
        if (requests.some((r) => !Number.isFinite(r.gain) || r.gain < 0)) seen.hostile++;
        if (requests.some((r) => r.gain > cap)) seen.singleOverCap++;
      }),
      { numRuns: NUM_RUNS },
    );
    const msg = JSON.stringify(seen);
    expect(seen.over, `over cap: ${msg}`).toBeGreaterThanOrEqual(seen.runs * 0.15);
    expect(seen.under, `under cap: ${msg}`).toBeGreaterThanOrEqual(seen.runs * 0.15);
    expect(seen.hostile, `negative/NaN/infinite: ${msg}`).toBeGreaterThanOrEqual(seen.runs * 0.15);
    expect(seen.singleOverCap, `single request above cap: ${msg}`).toBeGreaterThanOrEqual(seen.runs * 0.15);
  });
});
