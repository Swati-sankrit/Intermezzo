/**
 * Node graph and gain ramps for the audio adapter. This file and audioAdapter.ts are the
 * only code that touches `ctx.destination`.
 *
 * Every ramp: cancelScheduledValues(now), setValueAtTime(current, now),
 * linearRampToValueAtTime(target, now + d). `current` comes from the adapter's own
 * schedule record, never from `param.value`, which is not confirmed mid-ramp.
 */
import type { HauntAudioContext } from '../hauntAudio';
import { createRestrictedContext } from './restrictedAudio';
import { clampGain, nextSchedule, SILENT, valueAt, type GainSchedule } from './gainSchedule';
import { planFadeIn, planFadeOut } from './plan';
import { planJumpAttack } from './returnRules';
import { CAP_RAMP_MS, LIMITER, SOUND_OFF_RAMP_MS, type GainRamp, type ReadyCallback } from './audioTypes';

export interface Graph {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly compressor: DynamicsCompressorNode;
}

export interface ChannelRecord {
  node: GainNode | null;
  /** What haunts get instead of the raw context. One per attached channel. */
  restricted: HauntAudioContext | null;
  sched: GainSchedule;
  waiters: Set<ReadyCallback>;
  pending: { target: number; ramp: GainRamp } | null;
  closed: boolean;
  /** Opened with `jumpSound`. Only such a channel may use the jump attack. */
  readonly jump: boolean;
}

export function newRecord(jump = false): ChannelRecord {
  return { node: null, restricted: null, sched: SILENT, waiters: new Set(), pending: null, closed: false, jump };
}

/** master -> compressor -> destination. A constructor throw means "not ready" (Req 8.7). */
export function buildGraph(createAudioContext: () => AudioContext): Graph | null {
  let ctx: AudioContext;
  try {
    ctx = createAudioContext();
  } catch {
    return null;
  }
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(1, now);
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(LIMITER.threshold, now);
  compressor.knee.setValueAtTime(LIMITER.knee, now);
  compressor.ratio.setValueAtTime(LIMITER.ratio, now);
  compressor.attack.setValueAtTime(LIMITER.attack, now);
  compressor.release.setValueAtTime(LIMITER.release, now);
  master.connect(compressor);
  compressor.connect(ctx.destination);
  setListenerOnce(ctx);
  return { ctx, master, compressor };
}

/**
 * Listener at the origin facing -Z with +Y up. The docs give these as the defaults, but they are
 * set anyway. Firefox has no listener AudioParams, so `setPosition` and `setOrientation` are the
 * fallback. A failure here leaves the defaults, which are the same values, so it is not fatal.
 */
function setListenerOnce(ctx: AudioContext): void {
  try {
    const l = ctx.listener as Partial<AudioListener> & AudioListener;
    const t = ctx.currentTime;
    if (l.positionX !== undefined && l.forwardX !== undefined && l.upX !== undefined) {
      l.positionX.setValueAtTime(0, t);
      l.positionY.setValueAtTime(0, t);
      l.positionZ.setValueAtTime(0, t);
      l.forwardX.setValueAtTime(0, t);
      l.forwardY.setValueAtTime(0, t);
      l.forwardZ.setValueAtTime(-1, t);
      l.upX.setValueAtTime(0, t);
      l.upY.setValueAtTime(1, t);
      l.upZ.setValueAtTime(0, t);
    } else {
      l.setPosition(0, 0, 0);
      l.setOrientation(0, 0, -1, 0, 1, 0);
    }
  } catch {
    // Defaults already match.
  }
}

/** Gives a record its channel GainNode (silent) and applies any gain requested before it existed. */
export function attach(g: Graph, rec: ChannelRecord): void {
  const node = g.ctx.createGain();
  node.gain.setValueAtTime(0, g.ctx.currentTime); // a new GainNode defaults to 1
  node.connect(g.master);
  rec.node = node;
  rec.restricted = createRestrictedContext(g.ctx, node);
  rec.sched = SILENT;
  const pending = rec.pending;
  rec.pending = null;
  if (pending !== null) applyGain(g.ctx, rec, pending.target, pending.ramp);
}

/**
 * Rising ramps last at least 300 ms (planFadeIn); the one exception is a jump channel whose ramp
 * the gate's plan marked `jump` (gainPlan.ts, rule 5): planJumpAttack, 20 ms (300 ms reduced). Falling ramps: `fallMs` when the gate's plan
 * gives one; else fade 50 to 800 ms, cap 50 ms, sound off 150 ms.
 */
export function applyGain(ctx: AudioContext, rec: ChannelRecord, rawTarget: number, ramp: GainRamp): void {
  const param = rec.node?.gain;
  if (param === undefined) return;
  const now = ctx.currentTime;
  const target = clampGain(rawTarget);
  const current = valueAt(rec.sched, now);
  let ms: number;
  const reduced = ramp.reduced === true;
  if (target > current && rec.jump && ramp.jump === true) ms = planJumpAttack(undefined, reduced);
  else if (target > current) ms = planFadeIn(ramp.kind === 'fade' ? ramp.requestedMs : undefined, reduced);
  else if (ramp.fallMs !== undefined && Number.isFinite(ramp.fallMs)) ms = Math.max(0, ramp.fallMs);
  else if (ramp.kind === 'cap') ms = CAP_RAMP_MS;
  else if (ramp.kind === 'soundOff') ms = SOUND_OFF_RAMP_MS;
  else ms = planFadeOut(ramp.requestedMs);
  const next = nextSchedule(rec.sched, now, target, ms / 1000);
  param.cancelScheduledValues(now);
  param.setValueAtTime(current, now);
  param.linearRampToValueAtTime(target, next.endTime);
  rec.sched = next;
}
