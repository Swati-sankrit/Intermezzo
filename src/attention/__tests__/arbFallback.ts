/**
 * Fast-check generator for FallbackSample sequences with hidden-tab runs and
 * idle runs (tasks 1.15 to 1.17). Test-only: nothing in the app imports this.
 *
 * - Hidden run: `tabActive: false` from firstT to lastT. Duration = lastT - firstT,
 *   compared with the debounce time.
 * - Idle run: the tab is active and `lastInputT` stays at firstT, so the idle time
 *   `t - lastInputT` grows to lastT - firstT, compared with the idle limit.
 * Runs are separated by one active sample with fresh input, so they never merge.
 * Every run has a sample at its first and last timestamp. All `t` are >= startT.
 */
import fc from 'fast-check';
import type { FallbackSample } from '../fallback';

export type FallbackRunKind = 'hidden' | 'idle';
export type FallbackRunLength = 'below' | 'at' | 'above';
export type FallbackRunMode = FallbackRunLength | 'mixed';

export interface FallbackRun {
  readonly kind: FallbackRunKind;
  /** lastT - firstT. */
  readonly durationMs: number;
  readonly firstT: number;
  readonly lastT: number;
  /** Index range into `samples`, inclusive. */
  readonly firstIndex: number;
  readonly lastIndex: number;
  /** Duration compared with the debounce time (hidden) or idle limit (idle). */
  readonly length: FallbackRunLength;
}

export interface FallbackSequence {
  readonly samples: FallbackSample[];
  readonly runs: FallbackRun[];
  readonly startT: number;
  readonly debounceMs: number;
  readonly idleLimitMs: number;
}

interface RunSpec {
  readonly kind: FallbackRunKind;
  readonly length: FallbackRunLength;
  readonly extra: number; // offset inside the length class, 0..3000
  readonly gapAfter: number; // ms from the end of the run to its spacer sample, >= 1
}

const HIDDEN_STEP_MS = 250;
const IDLE_STEP_MS = 5000;

function runDuration(limit: number, length: FallbackRunLength, extra: number): number {
  if (length === 'below') return Math.max(0, limit - 1 - extra); // 0 .. limit-1
  if (length === 'at') return limit;
  return limit + 1 + extra; // limit+1 ..
}

function arbRunSpec(mode: FallbackRunMode): fc.Arbitrary<RunSpec> {
  const lengths: FallbackRunLength[] = mode === 'mixed' ? ['below', 'at', 'above'] : [mode];
  return fc.record({
    kind: fc.constantFrom<FallbackRunKind>('hidden', 'idle'),
    length: fc.constantFrom(...lengths),
    extra: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 3000 })),
    gapAfter: fc.integer({ min: 1, max: 100 }),
  });
}

/**
 * 1..6 hidden or idle runs separated by active spacer samples. `debounceMs` and
 * `idleLimitMs` are the effective (already clamped) values the test passes to the
 * fallback function.
 */
export function arbFallbackSequence(
  debounceMs: number,
  idleLimitMs: number,
  mode: FallbackRunMode,
): fc.Arbitrary<FallbackSequence> {
  return fc
    .tuple(
      fc.integer({ min: 0, max: 100_000 }), // startT
      fc.integer({ min: 0, max: 5000 }), // first-sample offset from startT
      fc.array(arbRunSpec(mode), { minLength: 1, maxLength: 6 }),
    )
    .map(([startT, offset, specs]) => build(specs, startT, offset, debounceMs, idleLimitMs));
}

function build(
  specs: readonly RunSpec[],
  startT: number,
  offset: number,
  debounceMs: number,
  idleLimitMs: number,
): FallbackSequence {
  const samples: FallbackSample[] = [];
  const runs: FallbackRun[] = [];
  let t = startT + offset;
  // An active sample with fresh input at the start, then after every run.
  samples.push({ t, tabActive: true, lastInputT: t });
  t += 1;
  for (const spec of specs) {
    const limit = spec.kind === 'hidden' ? debounceMs : idleLimitMs;
    const step = spec.kind === 'hidden' ? HIDDEN_STEP_MS : IDLE_STEP_MS;
    const durationMs = runDuration(limit, spec.length, spec.extra);
    const offsets = [0];
    for (let o = step; o < durationMs; o += step) offsets.push(o);
    if (durationMs > 0) offsets.push(durationMs);
    const firstIndex = samples.length;
    for (const o of offsets) {
      samples.push({ t: t + o, tabActive: spec.kind === 'idle', lastInputT: t });
    }
    runs.push({
      kind: spec.kind,
      durationMs,
      firstT: t,
      lastT: t + durationMs,
      firstIndex,
      lastIndex: samples.length - 1,
      length: spec.length,
    });
    t += durationMs + spec.gapAfter;
    samples.push({ t, tabActive: true, lastInputT: t });
    t += 1;
  }
  return { samples, runs, startT, debounceMs, idleLimitMs };
}
