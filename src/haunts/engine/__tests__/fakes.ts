/**
 * Test infrastructure for the haunt engine and gate (task 3.3).
 *
 * Nothing here is a mock of code under test. These are stand-ins for the
 * things the engine and gate depend on: time, timers, haunts, the gate (for
 * engine tests), the Web Audio API, storage and matchMedia.
 *
 * The AudioParam fake follows the Web Audio automation model (see the task 3.1
 * findings in docs/BUILD_LOG.md): a linear ramp starts at the previous event's
 * time and value, `cancelScheduledValues(t)` drops events at or after t, and a
 * negative time throws TypeError. Reading `param.value` mid-ramp is not
 * confirmed by the docs, so the fake returns only the intrinsic value there;
 * code that needs the in-flight value must compute it itself.
 */
import type { MatchMediaFn, MediaQueryListLike } from '../gate/reducedMotion';
import type { EvidenceHost, ReadingContext, ReturnPort, SpoilerCardView, SpoilerHost } from '../returnTypes';
import type {
  AudioOut,
  Gate,
  GatePort,
  Haunt,
  HauntAudioContext,
  HauntLevel,
  ImageFit,
  Unsubscribe,
  VisualLayer,
  VisualOut,
} from '../types';

// ---------------------------------------------------------------------------
// Clock and scheduler
// ---------------------------------------------------------------------------

/** Manual clock in milliseconds. Never goes backwards. */
export class FakeClock {
  private current: number;
  private readonly listeners = new Set<(deltaMs: number) => void>();
  constructor(startMs = 0) {
    this.current = startMs;
  }
  now(): number {
    return this.current;
  }
  /** Moves to `ms` if it is later than now; notifies listeners with the delta. */
  advanceTo(ms: number): void {
    if (!(ms > this.current)) return;
    const delta = ms - this.current;
    this.current = ms;
    for (const cb of [...this.listeners]) cb(delta);
  }
  advance(ms: number): void {
    this.advanceTo(this.current + Math.max(0, ms));
  }
  onAdvance(cb: (deltaMs: number) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }
}

interface PendingTimer {
  readonly id: number;
  readonly seq: number;
  readonly due: number;
  readonly fn: () => void;
}

/** Matches `EngineDeps['scheduler']`. Timers fire in due-time order, ties in creation order. */
export class FakeScheduler {
  private readonly timers = new Map<number, PendingTimer>();
  private nextId = 1;
  private seq = 0;
  /** Every delay passed to setTimeout, in call order. */
  readonly requestedDelays: number[] = [];
  private readonly clock: FakeClock;
  constructor(clock: FakeClock) {
    this.clock = clock;
  }

  setTimeout(fn: () => void, ms: number): unknown {
    const delay = Number.isFinite(ms) ? Math.max(0, ms) : 0;
    this.requestedDelays.push(ms);
    const id = this.nextId++;
    this.timers.set(id, { id, seq: this.seq++, due: this.clock.now() + delay, fn });
    return id;
  }
  clearTimeout(id: unknown): void {
    if (typeof id === 'number') this.timers.delete(id);
  }
  get pendingCount(): number {
    return this.timers.size;
  }
  /** Due times of pending timers, ascending. */
  pendingDueTimes(): number[] {
    return [...this.timers.values()].map((t) => t.due).sort((a, b) => a - b);
  }
  private earliest(limit: number): PendingTimer | null {
    let best: PendingTimer | null = null;
    for (const t of this.timers.values()) {
      if (t.due > limit) continue;
      if (best === null || t.due < best.due || (t.due === best.due && t.seq < best.seq)) best = t;
    }
    return best;
  }
  /** Advances the clock by `ms`, firing every timer that becomes due (including ones they create). */
  advance(ms: number): void {
    const target = this.clock.now() + Math.max(0, ms);
    for (let t = this.earliest(target); t !== null; t = this.earliest(target)) {
      this.timers.delete(t.id);
      this.clock.advanceTo(t.due);
      t.fn();
    }
    this.clock.advanceTo(target);
  }
  /** Fires the earliest pending timer, moving the clock to its due time. Returns false when none. */
  fireNext(): boolean {
    const t = this.earliest(Number.POSITIVE_INFINITY);
    if (t === null) return false;
    this.timers.delete(t.id);
    this.clock.advanceTo(t.due);
    t.fn();
    return true;
  }
}

export function createFakeTime(startMs = 0): { clock: FakeClock; scheduler: FakeScheduler } {
  const clock = new FakeClock(startMs);
  return { clock, scheduler: new FakeScheduler(clock) };
}

// ---------------------------------------------------------------------------
// Fake haunt
// ---------------------------------------------------------------------------

export type HauntCall =
  | { readonly type: 'start'; readonly level: HauntLevel; readonly audio: AudioOut; readonly visual: VisualOut }
  | { readonly type: 'setLevel'; readonly level: HauntLevel }
  | { readonly type: 'stop' };

export type ThrowRule = boolean | ((callNumber: number) => boolean);
export interface FakeHauntThrows {
  start?: ThrowRule;
  setLevel?: ThrowRule;
  stop?: ThrowRule;
}

export interface FakeHaunt extends Haunt {
  readonly calls: HauntCall[];
  /** Mutable: tests may change what throws between steps. */
  throwOn: FakeHauntThrows;
  readonly startCount: number;
  readonly stopCount: number;
  /** Number of `start` calls (including ones that threw) minus `stop` calls. */
  readonly openCount: number;
  readonly lastLevel: HauntLevel | null;
}

