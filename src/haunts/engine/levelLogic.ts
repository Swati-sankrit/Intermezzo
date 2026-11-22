/**
 * Level_Logic: pure decision of haunt level, lead haunt and companion haunt.
 * No clock, timers, randomness, DOM or audio. Time and random draws are inputs.
 */
import type { AttentionSignalLike } from './types';

export type { AttentionSignalLike } from './types';

export interface LevelInput {
  /** Delivery order. The trailing run of `away` events gives the away start. */
  readonly events: readonly AttentionSignalLike[];
  readonly now: number;
  readonly gentle: boolean;
  readonly hauntIds: readonly string[];
  /** Lead of the previous look-away, or null. */
  readonly previousLeadId: string | null;
  /** Fixed for one look-away. Each is in [0, 1). */
  readonly rolls: { readonly lead: number; readonly companion: number };
}

export interface LevelOutput {
  readonly level: 0 | 1 | 2 | 3;
  readonly leadId: string | null;
  readonly companionId: string | null;
}

export const THRESHOLDS_MS = { level2: 5000, level3: 12000 } as const;

const CALM: LevelOutput = { level: 0, leadId: null, companionId: null };

/** Timestamp of the first event of the trailing `away` run, or null. */
function awayStart(events: readonly AttentionSignalLike[]): number | null {
  let start: number | null = null;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].value !== 'away') break;
    start = events[i].timestamp;
  }
  return start;
}

function pick(candidates: readonly string[], roll: number): string {
  const raw = Math.floor(roll * candidates.length);
  const index = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), candidates.length - 1) : 0;
  return candidates[index];
}

function rawLevel(elapsed: number): 1 | 2 | 3 {
  if (elapsed >= THRESHOLDS_MS.level3) return 3;
  if (elapsed >= THRESHOLDS_MS.level2) return 2;
  return 1;
}

export function evaluate(input: LevelInput): LevelOutput {
  const start = awayStart(input.events);
  if (start === null || input.hauntIds.length === 0) return CALM;

  const elapsed = Math.max(0, input.now - start);
  const level = input.gentle ? 1 : rawLevel(elapsed);

  const withoutPrevious = input.hauntIds.filter((id) => id !== input.previousLeadId);
  const leadCandidates =
    input.previousLeadId === null || withoutPrevious.length === 0 || withoutPrevious.length === input.hauntIds.length
      ? input.hauntIds
      : withoutPrevious;
  const leadId = pick(leadCandidates, input.rolls.lead);

  let companionId: string | null = null;
  if (level === 3 && input.hauntIds.length >= 2) {
    const others = input.hauntIds.filter((id) => id !== leadId);
    if (others.length > 0) companionId = pick(others, input.rolls.companion);
  }

  return { level, leadId, companionId };
}

/** Ms until the level next changes, or null if it cannot change by time alone. */
export function nextChangeDelay(input: LevelInput): number | null {
  const start = awayStart(input.events);
  if (start === null || input.gentle || input.hauntIds.length === 0) return null;

  // Unclamped on purpose: a start slightly ahead of `now` must not shorten the wait.
  const elapsed = input.now - start;
  if (elapsed < THRESHOLDS_MS.level2) return THRESHOLDS_MS.level2 - elapsed;
  if (elapsed < THRESHOLDS_MS.level3) return THRESHOLDS_MS.level3 - elapsed;
  return null;
}
