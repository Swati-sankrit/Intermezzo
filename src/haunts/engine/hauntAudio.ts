/**
 * The restricted audio context a haunt receives from `AudioOut.whenReady`. Types only.
 *
 * A haunt never gets the real AudioContext, `destination` or any real AudioNode (a real node's
 * `.context` would lead back to both). It gets wrapper objects that can only be connected to
 * each other and to the port input, so every path to the speakers passes through the port's
 * channel gain (the Volume_Cap). The wrappers are built in gate/restrictedAudio.ts.
 */

/** The automation calls a haunt may use on a node parameter. */
export interface HauntParam {
  setValueAtTime(value: number, time: number): void;
  linearRampToValueAtTime(value: number, time: number): void;
  cancelScheduledValues(time: number): void;
}

/** Something a node can be connected to: another haunt node, or the port input. */
export interface HauntSink {
  readonly isHauntSink: true;
}

/** A node wrapper. `connect` throws for any target that is not a sink of the same port. */
export interface HauntNode extends HauntSink {
  connect<T extends HauntSink>(target: T): T;
  /** Disconnects every outgoing connection of this node. */
  disconnect(): void;
}

export interface HauntBufferSource extends HauntNode {
  buffer: AudioBuffer | null;
  loop: boolean;
  readonly playbackRate: HauntParam;
  onended: (() => void) | null;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface HauntFilter extends HauntNode {
  type: BiquadFilterType;
  readonly frequency: HauntParam;
  readonly Q: HauntParam;
  readonly gain: HauntParam;
  readonly detune: HauntParam;
}

export interface HauntPanner extends HauntNode {
  readonly pan: HauntParam;
}

/**
 * A 3D panner with fixed settings (HRTF, inverse distance, omnidirectional). A haunt can move it
 * and nothing else: no setter for the model, distance or cone, and no way to the audio device.
 */
export interface HauntSpatialPanner extends HauntNode {
  readonly positionX: HauntParam;
  readonly positionY: HauntParam;
  readonly positionZ: HauntParam;
}

export interface HauntAudioContext {
  /** This port's channel gain. Connect the last node of a chain here, and nowhere else. */
  readonly input: HauntSink;
  readonly sampleRate: number;
  readonly currentTime: number;
  /** Shaped like `createBuffer` so `createNoiseBuffer(ctx, seconds)` in noise.ts works. */
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBuffer;
  createBufferSource(): HauntBufferSource;
  createBiquadFilter(): HauntFilter;
  createStereoPanner(): HauntPanner;
  /** `null` when the browser cannot make the panner; the haunt then uses `createStereoPanner`, then none. */
  createSpatialPanner(): HauntSpatialPanner | null;
}
