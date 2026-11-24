/**
 * Shared rig for the ghost haunt unit tests. The real gate, real audio and visual adapters and
 * the real restricted audio context run on the fake AudioContext and fake scheduler from
 * `engine/__tests__/fakes.ts`. The haunt under test is never replaced.
 *
 * Two observers wrap real objects without changing them: `spyAudio` hands the haunt a Proxy of
 * the real restricted context that records each spatial panner wrapper the haunt receives.
 */
import { createGate } from '../engine/gate/gate';
import { createReducedMotion } from '../engine/gate/reducedMotion';
import { KEYS } from '../engine/settings';
import type {
  AudioOut, Gate, GatePort, Haunt, HauntAudioContext, HauntLevel, HauntSpatialPanner, ReturnEffect, ReturnPlan,
  ReturnPort, StartInfo,
} from '../engine/types';
import {
  FakeAudioContext, FakeBufferSourceNode, FakePannerNode, createFakeAudioContextFactory, createFakeMatchMedia,
  createFakeStorage, createFakeTime, type FakeAudioNode, type FakeClock, type FakeScheduler,
} from '../engine/__tests__/fakes';

export interface WorldOptions {
  readonly reduced?: boolean;
  readonly createPannerThrows?: boolean;
  readonly stereoThrows?: boolean;
  readonly constructorThrows?: boolean;
  readonly cap?: string;
}

export class World {
  readonly clock: FakeClock;
  readonly scheduler: FakeScheduler;
  readonly root = document.createElement('div');
  readonly warnings: string[] = [];
  readonly gate: Gate;
  private readonly unlockTarget = new EventTarget();
  private readonly contexts: FakeAudioContext[];

  constructor(o: WorldOptions = {}) {
    ({ clock: this.clock, scheduler: this.scheduler } = createFakeTime());
    const factory = createFakeAudioContextFactory(this.clock, {
      createPannerThrows: o.createPannerThrows ?? false,
      constructorThrows: o.constructorThrows ?? false,
    });
    this.contexts = factory.contexts;
    const left = document.createElement('div');
    const right = document.createElement('div');
    this.root.append(left, right);
    document.body.append(this.root);
    const create = (): AudioContext => {
      const made = factory.create();
      if (o.stereoThrows === true) {
        // Environment fault: this browser cannot make a stereo panner.
        this.contexts[this.contexts.length - 1].createStereoPanner = () => {
          throw new Error('fake createStereoPanner: not supported');
        };
      }
      return made;
    };
    this.gate = createGate({
      audio: { createAudioContext: create, eventTarget: this.unlockTarget },
      hosts: { root: this.root, left, right },
      storage: createFakeStorage({ [KEYS.volumeCap]: o.cap ?? '0.5' }),
      storageEvents: null,
      reducedMotion: createReducedMotion(createFakeMatchMedia(o.reduced ?? false).matchMedia),
      scheduler: this.scheduler,
      warn: (m) => void this.warnings.push(m),
    });
  }

  /** The fake context, once audio has been unlocked. */
  get ctx(): FakeAudioContext {
    const c = this.contexts[0];
    if (c === undefined) throw new Error('audio is not unlocked');
    return c;
  }
  get hasContext(): boolean {
    return this.contexts.length > 0;
  }

  async unlock(): Promise<void> {
    this.unlockTarget.dispatchEvent(new Event('pointerdown'));
    for (let i = 0; i < 6; i++) await Promise.resolve();
  }

  /** Channel gain node of the n-th port (0-based); the master gain is first in the context. */
  channelGain(n = 0): ReturnType<FakeAudioContext['createGain']> {
    return this.ctx.nodesOfKind('gain')[n + 1] as ReturnType<FakeAudioContext['createGain']>;
  }