/** A haunt that records every call (also the ones that throw) and can be told to throw. */
export function createFakeHaunt(id: string, throwOn: FakeHauntThrows = {}): FakeHaunt {
  const calls: HauntCall[] = [];
  const counts = { start: 0, setLevel: 0, stop: 0 };
  let lastLevel: HauntLevel | null = null;
  const maybeThrow = (kind: 'start' | 'setLevel' | 'stop'): void => {
    counts[kind] += 1;
    const rule = haunt.throwOn[kind];
    const should = typeof rule === 'function' ? rule(counts[kind]) : rule === true;
    if (should) throw new Error(`fake haunt ${id}: ${kind} threw`);
  };
  const haunt: FakeHaunt = {
    id,
    name: `Fake ${id}`,
    calls,
    throwOn,
    get startCount() {
      return counts.start;
    },
    get stopCount() {
      return counts.stop;
    },
    get openCount() {
      return counts.start - counts.stop;
    },
    get lastLevel() {
      return lastLevel;
    },
    start(level, audio, visual) {
      calls.push({ type: 'start', level, audio, visual });
      lastLevel = level;
      maybeThrow('start');
    },
    setLevel(level) {
      calls.push({ type: 'setLevel', level });
      lastLevel = level;
      maybeThrow('setLevel');
    },
    stop() {
      calls.push({ type: 'stop' });
      maybeThrow('stop');
    },
  };
  return haunt;
}

// ---------------------------------------------------------------------------
// Fake gate (for engine tests)
// ---------------------------------------------------------------------------

export interface FakeGateOptions {
  /** `open` throws for these haunt ids. */
  openThrowsFor?: readonly string[];
  /** `close` on any port throws (after being recorded). */
  closeThrows?: boolean;
}

export interface FakeGatePort extends GatePort {
  readonly hauntId: string;
  readonly gains: number[];
  readonly glowCalls: { kind: 'dim' | 'gutter'; args: number[] }[];
  readonly layers: FakeVisualLayer[];
  readonly closeCalls: number;
  readonly closed: boolean;
  readonly readyCallbacks: ((ctx: HauntAudioContext) => void)[];
  /** Milliseconds passed to each `fadeOut(ms)` call, as requested (not planned). */
  readonly fadeOuts: number[];
  /** Calls every pending whenReady callback once. */
  fireReady(ctx: HauntAudioContext): void;
  /** Current audibility the port reports to `onAudibleChange` subscribers. Starts true. */
  readonly audible: boolean;
  /** Number of `onAudibleChange` calls made on this port, cancelled or not. */
  readonly audibleSubscriptions: number;
  /** Callbacks currently subscribed through `onAudibleChange`. */
  readonly audibleCallbacks: ((audible: boolean) => void)[];
  /** Sets audibility; subscribers are called only when the value changes. */
  setAudible(audible: boolean): void;
  /** Callbacks subscribed through `onTick`, with their requested period. */
  readonly tickCallbacks: { cb: () => void; periodMs: number }[];
  /** Calls every subscribed tick callback once. */
  tick(): void;
}

export interface FakeVisualLayer extends VisualLayer {
  readonly side: 'left' | 'right';
  readonly markup: string[];
  readonly images: { name: string; fit: ImageFit }[];
  readonly opacities: number[];
  readonly sweeps: (number | null)[];
  readonly labels: string[];
  readonly removed: boolean;
}

function createFakeLayer(side: 'left' | 'right'): FakeVisualLayer {
  const markup: string[] = [];
  const images: { name: string; fit: ImageFit }[] = [];
  const opacities: number[] = [];
  const sweeps: (number | null)[] = [];
  const labels: string[] = [];
  let removed = false;
  return {
    side,
    markup,
    images,
    opacities,
    sweeps,
    labels,
    get removed() {
      return removed;
    },
    setMarkup: (svg) => void markup.push(svg),
    setImage: (name, fit) => void images.push({ name, fit }),
    setOpacity: (o) => void opacities.push(o),
    setSweep: (p) => void sweeps.push(p),
    setLabel: (text) => void labels.push(text),
    remove: () => {
      removed = true;
    },
  };
}

export type GateCall =
  | { readonly type: 'open'; readonly hauntId: string }
  | { readonly type: 'fadeOutAll'; readonly requestedMs: number }
  | { readonly type: 'fadeOut'; readonly hauntId: string; readonly ms: number }
  | { readonly type: 'setSoundEnabled'; readonly on: boolean }
  | { readonly type: 'setReducedMotion'; readonly on: boolean }
  | { readonly type: 'refreshVolumeCap' }
  | { readonly type: 'unlockAudio' }
  | { readonly type: 'dispose' }
  | { readonly type: 'beginReturnMoment' }
  | { readonly type: 'endReturnMoment'; readonly fadeMs: number | undefined }
  | { readonly type: 'openReturn'; readonly effectId: string; readonly jumpSound: boolean }
  | { readonly type: 'close'; readonly hauntId: string };

