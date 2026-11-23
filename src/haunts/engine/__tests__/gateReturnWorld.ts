/**
 * The world a Property 24 script runs in: the real gate (real audio adapter, real return host and
 * return visual) on the fake AudioContext and the fake scheduler, plus a model of the Return_Moment
 * written from the requirements, not from the gate:
 *  - a Return_Moment is active from `begin` (ignored while one is active or after dispose) until
 *    `end` is called or 3000 ms have passed, whichever is first;
 *  - while active, every overlay and every return channel opened in it exists (unless the script
 *    closed it);
 *  - after the end they may fade for at most 100 ms, then none remains;
 *  - nothing is ever created for a Return_Moment that is not active.
 * The model never reads the gate's fade length or its internal state. `strict` additionally asserts
 * the reading "no effect outlives 3000 ms from the start" (haunt-safety: at most 3 seconds).
 */
import { expect } from 'vitest';
import { createGate } from '../gate/gate';
import { createReducedMotion } from '../gate/reducedMotion';
import type { OverlayKind, ReturnPort } from '../returnTypes';
import { KEYS } from '../settings';
import type { AudioOut, Gate, GatePort, VisualLayer } from '../types';
import { makeRef } from './gateCapRef';
import type { Action } from './gateReturnScript';
import {
  createFakeAudioContextFactory, createFakeMatchMedia, createFakeStorage, createFakeTime,
  type FakeAudioContext, type FakeGainNode, type FakeMatchMedia, type FakeScheduler, type FakeClock,
} from './fakes';

export const FLAG_NAMES = [
  'inGhost', 'inJumpscare', 'inCard', 'inGlitch', 'outGhost', 'outJumpscare', 'outCard', 'outGlitch',
  'jumpChannel', 'jumpRejected', 'guardCross', 'guardEndsWithEffects', 'doubleEnd', 'disposeMid', 'reducedMoment',
  'normalTryJump', 'secondBegin', 'glitchOut', 'glitchIn', 'beginInFade', 'staleLayerOp', 'soundToggleJump',
] as const;
export type FlagName = (typeof FLAG_NAMES)[number];

const OVERLAY_FLAG: Record<OverlayKind, [FlagName, FlagName]> = {
  ghost: ['inGhost', 'outGhost'], jumpscare: ['inJumpscare', 'outJumpscare'],
  'card-hand': ['inCard', 'outCard'], glitch: ['inGlitch', 'outGlitch'],
};

const SQUARE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="var(--shadow)"/></svg>';
/** The requirement: effects are gone within 100 ms of the end (tasks 3.7, Req 6.8 for the Glitch). */
const REMOVE_WITHIN_MS = 100;
const GUARD_MS = 3000;
/** Largest rise per 10 ms of a normal channel: a full cap (0.5) over the 300 ms fade-in floor. */
const NORMAL_RISE_PER_10MS = (0.5 * 10) / 300 + 1e-9;

interface Win { readonly beginAt: number; endAt: number | null; endedBy: 'call' | 'guard' | null; effectsAtLastMs: boolean }
type Level = 'must' | 'may' | 'never';

interface MPort {
  readonly kind: 'normal' | 'return';
  readonly jump: boolean;
  readonly win: Win | null;
  readonly audio: AudioOut;
  readonly closeFn: () => void;
  readonly ret: ReturnPort | null;
  node: FakeGainNode | null;
  closed: boolean;
  gone: boolean;
}

interface MLayer {
  readonly port: MPort;
  readonly layer: VisualLayer;
  readonly el: HTMLElement | null;
  removed: boolean;
  gone: boolean;
}

export interface Stats {
  /** Largest ms since the start of the Return_Moment at which an overlay or return channel was still present. */
  maxSinceBegin: number;
  maxSinceBeginByGuard: number;
  maxSinceBeginByCall: number;
  /** Largest ms since the end at which one was still present. */
  maxSinceEnd: number;
}
export const newStats = (): Stats => ({ maxSinceBegin: 0, maxSinceBeginByGuard: 0, maxSinceBeginByCall: 0, maxSinceEnd: 0 });

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

export class ReturnWorld {
  readonly clock: FakeClock;
  readonly scheduler: FakeScheduler;
  readonly mm: FakeMatchMedia;
  readonly unlockTarget = new EventTarget();
  readonly root = document.createElement('div');
  readonly gate: Gate;
  readonly flags = new Set<FlagName>();
  private readonly factory: ReturnType<typeof createFakeAudioContextFactory>;
  private readonly wins: Win[] = [];
  private readonly ports: MPort[] = [];
  private readonly layers: MLayer[] = [];
  private known = 0;
  private disposed = false;
  private osReduced = false;
  private appReduced = false;

