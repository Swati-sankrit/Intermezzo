/**
 * Property 14: Mode switch keeps the signal.
 * **Validates: Requirements 9.2**
 */
import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { MIN_IDLE_LIMIT_MS } from '../config';
import { initialDecisionState, stepDecision } from '../decision';
import { initialFallbackState, stepFallback } from '../fallback';
import type { AttentionSignal } from '../types';
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
});
