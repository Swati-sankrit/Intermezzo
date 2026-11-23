/** Types and constants shared by the audio adapter files. */
import type { HauntAudioContext } from '../hauntAudio';
import type { Unsubscribe } from '../types';

/** Ramp lengths for a lowered cap and for sound switched off (inside Req 6.13 and 9.2 limits). */
export const CAP_RAMP_MS = 50;
export const SOUND_OFF_RAMP_MS = 150;

/**
 * Safety limiter settings. The docs do not confirm the node defaults, so all are set.
 * Threshold -6 dB (about half scale) with a hard ratio and a fast attack catches peaks only.
 */
export const LIMITER = { threshold: -6, knee: 6, ratio: 20, attack: 0.003, release: 0.25 } as const;

export type RampKind = 'fade' | 'cap' | 'soundOff';
export interface GainRamp {
  readonly kind: RampKind;
  /** Used by `fade` only. */
  readonly requestedMs?: number;
  readonly reduced?: boolean;
  /** Explicit length of a falling ramp, set by the gate's plan; overrides the length chosen by `kind`. */
  readonly fallMs?: number;
  /** Set by the gate's plan (rule 5) on the rise of a jump channel: the rise uses `planJumpAttack`. Ignored by other channels. */
  readonly jump?: boolean;
}

export type ReadyCallback = (ctx: HauntAudioContext) => void;

export interface AudioChannel {
  /** True only for a channel opened with `jumpSound: true`. Fixed at open. */
  readonly jumpSound: boolean;
  /** Calls `cb` once when sound is possible, at once if it already is. */
  whenReady(cb: ReadyCallback): Unsubscribe;
  /** `target` is the gate's final, capped gain. Rising ramps last at least 300 ms (a jump channel's plan-marked rise: at least 20 ms). */
  setGain(target: number, ramp: GainRamp): void;
  /** In-flight gain now, from the adapter's own schedule record (never `param.value`). 0 if not attached. */
  currentGain(): number;
  /** Target and end time (context seconds) of the ramp still running, or null if none (or not attached). */
  inFlight(): { readonly target: number; readonly endSec: number } | null;
  /** Disconnects the channel. Safe to call twice. */
  close(): void;
}

export type UnlockEvent = 'pointerdown' | 'keydown';
/** The slice of `window` used for Audio_Unlock. */
export interface UnlockTarget {
  addEventListener(type: UnlockEvent, listener: () => void, capture: boolean): void;
  removeEventListener(type: UnlockEvent, listener: () => void, capture: boolean): void;
}

export interface AudioAdapterDeps {
  /** May throw; a throw means "not ready". */
  createAudioContext: () => AudioContext;
  /** `null` when there is no window; then only `unlock()` can start audio. */
  eventTarget: UnlockTarget | null;
  warn?: (msg: string) => void;
}

export interface OpenChannelOptions {
  /** A jump channel may rise with the short attack of `planJumpAttack`, and only when the gain plan asks for it. */
  readonly jumpSound?: boolean;
}

export interface AudioAdapter {
  openChannel(opts?: OpenChannelOptions): AudioChannel;
  /** What the unlock listener does on a gesture. Also called by `Gate.unlockAudio`. */
  unlock(): void;
  /** True only while the context state is `running`. */
  isReady(): boolean;
  /** Context clock in seconds; 0 while there is no context. */
  now(): number;
  /** Called when readiness changes. */
  onReadyChange(cb: (ready: boolean) => void): Unsubscribe;
  dispose(): void;
}