  readonly strict: boolean;
  readonly stats: Stats;

  constructor(strict: boolean, stats: Stats) {
    this.strict = strict;
    this.stats = stats;
    ({ clock: this.clock, scheduler: this.scheduler } = createFakeTime());
    this.factory = createFakeAudioContextFactory(this.clock);
    this.mm = createFakeMatchMedia(false);
    const left = document.createElement('div');
    const right = document.createElement('div');
    this.root.append(left, right);
    document.body.append(this.root);
    this.gate = createGate({
      audio: { createAudioContext: this.factory.create, eventTarget: this.unlockTarget },
      hosts: { root: this.root, left, right },
      storage: createFakeStorage({ [KEYS.volumeCap]: '0.5' }),
      storageEvents: null,
      reducedMotion: createReducedMotion(this.mm.matchMedia),
      scheduler: this.scheduler,
    });
  }

  private ctx(): FakeAudioContext {
    const c = this.factory.contexts[0];
    if (c === undefined) throw new Error('the script must unlock audio first');
    return c;
  }
  private gains(): FakeGainNode[] {
    return this.ctx().nodesOfKind('gain').slice(1) as FakeGainNode[];
  }
  private cur(): Win | null {
    return this.wins.at(-1) ?? null;
  }
  /** Active as the requirements state it, at the current fake time. */
  private active(): boolean {
    const w = this.cur();
    return !this.disposed && w !== null && w.endAt === null && this.clock.now() - w.beginAt < GUARD_MS;
  }
  private hasEffects(w: Win): boolean {
    return this.ports.some((p) => p.win === w && !p.closed && p.node !== null && this.connected(p.node));
  }
  /**
   * The 3000 ms guard, as the spec states it: the moment is over once 3000 ms have passed.
   * Flag guardEndsWithEffects: the guard (not a caller endReturnMoment) ended the moment while an overlay or a return
   * channel was still present at begin + 2999 ms, the last millisecond the moment is active.
   */
  private syncModel(): void {
    const w = this.cur();
    if (this.disposed || w === null || w.endAt !== null) return;
    const since = this.clock.now() - w.beginAt;
    if (since === GUARD_MS - 1) {
      w.effectsAtLastMs = this.hasEffects(w) || this.layers.some((l) => l.port.win === w && l.el?.isConnected === true);
    }
    if (since < GUARD_MS) return;
    this.flags.add('guardCross');
    if (w.effectsAtLastMs) this.flags.add('guardEndsWithEffects');
    w.endAt = w.beginAt + GUARD_MS;
    w.endedBy = 'guard';
  }
  private connected(node: FakeGainNode): boolean {
    return this.ctx().connections.some((e) => e.from === node);
  }

  private level(win: Win, userGone: boolean, t: number): Level {
    if (this.disposed || userGone) return 'never';
    if (win.endAt === null) return 'must';
    return t < win.endAt + REMOVE_WITHIN_MS ? 'may' : 'never';
  }

  private judge(what: string, present: boolean, level: Level, rec: { gone: boolean }, win: Win | null, t: number): void {
    if (!present) rec.gone = true;
    expect(present && rec.gone, `${what} came back after it was gone`).toBe(false);
    const detail = win === null ? '' : ` (${t - win.beginAt} ms after begin${win.endAt === null ? ', moment active' : `, ${t - win.endAt} ms after the end`})`;
    if (level === 'must') expect(present, `${what} missing while its Return_Moment is active${detail}`).toBe(true);
    if (level === 'never') expect(present, `${what} still present${detail}`).toBe(false);
    if (present && win !== null) {
      const since = t - win.beginAt;
      this.stats.maxSinceBegin = Math.max(this.stats.maxSinceBegin, since);
      if (win.endedBy === 'guard') this.stats.maxSinceBeginByGuard = Math.max(this.stats.maxSinceBeginByGuard, since);
      if (win.endedBy === 'call') this.stats.maxSinceBeginByCall = Math.max(this.stats.maxSinceBeginByCall, since);
      if (win.endAt !== null) this.stats.maxSinceEnd = Math.max(this.stats.maxSinceEnd, t - win.endAt);
      if (this.strict) expect(since, `${what} present ${since} ms after its Return_Moment began (limit ${GUARD_MS})`).toBeLessThan(GUARD_MS);
    }
  }