export interface FakeGate extends Gate {
  readonly calls: GateCall[];
  readonly ports: FakeGatePort[];
  /** Ports opened and not yet closed. */
  openPorts(): FakeGatePort[];
  options: FakeGateOptions;
  soundEnabled: boolean;
  reducedMotion: boolean;
  disposed: boolean;
  /** True between `beginReturnMoment` and `endReturnMoment`. */
  returnActive: boolean;
  /** Every ReturnPort handed out by `openReturn`. */
  readonly returnPorts: ReturnPort[];
}

export function createFakeGate(options: FakeGateOptions = {}): FakeGate {
  const calls: GateCall[] = [];
  const ports: FakeGatePort[] = [];
  const gate: FakeGate = {
    calls,
    ports,
    options,
    soundEnabled: true,
    reducedMotion: false,
    disposed: false,
    returnActive: false,
    returnPorts: [],
    openPorts: () => ports.filter((p) => !p.closed),
    open(hauntId) {
      calls.push({ type: 'open', hauntId });
      if (gate.options.openThrowsFor?.includes(hauntId)) throw new Error(`fake gate: open ${hauntId} threw`);
      const gains: number[] = [];
      const glowCalls: FakeGatePort['glowCalls'] = [];
      const layers: FakeVisualLayer[] = [];
      const readyCallbacks: FakeGatePort['readyCallbacks'] = [];
      const fadeOuts: number[] = [];
      const audibleCallbacks: FakeGatePort['audibleCallbacks'] = [];
      const tickCallbacks: FakeGatePort['tickCallbacks'] = [];
      let audible = true;
      let audibleSubscriptions = 0;
      let closeCalls = 0;
      const port: FakeGatePort = {
        hauntId,
        gains,
        glowCalls,
        layers,
        readyCallbacks,
        audibleCallbacks,
        tickCallbacks,
        tick() {
          for (const t of [...tickCallbacks]) t.cb();
        },
        get audible() {
          return audible;
        },
        get audibleSubscriptions() {
          return audibleSubscriptions;
        },
        setAudible(next) {
          if (audible === next) return;
          audible = next;
          for (const cb of [...audibleCallbacks]) cb(next);
        },
        get closeCalls() {
          return closeCalls;
        },
        get closed() {
          return closeCalls > 0;
        },
        audio: {
          whenReady(cb) {
            readyCallbacks.push(cb);
            return () => {
              const i = readyCallbacks.indexOf(cb);
              if (i >= 0) readyCallbacks.splice(i, 1);
            };
          },
          setGain: (g) => void gains.push(g),
          onTick(cb, periodMs) {
            const entry = { cb, periodMs };
            tickCallbacks.push(entry);
            return () => {
              const i = tickCallbacks.indexOf(entry);
              if (i >= 0) tickCallbacks.splice(i, 1);
            };
          },
          onAudibleChange(cb) {
            audibleSubscriptions += 1;
            audibleCallbacks.push(cb);
            cb(audible);
            return () => {
              const i = audibleCallbacks.indexOf(cb);
              if (i >= 0) audibleCallbacks.splice(i, 1);
            };
          },
        },
        visual: {
          glow: {
            setDim: (amount, fadeMs) => void glowCalls.push({ kind: 'dim', args: fadeMs === undefined ? [amount] : [amount, fadeMs] }),
            setGutter: (depth, rate) => void glowCalls.push({ kind: 'gutter', args: [depth, rate] }),
          },
          createLayer(side) {
            const layer = createFakeLayer(side);
            layers.push(layer);
            return layer;
          },
        },
        fireReady(ctx) {
          for (const cb of readyCallbacks.splice(0)) cb(ctx);
        },
        fadeOuts,
        fadeOut(ms) {
          fadeOuts.push(ms);
          calls.push({ type: 'fadeOut', hauntId, ms });
        },
        close() {
          closeCalls += 1;
          audibleCallbacks.length = 0;
          calls.push({ type: 'close', hauntId });
          if (gate.options.closeThrows) throw new Error(`fake gate: close ${hauntId} threw`);
        },
      };
      ports.push(port);
      return port;
    },
    fadeOutAll(requestedMs) {
      calls.push({ type: 'fadeOutAll', requestedMs });
      const ms = Number.isFinite(requestedMs) ? requestedMs : 0;
      return Math.min(800, Math.max(50, ms));
    },
    setSoundEnabled(on) {
      calls.push({ type: 'setSoundEnabled', on });
      gate.soundEnabled = on;
    },
    setReducedMotion(on) {
      calls.push({ type: 'setReducedMotion', on });
      gate.reducedMotion = on;
    },
    refreshVolumeCap: () => void calls.push({ type: 'refreshVolumeCap' }),
    unlockAudio: () => void calls.push({ type: 'unlockAudio' }),
    beginReturnMoment() {
      calls.push({ type: 'beginReturnMoment' });
      gate.returnActive = true;
    },
    endReturnMoment(fadeMs) {
      calls.push({ type: 'endReturnMoment', fadeMs });
      gate.returnActive = false;
    },
    openReturn(effectId, opts) {
      calls.push({ type: 'openReturn', effectId, jumpSound: opts?.jumpSound === true });
      if (!gate.returnActive) return null;
      const base: AudioOut = {
        whenReady: () => () => undefined,
        setGain: () => undefined,
        onAudibleChange: () => () => undefined,
        onTick: () => () => undefined,
      };
      const port: ReturnPort = {
        audio: base,
        visual: {
          glow: { setDim: () => undefined, setGutter: () => undefined },
          createLayer: createFakeLayer,
          createOverlay: () => createFakeLayer('left'),
          runGlitch: (spec) => ({ grantedFlickers: spec.flickers }),
        },
        close: () => undefined,
      };
      gate.returnPorts.push(port);
      return port;
    },
    dispose() {
      calls.push({ type: 'dispose' });
      gate.disposed = true;
    },
  };
  return gate;
}

