/**
 * One audio planning pass of the gate: turns port requests into capped targets (plan.ts),
 * asks `planGains` for the ramps, and sends them to the channels. Kept apart from gate.ts so the
 * gate stays small and tests can run the same pass against the real adapter.
 */
import type { RampKind } from './audioTypes';
import { planGains } from './gainPlan';
import type { PortRecord } from './portRecord';
import { effectiveRequests, scaleGains } from './plan';

export interface AudioPassInput {
  readonly ports: readonly Pick<PortRecord, 'id' | 'channel' | 'requested' | 'faded' | 'fadeMs' | 'fadeEndSec' | 'sent'>[];
  readonly kind: RampKind;
  readonly capDropped: boolean;
  /** Pending cap deadline from earlier passes (audio seconds), or null. */
  readonly deadlineSec: number | null;
  readonly soundOn: boolean;
  /** Audio is unlocked and the context is running. */
  readonly audioReady: boolean;
  readonly cap: number;
  readonly reduced: boolean;
  readonly nowSec: number;
}

/** Runs one pass and updates each port's `sent`. Returns the deadline to keep for the next pass. */
export function runAudioPass(input: AudioPassInput): number | null {
  const { ports } = input;
  const requests = ports.map((p) => ({ key: p.id, gain: p.faded ? 0 : p.requested }));
  const effective = effectiveRequests(requests, input.soundOn, input.audioReady);
  const scaled = scaleGains(effective, input.cap);
  const views = ports.map((p) => ({
    id: p.id, target: scaled.find((r) => r.key === p.id)?.gain ?? 0, sent: p.sent,
    current: p.channel.currentGain(), inFlight: p.channel.inFlight(), fadeMs: p.fadeMs, fadeEndSec: p.fadeEndSec, jump: p.channel.jumpSound,
  }));
  const plan = planGains({
    nowSec: input.nowSec, kind: input.kind, reduced: input.reduced, capDropped: input.capDropped,
    cap: input.cap, deadlineSec: input.deadlineSec, ports: views,
  });
  for (const a of plan.actions) {
    const p = ports.find((r) => r.id === a.id);
    if (p === undefined) continue;
    p.sent = a.target;
    p.channel.setGain(a.target, a.ramp);
  }
  return plan.deadlineSec;
}
