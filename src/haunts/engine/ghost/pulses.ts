/**
 * Pulse train builder for footsteps, breaths, knocks and the jump sound. Pure: it
 * returns sample data only and touches no audio, DOM, clock or global random source.
 * The same arguments always give the same samples.
 */
export interface PulseSpec {
  readonly kind: 'footstep' | 'breath' | 'knock' | 'jump';
  readonly pulsesPerLoop: number;
  readonly attackMs: number;
  readonly peak: number;
}

export const MIN_ATTACK_MS = 20;
const MAX_ATTACK_MS = 2000;
const DEFAULT_SAMPLE_RATE = 44100;
const MIN_SAMPLE_RATE = 8000;
const MAX_SAMPLE_RATE = 96000;
const DEFAULT_SECONDS = 1;
const MAX_SECONDS = 60;
const MAX_PULSES = 256;
const DEFAULT_PEAK = 0.5;
/** Keeps every sample and every rise step safely under the promised bounds. */
const HEADROOM = 0.995;

/** Decay time after the peak, in seconds, per kind. */
const DECAY_S = { footstep: 0.14, breath: 0.7, knock: 0.09, jump: 0.45 } as const;
const KIND_INDEX = { footstep: 1, breath: 2, knock: 3, jump: 4 } as const;

/** Small seeded generator (mulberry32). Returns values in [0, 1). */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mixSeed(parts: readonly number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    h = Math.imul(h ^ (p | 0), 0x01000193);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  }
  return h >>> 0;
}

function clampFinite(v: number, lo: number, hi: number, fallback: number): number {
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
}

/** Largest float32 sample not above `limit` in magnitude, keeping the sign of `v`. */
function toSample(v: number, limit: number): number {
  let s = Math.fround(v);
  while (Math.abs(s) > limit) s = Math.fround(s * 0.9999999);
  return s === 0 ? 0 : s;
}

/**
 * Mono samples for one loop. Every pulse starts at 0, rises linearly to its own
 * amplitude over `attackMs` (never under 20 ms), then falls smoothly back to 0.
 * Pulse amplitude is at most `peak`, so no sample exceeds `peak`, and `peak` is at
 * most 1. The loop starts and ends at 0.
 *
 * Input handling (documented defaults, never NaN in the output):
 * - `sampleRate`: non-finite gives 44100; clamped to 8000..96000.
 * - `seconds`: non-finite gives 1; clamped to 0.05..60, then raised if needed so one
 *   pulse fits (two attack lengths).
 * - `attackMs`: non-finite or under 20 gives 20; at most 2000.
 * - `peak`: non-finite gives 0.5; clamped to 0..1.
 * - `pulsesPerLoop`: non-finite gives 1; floored, clamped to 1..256, then lowered if
 *   the pulses would not fit in the loop with their full attack.
 * Polarity alternates by a seeded choice per pulse, and position and amplitude vary
 * a little per pulse from the same seed.
 */
export function buildPulseTrain(sampleRate: number, seconds: number, spec: PulseSpec): Float32Array {
  const rate = Math.round(clampFinite(sampleRate, MIN_SAMPLE_RATE, MAX_SAMPLE_RATE, DEFAULT_SAMPLE_RATE));
  const attackMs = clampFinite(spec.attackMs, MIN_ATTACK_MS, MAX_ATTACK_MS, MIN_ATTACK_MS);
  const peak = clampFinite(spec.peak, 0, 1, DEFAULT_PEAK);
  const secs = clampFinite(seconds, 0.05, MAX_SECONDS, DEFAULT_SECONDS);
  // One extra frame makes the slope strictly below peak / (0.020 * rate).
  const attackFrames = Math.ceil((attackMs * rate) / 1000) + 1;
  const frames = Math.max(Math.round(secs * rate), attackFrames * 2);
  const out = new Float32Array(frames);
  if (peak === 0) return out;

  const kind = spec.kind in KIND_INDEX ? spec.kind : 'footstep';
  const requested = Math.floor(clampFinite(spec.pulsesPerLoop, 1, MAX_PULSES, 1));
  const decayFrames = Math.max(1, Math.round(DECAY_S[kind] * rate));
  const count = Math.max(1, Math.min(requested, Math.floor(frames / (attackFrames + 1))));
  const slot = frames / count;
  const rand = seededRandom(
    mixSeed([KIND_INDEX[kind], count, Math.round(attackMs * 1000), Math.round(peak * 1e6), rate, frames]),
  );

  for (let i = 0; i < count; i++) {
    const length = Math.min(attackFrames + decayFrames, Math.floor(slot));
    const spare = Math.max(0, Math.floor(slot) - length);
    const start = Math.floor(i * slot) + Math.floor(rand() * spare * 0.5);
    const amp = peak * HEADROOM * (0.75 + 0.25 * rand());
    const sign = rand() < 0.5 ? -1 : 1;
    const fall = Math.max(1, length - attackFrames);
    for (let n = 0; n < length && start + n < frames; n++) {
      const env = n < attackFrames ? n / attackFrames : (1 - (n - attackFrames) / fall) ** 3;
      out[start + n] = toSample(sign * amp * env, peak);
    }
  }
  return out;
}
