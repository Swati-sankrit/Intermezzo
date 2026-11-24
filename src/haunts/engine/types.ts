/**
 * Shared types for the haunt feature. Types only: no DOM, audio, timer or
 * camera access, and no import from src/attention/.
 */

import type { HauntAudioContext } from './hauntAudio';
import type { HauntMode } from './ghost/mode';
import type { ReturnPort } from './returnTypes';
import type { Rect } from './regions';

export type {
  HauntAudioContext, HauntBufferSource, HauntFilter, HauntNode, HauntPanner, HauntParam, HauntSink, HauntSpatialPanner,
} from './hauntAudio';

export type HauntLevel = 1 | 2 | 3;
export type Unsubscribe = () => void;

export type { HauntMode } from './ghost/mode';
export type { ReturnEffect, ReturnPlan, ReturnPort } from './returnTypes';

/** Extra start data. Existing haunts may ignore it. */
export interface StartInfo {
  readonly mode: HauntMode;
  readonly ghostStep: 0 | 1 | 2 | 3 | 4;
  /** One random draw in [0, 1) per start. */
  readonly roll: number;
  /** Side regions beside the Reading_Column, when the engine can measure them. */
  readonly regions?: { readonly left: Rect; readonly right: Rect };
}

/** The shape of a haunt module's named exports. */
export interface Haunt {
  readonly id: string;
  readonly name: string;
  start(level: HauntLevel, audio: AudioOut, visual: VisualOut, info?: StartInfo): void;
  setLevel(level: HauntLevel): void;
  stop(): void;
  /** Default 'lead'. Layers run alongside the lead and never enter Level_Logic. */
  readonly role?: 'lead' | 'layer';
  /** Default: all three modes. */
  readonly modes?: readonly HauntMode[];
  /** Layers only. Default 1. */
  readonly minLevel?: HauntLevel;
}

export interface AudioOut {
  /**
   * Calls `cb` once, as soon as sound is possible (after Audio_Unlock), or at
   * once if it already is. `ctx` is a restricted context: it makes sources, filters and
   * panners, and connects them only to each other and to `ctx.input` (this haunt's channel
   * gain). It has no `destination` and no raw AudioContext. Returns a cancel function.
   */
  whenReady(cb: (ctx: HauntAudioContext) => void): Unsubscribe;
  /** Requested absolute gain, 0 to 1. The gate clamps, scales and ramps it. */
  setGain(requested: number): void;
  /**
   * Read-only notification of whether sound can be heard: the sound setting is on AND audio is
   * unlocked AND the context state is `running`. Calls `cb` at once with the current value, then
   * only when the value changes. Stops after the returned cancel function or the port's `close()`
   * (it keeps delivering after `fadeOut`, which only stops requests). No calls after `gate.dispose()`.
   */
  onAudibleChange(cb: (audible: boolean) => void): Unsubscribe;
  /**
   * Calls `cb` about every `periodMs` (at least 100) until cancelled or the port closes or
   * fades out. Gate-owned, so haunt files need no timers.
   */
  onTick(cb: () => void, periodMs: number): Unsubscribe;
}

export interface GlowControl {
  /** 0 = calm glow, 1 = darkest allowed. Fade is raised to the plan minimum. */
  setDim(amount: number, fadeMs?: number): void;
  /** Dips of the glow. `depth` 0 to 1, `dipsPerSec` is limited by the flash budget. */
  setGutter(depth: number, dipsPerSec: number): void;
}

export interface VisualLayer {
  /** Static SVG or CSS content from a string constant. Parsed by the gate. */
  setMarkup(svg: string): void;
  setOpacity(opacity: number, fadeMs?: number): void;
  /** Slow movement across the layer, one crossing per `periodMs`; null stops it. */
  setSweep(periodMs: number | null): void;
  /** Screen-reader label. Without it the layer is hidden from assistive technology. */
  setLabel(text: string): void;
  remove(): void;
}

export interface VisualOut {
  readonly glow: GlowControl;
  /** A layer in the left or right region beside the Reading_Column. */
  createLayer(side: 'left' | 'right'): VisualLayer;
}

export interface Gate {
  open(hauntId: string): GatePort;
  /** Fade every open port to zero. Returns the planned duration, at most 800 ms. */
  fadeOutAll(requestedMs: number): number;
  setSoundEnabled(on: boolean): void;
  setReducedMotion(on: boolean): void;
  /** Re-read the Volume_Cap from storage. Also called on the `storage` event. */
  refreshVolumeCap(): void;
  /** Create and resume the AudioContext. Called by the first-gesture listener. */
  unlockAudio(): void;
  /** Starts a Return_Moment (at most 3000 ms); enables `openReturn`. */
  beginReturnMoment(): void;
  /** Closes every ReturnPort and overlay. `fadeMs` is at most 100. Safe to call twice. */
  endReturnMoment(fadeMs?: number): void;
  /** Null when no Return_Moment is running. */
  openReturn(effectId: string, opts?: { jumpSound?: boolean }): ReturnPort | null;
  dispose(): void;
}

export interface GatePort {
  readonly audio: AudioOut;
  readonly visual: VisualOut;
  /**
   * Fades only this port's audio and visuals to 0 over `planFadeOut(ms)` (at most 800 ms in
   * every mode), then ignores further audio and visual requests. Does not release the port.
   */
  fadeOut(ms: number): void;
  /** Gate-side cleanup: removes layers, disconnects the channel. Safe to call twice. */
  close(): void;
}

/**
 * Structural copy of the attention signal. Declared here so the haunt code
 * never imports from src/attention/. Task 1.2 may re-export it from levelLogic.
 */
export interface AttentionSignalLike {
  readonly value: 'present' | 'away';
  readonly timestamp: number;
}

/** Settings shape, declared here so EngineDeps compiles before settings.ts exists. */
export interface HauntSettings {
  readonly sound: boolean;
  readonly mode: HauntMode;
  readonly noticeSeen: boolean;
  /** True once the headphones tip has been shown with a saved notice. */
  readonly headphonesTipSeen: boolean;
}

export interface SettingsStore {
  get(): HauntSettings;
  /** Memory first, then best-effort save. Returns false when any write failed or storage is missing. */
  set(patch: Partial<HauntSettings>): boolean;
  subscribe(cb: () => void): Unsubscribe;
}

export interface EngineDeps {
  subscribeSignal(cb: (s: AttentionSignalLike) => void): Unsubscribe;
  haunts: readonly Haunt[];
  gate: Gate;
  settings: SettingsStore;
  /** Same time base as signal timestamps. */
  clock: { now(): number };
  scheduler: { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(id: unknown): void };
  random(): number;
  warn(msg: string): void;
}

export interface EngineState {
  readonly level: 0 | 1 | 2 | 3;
  readonly leadId: string | null;
  readonly companionId: string | null;
  readonly running: readonly string[];
}

export interface HauntEngine {
  /** Subscribe; level 0. */
  start(): void;
  /** Unsubscribe, stop everything, dispose timers. */
  stop(): void;
  getState(): EngineState;
}
