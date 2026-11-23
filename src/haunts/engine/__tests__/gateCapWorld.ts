/**
 * The world a Property 23 script runs in: the real gate and real audio adapter on the fake AudioContext,
 * plus the bookkeeping the reference needs (which gain node belongs to which port, the Return_Moment
 * windows as the spec states them, the cap history, the fade-outs owed). Nothing here reads the plan.
 */
import { expect } from 'vitest';
import { createGate } from '../gate/gate';
import { createReducedMotion } from '../gate/reducedMotion';
import type { HauntSpatialPanner } from '../hauntAudio';
import { KEYS } from '../settings';
import type { AudioOut, Gate } from '../types';
import { makeRef, type CapHistory } from './gateCapRef';
import type { Action, Scenario } from './gateCapScript';
import {
  createFakeAudioContextFactory, createFakeMatchMedia, createFakeStorage, createFakeTime,
  type FakeAudioContext, type FakeAudioContextFactory, type FakeBufferSourceNode, type FakeGainNode,
  type FakeMatchMedia, type FakePannerNode, type FakeScheduler, type FakeStorage, type FakeClock,
} from './fakes';

/** One Return_Moment as the spec states it: from begin until end or 3000 ms, in fake-clock milliseconds. */
export interface Window { readonly beginAt: number; endAt: number | null; finalizeAt: number | null }

export interface PannerRec { readonly w: HauntSpatialPanner; readonly raw: FakePannerNode; readonly src: FakeBufferSourceNode }

export interface PortRec {
  readonly kind: 'normal' | 'return';
  readonly jump: boolean;
  readonly audio: AudioOut;
  readonly closeFn: () => void;
  readonly fadeFn: ((ms: number) => void) | null;
  readonly window: Window | null;
  node: FakeGainNode | null;
  /** Closed before its gain node existed, so it never gets one. */
  skipped: boolean;
  closed: boolean;
  faded: boolean;
  readonly panners: PannerRec[];
}

export const FLAG_NAMES = [
  'jumpRise', 'jumpPlaying', 'capLow', 'capHigh', 'reducedJump', 'soundToggleJump', 'spatial', 'several', 'endWhileRising',
  'pannerMoved', 'capChangeJump',
] as const;
export type FlagName = (typeof FLAG_NAMES)[number];

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

export class World {
  readonly clock: FakeClock;
  readonly scheduler: FakeScheduler;
  readonly factory: FakeAudioContextFactory;
  readonly mm: FakeMatchMedia;
  readonly storage: FakeStorage;
  readonly unlockTarget = new EventTarget();
  readonly root = document.createElement('div');
  readonly gate: Gate;
  readonly ports: PortRec[] = [];
  readonly hist: CapHistory;
  capModel: number;
  osReduced: boolean;
  appReduced = false;
  ret: { active: boolean; window: Window | null } = { active: false, window: null };
  readonly windows: Window[] = [];
  /** Fade-outs that must reach 0 within 800 ms of `t` (ctx seconds). */
  obligations: { p: PortRec; t: number }[] = [];
  /** Fade-outs started by the last action, with the gain at the start. */
  justFaded: { p: PortRec; v0: number }[] = [];
  /** Index into ctx.automation up to which the rises have been checked. */
  mark = 0;
  readonly flags = new Set<FlagName>();

  constructor(s: Scenario) {
    ({ clock: this.clock, scheduler: this.scheduler } = createFakeTime());
    this.factory = createFakeAudioContextFactory(this.clock);
    this.mm = createFakeMatchMedia(s.osReduced);
    this.osReduced = s.osReduced;
    this.storage = createFakeStorage({ [KEYS.volumeCap]: s.capText });
    this.capModel = Number(s.capText);
    this.hist = { base: this.capModel, changes: [] };
    const left = document.createElement('div');
    const right = document.createElement('div');
    this.root.append(left, right);
    document.body.append(this.root);
    this.gate = createGate({
      audio: { createAudioContext: this.factory.create, eventTarget: this.unlockTarget },
      hosts: { root: this.root, left, right },
      storage: this.storage,
      storageEvents: null,
      reducedMotion: createReducedMotion(this.mm.matchMedia),
      scheduler: this.scheduler,
    });
  }

