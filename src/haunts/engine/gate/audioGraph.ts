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
}

export function newRecord(): ChannelRecord {
  return { node: null, restricted: null, sched: SILENT, waiters: new Set(), pending: null, closed: false };
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
  return { ctx, master, compressor };
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
 * Rising ramps last at least 300 ms (planFadeIn). Falling ramps: `fallMs` when the gate's plan
 * gives one; else fade 50 to 800 ms, cap 50 ms, sound off 150 ms.
 */
export function applyGain(ctx: AudioContext, rec: ChannelRecord, rawTarget: number, ramp: GainRamp): void {
  const param = rec.node?.gain;
  if (param === undefined) return;
  const now = ctx.currentTime;
  const target = clampGain(rawTarget);
  const current = valueAt(rec.sched, now);
  let ms: number;
  if (target > current) ms = planFadeIn(ramp.kind === 'fade' ? ramp.requestedMs : undefined, ramp.reduced === true);
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