  /** Checks every observable against the model at the current fake time. */
  observe(): void {
    this.syncModel();
    const t = this.clock.now();
    this.probe();
    for (const p of this.ports) {
      if (p.node === null) continue;
      const level = p.kind === 'normal' ? (p.closed || this.disposed ? 'never' : 'must') : this.level(p.win as Win, p.closed, t);
      this.judge(`${p.kind}${p.jump ? ' jump' : ''} channel`, this.connected(p.node), level, p, p.win, t);
    }
    let live = 0;
    for (const l of this.layers) {
      if (l.el === null) continue;
      const present = l.el.isConnected;
      const win = l.port.win as Win;
      this.judge(`${l.el.getAttribute('data-overlay-kind')} overlay`, present, this.level(win, l.removed || l.port.closed, t), l, win, t);
      if (present) live += 1;
      if (present && win.endAt !== null) expect(l.el.style.opacity, 'an overlay of an ended Return_Moment is fading out').toBe('0');
    }
    expect(this.root.querySelectorAll('.haunt-overlay').length, 'every overlay in the page was made by a Return_Moment the script opened').toBe(live);
    if (this.disposed) expect(this.scheduler.pendingCount, 'no timer left after dispose').toBe(0);
  }

  /** While no Return_Moment is active openReturn must refuse and make nothing; while one is, it must open. */
  private probe(): void {
    const expected = this.active();
    const nodes = this.ctx().createdNodes.length;
    const html = this.root.innerHTML;
    const port = this.gate.openReturn('probe');
    expect(port !== null, `openReturn is ${expected ? 'open' : 'null'} at ${this.clock.now()} ms`).toBe(expected);
    if (port === null) {
      expect(this.ctx().createdNodes.length, 'a refused openReturn created an audio node').toBe(nodes);
      expect(this.root.innerHTML, 'a refused openReturn changed the page').toBe(html);
      return;
    }
    port.close();
    for (const n of this.gains()) if (!this.ports.some((p) => p.node === n)) expect(this.connected(n), 'a closed probe channel is disconnected').toBe(false);
    this.known = this.gains().length;
  }

  /** Gives the one new gain node (if any) to the port just opened. */
  private track(p: MPort, mustCreate: boolean): void {
    const fresh = this.gains().slice(this.known);
    if (mustCreate) expect(fresh.length, 'one new channel gain node for one new port').toBe(1);
    expect(fresh.length <= 1).toBe(true);
    p.node = fresh[0] ?? null;
    this.known += fresh.length;
    this.ports.push(p);
  }

  private pickReturn(who: number): MPort | undefined {
    const list = this.ports.filter((p) => p.kind === 'return');
    return list.length === 0 ? undefined : list[who % list.length];
  }
  private pickNormal(who: number): MPort | undefined {
    const list = this.ports.filter((p) => p.kind === 'normal' && !p.closed);
    return list.length === 0 ? undefined : list[who % list.length];
  }
  private portActive(p: MPort): boolean {
    return !this.disposed && !p.closed && p.win !== null && p.win.endAt === null;
  }

  private overlay(a: Extract<Action, { k: 'overlay' }>): void {
    const p = this.pickReturn(a.who);
    if (p === undefined || p.ret === null) return;
    const before = new Set(this.root.querySelectorAll('.haunt-overlay'));
    const wasActive = this.portActive(p);
    const layer = p.ret.visual.createOverlay(a.kind);
    const fresh = [...this.root.querySelectorAll<HTMLElement>('.haunt-overlay')].filter((e) => !before.has(e));
    expect(fresh.length, `createOverlay makes ${wasActive ? 'one element' : 'no element'} ${wasActive ? 'inside' : 'outside'} a Return_Moment`).toBe(wasActive ? 1 : 0);
    this.flags.add(OVERLAY_FLAG[a.kind][wasActive ? 0 : 1]);
    const el = fresh[0] ?? null;
    if (el !== null) expect(el.getAttribute('data-overlay-kind')).toBe(a.kind);
    this.layers.push({ port: p, layer, el, removed: false, gone: false });
  }