  get reduced(): boolean {
    return this.osReduced || this.appReduced;
  }
  ctx(): FakeAudioContext | undefined {
    return this.factory.contexts[0];
  }
  live(): PortRec[] {
    return this.ports.filter((p) => !p.closed);
  }
  private pick(who: number, pred: (p: PortRec) => boolean = () => true): PortRec | undefined {
    const list = this.live().filter(pred);
    return list.length === 0 ? undefined : list[who % list.length];
  }
  private newPort(rec: Omit<PortRec, 'node' | 'skipped' | 'closed' | 'faded' | 'panners'>): PortRec {
    const p: PortRec = { ...rec, node: null, skipped: false, closed: false, faded: false, panners: [] };
    this.ports.push(p);
    return p;
  }
  /** Connected channel nodes of ports that reach the master, with the port record. */
  connected(): PortRec[] {
    const ctx = this.ctx();
    if (ctx === undefined) return [];
    const nodes = new Set(makeRef(ctx).channels);
    return this.ports.filter((p) => p.node !== null && nodes.has(p.node));
  }

  /** Gives every new channel gain node to the port that opened it (open order, as the adapter attaches). */
  sync(): void {
    const ctx = this.ctx();
    if (ctx === undefined) return;
    const now = this.clock.now();
    for (const p of this.ports) {
      if (p.node === null && (p.window?.finalizeAt ?? Number.POSITIVE_INFINITY) <= now) p.skipped = true; // the gate closed it first
    }
    const gains = ctx.nodesOfKind('gain').slice(1) as FakeGainNode[];
    const taken = new Set(this.ports.map((p) => p.node));
    const free = gains.filter((n) => !taken.has(n));
    const pending = this.ports.filter((p) => p.node === null && !p.skipped);
    expect(free.length, 'new gain nodes match ports waiting for one').toBe(pending.length);
    pending.forEach((p, i) => void (p.node = free[i]));
  }

  /** The Return_Moment guard (3000 ms) as the spec states it. */
  syncReturn(): void {
    const w = this.ret.window;
    if (this.ret.active && w !== null && this.clock.now() >= w.beginAt + 3000) {
      this.ret.active = false;
      w.endAt = w.beginAt + 3000;
      // The 3000 ms rule: the guard fade starts at 2920 and everything is gone by begin + 3000, so the
      // guard end and the hard deadline coincide (stricter than the old endAt + 80).
      w.finalizeAt = w.endAt;
    }
  }

  private jumpRising(tEnd: number): boolean {
    const ctx = this.ctx();
    if (ctx === undefined) return false;
    const ref = makeRef(ctx);
    return this.connected().some((p) => p.jump && p.node !== null && ref.value(p.node, tEnd + 0.01) > ref.value(p.node, tEnd) + 1e-6);
  }

  private readCap(text: string): void {
    this.storage.setItem(KEYS.volumeCap, text);
    this.gate.refreshVolumeCap();
    const next = Number(text);
    if (next === this.capModel) return;
    const ctx = this.ctx();
    if (ctx !== undefined && this.connected().some((p) => p.jump)) this.flags.add('capChangeJump');
    this.capModel = next;
    if (ctx === undefined) {
      this.hist.base = next;
      this.hist.changes.length = 0;
    } else this.hist.changes.push({ t: ctx.currentTime, cap: next });
  }

  private gainSnapshot(ctx: FakeAudioContext): { calls: number; values: number[] } {
    const ref = makeRef(ctx);
    return {
      calls: ctx.automation.filter((c) => c.param.label.startsWith('gain#')).length,
      values: [0, 0.05, 0.1, 0.3, 1, 2].map((d) => ref.combined(ctx.currentTime + d)),
    };
  }

