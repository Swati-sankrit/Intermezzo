import { buildPulseTrain } from './engine/ghost/pulses';
import { azimuthToPosition, breathingSpec } from './engine/ghost/spatial';
import type {
  AudioOut, HauntAudioContext, HauntBufferSource, HauntLevel, HauntMode, HauntNode, HauntPanner,
  StartInfo, Unsubscribe, VisualOut,
} from './engine/types';

export const id = 'breathing';
export const name = 'Breathing close by';
export const role = 'layer' as const;
export const modes: readonly HauntMode[] = ['classic', 'nightmare'];
export const minLevel: HauntLevel = 1;

type Side = 'left' | 'right';

/** Two slow breaths in a 6 s loop, about 20 breaths a minute. */
const LOOP_SECONDS = 6;
const BREATHS_PER_LOOP = 2;
const ATTACK_MS = 400;
const PEAK = 0.6;
const BAND_HZ = 900;
const BAND_Q = 0.7;
/** Stereo fallback pan, as whispers.ts uses. */
const PAN = 0.8;
/** Requested gain per level. The gate clamps and scales it. */
const GAIN: Readonly<Record<HauntLevel, number>> = { 1: 0.3, 2: 0.4, 3: 0.5 };

let audio: AudioOut | null = null;
let cancelReady: Unsubscribe | null = null;
let nodes: HauntNode[] = [];
let source: HauntBufferSource | null = null;
/** Side of the next look-away. It flips in `start`, so one look-away keeps one side. */
let nextSide: Side = 'left';
let side: Side = 'left';
let roll = 0;

function track<T extends HauntNode>(node: T): T {
  nodes.push(node);
  return node;
}

function makeLoop(ctx: HauntAudioContext): AudioBuffer {
  const samples = buildPulseTrain(ctx.sampleRate, LOOP_SECONDS, {
    kind: 'breath', pulsesPerLoop: BREATHS_PER_LOOP, attackMs: ATTACK_MS, peak: PEAK,
  });
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buffer.getChannelData(0).set(samples);
  return buffer;
}

function build(ctx: HauntAudioContext): void {
  const src = track(ctx.createBufferSource());
  src.buffer = makeLoop(ctx);
  src.loop = true;
  const filter = track(ctx.createBiquadFilter());
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(BAND_HZ, ctx.currentTime);
  filter.Q.setValueAtTime(BAND_Q, ctx.currentTime);
  src.connect(filter);

  let last: HauntNode = filter;
  const spatial = ctx.createSpatialPanner();
  if (spatial) {
    // Fixed position: set once, never ramped.
    const spec = breathingSpec(side, roll);
    const p = azimuthToPosition(spec.azimuthDeg, spec.distanceM);
    const now = ctx.currentTime;
    spatial.positionX.setValueAtTime(p.x, now);
    spatial.positionY.setValueAtTime(p.y, now);
    spatial.positionZ.setValueAtTime(p.z, now);
    last = track(spatial);
    filter.connect(spatial);
  } else {
    try {
      const stereo: HauntPanner = track(ctx.createStereoPanner());
      stereo.pan.setValueAtTime(side === 'left' ? -PAN : PAN, ctx.currentTime);
      filter.connect(stereo);
      last = stereo;
    } catch {
      // No stereo panner either: play unpanned.
      last = filter;
    }
  }
  last.connect(ctx.input);
  src.start();
  source = src;
}

export function start(level: HauntLevel, a: AudioOut, _v: VisualOut, info?: StartInfo): void {
  audio = a;
  nodes = [];
  source = null;
  side = nextSide;
  nextSide = side === 'left' ? 'right' : 'left';
  roll = info && Number.isFinite(info.roll) ? Math.min(1, Math.max(0, info.roll)) : 0;
  a.setGain(GAIN[level]);
  cancelReady = a.whenReady(build);
}

export function setLevel(level: HauntLevel): void {
  audio?.setGain(GAIN[level]);
}

export function stop(): void {
  cancelReady?.();
  cancelReady = null;
  source?.stop();
  for (const n of nodes) n.disconnect();
  nodes = [];
  source = null;
  audio = null;
}
