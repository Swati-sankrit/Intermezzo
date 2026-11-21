/**
 * Shared fast-check generators for the attention property tests (tasks 1.4 to
 * 1.12). Test-only: nothing in the app imports this file.
 */
import fc from 'fast-check';
import { DEFAULT_THRESHOLDS } from '../config';
import type { PoseSample, Thresholds } from '../types';

/** Baseline in [-60, 60], limits in (0, 90], every value a multiple of 0.25. */
export const arbThresholds: fc.Arbitrary<Thresholds> = fc.record({
  // `+ 0` turns -0 into 0
  baselineYaw: fc.integer({ min: -240, max: 240 }).map((n) => n / 4 + 0),
  baselinePitch: fc.integer({ min: -240, max: 240 }).map((n) => n / 4 + 0),
  yawLimit: fc.integer({ min: 1, max: 360 }).map((n) => n / 4),
  pitchLimit: fc.integer({ min: 1, max: 360 }).map((n) => n / 4),
});

type Pose = Pick<PoseSample, 'faceFound' | 'yaw' | 'pitch' | 'tabActive'>;
function arbAngle(centre: number, limit: number): fc.Arbitrary<number> {
  return fc.oneof(
    fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
    fc.constantFrom(centre + limit, centre - limit), // exact limits
    fc.constantFrom(NaN, Infinity, -Infinity),
  );
}

/** Every field of a sample except `t`. Angles may be NaN, +-Infinity, or exactly on a limit. */
export function arbPoseBody(th: Thresholds = DEFAULT_THRESHOLDS): fc.Arbitrary<Pose> {
  return fc.record({
    faceFound: fc.boolean(),
    yaw: arbAngle(th.baselineYaw, th.yawLimit),
    pitch: arbAngle(th.baselinePitch, th.pitchLimit),
    tabActive: fc.boolean(),
  });
}

export interface PoseWalkOptions {
  /** Allow backward timestamp jumps (default: times never decrease). */
  readonly outOfOrder?: boolean;
  readonly thresholds?: Thresholds;
  readonly maxLength?: number;
}

/** Samples whose `t` walks with gaps of 0..400 ms; `outOfOrder` adds backward jumps of 1..500 ms. */
export function arbPoseSample(opts: PoseWalkOptions = {}): fc.Arbitrary<PoseSample[]> {
  const gap = fc.integer({ min: 0, max: 400 });
  const arbGap = opts.outOfOrder
    ? fc.oneof({ weight: 4, arbitrary: gap }, fc.integer({ min: -500, max: -1 }))
    : gap;
  return fc
    .tuple(
      fc.integer({ min: 0, max: 100_000 }),
      fc.array(fc.tuple(arbGap, arbPoseBody(opts.thresholds)), { maxLength: opts.maxLength ?? 40 }),
    )
    .map(([start, steps]) => {
      let t = start;
      return steps.map(([g, body]) => ({ t: (t += g), ...body }));
    });
}

export type RunLength = 'below' | 'at' | 'above';
export type RunMode = RunLength | 'mixed';
export interface Run {
  readonly kind: 'facing' | 'away';
  /** lastT - firstT, in sample timestamps. */
  readonly durationMs: number;
  readonly firstT: number;
  readonly lastT: number;
  /** Index range into `samples`, inclusive. */
  readonly firstIndex: number;
  readonly lastIndex: number;
  /** Away runs only: duration compared with the debounce time. */
  readonly length?: RunLength;
}

export interface RunSequence {
  readonly samples: PoseSample[];
  readonly runs: Run[];
  readonly debounceMs: number;
  readonly thresholds: Thresholds;
}

const INTERIOR_STEP_MS = 100;
type AwayReason = 'tab' | 'noFace' | 'nan' | 'yaw' | 'pitch';
interface RunSpec {
  readonly kind: 'facing' | 'away';
  readonly length: RunLength;
  readonly extra: number; // offset inside the length class
  readonly gapAfter: number; // ms to the next run, >= 1 (time strictly increases)
  readonly reason: AwayReason;
  readonly sign: 1 | -1;
  readonly beyond: number; // 1..40 quarter-degrees past the limit
  readonly inner: number; // facing offset as a percentage of the limit (100 = on it)
}