  private layerOp(a: Extract<Action, { k: 'layerOp' }>): void {
    if (this.layers.length === 0) return;
    const l = this.layers[a.who % this.layers.length];
    const el = l.el;
    const ended = l.port.win !== null && l.port.win.endAt !== null;
    const kids = el?.childElementCount ?? 0;
    const opacity = el?.style.opacity ?? '';
    const was = el?.isConnected === true;
    if (a.op === 'markup') l.layer.setMarkup(SQUARE);
    else if (a.op === 'opacity') l.layer.setOpacity(1, 300);
    else if (a.op === 'label') l.layer.setLabel('A pale figure');
    else {
      l.layer.remove();
      l.removed = true;
    }
    if (el !== null && was && ended && a.op !== 'remove') {
      this.flags.add('staleLayerOp');
      expect(el.childElementCount, 'a layer of an ended Return_Moment changed its content').toBe(kids);
      expect(el.style.opacity, 'a layer of an ended Return_Moment changed its opacity').toBe(opacity);
    }
  }

  private glitch(a: Extract<Action, { k: 'glitch' }>): void {
    const p = this.pickReturn(a.who);
    if (p === undefined || p.ret === null) return;
    const wasActive = this.portActive(p);
    const html = this.root.innerHTML;
    const out = p.ret.visual.runGlitch({ durationMs: 300, flickers: a.flickers });
    expect(Number.isInteger(out.grantedFlickers) && out.grantedFlickers >= 0 && out.grantedFlickers <= a.flickers, 'granted flickers are within what was asked').toBe(true);
    this.flags.add(wasActive ? 'glitchIn' : 'glitchOut');
    if (!wasActive) {
      expect(out.grantedFlickers, 'runGlitch outside a Return_Moment grants no flicker').toBe(0);
      expect(this.root.innerHTML, 'runGlitch outside a Return_Moment changed the page').toBe(html);
    }
  }

  private newPort(p: GatePort | null, kind: 'normal' | 'return', jump: boolean, win: Win | null, ret: ReturnPort | null): void {
    const audio = p?.audio ?? (ret as ReturnPort).audio;
    const closeFn = p?.close ?? (ret as ReturnPort).close;
    this.track({ kind, jump, win, audio, closeFn, ret, node: null, closed: false, gone: false }, !this.disposed);
  }

  async perform(a: Action): Promise<void> {
    this.syncModel();
    switch (a.k) {
      case 'unlock':
        this.unlockTarget.dispatchEvent(new Event('pointerdown'));
        await flush();
        this.known = this.gains().length;
        break;
      case 'begin': {
        const was = this.active();
        const prev = this.cur();
        this.gate.beginReturnMoment();
        if (this.disposed) break;
        if (was) {
          this.flags.add('secondBegin');
          break;
        }
        if (prev !== null && prev.endAt !== null && this.clock.now() < prev.endAt + REMOVE_WITHIN_MS) this.flags.add('beginInFade');
        this.wins.push({ beginAt: this.clock.now(), endAt: null, endedBy: null, effectsAtLastMs: false });
        break;
      }
      case 'end': {
        const was = this.active();
        const w = this.cur();
        this.gate.endReturnMoment(a.ms);
        if (was && w !== null) {
          w.endAt = this.clock.now();
          w.endedBy = 'call';
        } else if (w !== null && w.endAt !== null) this.flags.add('doubleEnd');
        break;
      }
      case 'rOpen': {
        const act = this.active();
        const nodes = this.ctx().createdNodes.length;
        const html = this.root.innerHTML;
        const ret = this.gate.openReturn('fx', { jumpSound: a.jump });
        expect(ret !== null, 'openReturn opens exactly while a Return_Moment is active').toBe(act);
        if (ret === null) {
          expect(this.ctx().createdNodes.length, 'a rejected channel made an audio node').toBe(nodes);
          expect(this.root.innerHTML, 'a rejected channel changed the page').toBe(html);
          if (a.jump) this.flags.add('jumpRejected');
        } else {
          if (a.jump) this.flags.add('jumpChannel');
          this.newPort(null, 'return', a.jump, this.cur(), ret);
        }
        break;
      }
      case 'overlay':
        this.overlay(a);
        break;
      case 'layerOp':
        this.layerOp(a);
        break;
      case 'glitch':
        this.glitch(a);
        break;
      case 'portClose': {
        const p = this.pickReturn(a.who);
        if (p === undefined) break;
        p.closeFn();
        p.closed = true;
        for (const l of this.layers) if (l.port === p) l.removed = true;
        break;
      }
      case 'open': {
        // The Gate type has no jumpSound option; a caller that passes one anyway must get a normal port.
        const open = this.gate.open as unknown as (id: string, o?: { jumpSound: boolean }) => GatePort;
        const port = a.tryJump ? open(`n${this.ports.length}`, { jumpSound: true }) : open(`n${this.ports.length}`);
        if (a.tryJump) this.flags.add('normalTryJump');
        this.newPort(port, 'normal', false, null, null);
        break;
      }
      case 'setGain':
        this.pickNormal(a.who)?.audio.setGain(a.v);
        break;
      case 'normalClose': {
        const p = this.pickNormal(a.who);
        if (p === undefined) break;
        p.closeFn();
        p.closed = true;
        break;
      }
      case 'sound':
        if (!a.on && this.ports.some((p) => p.jump && p.node !== null && this.connected(p.node))) this.flags.add('soundToggleJump');
        this.gate.setSoundEnabled(a.on);
        break;
      case 'reduced':
        this.appReduced = a.on;
        this.gate.setReducedMotion(a.on);
        break;
      case 'osReduced':
        this.osReduced = a.on;
        this.mm.setMatches(a.on);
        break;
      case 'dispose':
        if (this.active()) this.flags.add('disposeMid');
        this.gate.dispose();
        this.disposed = true;
        break;
      case 'step':
        await this.step(a.ms);
        break;
    }
    if (this.active() && (this.osReduced || this.appReduced)) this.flags.add('reducedMoment');
    this.observe();
    if (a.k === 'setGain' || a.k === 'sound' || a.k === 'reduced' || a.k === 'osReduced' || a.k === 'open') this.checkRises();
  }

