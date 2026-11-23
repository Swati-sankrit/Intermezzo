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
 * 5. A jump channel (opened with `jumpSound`) has its target set to min(target, jumpHeadroom(cap,
 *    other channels' current gains)). When it rises, the rise is marked `jump` (attack from
 *    planJumpAttack: 20 ms, 300 ms reduced) and every other rise in that pass is held: its target
 *    for the pass is its current value, and it is planned again in the first pass after the jump
 *    rise ends. Only one jump channel rises per pass (the first in port order); another one is
 *    held like any other rise. Falls follow rules 3 and 4 (a jump rise does not count as a rise
 *    for rule 3, because nothing else rises).
 * 6. A port that was faded out keeps the deadline set when its fade began (`fadeEndSec`). Later
 *    passes issue its fall with only the time left to that deadline (0 once passed), so a re-issue
 *    never restarts the clock. This only shortens falls; rises and the cap are not affected.
 */
import { CAP_RAMP_MS, SOUND_OFF_RAMP_MS, type RampKind, type GainRamp } from './audioTypes';
import { planFadeIn, planFadeOut } from './plan';
import { jumpHeadroom } from './returnRules';

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
  /** Audio second by which a fading-out port must reach 0 (fixed when the fade began). */
  readonly fadeEndSec?: number;
  /** The channel was opened with `jumpSound`. */
  readonly jump?: boolean;
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
  /** The Volume_Cap in force; the jump headroom is computed from it. */
  readonly cap: number;
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

/** Rule 5, first part: a jump port's target is at most the headroom left by the other ports' current gains. */
function limitJumpTargets(ports: readonly PortGainView[], cap: number): readonly PortGainView[] {
  return ports.map((p) => {
    if (p.jump !== true) return p;
    const room = jumpHeadroom(cap, ports.filter((o) => o.id !== p.id).map((o) => o.current));
    return { ...p, target: Math.min(p.target, room) };
  });
}

export function planGains(input: GainPlanInput): GainPlan {
  const { nowSec, kind, reduced } = input;
  const deadlineSec = nextDeadline(input.deadlineSec, nowSec, input.capDropped);
  const ports = limitJumpTargets(input.ports, input.cap);
  const moving = ports.filter((p) => p.inFlight !== null || p.target !== p.sent);
  const jumpRiser = moving.find((p) => p.jump === true && p.target > p.current);
  const hasRise = jumpRiser === undefined && moving.some((p) => p.target > p.current);
  const riseMs = planFadeIn(undefined, reduced);
  const actions: GainAction[] = [];
  for (const p of moving) {
    if (p === jumpRiser) {
      actions.push({ id: p.id, target: p.target, ramp: { kind, reduced, jump: true } });
      continue;
    }
    if (p.target > p.current) {
      if (jumpRiser === undefined) actions.push({ id: p.id, target: p.target, ramp: { kind, reduced } });
      else actions.push({ id: p.id, target: p.current, ramp: { kind, reduced, fallMs: 0 } }); // held (rule 5)
      continue;
    }
    let fallMs = ownFallMs(kind, p.fadeMs);
    if (hasRise) fallMs = Math.min(fallMs, riseMs);
    if (p.fadeEndSec !== undefined) fallMs = Math.min(fallMs, (p.fadeEndSec - nowSec) * 1000); // original deadline (rule 6)
    if (deadlineSec !== null) fallMs = Math.min(fallMs, (deadlineSec - nowSec) * 1000);
    actions.push({ id: p.id, target: p.target, ramp: { kind, reduced, fallMs: Math.max(0, fallMs) } });
  }
  return { actions, deadlineSec };
}
