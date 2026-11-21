/**
 * Property 14: Mode switch keeps the signal.
 * **Validates: Requirements 9.2**
 */
import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { MIN_IDLE_LIMIT_MS } from '../config';
import { initialDecisionState, stepDecision } from '../decision';
import { initialFallbackState, stepFallback } from '../fallback';
import type { FallbackSample } from '../fallback';
import type { AttentionSignal, PoseSample, Thresholds } from '../types';
import { arbFallbackSequence } from './arbFallback';
import { arbPoseSample, arbRunSequence, arbThresholds } from './arbitraries';

const NUM_RUNS = 300;
const DEBOUNCE = 1500;
const IDLE_LIMIT = MIN_IDLE_LIMIT_MS;

const arbSignal: fc.Arbitrary<AttentionSignal> = fc.record({
  value: fc.constantFrom<'present' | 'away'>('present', 'away'),
  timestamp: fc.integer({ min: 0, max: 200_000 }),
});
/** Start times below, at, and above the signal's own timestamp are all covered. */
const arbStartT = fc.integer({ min: -1000, max: 250_000 });

/**
 * Walks `signals` (the signal after each step). Until the first step whose value
 * differs from `carried`, every signal must equal `carried` exactly. After that,
 * a signal may only change when its value changes.
 */
function expectKeepsUntilValueChange(
  carried: AttentionSignal,
  signals: readonly AttentionSignal[],
): void {
  let prev = carried;
  for (const next of signals) {
    if (next.value === prev.value) {
      expect(next).toEqual(prev);
    } else {
      expect(next.timestamp).toBeGreaterThanOrEqual(prev.timestamp);
    }
    prev = next;
  }
}

/** Folds the camera decision and returns the signal after every sample. */
function cameraSignals(
  state0: ReturnType<typeof initialDecisionState>,
  samples: Parameters<typeof stepDecision>[1][],
  th: Parameters<typeof stepDecision>[2]['thresholds'],
): AttentionSignal[] {
  const cfg = { thresholds: th, debounceMs: DEBOUNCE, returnMs: 1000 };
  let state = state0;
  return samples.map((s) => (state = stepDecision(state, s, cfg)).signal);
}

function fallbackSignals(
  state0: ReturnType<typeof initialFallbackState>,
  samples: Parameters<typeof stepFallback>[1][],
): AttentionSignal[] {
  const cfg = { debounceMs: DEBOUNCE, idleLimitMs: IDLE_LIMIT };
  let state = state0;
  return samples.map((s) => (state = stepFallback(state, s, cfg)).signal);
}

