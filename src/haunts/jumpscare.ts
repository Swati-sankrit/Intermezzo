import { GHOST_IMAGE_GEOMETRY } from './engine/ghost/imageFit';
import { buildPulseTrain } from './engine/ghost/pulses';
import type {
  HauntAudioContext, HauntBufferSource, HauntMode, HauntNode, ReturnPlan, ReturnPort, Unsubscribe,
  VisualLayer,
} from './engine/types';

export const id = 'jumpscare';
export const name = 'The ghost lunges';
export const modes: readonly HauntMode[] = ['classic', 'nightmare'];
/** The engine opens this effect's port as a jump channel (fast attack, headroom rule). */
export const jumpSound = true;

const LABEL = 'A ghost lunges at the screen';
/** Nightmare: the face at the closest Ghost step. Classic: the standing ghost, one step smaller. */
const NIGHTMARE_IMAGE = 'ghost-face.png';
const NIGHTMARE_STEP = 4;
const CLASSIC_IMAGE = 'ghost-standing.png';
const CLASSIC_STEP = 3;
/** Opacity rise of the full jumpscare. */
const FULL_FADE_IN_MS = 40;
/** Slowest-allowed fade under reduced motion; the gate also enforces this floor. */
const REDUCED_FADE_MIN_MS = 1000;
/** Jump pulse: one hit, about half a second long. */
const JUMP_SECONDS = 0.6;
/** Pulse attack. 20 ms is the shortest allowed; reduced motion uses the slow attack the gate plans. */
const FULL_ATTACK_MS = 20;
const REDUCED_ATTACK_MS = 300;
/** Below 1. The gate applies the volume cap and the headroom rule on top. */
const PEAK = 0.9;
const GAIN = 0.9;

let port: ReturnPort | null = null;
let overlay: VisualLayer | null = null;
let cancelReady: Unsubscribe | null = null;
let nodes: HauntNode[] = [];
let source: HauntBufferSource | null = null;

export function span(plan: ReturnPlan): { startMs: number; endMs: number } | null {
  const j = plan.jumpscare;
  return j === null ? null : { startMs: j.startMs, endMs: j.startMs + j.durationMs };
}

function playJump(ctx: HauntAudioContext, reduced: boolean): void {
  const samples = buildPulseTrain(ctx.sampleRate, JUMP_SECONDS, {
    kind: 'jump', pulsesPerLoop: 1, attackMs: reduced ? REDUCED_ATTACK_MS : FULL_ATTACK_MS, peak: PEAK,
  });
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buffer.getChannelData(0).set(samples);

  const src = ctx.createBufferSource();
  nodes.push(src);
  src.buffer = buffer;
  src.loop = false;
  src.connect(ctx.input);
  src.start(ctx.currentTime);
  source = src;
}

export function begin(plan: ReturnPlan, p: ReturnPort, mode?: HauntMode): void {
  end();
  const j = plan.jumpscare;
  if (j === null) return;
  const reduced = j.render === 'fade';
  port = p;

  overlay = p.visual.createOverlay('jumpscare');
  const image = mode === 'nightmare' ? NIGHTMARE_IMAGE : CLASSIC_IMAGE;
  overlay.setImage(image, { step: mode === 'nightmare' ? NIGHTMARE_STEP : CLASSIC_STEP, ...GHOST_IMAGE_GEOMETRY[image] });
  overlay.setLabel(LABEL);
  overlay.setOpacity(1, reduced ? Math.max(REDUCED_FADE_MIN_MS, j.durationMs) : FULL_FADE_IN_MS);

  // With sound off and audio unlocked a source still starts, but the channel gain is 0, so nothing is audible.
  p.audio.setGain(GAIN);
  cancelReady = p.audio.whenReady((ctx) => playJump(ctx, reduced));
}

export function end(): void {
  cancelReady?.();
  cancelReady = null;
  source?.stop();
  for (const n of nodes) n.disconnect();
  nodes = [];
  source = null;
  overlay?.remove();
  overlay = null;
  port?.close();
  port = null;
}