// ---------------------------------------------------------------------------
// Fake reading context, evidence host and spoiler host (ghost-dread)
// ---------------------------------------------------------------------------

export interface FakeReadingOptions {
  chapterKey?: string;
  activeParagraph?: string | null;
  spoilerSource?: ReturnType<ReadingContext['spoilerSource']>;
  readSoFar?: { text: string; position: number };
}

export interface FakeReading extends ReadingContext {
  options: FakeReadingOptions;
}

/** A reading context whose answers are set by the test and can change between calls. */
export function createFakeReading(options: FakeReadingOptions = {}): FakeReading {
  const reading: FakeReading = {
    options,
    chapterKey: () => reading.options.chapterKey ?? 'chapter-1',
    activeParagraph: () => reading.options.activeParagraph ?? null,
    spoilerSource: () => reading.options.spoilerSource ?? null,
    readSoFar: () => reading.options.readSoFar ?? { text: '', position: 0 },
  };
  return reading;
}

export interface FakeEvidenceHost extends EvidenceHost {
  readonly shown: { shown: string; original: string }[];
  clears: number;
}

export function createFakeEvidenceHost(): FakeEvidenceHost {
  const host: FakeEvidenceHost = {
    shown: [],
    clears: 0,
    show: (shown, original) => void host.shown.push({ shown, original }),
    clear: () => {
      host.clears += 1;
    },
  };
  return host;
}

export interface FakeSpoilerHost extends SpoilerHost {
  readonly cards: SpoilerCardView[];
  readonly holdings: boolean[];
  hides: number;
}

export function createFakeSpoilerHost(): FakeSpoilerHost {
  const host: FakeSpoilerHost = {
    cards: [],
    holdings: [],
    hides: 0,
    show: (card) => void host.cards.push(card),
    setHolding: (holding) => void host.holdings.push(holding),
    hide: () => {
      host.hides += 1;
    },
  };
  return host;
}

// ---------------------------------------------------------------------------
// Fake Web Audio
// ---------------------------------------------------------------------------

export type AutomationType = 'setValueAtTime' | 'linearRampToValueAtTime' | 'cancelScheduledValues' | 'setValue';

export interface AutomationCall {
  /** Label of the param, e.g. `gain#3.gain`. */
  readonly param: FakeAudioParam;
  readonly type: AutomationType;
  /** Absent for `cancelScheduledValues`. */
  readonly value?: number;
  /** Time as passed by the caller. For `setValue` it is the context time of the call. */
  readonly time: number;
  /** Time the event has in the timeline (clamped up to `currentTime`, as in the spec). */
  readonly effectiveTime: number;
  /** `ctx.currentTime` when the call was made. */
  readonly atContextTime: number;
}

interface TimelineEvent {
  readonly kind: 'set' | 'ramp';
  readonly value: number;
  readonly time: number;
}

