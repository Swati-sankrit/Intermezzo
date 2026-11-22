/**
 * Noise helper for haunts (e.g. whispers). White noise in [-1, 1], mono.
 * Haunts must route the resulting buffer through AudioOut; this only builds data.
 */

/** Minimal buffer shape: what createNoiseBuffer touches. */
export interface NoiseBufferLike {
  getChannelData(channel: number): Float32Array;
}

/** Minimal context shape: what createNoiseBuffer touches. */
export interface NoiseContextLike<B extends NoiseBufferLike = AudioBuffer> {
  readonly sampleRate: number;
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): B;
}

/**
 * Buffer length in frames is Math.round(seconds * sampleRate), clamped to at least 1
 * (zero-length createBuffer behaviour is unconfirmed). Non-finite or non-positive
 * `seconds` gives a 1-frame buffer.
 */
export function noiseFrameCount(seconds: number, sampleRate: number): number {
  const frames = Math.round(seconds * sampleRate);
  return Number.isFinite(frames) && frames >= 1 ? frames : 1;
}

export function createNoiseBuffer<B extends NoiseBufferLike>(
  ctx: NoiseContextLike<B>,
  seconds: number,
): B {
  const buffer = ctx.createBuffer(1, noiseFrameCount(seconds, ctx.sampleRate), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}