  /** Layer haunt on a real gate port. Audio is unlocked first (unless `unlock` is false). */
  async startLayer(mod: Haunt, level: HauntLevel = 1, info?: StartInfo, unlock = true): Promise<LayerRun> {
    const port = this.gate.open(mod.id);
    if (unlock) await this.unlock();
    const baseline = this.hasContext ? this.ctx.createdNodes.length : 0;
    const panners: HauntSpatialPanner[] = [];
    const seen: HauntAudioContext[] = [];
    const audio: AudioOut = {
      ...port.audio,
      whenReady: (cb) => port.audio.whenReady((real) => {
        const spy = new Proxy(real, {
          get(target, prop, recv) {
            if (prop === 'createSpatialPanner') {
              return () => {
                const w = target.createSpatialPanner();
                if (w !== null) panners.push(w);
                return w;
              };
            }
            return Reflect.get(target, prop, recv) as unknown;
          },
        });
        seen.push(spy);
        cb(spy);
      }),
    };
    mod.start(level, audio, port.visual, info);
    return new LayerRun(this, mod, port, baseline, panners, seen);
  }

  /** Return effect inside a Return_Moment, with its port from the real gate. */
  async beginEffect(mod: ReturnEffect, plan: ReturnPlan, unlock = true): Promise<EffectRun> {
    if (unlock) await this.unlock();
    this.gate.beginReturnMoment();
    const port = this.gate.openReturn(mod.id, mod.jumpSound === true ? { jumpSound: true } : undefined);
    if (port === null) throw new Error('openReturn gave no port inside a Return_Moment');
    const baseline = this.hasContext ? this.ctx.createdNodes.length : 0;
    mod.begin(plan, port);
    return new EffectRun(this, mod, port, baseline);
  }

  overlays(kind?: string): HTMLElement[] {
    const sel = kind === undefined ? '.haunt-overlay' : `.haunt-overlay[data-overlay-kind="${kind}"]`;
    return [...this.root.querySelectorAll<HTMLElement>(sel)];
  }
  layers(): HTMLElement[] {
    return [...this.root.querySelectorAll<HTMLElement>('.haunt-layer')];
  }

  /** Nodes created since `baseline`, and which of them still have an outgoing connection. */
  connectedAmong(nodes: readonly FakeAudioNode[]): FakeAudioNode[] {
    return nodes.filter((n) => this.ctx.connections.some((e) => e.from === n));
  }

  dispose(): void {
    this.gate.dispose();
    this.root.remove();
  }
}

abstract class Run {
  readonly w: World;
  readonly baseline: number;
  constructor(w: World, baseline: number) {
    this.w = w;
    this.baseline = baseline;
  }
  /** Every audio node the haunt created (the gate's own nodes are before the baseline). */
  nodes(): FakeAudioNode[] {
    return this.w.hasContext ? this.w.ctx.createdNodes.slice(this.baseline) : [];
  }
  sources(): FakeBufferSourceNode[] {
    return this.nodes().filter((n): n is FakeBufferSourceNode => n instanceof FakeBufferSourceNode);
  }
  panners(): FakePannerNode[] {
    return this.nodes().filter((n): n is FakePannerNode => n instanceof FakePannerNode);
  }
}

export class LayerRun extends Run {
  readonly mod: Haunt;
  readonly port: GatePort;
  readonly wrappers: HauntSpatialPanner[];
  readonly contexts: HauntAudioContext[];
  constructor(
    w: World, mod: Haunt, port: GatePort, baseline: number, wrappers: HauntSpatialPanner[],
    contexts: HauntAudioContext[],
  ) {
    super(w, baseline);
    this.mod = mod;
    this.port = port;
    this.wrappers = wrappers;
    this.contexts = contexts;
  }
  /** Moves the gate scheduler and the fake audio clock forward by `ms`, firing due ticks. */
  advance(ms: number): void {
    this.w.scheduler.advance(ms);
  }
  stop(): void {
    this.mod.stop();
    this.port.close();
  }
}

export class EffectRun extends Run {
  readonly mod: ReturnEffect;
  readonly port: ReturnPort;
  constructor(w: World, mod: ReturnEffect, port: ReturnPort, baseline: number) {
    super(w, baseline);
    this.mod = mod;
    this.port = port;
  }
}

export function plan(over: Partial<ReturnPlan> = {}): ReturnPlan {
  return {
    durationMs: 3000, qualifying: true, ambientFadeMs: 300, ghostStep: 2, ghostLingerMs: 1500,
    falseCalmMs: null, jumpscare: null, glitch: null, fade: null, evidence: null, spoiler: null,
    ...over,
  };
}

export function startInfo(over: Partial<StartInfo> = {}): StartInfo {
  return { mode: 'classic', ghostStep: 2, roll: 0.3, ...over };
}