function checkTime(time: number, what: string): void {
  if (typeof time !== 'number' || Number.isNaN(time) || !Number.isFinite(time)) {
    throw new TypeError(`${what}: time must be a finite number`);
  }
  if (time < 0) throw new TypeError(`${what}: negative time ${time}`);
}
function checkValue(value: number, what: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${what}: value must be finite`);
}

export class FakeAudioParam {
  readonly calls: AutomationCall[] = [];
  private timeline: TimelineEvent[] = [];
  private intrinsic: number;
  readonly label: string;
  readonly defaultValue: number;
  private readonly currentTime: () => number;
  private readonly sink: (call: AutomationCall) => void;
  constructor(label: string, defaultValue: number, currentTime: () => number, sink: (call: AutomationCall) => void) {
    this.label = label;
    this.defaultValue = defaultValue;
    this.currentTime = currentTime;
    this.sink = sink;
    this.intrinsic = defaultValue;
  }

  /** Intrinsic value only. It is NOT automation-aware, so code must not use it as "the value now". */
  get value(): number {
    return this.intrinsic;
  }
  /** Per spec, equivalent to `setValueAtTime(v, currentTime)`. Recorded as `setValue` so tests can forbid it. */
  set value(v: number) {
    checkValue(v, `${this.label}.value`);
    const now = this.currentTime();
    this.intrinsic = v;
    this.insert({ kind: 'set', value: v, time: now });
    this.record({ type: 'setValue', value: v, time: now, effectiveTime: now });
  }

  setValueAtTime(value: number, time: number): this {
    checkValue(value, `${this.label}.setValueAtTime`);
    checkTime(time, `${this.label}.setValueAtTime`);
    const eff = Math.max(time, this.currentTime());
    this.insert({ kind: 'set', value, time: eff });
    this.record({ type: 'setValueAtTime', value, time, effectiveTime: eff });
    return this;
  }

  linearRampToValueAtTime(value: number, time: number): this {
    checkValue(value, `${this.label}.linearRampToValueAtTime`);
    checkTime(time, `${this.label}.linearRampToValueAtTime`);
    const now = this.currentTime();
    const eff = Math.max(time, now);
    if (this.timeline.length === 0) {
      // Spec: with no preceding event the ramp starts from the value now, at the current time.
      this.insert({ kind: 'set', value: this.intrinsic, time: now });
    }
    this.insert({ kind: 'ramp', value, time: eff });
    this.record({ type: 'linearRampToValueAtTime', value, time, effectiveTime: eff });
    return this;
  }

  /** Drops every event at or after `time`. The value then follows the remaining events. */
  cancelScheduledValues(time: number): this {
    checkTime(time, `${this.label}.cancelScheduledValues`);
    this.timeline = this.timeline.filter((e) => e.time < time);
    this.record({ type: 'cancelScheduledValues', time, effectiveTime: time });
    return this;
  }

  /** Value at context time `t`, from the event list (right-continuous at event times). */
  valueAt(t: number): number {
    return this.evaluate(t, false);
  }
  /** Limit of the value as time approaches `t` from below. Differs from `valueAt` at jumps. */
  valueBefore(t: number): number {
    return this.evaluate(t, true);
  }
  /** Largest value the param takes on the closed interval [t0, t1], jumps included. */
  maxValueOver(t0: number, t1: number): number {
    const times = [t0, t1, ...this.timeline.map((e) => e.time).filter((t) => t >= t0 && t <= t1)];
    let max = Number.NEGATIVE_INFINITY;
    for (const t of times) {
      max = Math.max(max, this.valueAt(t));
      if (t > t0) max = Math.max(max, this.valueBefore(t));
    }
    return max;
  }
  /** Times at which the value's slope can change (event times), ascending. */
  breakpoints(): number[] {
    return this.timeline.map((e) => e.time);
  }
  get eventCount(): number {
    return this.timeline.length;
  }

  private insert(e: TimelineEvent): void {
    let i = this.timeline.length;
    while (i > 0 && this.timeline[i - 1].time > e.time) i -= 1;
    this.timeline.splice(i, 0, e);
  }
  private record(c: Omit<AutomationCall, 'param' | 'atContextTime'>): void {
    const call: AutomationCall = { ...c, param: this, atContextTime: this.currentTime() };
    this.calls.push(call);
    this.sink(call);
  }
  private evaluate(t: number, left: boolean): number {
    const tl = this.timeline;
    let idx = -1;
    for (let i = 0; i < tl.length; i++) {
      if (left ? tl[i].time < t : tl[i].time <= t) idx = i;
    }
    const prev = idx >= 0 ? tl[idx] : null;
    const next = idx + 1 < tl.length ? tl[idx + 1] : null;
    if (next !== null && next.kind === 'ramp' && prev !== null && (next.time > t || (left && next.time >= t))) {
      // Web Audio linear ramp: v(t) = V0 + (V1 - V0) * (t - T0) / (T1 - T0)
      return prev.value + ((next.value - prev.value) * (t - prev.time)) / (next.time - prev.time);
    }
    return prev === null ? this.intrinsic : prev.value;
  }
}

export type FakeNodeKind =
  | 'gain'
  | 'compressor'
  | 'bufferSource'
  | 'biquad'
  | 'stereoPanner'
  | 'panner'
  | 'destination';

export type AudioLogEntry =
  | { readonly op: 'create'; readonly node: FakeAudioNode }
  | { readonly op: 'connect'; readonly from: FakeAudioNode; readonly to: FakeAudioNode | FakeAudioParam }
  | { readonly op: 'disconnect'; readonly from: FakeAudioNode; readonly to: FakeAudioNode | FakeAudioParam | 'all' };

export class FakeAudioNode {
  readonly id: number;
  readonly kind: FakeNodeKind;
  protected readonly ctx: FakeAudioContext;
  constructor(kind: FakeNodeKind, ctx: FakeAudioContext) {
    this.kind = kind;
    this.ctx = ctx;
    this.id = ctx.nextNodeId();
  }
  protected param(name: string, def: number): FakeAudioParam {
    return this.ctx.makeParam(`${this.kind}#${this.id}.${name}`, def);
  }
  connect<T extends FakeAudioNode | FakeAudioParam>(dest: T): T {
    this.ctx.addEdge(this, dest);
    return dest;
  }
  /** No argument removes every outgoing connection. A missing edge throws, as in browsers. */
  disconnect(dest?: FakeAudioNode | FakeAudioParam): void {
    this.ctx.removeEdges(this, dest);
  }
  /** Cast for passing to code typed against the DOM `AudioNode`. */
  asNode(): AudioNode {
    return this as unknown as AudioNode;
  }
}