  private startFade(affected: PortRec[]): void {
    const ctx = this.ctx();
    if (ctx === undefined) return;
    const ref = makeRef(ctx);
    for (const p of affected) {
      if (p.node === null || !ref.channels.includes(p.node)) continue;
      this.justFaded.push({ p, v0: ref.value(p.node, ctx.currentTime) });
      this.obligations.push({ p, t: ctx.currentTime });
    }
  }

  private makePanner(p: PortRec): void {
    p.audio.whenReady((hctx) => {
      const ctx = this.ctx();
      if (ctx === undefined || p.panners.length >= 3) return;
      const w = hctx.createSpatialPanner();
      if (w === null) return;
      const raw = ctx.nodesOfKind('panner').at(-1) as FakePannerNode;
      const src = hctx.createBufferSource();
      const rawSrc = ctx.nodesOfKind('bufferSource').at(-1) as FakeBufferSourceNode;
      src.connect(w);
      w.connect(hctx.input);
      p.panners.push({ w, raw, src: rawSrc });
      this.flags.add('spatial');
    });
  }

  private movePanner(p: PortRec, a: Extract<Action, { k: 'move' }>): void {
    const ctx = this.ctx();
    if (ctx === undefined || p.panners.length === 0) return;
    const rec = p.panners[a.who % p.panners.length];
    const param = [rec.w.positionX, rec.w.positionY, rec.w.positionZ][a.dim];
    const before = this.gainSnapshot(ctx);
    if (a.rampMs === null) param.setValueAtTime(a.v, ctx.currentTime);
    else param.linearRampToValueAtTime(a.v, ctx.currentTime + a.rampMs / 1000);
    const after = this.gainSnapshot(ctx);
    expect(after.calls, 'a panner position change added a gain automation call').toBe(before.calls);
    expect(after.values, 'a panner position change changed the combined gain').toEqual(before.values);
    this.flags.add('pannerMoved');
  }

  private endReturn(ms: number | undefined): void {
    const ctx = this.ctx();
    const w = this.ret.window;
    if (this.ret.active && ctx !== undefined && this.jumpRising(ctx.currentTime)) this.flags.add('endWhileRising');
    this.gate.endReturnMoment(ms);
    if (!this.ret.active || w === null) return;
    const fade = ms === undefined || !Number.isFinite(ms) ? 80 : Math.min(100, Math.max(0, ms));
    this.ret.active = false;
    w.endAt = this.clock.now();
    // Never later than begin + 3000 (the 3000 ms rule), so an end near the deadline is cut off there.
    w.finalizeAt = Math.min(w.endAt + fade, w.beginAt + 3000);
  }