  /** Times at which something should change, so the clock stops on both sides of each. */
  private boundaries(): number[] {
    const out: number[] = [];
    for (const w of this.wins) {
      if (w.endAt === null) out.push(w.beginAt + GUARD_MS - 1, w.beginAt + GUARD_MS);
      else for (const d of [79, 80, 81, 99, 100, 101]) out.push(w.endAt + d);
    }
    return out;
  }

  /** Advances the fake clock by `ms`, stopping at every pending timer and every boundary to observe. */
  private async step(ms: number): Promise<void> {
    const target = this.clock.now() + ms;
    for (;;) {
      const now = this.clock.now();
      const next = [...this.scheduler.pendingDueTimes(), ...this.boundaries()].filter((d) => d > now && d <= target).sort((x, y) => x - y)[0];
      if (next === undefined) break;
      this.scheduler.advance(next - now);
      await flush();
      this.observe();
    }
    this.scheduler.advance(target - this.clock.now());
    await flush();
  }

  /** No normal channel rises faster than the 300 ms fade-in floor, whatever the caller asked at `open`. */
  checkRises(): void {
    const ctx = this.ctx();
    const ref = makeRef(ctx);
    for (const p of this.ports) {
      if (p.kind !== 'normal' || p.node === null || p.closed) continue;
      for (let ms = 0; ms < 1500; ms += 10) {
        const t = ctx.currentTime + ms / 1000;
        const rise = ref.value(p.node, t + 0.01) - ref.value(p.node, t);
        expect(rise, `a normal channel rose ${rise} in 10 ms at +${ms} ms`).toBeLessThanOrEqual(NORMAL_RISE_PER_10MS);
      }
    }
  }

  /** The script is over: end any Return_Moment, let the fades finish, and look once more. */
  async finish(): Promise<void> {
    this.gate.endReturnMoment();
    const w = this.cur();
    if (this.active() && w !== null) {
      w.endAt = this.clock.now();
      w.endedBy = 'call';
    }
    await this.step(REMOVE_WITHIN_MS);
    this.observe();
    expect(this.root.querySelectorAll('.haunt-overlay').length, 'no overlay left when the script is over').toBe(0);
  }

  // Test hooks for the control tests: the same objects the checks read.
  jumpNodes(): FakeGainNode[] {
    return this.ports.filter((p) => p.jump && p.node !== null).map((p) => p.node as FakeGainNode);
  }
  normalNodes(): FakeGainNode[] {
    return this.ports.filter((p) => p.kind === 'normal' && p.node !== null).map((p) => p.node as FakeGainNode);
  }
  contextForTest(): FakeAudioContext {
    return this.ctx();
  }
  masterForTest(): FakeGainNode {
    return this.ctx().nodesOfKind('gain')[0] as FakeGainNode;
  }

  dispose(): void {
    this.gate.dispose();
    this.root.remove();
  }
}