export class FakeGainNode extends FakeAudioNode {
  readonly gain = this.param('gain', 1);
  constructor(ctx: FakeAudioContext) {
    super('gain', ctx);
  }
}
export class FakeCompressorNode extends FakeAudioNode {
  readonly threshold = this.param('threshold', -24);
  readonly knee = this.param('knee', 30);
  readonly ratio = this.param('ratio', 12);
  readonly attack = this.param('attack', 0.003);
  readonly release = this.param('release', 0.25);
  readonly reduction = 0;
  constructor(ctx: FakeAudioContext) {
    super('compressor', ctx);
  }
}
export class FakeBiquadNode extends FakeAudioNode {
  type = 'lowpass';
  readonly frequency = this.param('frequency', 350);
  readonly detune = this.param('detune', 0);
  readonly Q = this.param('Q', 1);
  readonly gain = this.param('gain', 0);
  constructor(ctx: FakeAudioContext) {
    super('biquad', ctx);
  }
}
export class FakeStereoPannerNode extends FakeAudioNode {
  readonly pan = this.param('pan', 0);
  constructor(ctx: FakeAudioContext) {
    super('stereoPanner', ctx);
  }
}
/** A 3D PannerNode. Settings start at the documented defaults. `positionX/Y/Z` are absent in the no-params variant. */
export class FakePannerNode extends FakeAudioNode {
  panningModel = 'equalpower';
  distanceModel = 'inverse';
  refDistance = 1;
  rolloffFactor = 1;
  coneInnerAngle = 360;
  coneOuterAngle = 360;
  coneOuterGain = 0;
  readonly positionX?: FakeAudioParam;
  readonly positionY?: FakeAudioParam;
  readonly positionZ?: FakeAudioParam;
  /** Every `setPosition(x, y, z)` call, in order. */
  readonly setPositionCalls: [number, number, number][] = [];
  constructor(ctx: FakeAudioContext, withPositionParams: boolean) {
    super('panner', ctx);
    if (withPositionParams) {
      this.positionX = this.param('positionX', 0);
      this.positionY = this.param('positionY', 0);
      this.positionZ = this.param('positionZ', 0);
    }
  }
  setPosition(x: number, y: number, z: number): void {
    this.setPositionCalls.push([x, y, z]);
  }
}

/**
 * AudioListener. Its params keep their own call lists and do not feed `ctx.automation`.
 * Without params (Firefox) only `setPosition` and `setOrientation` exist.
 */
export class FakeListener {
  readonly positionX?: FakeAudioParam;
  readonly positionY?: FakeAudioParam;
  readonly positionZ?: FakeAudioParam;
  readonly forwardX?: FakeAudioParam;
  readonly forwardY?: FakeAudioParam;
  readonly forwardZ?: FakeAudioParam;
  readonly upX?: FakeAudioParam;
  readonly upY?: FakeAudioParam;
  readonly upZ?: FakeAudioParam;
  readonly setPositionCalls: [number, number, number][] = [];
  readonly setOrientationCalls: [number, number, number, number, number, number][] = [];
  constructor(withParams: boolean, now: () => number) {
    if (!withParams) return;
    const mk = (name: string, def: number): FakeAudioParam => new FakeAudioParam(`listener.${name}`, def, now, () => undefined);
    this.positionX = mk('positionX', 0);
    this.positionY = mk('positionY', 0);
    this.positionZ = mk('positionZ', 0);
    this.forwardX = mk('forwardX', 0);
    this.forwardY = mk('forwardY', 0);
    this.forwardZ = mk('forwardZ', -1);
    this.upX = mk('upX', 0);
    this.upY = mk('upY', 1);
    this.upZ = mk('upZ', 0);
  }
  setPosition(x: number, y: number, z: number): void {
    this.setPositionCalls.push([x, y, z]);
  }
  setOrientation(x: number, y: number, z: number, xUp: number, yUp: number, zUp: number): void {
    this.setOrientationCalls.push([x, y, z, xUp, yUp, zUp]);
  }
}

export class FakeBufferSourceNode extends FakeAudioNode {
  buffer: FakeAudioBuffer | null = null;
  loop = false;
  readonly playbackRate = this.param('playbackRate', 1);
  readonly startCalls: (number | undefined)[] = [];
  readonly stopCalls: (number | undefined)[] = [];
  onended: (() => void) | null = null;
  constructor(ctx: FakeAudioContext) {
    super('bufferSource', ctx);
  }
  start(when?: number): void {
    this.startCalls.push(when);
  }
  stop(when?: number): void {
    this.stopCalls.push(when);
  }
}
export class FakeDestinationNode extends FakeAudioNode {
  constructor(ctx: FakeAudioContext) {
    super('destination', ctx);
  }
}

export class FakeAudioBuffer {
  private readonly channels: Float32Array[];
  readonly duration: number;
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
    this.duration = length / sampleRate;
  }
  getChannelData(channel: number): Float32Array {
    const data = this.channels[channel];
    if (data === undefined) throw namedError('IndexSizeError', `channel ${channel} out of range`);
    return data;
  }
}

function namedError(name: string, message: string): Error {
  const e = new Error(message);
  e.name = name;
  return e;
}

export type FakeAudioState = 'suspended' | 'running' | 'closed' | 'interrupted';

export interface FakeAudioContextOptions {
  clock: FakeClock;
  sampleRate?: number;
  /** `resume()` returns a rejected promise and the state stays as it was. */
  resumeRejects?: boolean;
  /** The constructor throws (`InvalidStateError`). */
  constructorThrows?: boolean;
  /** `createPanner` throws (`NotSupportedError`). */
  createPannerThrows?: boolean;
  /** Panners have no `positionX/Y/Z` (old Safari); only `setPosition` moves them. */
  pannerWithoutPositionParams?: boolean;
  /** The listener has no AudioParams (Firefox); only `setPosition` and `setOrientation` exist. */
  listenerWithoutParams?: boolean;
}

