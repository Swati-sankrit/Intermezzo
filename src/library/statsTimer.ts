/**
 * Pure timing for reading stats. No clock, no DOM: callers pass `nowMs`.
 * Whole seconds are credited to whichever signal value was current; the leftover
 * fraction is carried so no time is lost or counted twice across calls.
 */
export type TimerValue = 'present' | 'away';

export interface TimerState {
  /** Current signal, or null while no book is open (nothing is counted). */
  readonly value: TimerValue | null;
  /** Time of the last update, in ms. */
  readonly at: number;
  /** Milliseconds already elapsed but not yet worth a whole second (0 to 999). */
  readonly rest: number;
  /** Away seconds already credited to the current Look_Away (0 to AWAY_CAP_SECONDS). */
  readonly awayCredited: number;
}

/** The most away seconds recorded for one Look_Away. */
export const AWAY_CAP_SECONDS = 120;

export interface TimerStep {
  readonly state: TimerState;
  /** Whole seconds to add to active reading time. */
  readonly active: number;
  /** Whole seconds to add to away time. */
  readonly away: number;
  /** 1 on a present to away change, else 0. */
  readonly lookAway: number;
}

export const IDLE_TIMER: TimerState = { value: null, at: 0, rest: 0, awayCredited: 0 };

/** Credits the time since the last update to the current value. A backwards clock adds nothing. */
export function tickTimer(state: TimerState, nowMs: number): TimerStep {
  if (state.value === null || !Number.isFinite(nowMs)) {
    return { state: { ...state, at: Number.isFinite(nowMs) ? nowMs : state.at }, active: 0, away: 0, lookAway: 0 };
  }
  const total = state.rest + Math.max(0, nowMs - state.at);
  const seconds = Math.floor(total / 1000);
  const away =
    state.value === 'away' ? Math.min(seconds, Math.max(0, AWAY_CAP_SECONDS - state.awayCredited)) : 0;
  const next: TimerState = {
    value: state.value,
    at: nowMs,
    rest: total - seconds * 1000,
    awayCredited: state.awayCredited + away,
  };
  return {
    state: next,
    active: state.value === 'present' ? seconds : 0,
    away,
    lookAway: 0,
  };
}

/**
 * Credits the time so far, then switches to `value` (null when the book closes).
 * Reports a look-away only for present to away.
 */
export function changeTimer(state: TimerState, value: TimerValue | null, nowMs: number): TimerStep {
  const step = tickTimer(state, nowMs);
  const rest = value === null || state.value === null ? 0 : step.state.rest;
  return {
    ...step,
    state: {
      value,
      at: step.state.at,
      rest,
      awayCredited: state.value === 'away' && value === 'away' ? step.state.awayCredited : 0,
    },
    lookAway: state.value === 'present' && value === 'away' ? 1 : 0,
  };
}
