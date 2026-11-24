import { buildPulseTrain } from './engine/ghost/pulses';
import { azimuthToPosition, footstepSpec } from './engine/ghost/spatial';
import type {
  AudioOut, HauntAudioContext, HauntBufferSource, HauntLevel, HauntMode, HauntNode, HauntPanner,
  HauntSpatialPanner, StartInfo, Unsubscribe, VisualOut,
} from './engine/types';

export const id = 'footsteps';
export const name = 'Footsteps in the room';
export const role = 'layer' as const;
export const modes: readonly HauntMode[] = ['classic', 'nightmare'];
export const minLevel: HauntLevel = 1;

const TICK_MS = 500;
/**
 * Two ramp segments of 1 s each, so every ramp lasts at least 1 s (reduced-motion rule) and
 * the schedule reaches 2 s ahead, past the 1.5 s the design asks for. At 2.5 m and 80 deg/s a
 * 1 s chord passes 1.92 m from the listener, still beyond the 1.5 m minimum.
 */
const SEGMENT_S = 1;
const SEGMENTS = 2;
/** The loop holds 4 steps over 4 s, so playbackRate equals steps per second. */
const LOOP_SECONDS = 4;
const STEPS_PER_LOOP = 4;
const ATTACK_MS = 30;
const PEAK = 0.9;
const LOWPASS_HZ = 1100;

let audio: AudioOut | null = null;
let cancelReady: Unsubscribe | null = null;
let cancelTick: Unsubscribe | null = null;
let ctxRef: HauntAudioContext | null = null;
let nodes: HauntNode[] = [];
let source: HauntBufferSource | null = null;
let spatial: HauntSpatialPanner | null = null;
let currentLevel: HauntLevel = 1;
/** Walk model: azimuth is startDeg + degPerSec * (time - startTime). */
let startDeg = 0;
let startTime = 0;
let degPerSec = 0;

function azimuthAt(t: number): number {
  return startDeg + degPerSec * (t - startTime);
}

function schedulePositions(): void {
  if (!ctxRef || !spatial) return;
  const now = ctxRef.currentTime;
  const { distanceM } = footstepSpec(currentLevel);
  const here = azimuthToPosition(azimuthAt(now), distanceM);
  spatial.positionX.cancelScheduledValues(now);
  spatial.positionZ.cancelScheduledValues(now);
  spatial.positionX.setValueAtTime(here.x, now);
  spatial.positionZ.setValueAtTime(here.z, now);
  spatial.positionY.setValueAtTime(0, now);
  for (let i = 1; i <= SEGMENTS; i++) {
    const dt = i * SEGMENT_S;
    const p = azimuthToPosition(azimuthAt(now + dt), distanceM);
    spatial.positionX.linearRampToValueAtTime(p.x, now + dt);
    spatial.positionZ.linearRampToValueAtTime(p.z, now + dt);
  }
}

function track<T extends HauntNode>(node: T): T {
  nodes.push(node);
  return node;
}

function makeLoop(ctx: HauntAudioContext): AudioBuffer {
  const samples = buildPulseTrain(ctx.sampleRate, LOOP_SECONDS, {
    kind: 'footstep', pulsesPerLoop: STEPS_PER_LOOP, attackMs: ATTACK_MS, peak: PEAK,
  });
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buffer.getChannelData(0).set(samples);
  return buffer;
}

function build(ctx: HauntAudioContext): void {
  ctxRef = ctx;
  const spec = footstepSpec(currentLevel);
  const src = track(ctx.createBufferSource());
  src.buffer = makeLoop(ctx);
  src.loop = true;
  src.playbackRate.setValueAtTime(spec.stepsPerSec, ctx.currentTime);
  const filter = track(ctx.createBiquadFilter());
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(LOWPASS_HZ, ctx.currentTime);
  src.connect(filter);

  let last: HauntNode = filter;
  spatial = ctx.createSpatialPanner();
  if (spatial) {
    last = track(spatial);
    filter.connect(spatial);
    startTime = ctx.currentTime;
    schedulePositions();
  } else {
    // No 3D panner: fixed stereo position from the starting azimuth, no movement.
    let stereo: HauntPanner | null = null;
    try {
      stereo = track(ctx.createStereoPanner());
      stereo.pan.setValueAtTime(azimuthToPosition(startDeg, 1).x, ctx.currentTime);
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
  currentLevel = level;
  nodes = [];
  source = null;
  spatial = null;
  ctxRef = null;
  const roll = info && Number.isFinite(info.roll) ? Math.min(1, Math.max(0, info.roll)) : 0;
  startDeg = roll * 360;
  startTime = 0;
  degPerSec = footstepSpec(level).degPerSec;
  a.setGain(footstepSpec(level).gain);
  cancelReady = a.whenReady(build);
  cancelTick = a.onTick(schedulePositions, TICK_MS);
}

export function setLevel(level: HauntLevel): void {
  if (ctxRef) {
    // Keep the walker where it is, then change speed.
    const now = ctxRef.currentTime;
    startDeg = azimuthAt(now);
    startTime = now;
  }
  currentLevel = level;
  const spec = footstepSpec(level);
  degPerSec = spec.degPerSec;
  audio?.setGain(spec.gain);
  if (ctxRef && source) {
    source.playbackRate.setValueAtTime(spec.stepsPerSec, ctxRef.currentTime);
    schedulePositions();
  }
}

export function stop(): void {
  cancelTick?.();
  cancelTick = null;
  cancelReady?.();
  cancelReady = null;
  source?.stop();
  for (const n of nodes) n.disconnect();
  nodes = [];
  source = null;
  spatial = null;
  ctxRef = null;
  audio = null;
}