export class FakeAudioContext {
  readonly sampleRate: number;
  readonly destination: FakeDestinationNode;
  /** Every node created, in order (destination excluded). */
  readonly createdNodes: FakeAudioNode[] = [];
  /** Live connections only. */
  readonly connections: { from: FakeAudioNode; to: FakeAudioNode | FakeAudioParam }[] = [];
  /** Create, connect and disconnect in call order. */
  readonly log: AudioLogEntry[] = [];
  /** Every AudioParam automation call from every node, in call order. */
  readonly automation: AutomationCall[] = [];
  readonly resumeCalls: number[] = [];
  readonly listener: FakeListener;
  resumeRejects: boolean;
  private stateValue: FakeAudioState = 'suspended';
  private time = 0;
  private idCounter = 0;
  private readonly stateListeners = new Set<() => void>();
  onstatechange: (() => void) | null = null;

  private readonly options: FakeAudioContextOptions;
  constructor(options: FakeAudioContextOptions) {
    this.options = options;
    if (options.constructorThrows) throw namedError('InvalidStateError', 'fake AudioContext: constructor threw');
    this.sampleRate = options.sampleRate ?? 48000;
    this.resumeRejects = options.resumeRejects ?? false;
    this.destination = new FakeDestinationNode(this);
    this.listener = new FakeListener(!(options.listenerWithoutParams ?? false), () => this.time);
    // Time moves with the fake clock, but only while the context is running.
    options.clock.onAdvance((deltaMs) => {
      if (this.stateValue === 'running') this.time += deltaMs / 1000;
    });
  }

  get currentTime(): number {
    return this.time;
  }
  get state(): FakeAudioState {
    return this.stateValue;
  }

  resume(): Promise<void> {
    this.resumeCalls.push(this.options.clock.now());
    if (this.stateValue === 'closed') return Promise.reject(namedError('InvalidStateError', 'context is closed'));
    if (this.resumeRejects) return Promise.reject(namedError('NotAllowedError', 'fake resume rejected'));
    return Promise.resolve().then(() => this.setState('running'));
  }
  close(): Promise<void> {
    this.setState('closed');
    return Promise.resolve();
  }
  /** Test control: change the state the way the browser would (e.g. `interrupted`). */
  setState(next: FakeAudioState): void {
    if (this.stateValue === next) return;
    this.stateValue = next;
    this.onstatechange?.();
    for (const cb of [...this.stateListeners]) cb();
  }
  addEventListener(type: 'statechange', cb: () => void): void {
    if (type === 'statechange') this.stateListeners.add(cb);
  }
  removeEventListener(type: 'statechange', cb: () => void): void {
    if (type === 'statechange') this.stateListeners.delete(cb);
  }

  createGain(): FakeGainNode {
    return this.track(new FakeGainNode(this));
  }
  createDynamicsCompressor(): FakeCompressorNode {
    return this.track(new FakeCompressorNode(this));
  }
  createBiquadFilter(): FakeBiquadNode {
    return this.track(new FakeBiquadNode(this));
  }
  createStereoPanner(): FakeStereoPannerNode {
    return this.track(new FakeStereoPannerNode(this));
  }
  createPanner(): FakePannerNode {
    if (this.options.createPannerThrows) throw namedError('NotSupportedError', 'fake createPanner: not supported');
    return this.track(new FakePannerNode(this, !(this.options.pannerWithoutPositionParams ?? false)));
  }
  createBufferSource(): FakeBufferSourceNode {
    return this.track(new FakeBufferSourceNode(this));
  }
  /** Rejects channels outside 1..32, rates outside 8000..96000 and lengths below 1 (the zero-length rule is unconfirmed in the docs). */
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): FakeAudioBuffer {
    const ok =
      Number.isInteger(numberOfChannels) && numberOfChannels >= 1 && numberOfChannels <= 32 &&
      Number.isInteger(length) && length >= 1 &&
      Number.isFinite(sampleRate) && sampleRate >= 8000 && sampleRate <= 96000;
    if (!ok) throw namedError('NotSupportedError', 'fake createBuffer: invalid arguments');
    return new FakeAudioBuffer(numberOfChannels, length, sampleRate);
  }

  /** Cast for passing to code typed against the DOM `AudioContext`. */
  asContext(): AudioContext {
    return this as unknown as AudioContext;
  }

  // -- graph analysis -------------------------------------------------------

  /** Every path from `source` to `destination`, as node lists (source first, destination last). Cycles are not followed. */
  pathsToDestination(source: FakeAudioNode): FakeAudioNode[][] {
    const paths: FakeAudioNode[][] = [];
    const walk = (node: FakeAudioNode, trail: FakeAudioNode[]): void => {
      if (trail.includes(node)) return;
      const here = [...trail, node];
      if (node === this.destination) {
        paths.push(here);
        return;
      }
      for (const edge of this.connections) {
        if (edge.from === node && edge.to instanceof FakeAudioNode) walk(edge.to, here);
      }
    };
    walk(source, []);
    return paths;
  }
  /**
   * Effective gain at context time `t` from `source` to `destination`: for each path the product of
   * the `gain` values of every GainNode on it (the source included), summed over paths. 0 when no path reaches the destination.
   */
  effectiveGainAt(source: FakeAudioNode, t: number): number {
    let sum = 0;
    for (const path of this.pathsToDestination(source)) {
      let product = 1;
      for (const node of path) if (node instanceof FakeGainNode) product *= node.gain.valueAt(t);
      sum += product;
    }
    return sum;
  }
  /** Sorted, de-duplicated automation times of every GainNode on a path from `source` to the destination. */
  gainBreakpoints(source: FakeAudioNode): number[] {
    const times = new Set<number>();
    for (const path of this.pathsToDestination(source)) {
      for (const node of path) if (node instanceof FakeGainNode) for (const t of node.gain.breakpoints()) times.add(t);
    }
    return [...times].sort((a, b) => a - b);
  }
  /** All created nodes of one kind. */
  nodesOfKind<K extends FakeNodeKind>(kind: K): FakeAudioNode[] {
    return this.createdNodes.filter((n) => n.kind === kind);
  }

  // -- internals used by nodes ---------------------------------------------

  nextNodeId(): number {
    this.idCounter += 1;
    return this.idCounter;
  }
  makeParam(label: string, def: number): FakeAudioParam {
    return new FakeAudioParam(label, def, () => this.time, (c) => void this.automation.push(c));
  }
  addEdge(from: FakeAudioNode, to: FakeAudioNode | FakeAudioParam): void {
    const exists = this.connections.some((e) => e.from === from && e.to === to);
    if (!exists) this.connections.push({ from, to });
    this.log.push({ op: 'connect', from, to });
  }
  removeEdges(from: FakeAudioNode, to?: FakeAudioNode | FakeAudioParam): void {
    if (to === undefined) {
      for (let i = this.connections.length - 1; i >= 0; i--) if (this.connections[i].from === from) this.connections.splice(i, 1);
      this.log.push({ op: 'disconnect', from, to: 'all' });
      return;
    }
    const i = this.connections.findIndex((e) => e.from === from && e.to === to);
    if (i < 0) throw namedError('InvalidAccessError', 'fake disconnect: not connected');
    this.connections.splice(i, 1);
    this.log.push({ op: 'disconnect', from, to });
  }
  private track<N extends FakeAudioNode>(node: N): N {
    this.createdNodes.push(node);
    this.log.push({ op: 'create', node });
    return node;
  }
}

