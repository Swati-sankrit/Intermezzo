/**
 * Shared types for the haunt feature. Types only: no DOM, audio, timer or
 * camera access, and no import from src/attention/.
 */

export type HauntLevel = 1 | 2 | 3;
export type Unsubscribe = () => void;

/** The shape of a haunt module's named exports. */
export interface Haunt {
  readonly id: string;
  readonly name: string;
  start(level: HauntLevel, audio: AudioOut, visual: VisualOut): void;
  setLevel(level: HauntLevel): void;
  stop(): void;
}

export interface AudioOut {
  /**
   * Calls `cb` once, as soon as sound is possible (after Audio_Unlock), or at
   * once if it already is. `input` is this haunt's channel gain node: connect
   * every source to it and to nothing else. Returns a cancel function.
   */
  whenReady(cb: (ctx: AudioContext, input: AudioNode) => void): Unsubscribe;
  /** Requested absolute gain, 0 to 1. The gate clamps, scales and ramps it. */
  setGain(requested: number): void;
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
  dispose(): void;
}

export interface GatePort {
  readonly audio: AudioOut;
  readonly visual: VisualOut;
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
  readonly gentle: boolean;
  readonly noticeSeen: boolean;
}

export interface SettingsStore {
  get(): HauntSettings;
  /** Saves best-effort, then notifies. */
  set(patch: Partial<HauntSettings>): void;
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
