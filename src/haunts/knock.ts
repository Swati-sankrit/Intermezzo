import { buildPulseTrain } from './engine/ghost/pulses';
import type {
  AudioOut, HauntAudioContext, HauntBufferSource, HauntLevel, HauntMode, HauntNode, Unsubscribe,
  VisualOut,
} from './engine/types';

export const id = 'knock';
export const name = 'Knock';
export const role = 'layer' as const;
export const modes: readonly HauntMode[] = ['classic', 'nightmare'];
export const minLevel: HauntLevel = 3;

/**
 * Delay after `whenReady`, on the audio clock (`ctx.currentTime`). It is past the layer's
 * 300 ms fade-in and under 500 ms, so the knock starts within 500 ms of the layer.
 */
export const KNOCK_DELAY_S = 0.35;
/** Three knocks in a short buffer that plays once (no loop). */
const KNOCK_SECONDS = 1.2;
const KNOCKS = 3;
/** Pulse attack. 20 ms is allowed for a pulse inside a running layer. */
const ATTACK_MS = 20;
/** Below 1, so a pulse stays under the layer's gain target. */
const PEAK = 0.8;
/** Requested gain. The gate clamps and scales it, so the cap holds. */
const GAIN = 0.5;

let audio: AudioOut | null = null;
let cancelReady: Unsubscribe | null = null;
let nodes: HauntNode[] = [];
let source: HauntBufferSource | null = null;

function build(ctx: HauntAudioContext): void {
  const samples = buildPulseTrain(ctx.sampleRate, KNOCK_SECONDS, {
    kind: 'knock', pulsesPerLoop: KNOCKS, attackMs: ATTACK_MS, peak: PEAK,
  });
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buffer.getChannelData(0).set(samples);

  const src = ctx.createBufferSource();
  nodes.push(src);
  src.buffer = buffer;
  src.loop = false;
  src.connect(ctx.input);
  src.start(ctx.currentTime + KNOCK_DELAY_S);
  source = src;
}

export function start(_level: HauntLevel, a: AudioOut, _v: VisualOut): void {
  audio = a;
  nodes = [];
  source = null;
  a.setGain(GAIN);
  cancelReady = a.whenReady(build);
}

export function setLevel(_level: HauntLevel): void {
  audio?.setGain(GAIN);
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