describe('Property 14: Mode switch keeps the signal', () => {
  it('both initial states hold the given signal, unchanged, for any start time', () => {
    fc.assert(
      fc.property(arbSignal, arbStartT, (signal, startT) => {
        const cam = initialDecisionState(startT, signal);
        const fb = initialFallbackState(startT, signal);
        expect(cam.signal).toEqual(signal);
        expect(fb.signal).toEqual(signal);
        expect(cam.lastT).toBe(Math.max(startT, signal.timestamp));
        expect(fb.lastT).toBe(Math.max(startT, signal.timestamp));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('camera -> fallback: the signal reached in camera mode survives the switch', () => {
    fc.assert(
      fc.property(
        arbRunSequence(DEBOUNCE, 'mixed'),
        arbFallbackSequence(DEBOUNCE, IDLE_LIMIT, 'mixed'),
        fc.integer({ min: -500, max: 5000 }),
        (cam, fb, switchOffset) => {
          const camSignals = cameraSignals(
            initialDecisionState(0),
            cam.samples,
            cam.thresholds,
          );
          const carried = camSignals.at(-1) ?? initialDecisionState(0).signal;
          const lastCamT = cam.samples.at(-1)?.t ?? 0;
          const switchT = Math.max(0, lastCamT + switchOffset);

          const start = initialFallbackState(switchT, carried);
          expect(start.signal).toEqual(carried);
          expectKeepsUntilValueChange(carried, fallbackSignals(start, fb.samples));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('fallback -> camera: the signal reached in fallback mode survives the switch', () => {
    fc.assert(
      fc.property(
        arbFallbackSequence(DEBOUNCE, IDLE_LIMIT, 'mixed'),
        arbThresholds.chain((th) =>
          fc.tuple(fc.constant(th), arbRunSequence(DEBOUNCE, 'mixed', th)),
        ),
        fc.integer({ min: -500, max: 5000 }),
        (fb, [th, cam], switchOffset) => {
          const fbSignals = fallbackSignals(initialFallbackState(fb.startT), fb.samples);
          const carried = fbSignals.at(-1) ?? initialFallbackState(fb.startT).signal;
          const lastFbT = fb.samples.at(-1)?.t ?? fb.startT;
          const switchT = Math.max(0, lastFbT + switchOffset);

          const start = initialDecisionState(switchT, carried);
          expect(start.signal).toEqual(carried);
          expectKeepsUntilValueChange(carried, cameraSignals(start, cam.samples, th));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('arbitrary carried signals and out-of-order camera samples keep the signal until the value changes', () => {
    fc.assert(
      fc.property(
        arbSignal,
        arbStartT,
        arbThresholds.chain((th) =>
          fc.tuple(fc.constant(th), arbPoseSample({ outOfOrder: true, thresholds: th })),
        ),
        (signal, startT, [th, samples]) => {
          const start = initialDecisionState(startT, signal);
          expectKeepsUntilValueChange(signal, cameraSignals(start, samples, th));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('arbitrary carried signals keep the signal through fallback sequences until the value changes', () => {
    fc.assert(
      fc.property(
        arbSignal,
        arbStartT,
        arbFallbackSequence(DEBOUNCE, IDLE_LIMIT, 'mixed'),
        (signal, startT, fb) => {
          const start = initialFallbackState(startT, signal);
          expectKeepsUntilValueChange(signal, fallbackSignals(start, fb.samples));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // ---- Reference-model tests (task 1.17) -------------------------------

  /** Independent reference: camera mode, same normalized config as the real step. */
  function modelCamera(
    carried: AttentionSignal,
    startT: number,
    samples: readonly PoseSample[],
    th: Thresholds,
  ): AttentionSignal[] {
    let value = carried.value;
    let ts = carried.timestamp;
    let lastT = Math.max(startT, carried.timestamp);
    let runStart: number | null = null;
    const out: AttentionSignal[] = [];
    for (const s of samples) {
      if (Number.isFinite(s.t) && s.t >= lastT) {
        lastT = s.t;
        const away =
          !s.tabActive ||
          !s.faceFound ||
          !Number.isFinite(s.yaw) ||
          !Number.isFinite(s.pitch) ||
          Math.abs(s.yaw - th.baselineYaw) > th.yawLimit ||
          Math.abs(s.pitch - th.baselinePitch) > th.pitchLimit;
        if (!away) {
          runStart = null;
          if (value === 'away') {
            value = 'present';
            ts = Math.max(s.t, ts);
          }
        } else {
          runStart ??= s.t;
          if (value === 'present' && s.t - runStart > DEBOUNCE) {
            value = 'away';
            ts = Math.max(s.t, ts);
          }
        }
      }
      out.push({ value, timestamp: ts });
    }
    return out;
  }

  /** Independent reference: fallback mode with Req 6.4 (away -> present needs active tab and no idle). */
  function modelFallback(
    carried: AttentionSignal,
    startT: number,
    samples: readonly FallbackSample[],
  ): AttentionSignal[] {
    let value = carried.value;
    let ts = carried.timestamp;
    let lastT = Math.max(startT, carried.timestamp);
    let hiddenSince: number | null = null;
    const out: AttentionSignal[] = [];
    for (const s of samples) {
      if (Number.isFinite(s.t) && s.t >= lastT) {
        lastT = s.t;
        hiddenSince = s.tabActive ? null : (hiddenSince ?? s.t);
        const hiddenTooLong = hiddenSince !== null && s.t - hiddenSince > DEBOUNCE;
        const idle = Number.isFinite(s.lastInputT) && s.t - s.lastInputT > IDLE_LIMIT;
        if (value === 'present' && (hiddenTooLong || idle)) {
          value = 'away';
          ts = Math.max(s.t, ts);
        } else if (value === 'away' && s.tabActive && !idle) {
          value = 'present';
          ts = Math.max(s.t, ts);
        }
      }
      out.push({ value, timestamp: ts });
    }
    return out;
  }

  /** Each signal must equal the model's; the carried signal must hold until the model changes it. */
  function expectMatchesModel(
    carried: AttentionSignal,
    real: readonly AttentionSignal[],
    model: readonly AttentionSignal[],
  ): boolean {
    expect(real).toEqual(model);
    let prev = carried;
    let flipped = false;
    for (const sig of real) {
      if (sig.value === prev.value) expect(sig).toEqual(prev);
      else flipped = true;
      prev = sig;
    }
    return flipped;
  }

  const shiftPose = (xs: PoseSample[], first: number): PoseSample[] =>
    xs.length === 0 ? xs : xs.map((x) => ({ ...x, t: x.t - xs[0].t + first }));
  const shiftFb = (xs: FallbackSample[], first: number): FallbackSample[] =>
    xs.length === 0
      ? xs
      : xs.map((x) => ({
          ...x,
          t: x.t - xs[0].t + first,
          lastInputT: x.lastInputT - xs[0].t + first,
        }));

  const tally = {
    camToFb: { cases: 0, flips: 0, carriedAway: 0, carriedAwayFlips: 0, carriedPresent: 0, carriedPresentFlips: 0 },
    fbToCam: { cases: 0, flips: 0, carriedAway: 0, carriedAwayFlips: 0, carriedPresent: 0, carriedPresentFlips: 0 },
  };
  type Tally = (typeof tally)['camToFb'];
  function record(t: Tally, carried: AttentionSignal, flipped: boolean): void {
    t.cases++;
    if (flipped) t.flips++;
    if (carried.value === 'away') {
      t.carriedAway++;
      if (flipped) t.carriedAwayFlips++;
    } else {
      t.carriedPresent++;
      if (flipped) t.carriedPresentFlips++;
    }
  }

  it('camera -> fallback: every step matches the reference models, and the value flips in at least 30% of cases', () => {
    fc.assert(
      fc.property(
        arbRunSequence(DEBOUNCE, 'mixed'),
        arbFallbackSequence(DEBOUNCE, IDLE_LIMIT, 'mixed'),
        fc.integer({ min: 0, max: 5000 }),
        fc.integer({ min: -300, max: 300 }),
        (cam, fb, switchGap, firstDelta) => {
          const camReal = cameraSignals(initialDecisionState(0), cam.samples, cam.thresholds);
          const camModel = modelCamera({ value: 'present', timestamp: 0 }, 0, cam.samples, cam.thresholds);
          expect(camReal).toEqual(camModel);
          const carried = camReal.at(-1) ?? { value: 'present' as const, timestamp: 0 };
          const switchT = (cam.samples.at(-1)?.t ?? 0) + switchGap;
          const base = Math.max(switchT, carried.timestamp);
          const samples = shiftFb(fb.samples, Math.max(0, base + firstDelta));

          const real = fallbackSignals(initialFallbackState(switchT, carried), samples);
          const model = modelFallback(carried, switchT, samples);
          record(tally.camToFb, carried, expectMatchesModel(carried, real, model));
        },
      ),
      { numRuns: NUM_RUNS },
    );
    const t = tally.camToFb;
    expect(t.cases).toBe(NUM_RUNS);
    expect(t.flips / t.cases).toBeGreaterThanOrEqual(0.3);
    console.log('P14 camera->fallback flips', JSON.stringify(t));
  });

  it('fallback -> camera: every step matches the reference models, and the value flips in at least 30% of cases', () => {
    fc.assert(
      fc.property(
        arbFallbackSequence(DEBOUNCE, IDLE_LIMIT, 'mixed'),
        arbThresholds.chain((th) =>
          fc.tuple(fc.constant(th), arbRunSequence(DEBOUNCE, 'mixed', th)),
        ),
        fc.integer({ min: 0, max: 5000 }),
        fc.integer({ min: -300, max: 300 }),
        (fb, [th, cam], switchGap, firstDelta) => {
          const start = { value: 'present' as const, timestamp: fb.startT };
          const fbReal = fallbackSignals(initialFallbackState(fb.startT), fb.samples);
          const fbModel = modelFallback(start, fb.startT, fb.samples);
          expect(fbReal).toEqual(fbModel);
          const carried = fbReal.at(-1) ?? start;
          const switchT = (fb.samples.at(-1)?.t ?? fb.startT) + switchGap;
          const base = Math.max(switchT, carried.timestamp);
          const samples = shiftPose(cam.samples, Math.max(0, base + firstDelta));

          const real = cameraSignals(initialDecisionState(switchT, carried), samples, th);
          const model = modelCamera(carried, switchT, samples, th);
          record(tally.fbToCam, carried, expectMatchesModel(carried, real, model));
        },
      ),
      { numRuns: NUM_RUNS },
    );
    const t = tally.fbToCam;
    expect(t.cases).toBe(NUM_RUNS);
    expect(t.flips / t.cases).toBeGreaterThanOrEqual(0.3);
    console.log('P14 fallback->camera flips', JSON.stringify(t));
  });

  it('arbitrary carried signals match the reference models in both modes', () => {
    fc.assert(
      fc.property(
        arbSignal,
        arbStartT,
        arbFallbackSequence(DEBOUNCE, IDLE_LIMIT, 'mixed'),
        (carried, startT, fb) => {
          const real = fallbackSignals(initialFallbackState(startT, carried), fb.samples);
          expectMatchesModel(carried, real, modelFallback(carried, startT, fb.samples));
        },
      ),
      { numRuns: NUM_RUNS },
    );
    fc.assert(
      fc.property(
        arbSignal,
        arbStartT,
        arbThresholds.chain((th) =>
          fc.tuple(fc.constant(th), arbPoseSample({ outOfOrder: true, thresholds: th })),
        ),
        (carried, startT, [th, samples]) => {
          const real = cameraSignals(initialDecisionState(startT, carried), samples, th);
          expectMatchesModel(carried, real, modelCamera(carried, startT, samples, th));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('example: carried away stays away on a hidden sample inside the debounce, then present on an active, non-idle sample', () => {
    const cfg = { debounceMs: DEBOUNCE, idleLimitMs: IDLE_LIMIT };
    const carried: AttentionSignal = { value: 'away', timestamp: 1000 };
    let state = initialFallbackState(1000, carried);

    state = stepFallback(state, { t: 2000, tabActive: false, lastInputT: 1900 }, cfg);
    expect(state.signal).toEqual(carried);

    state = stepFallback(state, { t: 2100, tabActive: true, lastInputT: 2050 }, cfg);
    expect(state.signal).toEqual({ value: 'present', timestamp: 2100 });
  });

  it('example: carried away stays away on an active but idle sample', () => {
    const cfg = { debounceMs: DEBOUNCE, idleLimitMs: IDLE_LIMIT };
    const carried: AttentionSignal = { value: 'away', timestamp: 1000 };
    const state = stepFallback(
      initialFallbackState(1000, carried),
      { t: 70_000, tabActive: true, lastInputT: 0 },
      cfg,
    );
    expect(state.signal).toEqual(carried);
  });
});
