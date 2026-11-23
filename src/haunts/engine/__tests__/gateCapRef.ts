/**
 * Reference for ghost-dread Property 23 (gateCap.gd23.prop.test.ts). It reads gain only from what the
 * fake AudioContext recorded: it replays the automation calls of every gain param into its own
 * timeline and sums, over the channel gain nodes still connected to the master, channel x master.
 * Nothing here calls the gate, the audio adapter or the gain plan.
 */
import type { FakeAudioContext, FakeAudioParam, FakeGainNode } from './fakes';

interface Ev { readonly kind: 'set' | 'ramp'; readonly value: number; readonly time: number }

/** Web Audio timeline from the calls a param recorded (the call order is the replay order). */
function replay(param: FakeAudioParam): Ev[] {
  let events: Ev[] = [];
  const insert = (e: Ev): void => {
    let i = events.length;
    while (i > 0 && events[i - 1].time > e.time) i -= 1;
    events.splice(i, 0, e);
  };
  for (const c of param.calls) {
    if (c.type === 'cancelScheduledValues') events = events.filter((e) => e.time < c.time);
    else if (c.type === 'setValueAtTime' || c.type === 'setValue') insert({ kind: 'set', value: c.value as number, time: c.effectiveTime });
    else {
      if (events.length === 0) insert({ kind: 'set', value: param.defaultValue, time: c.atContextTime });
      insert({ kind: 'ramp', value: c.value as number, time: c.effectiveTime });
    }
  }
  return events;
}

function evaluate(events: readonly Ev[], fallback: number, t: number): number {
  let idx = -1;
  for (let i = 0; i < events.length; i++) if (events[i].time <= t) idx = i;
  const prev = idx >= 0 ? events[idx] : null;
  const next = idx + 1 < events.length ? events[idx + 1] : null;
  if (prev !== null && next !== null && next.kind === 'ramp' && next.time > t) {
    return prev.value + ((next.value - prev.value) * (t - prev.time)) / (next.time - prev.time);
  }
  return prev === null ? fallback : prev.value;
}

export interface Ref {
  readonly master: FakeGainNode | null;
  /** Channel gain nodes still connected to the master (a closed channel is disconnected). */
  readonly channels: readonly FakeGainNode[];
  /** Every channel gain node ever created, connected or not. */
  readonly allChannels: readonly FakeGainNode[];
  /** Gain of one gain node at ctx time t, replayed from its recorded calls. */
  value(node: FakeGainNode, t: number): number;
  /** Sum over connected channels of channel gain x master gain. */
  combined(t: number): number;
  /** Times at which any connected channel or the master changes slope. */
  breakpoints(): number[];
}

export function makeRef(ctx: FakeAudioContext): Ref {
  const gains = ctx.nodesOfKind('gain') as FakeGainNode[];
  const masterEdge = ctx.connections.find((e) => e.from.kind === 'gain' && 'kind' in e.to && e.to.kind === 'compressor');
  const master = masterEdge === undefined ? null : (masterEdge.from as FakeGainNode);
  const allChannels = gains.filter((n) => n !== master);
  const channels = allChannels.filter((n) => ctx.connections.some((e) => e.from === n && e.to === master));
  const cache = new Map<FakeGainNode, Ev[]>();
  const timeline = (n: FakeGainNode): Ev[] => {
    let tl = cache.get(n);
    if (tl === undefined) cache.set(n, (tl = replay(n.gain)));
    return tl;
  };
  const value = (n: FakeGainNode, t: number): number => evaluate(timeline(n), n.gain.defaultValue, t);
  return {
    master, channels, allChannels, value,
    combined(t) {
      if (master === null) return 0;
      const m = value(master, t);
      let sum = 0;
      for (const n of channels) sum += value(n, t) * m;
      return sum;
    },
    breakpoints() {
      const set = new Set<number>();
      for (const n of master === null ? channels : [master, ...channels]) for (const e of timeline(n)) set.add(e.time);
      return [...set];
    },
  };
}

/** Agreement between the replay and the fake's own timeline, checked at the given times. */
export function replayDisagreement(ref: Ref, times: readonly number[]): string | null {
  for (const n of ref.allChannels) {
    for (const t of times) {
      const a = ref.value(n, t);
      const b = n.gain.valueAt(t);
      if (Math.abs(a - b) > 1e-12) return `${n.gain.label} at ${t}s: replay ${a}, fake ${b}`;
    }
  }
  return null;
}

// ------------------------------------------------------------------ cap history

export interface CapHistory {
  base: number;
  /** In ctx-time order. */
  changes: { t: number; cap: number }[];
}

/** Cap in force at ctx time t (last change at or before t). */
export function capAt(h: CapHistory, t: number): number {
  let cap = h.base;
  for (const c of h.changes) if (c.t <= t) cap = c.cap;
  return cap;
}

/** The existing property for the cap allows the old cap for 50 ms after a drop (the adapter's cap ramp). */
export const CAP_WINDOW_S = 0.05;

/** Highest cap in force at any moment of the 50 ms up to t. */
export function allowedAt(h: CapHistory, t: number): number {
  const lo = t - CAP_WINDOW_S;
  let max = capAt(h, lo);
  for (const c of h.changes) if (c.t > lo && c.t <= t) max = Math.max(max, c.cap);
  return max;
}

/** Event boundaries (both sides), cap-window edges, midpoints, a fine grid, and the extra times given. */
export function sampleTimes(ref: Ref, h: CapHistory, now: number, extra: readonly number[]): number[] {
  const set = new Set<number>([now]);
  for (const t of ref.breakpoints()) if (t >= now) set.add(t);
  for (const c of h.changes) for (const t of [c.t, c.t + CAP_WINDOW_S, c.t + 0.1]) if (t >= now) set.add(t);
  for (const t of extra) if (t >= now) set.add(t);
  const sorted = [...set].sort((a, b) => a - b);
  const out = new Set<number>(sorted);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] - 1e-7 >= now) out.add(sorted[i] - 1e-7);
    if (i > 0) out.add((sorted[i] + sorted[i - 1]) / 2);
  }
  for (let ms = 0; ms <= 1500; ms += 10) out.add(now + ms / 1000);
  return [...out].sort((a, b) => a - b);
}
