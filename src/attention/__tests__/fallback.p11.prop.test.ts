/**
 * Feature: attention-signal, Property 11: Fallback away and return rules
 *
 * **Validates: Requirements 6.2, 6.3, 6.4, 6.7**
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  decideFallback,
  initialFallbackState,
  stepFallback,
  type FallbackConfig,
  type FallbackSample,
} from '../fallback';
import type { AttentionSignal } from '../types';
import { arbFallbackSequence, type FallbackRun } from './arbFallback';

const NUM_RUNS = 500;

const arbConfig = fc.record({
  debounceMs: fc.integer({ min: 500, max: 5000 }),
  idleLimitMs: fc.integer({ min: 60_000, max: 120_000 }),
});

const arbAboveCase = arbConfig.chain((cfg) =>
  fc.tuple(fc.constant(cfg), arbFallbackSequence(cfg.debounceMs, cfg.idleLimitMs, 'above')),
);

/** Signal after each sample (index i is the state after samples[i]). */
function trace(
  samples: readonly FallbackSample[],
  cfg: FallbackConfig,
  startT: number,
): AttentionSignal[] {
  let state = initialFallbackState(startT);
  const out: AttentionSignal[] = [];
  for (const s of samples) {
    state = stepFallback(state, s, cfg);
    out.push(state.signal);
  }
  return out;
}

/** Index of the first sample in the run that crosses its away condition. */
function firstAwayIndex(
  samples: readonly FallbackSample[],
  run: FallbackRun,
  cfg: FallbackConfig,
): number {
  for (let i = run.firstIndex; i <= run.lastIndex; i++) {
    const s = samples[i];
    const away =
      run.kind === 'hidden'
        ? s.t - run.firstT > cfg.debounceMs
        : s.t - s.lastInputT > cfg.idleLimitMs;
    if (away) return i;
  }
  return -1;
}

describe('Property 11: Fallback away and return rules', () => {
  it('away at the first sample past the limit, stays away through the run, present on the next active sample', () => {
    fc.assert(
      fc.property(arbAboveCase, ([cfg, seq]) => {
        const sig = trace(seq.samples, cfg, seq.startT);
        for (const run of seq.runs) {
          const k = firstAwayIndex(seq.samples, run, cfg);
          expect(k).toBeGreaterThanOrEqual(run.firstIndex);
          // Before the crossing: present (6.2 / 6.3: not away yet, limit is strict).
          for (let i = run.firstIndex; i < k; i++) expect(sig[i].value).toBe('present');
          // Crossing sample: away, stamped with that sample's t.
          expect(sig[k]).toEqual({ value: 'away', timestamp: seq.samples[k].t });
          // Away persists for the rest of the run (6.4 persistence).
          for (let i = k; i <= run.lastIndex; i++) {
            expect(sig[i].value).toBe('away');
            expect(sig[i].timestamp).toBe(seq.samples[k].t);
          }
          // Next sample is active with fresh input: present, stamped with its t.
          const back = run.lastIndex + 1;
          expect(seq.samples[back].tabActive).toBe(true);
          expect(seq.samples[back].t - seq.samples[back].lastInputT).toBe(0);
          expect(sig[back]).toEqual({ value: 'present', timestamp: seq.samples[back].t });
        }
        // decideFallback agrees with the fold.
        expect(decideFallback(seq.samples, cfg, seq.startT)).toEqual(sig[sig.length - 1]);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('idle is strict: exactly the limit is present, one ms over is away immediately', () => {
    fc.assert(
      fc.property(
        arbConfig,
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        (cfg, inputT, extra) => {
          const at: FallbackSample = {
            t: inputT + cfg.idleLimitMs,
            tabActive: true,
            lastInputT: inputT,
          };
          const over: FallbackSample = { ...at, t: at.t + 1 + extra };
          expect(decideFallback([at], cfg, inputT).value).toBe('present');
          expect(decideFallback([over], cfg, inputT)).toEqual({
            value: 'away',
            timestamp: over.t,
          });
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('after away, an active tab that is still idle stays away; the first active non-idle sample gives present', () => {
    fc.assert(
      fc.property(
        arbConfig,
        fc.integer({ min: 0, max: 100_000 }),
        fc.array(fc.integer({ min: 1, max: 5000 }), { minLength: 1, maxLength: 8 }),
        fc.integer({ min: 0, max: 5000 }),
        (cfg, startT, gaps, freshAfter) => {
          const inputT = startT;
          // Hidden for longer than the debounce, giving away.
          let t = startT + 1;
          const samples: FallbackSample[] = [
            { t, tabActive: false, lastInputT: inputT },
            { t: t + cfg.debounceMs + 1, tabActive: false, lastInputT: inputT },
          ];
          t += cfg.debounceMs + 1;
          // Tab comes back but input is older than the idle limit: still away.
          t = Math.max(t, inputT + cfg.idleLimitMs + 1);
          const idleIdx: number[] = [];
          for (const g of gaps) {
            t += g;
            idleIdx.push(samples.length);
            samples.push({ t, tabActive: true, lastInputT: inputT });
          }
          // Fresh input within the limit: present at this sample's t.
          t += freshAfter;
          const fresh: FallbackSample = { t, tabActive: true, lastInputT: t - freshAfter };
          samples.push(fresh);

          const sig = trace(samples, cfg, startT);
          expect(sig[1].value).toBe('away');
          for (const i of idleIdx) expect(sig[i].value).toBe('away');
          const last = sig[sig.length - 1];
          expect(last).toEqual({ value: 'present', timestamp: fresh.t });
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('return timestamp is max(t, current timestamp)', () => {
    fc.assert(
      fc.property(
        arbConfig,
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 0, max: 10_000 }),
        (cfg, awayT, delta) => {
          const from: AttentionSignal = { value: 'away', timestamp: awayT };
          const state = initialFallbackState(awayT, from);
          const s: FallbackSample = { t: awayT + delta, tabActive: true, lastInputT: awayT + delta };
          const next = stepFallback(state, s, cfg);
          expect(next.signal).toEqual({
            value: 'present',
            timestamp: Math.max(s.t, from.timestamp),
          });
          // A sample earlier than the current timestamp is ignored (state unchanged).
          if (awayT > 0) {
            const stale: FallbackSample = { t: awayT - 1, tabActive: true, lastInputT: awayT - 1 };
            expect(stepFallback(state, stale, cfg)).toBe(state);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('is deterministic and does not mutate its inputs (6.7)', () => {
    fc.assert(
      fc.property(
        arbConfig.chain((cfg) =>
          fc.tuple(
            fc.constant(cfg),
            fc
              .constantFrom<'below' | 'at' | 'above' | 'mixed'>('below', 'at', 'above', 'mixed')
              .chain((mode) => arbFallbackSequence(cfg.debounceMs, cfg.idleLimitMs, mode)),
          ),
        ),
        ([cfg, seq]) => {
          const snapshot = JSON.stringify(seq.samples);
          const cfgSnapshot = JSON.stringify(cfg);
          for (const s of seq.samples) Object.freeze(s);
          Object.freeze(seq.samples);
          Object.freeze(cfg);
          const a = decideFallback(seq.samples, cfg, seq.startT);
          const b = decideFallback(seq.samples, cfg, seq.startT);
          expect(a).toEqual(b);
          expect(JSON.stringify(seq.samples)).toBe(snapshot);
          expect(JSON.stringify(cfg)).toBe(cfgSnapshot);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
