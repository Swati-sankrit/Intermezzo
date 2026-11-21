import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isBeyond } from '../config';
import { decide } from '../decision';
import { arbPoseSample, arbRunSequence, arbThresholds } from './arbitraries';

describe('shared generators', () => {
  it('arbThresholds gives quarter-degree values in range', () => {
    fc.assert(
      fc.property(arbThresholds, (th) => {
        for (const v of Object.values(th)) expect(Number.isInteger(v * 4)).toBe(true);
        expect(Math.abs(th.baselineYaw)).toBeLessThanOrEqual(60);
        expect(Math.abs(th.baselinePitch)).toBeLessThanOrEqual(60);
        expect(th.yawLimit).toBeGreaterThan(0);
        expect(th.yawLimit).toBeLessThanOrEqual(90);
        expect(th.pitchLimit).toBeGreaterThan(0);
        expect(th.pitchLimit).toBeLessThanOrEqual(90);
      }),
    );
  });

  it('arbPoseSample times never decrease unless out-of-order is requested', () => {
    fc.assert(
      fc.property(arbPoseSample(), (samples) => {
        samples.slice(1).forEach((s, i) => {
          const gap = s.t - samples[i].t;
          expect(gap).toBeGreaterThanOrEqual(0);
          expect(gap).toBeLessThanOrEqual(400);
        });
      }),
    );
  });

  it('arbRunSequence run info matches the samples and the decision outcome', () => {
    const debounce = 1500;
    fc.assert(
      fc.property(
        fc
          .tuple(fc.constantFrom('below', 'at', 'above', 'mixed' as const), arbThresholds)
          .chain(([mode, th]) =>
            arbRunSequence(debounce, mode, th).map((seq) => ({ mode, th, seq })),
          ),
        ({ mode, th, seq }) => {
          const { samples, runs } = seq;
          samples.slice(1).forEach((s, i) => expect(s.t).toBeGreaterThan(samples[i].t));
          for (const r of runs) {
            expect(samples[r.firstIndex].t).toBe(r.firstT);
            expect(samples[r.lastIndex].t).toBe(r.lastT);
            expect(r.lastT - r.firstT).toBe(r.durationMs);
            for (let i = r.firstIndex; i <= r.lastIndex; i++) {
              const s = samples[i];
              const away =
                !s.tabActive || !s.faceFound || !Number.isFinite(s.yaw) || isBeyond(s.yaw, s.pitch, th);
              expect(away).toBe(r.kind === 'away');
            }
            if (r.kind === 'away') {
              const cmp = Math.sign(r.durationMs - debounce);
              expect(cmp).toBe({ below: -1, at: 0, above: 1 }[r.length!]);
              if (mode !== 'mixed') expect(r.length).toBe(mode);
            }
          }
          // Real decision outcome: away only when the final run is a long away run
          // or a long away run is still the latest event.
          const last = runs[runs.length - 1];
          const expected =
            last.kind === 'away' && last.length === 'above' ? 'away' : 'present';
          expect(decide(samples, { thresholds: th, debounceMs: debounce }).value).toBe(
            mode === 'below' || mode === 'at' ? 'present' : expected,
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});
