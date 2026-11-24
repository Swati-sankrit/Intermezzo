/**
 * Return_Planner: every decision about a Return_Moment, as one pure function.
 * No DOM, audio, timer, clock or random access. Time and random numbers are inputs.
 *
 * This part plans the Ghost, False_Calm, Jumpscare and the reduced-motion fade.
 * `glitch`, `evidence` and `spoiler` are null until later tasks add them.
 * The caller records the new outcome in `history` (`plan.jumpscare !== null`), as
 * `planReturn` returns a plan and never changes its input.
 */

import type { ReturnPlan } from '../returnTypes';
import { ghostDistance } from './ghostDistance';
import { allowed, probability } from './jumpscarePolicy';
import type { HauntMode } from './mode';
import {
  EMPTY_PLAN,
  QUALIFYING_AWAY_MS,
  REDUCED_FADE_MS,
  AMBIENT_FADE_JUMP_MS,
  AMBIENT_FADE_PLAIN_MS,
  clampRoll,
  jumpscareEndMs,
  planJumpscare,
  returnDuration,
  sanitiseAway,
} from './planParts';

export { EMPTY_PLAN };

export interface ReturnRolls {
  jump: number; calm: number; calmLen: number; jumpLen: number;
  glitchLen: number; flickers: number;
  evidence: number; evidenceMsg: number; evidenceRun: number; spoiler: number;
}

export interface ReturnInput {
  readonly mode: HauntMode;
  /** 0 or greater; NaN and negative become 0. */
  readonly awayMs: number;
  /** Jumpscare outcome of each earlier Qualifying_Return, oldest first. */
  readonly history: readonly boolean[];
  /** Each in [0, 1); anything else is clamped. */
  readonly rolls: ReturnRolls;
  readonly reducedMotion: boolean;
  /** The active paragraph. */
  readonly paragraph: string;
  /** Earlier look-aways in the chapter, before the one that just ended. */
  readonly lookAwayCount: number;
  readonly spoiler: {
    readonly finalChapterSentences: readonly string[];
    readonly otherChapterSentences: readonly string[];
  } | null;
  /** Evidence pool: fixed messages plus filled taunts. */
  readonly messages: readonly string[];
}

function isReturnMode(mode: unknown): mode is 'classic' | 'nightmare' {
  return mode === 'classic' || mode === 'nightmare';
}

export function planReturn(input: ReturnInput): ReturnPlan {
  // Gentle, and any mode that is not a known one at runtime, gets no Return_Moment (Req 11.5).
  if (!isReturnMode(input.mode)) return EMPTY_PLAN;
  const mode: HauntMode = input.mode;
  const rolls = (input.rolls ?? {}) as Partial<ReturnRolls>;
  const reduced = input.reducedMotion === true;

  const qualifying = sanitiseAway(input.awayMs) >= QUALIFYING_AWAY_MS;
  const wantJumpscare =
    qualifying && allowed(mode, input.history) && clampRoll(rolls.jump) < probability(mode);

  const part = wantJumpscare
    ? planJumpscare(clampRoll(rolls.calm), clampRoll(rolls.calmLen), clampRoll(rolls.jumpLen), reduced)
    : null;
  const jumpscare = part === null ? null : part.jumpscare;
  const jumpEnd = jumpscareEndMs(jumpscare);

  // Reduced motion replaces the Glitch with a fade at the Glitch's start: 0, or the Jumpscare end.
  const fade = reduced ? { startMs: jumpEnd, durationMs: REDUCED_FADE_MS } : null;
  const endMs = Math.max(jumpEnd, fade === null ? 0 : fade.startMs + fade.durationMs);
  const durationMs = returnDuration(endMs);

  return {
    durationMs,
    qualifying,
    ambientFadeMs: jumpscare === null ? AMBIENT_FADE_PLAIN_MS : AMBIENT_FADE_JUMP_MS,
    ghostStep: ghostDistance(input.lookAwayCount),
    ghostLingerMs: durationMs,
    falseCalmMs: part === null ? null : part.falseCalmMs,
    jumpscare,
    glitch: null,
    fade,
    evidence: null,
    spoiler: null,
  };
}