function awayDuration(debounceMs: number, length: RunLength, extra: number): number {
  if (length === 'below') return Math.max(0, debounceMs - 1 - extra); // 0 .. debounce-1
  if (length === 'at') return debounceMs;
  return debounceMs + 1 + extra; // debounce+1 ..
}

function poseFor(spec: RunSpec, th: Thresholds): Pose {
  const inside = (limit: number) => (spec.inner / 100) * limit * spec.sign;
  const facing: Pose = {
    faceFound: true,
    tabActive: true,
    yaw: th.baselineYaw + Math.round(inside(th.yawLimit) * 4) / 4,
    pitch: th.baselinePitch + Math.round(inside(th.pitchLimit) * 4) / 4,
  };
  if (spec.kind === 'facing') return facing;
  const past = (limit: number) => spec.sign * (limit + spec.beyond / 4);
  const away: Record<AwayReason, Partial<Pose>> = {
    tab: { tabActive: false },
    noFace: { faceFound: false },
    nan: { yaw: NaN },
    yaw: { yaw: th.baselineYaw + past(th.yawLimit) },
    pitch: { pitch: th.baselinePitch + past(th.pitchLimit) },
  };
  return { ...facing, ...away[spec.reason] };
}

function arbRunSpec(kind: 'facing' | 'away', mode: RunMode): fc.Arbitrary<RunSpec> {
  const lengths: RunLength[] = mode === 'mixed' ? ['below', 'at', 'above'] : [mode];
  return fc.record({
    kind: fc.constant(kind),
    length: fc.constantFrom(...lengths),
    extra: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 3000 })),
    gapAfter: fc.integer({ min: 1, max: 100 }),
    reason: fc.constantFrom<AwayReason>('tab', 'noFace', 'nan', 'yaw', 'pitch'),
    sign: fc.constantFrom<1 | -1>(1, -1),
    beyond: fc.integer({ min: 1, max: 40 }),
    inner: fc.integer({ min: 0, max: 100 }), // 100 = exactly on the limit
  });
}

/**
 * 1..8 alternating facing and away runs, starting with either kind. Each run
 * has samples at its first and last timestamp (duration = lastT - firstT) and
 * interior samples at most 100 ms apart. Away durations are below (0..debounce-1),
 * at (= debounce) or above (debounce+1..) per `mode`; facing runs last 0..2000 ms.
 * Facing samples sit inside or exactly on the limits.
 */
export function arbRunSequence(
  debounceMs: number,
  mode: RunMode,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): fc.Arbitrary<RunSequence> {
  return fc
    .tuple(
      fc.boolean(),
      fc.integer({ min: 1, max: 8 }),
      fc.integer({ min: 0, max: 10_000 }),
      fc.integer({ min: 0, max: 2000 }),
    )
    .chain(([startsAway, count, startT, facingMs]) =>
      fc
        .tuple(
          ...Array.from({ length: count }, (_, i) =>
            arbRunSpec((i % 2 === 0) === startsAway ? 'away' : 'facing', mode),
          ),
        )
        .map((specs) => buildSequence(specs, debounceMs, thresholds, startT, facingMs)),
    );
}

function buildSequence(
  specs: readonly RunSpec[],
  debounceMs: number,
  thresholds: Thresholds,
  startT: number,
  facingBaseMs: number,
): RunSequence {
  const samples: PoseSample[] = [];
  const runs: Run[] = [];
  let t = startT;
  for (const spec of specs) {
    const durationMs =
      spec.kind === 'away'
        ? awayDuration(debounceMs, spec.length, spec.extra)
        : (spec.extra + facingBaseMs) % 2001;
    const pose = poseFor(spec, thresholds);
    const firstIndex = samples.length;
    const offsets = [0];
    for (let o = INTERIOR_STEP_MS; o < durationMs; o += INTERIOR_STEP_MS) offsets.push(o);
    if (durationMs > 0) offsets.push(durationMs);
    for (const o of offsets) samples.push({ t: t + o, ...pose });
    runs.push({
      kind: spec.kind,
      durationMs,
      firstT: t,
      lastT: t + durationMs,
      firstIndex,
      lastIndex: samples.length - 1,
      ...(spec.kind === 'away' ? { length: spec.length } : {}),
    });
    t += durationMs + spec.gapAfter;
  }
  return { samples, runs, debounceMs, thresholds };
}
