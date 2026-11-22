import { createNoiseBuffer } from './engine/noise';
import type {
  AudioOut, HauntAudioContext, HauntBufferSource, HauntLevel, HauntNode, Unsubscribe,
  VisualLayer, VisualOut,
} from './engine/types';

export const id = 'whispers';
export const name = 'Whispers at the edge';

/** Requested gain per level, tuned by ear. The gate clamps and scales it. */
const GAIN: Record<HauntLevel, number> = { 1: 0.04, 2: 0.1, 3: 0.18 };

/** Edge vignette opacity per level, shown whenever sound is not audible (setting off, locked, or context not running). */
const VIGNETTE: Record<HauntLevel, number> = { 1: 0.3, 2: 0.55, 3: 0.8 };

const NOISE_SECONDS = 4;
const BAND_HZ = 2400;
const BAND_Q = 1.2;
const PAN = 0.8;

type Side = 'left' | 'right';

interface Tracked { node: HauntNode; disconnected: boolean }

let audio: AudioOut | null = null;
let layer: VisualLayer | null = null;
let cancelReady: Unsubscribe | null = null;
let source: HauntBufferSource | null = null;
let sourceStarted = false;
let tracked: Tracked[] = [];
let offAudible: Unsubscribe | null = null;
let audible = false;
let currentLevel: HauntLevel = 1;
let nextSide: Side = 'left';

function markup(side: Side): string {
  // The dark edge is on the whisper side; the gradient fades toward the reading column.
  const edgeFirst = side === 'left' ? 1 : 0;
  const stop = (offset: string, o: number) =>
    `<stop offset="${offset}" style="stop-color:var(--shadow);stop-opacity:${o}"/>`;
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none" ' +
    'width="100%" height="100%"><defs><linearGradient id="whisper-edge" x1="0" y1="0" x2="1" y2="0">' +
    stop('0', edgeFirst) + stop('1', 1 - edgeFirst) +
    '</linearGradient></defs><rect x="0" y="0" width="100" height="100" fill="url(#whisper-edge)"/></svg>'
  );
}

function track<T extends HauntNode>(node: T): T {
  tracked.push({ node, disconnected: false });
  return node;
}

function build(ctx: HauntAudioContext): void {
  const src = track(ctx.createBufferSource());
  src.buffer = createNoiseBuffer(ctx, NOISE_SECONDS);
  src.loop = true;
  const filter = track(ctx.createBiquadFilter());
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(BAND_HZ, ctx.currentTime);
  filter.Q.setValueAtTime(BAND_Q, ctx.currentTime);
  src.connect(filter);

  let last: HauntNode = filter;
  try {
    const panner = track(ctx.createStereoPanner());
    panner.pan.setValueAtTime(nextSide === 'left' ? -PAN : PAN, ctx.currentTime);
    filter.connect(panner);
    last = panner;
  } catch {
    // No stereo panner (Safari before 14.1) or the context refused it: play unpanned.
    last = filter;
  }
  last.connect(ctx.input);
  src.start();
  sourceStarted = true;
  source = src;
}

function applyVignette(): void {
  layer?.setOpacity(audible ? 0 : VIGNETTE[currentLevel]);
}

export function start(level: HauntLevel, a: AudioOut, v: VisualOut): void {
  audio = a;
  currentLevel = level;
  audible = false;
  tracked = [];
  source = null;
  sourceStarted = false;
  const side = nextSide;
  layer = v.createLayer(side);
  layer.setMarkup(markup(side));
  a.setGain(GAIN[level]);
  cancelReady = a.whenReady(build);
  // Called at once with the current value, then on every change in either direction.
  offAudible = a.onAudibleChange((value) => {
    audible = value;
    applyVignette();
  });
}

export function setLevel(level: HauntLevel): void {
  currentLevel = level;
  audio?.setGain(GAIN[level]);
  applyVignette();
}

export function stop(): void {
  offAudible?.();
  offAudible = null;
  cancelReady?.();
  cancelReady = null;
  if (source && sourceStarted) source.stop();
  for (const t of tracked) {
    if (t.disconnected) continue;
    t.disconnected = true;
    t.node.disconnect();
  }
  tracked = [];
  source = null;
  sourceStarted = false;
  layer?.remove();
  layer = null;
  audio = null;
  audible = false;
  nextSide = nextSide === 'left' ? 'right' : 'left';
}