export interface FakeAudioContextFactory {
  /** Matches a `createAudioContext: () => AudioContext` dependency. Throws when `options.constructorThrows`. */
  create(): AudioContext;
  /** Every context successfully constructed. */
  readonly contexts: FakeAudioContext[];
  /** How many times `create` was called, including failures. */
  readonly attempts: number;
  /** Mutable: change what the next `create` does. */
  options: Omit<FakeAudioContextOptions, 'clock'>;
}

export function createFakeAudioContextFactory(
  clock: FakeClock,
  options: Omit<FakeAudioContextOptions, 'clock'> = {},
): FakeAudioContextFactory {
  const contexts: FakeAudioContext[] = [];
  let attempts = 0;
  const factory: FakeAudioContextFactory = {
    contexts,
    options,
    get attempts() {
      return attempts;
    },
    create() {
      attempts += 1;
      const ctx = new FakeAudioContext({ ...factory.options, clock });
      contexts.push(ctx);
      return ctx.asContext();
    },
  };
  return factory;
}

// ---------------------------------------------------------------------------
// Fake storage
// ---------------------------------------------------------------------------

export interface FakeStorage extends Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'clear' | 'key'> {
  readonly length: number;
  /** Raw contents. */
  readonly data: Map<string, string>;
  readonly reads: string[];
  readonly writes: { key: string; value: string }[];
  /** Mutable: make reads or writes throw (a locked-down browser). */
  throwOnGet: boolean;
  throwOnSet: boolean;
}

export function createFakeStorage(initial: Readonly<Record<string, string>> = {}): FakeStorage {
  const data = new Map<string, string>(Object.entries(initial));
  const s: FakeStorage = {
    data,
    reads: [],
    writes: [],
    throwOnGet: false,
    throwOnSet: false,
    get length() {
      return data.size;
    },
    getItem(key) {
      s.reads.push(key);
      if (s.throwOnGet) throw namedError('SecurityError', 'fake storage: read blocked');
      return data.has(key) ? (data.get(key) as string) : null;
    },
    setItem(key, value) {
      if (s.throwOnSet) throw namedError('QuotaExceededError', 'fake storage: write blocked');
      const v = String(value);
      data.set(key, v);
      s.writes.push({ key, value: v });
    },
    removeItem: (key) => void data.delete(key),
    clear: () => data.clear(),
    key: (i) => [...data.keys()][i] ?? null,
  };
  return s;
}

// ---------------------------------------------------------------------------
// Fake matchMedia
// ---------------------------------------------------------------------------

export interface FakeMatchMedia {
  /** Pass as the `matchMedia` dependency. */
  readonly matchMedia: MatchMediaFn;
  readonly queries: string[];
  /** Number of live `change` listeners across all lists. */
  readonly listenerCount: number;
  /** Changes `matches` on every list and fires `change` on its listeners. */
  setMatches(matches: boolean): void;
}

export function createFakeMatchMedia(initialMatches = false): FakeMatchMedia {
  let matches = initialMatches;
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const queries: string[] = [];
  const mql: MediaQueryListLike = {
    get matches() {
      return matches;
    },
    addEventListener: (_type, cb) => void listeners.add(cb),
    removeEventListener: (_type, cb) => void listeners.delete(cb),
  };
  return {
    queries,
    get listenerCount() {
      return listeners.size;
    },
    matchMedia: (query) => {
      queries.push(query);
      return mql;
    },
    setMatches(next) {
      matches = next;
      for (const cb of [...listeners]) cb({ matches: next });
    },
  };
}
