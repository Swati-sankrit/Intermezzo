/**
 * Per-pass gain planning for the gate: which channels get a new ramp, of what kind and
 * length. Pure: no audio, DOM, clock or storage; times are seconds on the audio clock.
 * The argument that these rules keep the combined gain under the cap is in design.md
 * (Safety_Gate, "Cap guarantee").
 *
 * Every planning pass, whatever triggered it:
 *
 * 1. Re-issue, from its current value, every channel still moving (ramp not yet at its end)
 *    and every channel whose target changed. A channel at its target and not moving is left alone.
 * 2. All rises share one end time T = now + planFadeIn (300 ms, 1000 ms reduced; every rise
 *    has the same minimum). Nothing rises faster than its minimum.
 * 3. When the pass has a rise, every fall ends at or before T. Otherwise a fall keeps its own
 *    length: fade-out 50 to 800 ms, cap 50 ms, sound off 150 ms.
 * 4. One pending deadline D for the whole gate. A cap drop sets D = now + 50 ms unless one is
 *    pending (then it is kept, never extended). D is cleared once now >= D. While D is pending
 *    every fall, in any pass, ends by D. If D is very close the fall is abrupt but still
 *    downward; haunt-safety limits fade-in only.
 */
import { CAP_RAMP_MS, SOUND_OFF_RAMP_MS, type RampKind, type GainRamp } from './audioTypes';
import { planFadeIn, planFadeOut } from './plan';

export interface PortGainView {
  readonly id: string;
  /** Final, capped gain this port should have after the pass. */
  readonly target: number;
  /** Last target sent to the channel. */
  readonly sent: number;
  /** In-flight gain now. */
  readonly current: number;
  /** Scheduled ramp still running (target and end time), or null. */
  readonly inFlight: { readonly target: number; readonly endSec: number } | null;
  /** Fade-out length this port asked for, if it is fading out. */
  readonly fadeMs?: number;
}

export interface GainAction {
  readonly id: string;
  readonly target: number;
  readonly ramp: GainRamp;
}

export interface GainPlanInput {
  readonly nowSec: number;
  readonly kind: RampKind;
  readonly reduced: boolean;
  /** This pass is caused by a cap drop (new cap below the old one). */
  readonly capDropped: boolean;
  /** Pending deadline from earlier passes (audio seconds), or null. */
  readonly deadlineSec: number | null;
  readonly ports: readonly PortGainView[];
}

export interface GainPlan {
  readonly actions: readonly GainAction[];
  /** The deadline to keep for the next pass: null when none is pending. */
  readonly deadlineSec: number | null;
}

/** Seconds from a cap drop to the deadline. */
const CAP_DEADLINE_S = CAP_RAMP_MS / 1000;

/** Pending deadline for this pass: kept while now < D, cleared after; a cap drop sets one if none is pending. */
export function nextDeadline(prev: number | null, nowSec: number, capDropped: boolean): number | null {
  if (prev !== null && nowSec < prev) return prev;
  return capDropped ? nowSec + CAP_DEADLINE_S : null;
}

function ownFallMs(kind: RampKind, fadeMs: number | undefined): number {
  if (kind === 'cap') return CAP_RAMP_MS;
  return kind === 'soundOff' ? SOUND_OFF_RAMP_MS : planFadeOut(fadeMs);
}

export function planGains(input: GainPlanInput): GainPlan {
  const { nowSec, kind, reduced } = input;
  const deadlineSec = nextDeadline(input.deadlineSec, nowSec, input.capDropped);
  const moving = input.ports.filter((p) => p.inFlight !== null || p.target !== p.sent);
  const hasRise = moving.some((p) => p.target > p.current);
  const riseMs = planFadeIn(undefined, reduced);
  const actions: GainAction[] = [];
  for (const p of moving) {
    if (p.target > p.current) {
      actions.push({ id: p.id, target: p.target, ramp: { kind, reduced } });
      continue;
    }
    let fallMs = ownFallMs(kind, p.fadeMs);
    if (hasRise) fallMs = Math.min(fallMs, riseMs);
    if (deadlineSec !== null) fallMs = Math.min(fallMs, (deadlineSec - nowSec) * 1000);
    actions.push({ id: p.id, target: p.target, ramp: { kind, reduced, fallMs: Math.max(0, fallMs) } });
  }
  return { actions, deadlineSec };
}