  async perform(a: Action): Promise<void> {
    const ctx = this.ctx();
    switch (a.k) {
      case 'open': {
        if (this.live().length >= 6) break;
        const port = this.gate.open(`h${this.ports.length}`);
        this.newPort({ kind: 'normal', jump: false, audio: port.audio, closeFn: port.close, fadeFn: port.fadeOut, window: null });
        break;
      }
      case 'setGain':
        this.pick(a.who)?.audio.setGain(a.v);
        break;
      case 'panner': {
        const p = this.pick(a.who);
        if (p !== undefined) this.makePanner(p);
        break;
      }
      case 'move': {
        const p = this.pick(a.who, (q) => q.panners.length > 0);
        if (p !== undefined) this.movePanner(p, a);
        break;
      }
      case 'close': {
        const p = this.pick(a.who);
        if (p === undefined) break;
        p.closeFn();
        p.closed = true;
        if (p.node === null) p.skipped = true;
        break;
      }
      case 'fade': {
        const p = this.pick(a.who, (q) => q.fadeFn !== null && !q.faded);
        if (p === undefined) break;
        this.startFade([p]);
        p.fadeFn?.(a.ms as number); // the script also sends undefined and NaN on purpose
        p.faded = true;
        break;
      }
      case 'fadeAll': {
        const affected = this.live();
        this.startFade(affected);
        this.gate.fadeOutAll(a.ms as number);
        for (const p of affected) p.faded = true;
        break;
      }
      case 'rBegin': {
        const wasActive = this.ret.active;
        this.gate.beginReturnMoment();
        if (wasActive) break;
        // A new Return_Moment closes the ports an earlier one left behind.
        for (const old of this.windows) if (old.finalizeAt === null || old.finalizeAt > this.clock.now()) old.finalizeAt = this.clock.now();
        const w: Window = { beginAt: this.clock.now(), endAt: null, finalizeAt: null };
        this.windows.push(w);
        this.ret = { active: true, window: w };
        break;
      }
      case 'rEnd':
        this.endReturn(a.ms);
        break;
      case 'rOpen': {
        const port = this.gate.openReturn('fx', { jumpSound: a.jump });
        expect(port === null, 'openReturn is null exactly outside a Return_Moment').toBe(!this.ret.active);
        if (port !== null) this.newPort({ kind: 'return', jump: a.jump, audio: port.audio, closeFn: port.close, fadeFn: null, window: this.ret.window });
        break;
      }
      case 'rOpenOutside': {
        if (this.ret.active) break;
        const before = ctx?.nodesOfKind('gain').length ?? 0;
        expect(this.gate.openReturn('fx', { jumpSound: true }), 'no jump channel outside a Return_Moment').toBeNull();
        expect(ctx?.nodesOfKind('gain').length ?? 0, 'a rejected jump channel made no gain node').toBe(before);
        break;
      }
      case 'cap':
        this.readCap(a.text);
        break;
      case 'sound': {
        const ref = ctx === undefined ? null : makeRef(ctx);
        if (ctx !== undefined && ref !== null && this.connected().some((p) => p.jump && p.node !== null && ref.value(p.node, ctx.currentTime + 0.01) > 1e-4)) this.flags.add('soundToggleJump');
        this.gate.setSoundEnabled(a.on);
        break;
      }
      case 'ctx':
        if (ctx !== undefined) ctx.setState(a.state);
        await flush();
        break;
      case 'unlock':
        if (a.via === 'api') this.gate.unlockAudio();
        else this.unlockTarget.dispatchEvent(new Event(a.via));
        await flush();
        break;
      case 'osReduced':
        this.osReduced = a.on;
        this.mm.setMatches(a.on);
        break;
      case 'appReduced':
        this.appReduced = a.on;
        this.gate.setReducedMotion(a.on);
        break;
    }
    this.syncReturn();
    this.sync();
  }

  /** Advances the fake clock to `dt` ms later, stopping at every timer so no timer-made ramp goes unchecked. */
  async advance(dt: number, afterStop: () => void): Promise<void> {
    const target = this.clock.now() + dt;
    for (;;) {
      const due = this.scheduler.pendingDueTimes().find((d) => d > this.clock.now() && d <= target);
      if (due === undefined) break;
      const w = this.ret.window;
      const ctx = this.ctx();
      if (this.ret.active && w !== null && due >= w.beginAt + 3000 && ctx !== undefined) {
        const tEnd = ctx.currentTime + (ctx.state === 'running' ? (due - this.clock.now()) / 1000 : 0);
        if (this.jumpRising(tEnd)) this.flags.add('endWhileRising');
      }
      this.scheduler.advance(due - this.clock.now());
      await flush();
      this.syncReturn();
      this.sync();
      afterStop();
    }
    this.scheduler.advance(target - this.clock.now());
    await flush();
    this.syncReturn();
    this.sync();
    afterStop();
  }

  dispose(): void {
    this.gate.dispose();
    this.root.remove();
  }
}
