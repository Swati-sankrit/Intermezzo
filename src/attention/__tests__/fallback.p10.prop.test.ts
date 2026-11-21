/**
 * Feature: attention-signal, Property 10: Fallback never reports away for short
 * inactivity and short idle
 *
 * **Validates: Requirements 6.5**
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
import { arbFallbackSequence } from './arbFallback';

const NUM_RUNS = 500;

// Effective values: debounce within 500..5000, idle limit at or above the 60 s minimum.
const arbConfig = fc.record({
  debounceMs: fc.integer({ min: 500, max: 5000 }),
  idleLimitMs: fc.integer({ min: 60_000, max: 120_000 }),
});

/** Every intermediate signal value of the fold (initial state included). */
function values(samples: readonly FallbackSample[], cfg: FallbackConfig, startT: number): string[] {
  let state = initialFallbackState(startT);
  const out = [state.signal.value];
  for (const s of samples) {
    state = stepFallback(state, s, cfg);
    out.push(state.signal.value);
  }
  return out;
}

describe('Property 10: Fallback never reports away for short inactivity and short idle', () => {
  it('hidden runs and idle runs at or below their limits never give away', () => {
    const arbCase = arbConfig.chain((cfg) =>
      fc.tuple(
        fc.constant(cfg),
        fc.oneof(
          arbFallbackSequence(cfg.debounceMs, cfg.idleLimitMs, 'below'),
          arbFallbackSequence(cfg.debounceMs, cfg.idleLimitMs, 'at'),
        ),
      ),
    );
    fc.assert(
      fc.property(arbCase, ([cfg, seq]) => {
        for (const run of seq.runs) {
          const limit = run.kind === 'hidden' ? cfg.debounceMs : cfg.idleLimitMs;
          expect(run.durationMs).toBeLessThanOrEqual(limit);
          expect(seq.samples.some((s) => s.t === run.firstT)).toBe(true);
          expect(seq.samples.some((s) => s.t === run.lastT)).toBe(true);
        }
        for (const s of seq.samples) expect(s.t).toBeGreaterThanOrEqual(seq.startT);
        expect(values(seq.samples, cfg, seq.startT).every((v) => v === 'present')).toBe(true);
        expect(decideFallback(seq.samples, cfg, seq.startT).value).toBe('present');
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('a run exactly at its limit is not away, one ms over is (generator is not vacuous)', () => {
    const arbCase = arbConfig.chain((cfg) =>
      fc.tuple(
        fc.constant(cfg),
        arbFallbackSequence(cfg.debounceMs, cfg.idleLimitMs, 'above'),
      ),
    );
    fc.assert(
      fc.property(arbCase, ([cfg, seq]) => {
        for (const run of seq.runs) {
          const limit = run.kind === 'hidden' ? cfg.debounceMs : cfg.idleLimitMs;
          expect(run.durationMs).toBeGreaterThan(limit);
        }
        expect(values(seq.samples, cfg, seq.startT)).toContain('away');
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('examples: exact limits are present, one ms past is away', () => {
    const cfg = { debounceMs: 1500, idleLimitMs: 60_000 };
    const hidden = (end: number): FallbackSample[] => [
      { t: 0, tabActive: false, lastInputT: 0 },
      { t: end, tabActive: false, lastInputT: 0 },
    ];
    expect(decideFallback(hidden(1500), cfg, 0).value).toBe('present');
    expect(decideFallback(hidden(1501), cfg, 0).value).toBe('away');
    const idle = (t: number): FallbackSample[] => [{ t, tabActive: true, lastInputT: 0 }];
    expect(decideFallback(idle(60_000), cfg, 0).value).toBe('present');
    expect(decideFallback(idle(60_001), cfg, 0).value).toBe('away');
  });
});
