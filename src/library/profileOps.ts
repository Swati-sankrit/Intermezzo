/** Pure Profile operations (Requirement 7, 8). No DOM, no storage. */

import {
  CANDLE_COLOURS,
  EMPTY_DATA_MODEL,
  MAX_AVERAGE_PACE,
  MAX_DISPLAY_NAME,
  MIN_AVERAGE_PACE,
  type CandleColour,
  type DataModel,
} from './model';

export const NAME_TOO_LONG_MESSAGE = `Your name must be ${MAX_DISPLAY_NAME} characters or fewer.`;

export interface ProfileChanges {
  /** Trimmed before use. Empty after trimming clears the name. */
  displayName?: string;
  candleColour?: CandleColour;
}

export type UpdateProfileResult =
  | { ok: true; model: DataModel }
  | { ok: false; reason: 'name-too-long'; message: string; model: DataModel };

function isColour(v: unknown): v is CandleColour {
  return typeof v === 'string' && (CANDLE_COLOURS as readonly string[]).includes(v);
}

/**
 * Applies a name and/or colour change. A name over 40 characters after trimming
 * rejects the whole change: the result carries the unchanged model and a message (7.5).
 * An unknown colour is ignored.
 */
export function updateProfile(model: DataModel, changes: ProfileChanges): UpdateProfileResult {
  let displayName = model.profile.displayName;
  if (typeof changes.displayName === 'string') {
    const trimmed = changes.displayName.trim();
    if (trimmed.length > MAX_DISPLAY_NAME) {
      return { ok: false, reason: 'name-too-long', message: NAME_TOO_LONG_MESSAGE, model };
    }
    displayName = trimmed;
  }
  const candleColour = isColour(changes.candleColour) ? changes.candleColour : model.profile.candleColour;
  return { ok: true, model: { ...model, profile: { ...model.profile, displayName, candleColour } } };
}

/** Resets the Profile to the First_Visit_State. Books, shelves, positions, stats and daily stay (7.8). */
export function resetProfile(model: DataModel): DataModel {
  return { ...model, profile: { ...EMPTY_DATA_MODEL.profile } };
}

/** Sets Average_Pace, clamped to 50..1000. A non-finite value leaves the model unchanged (7.10, 7.11). */
export function recordPace(model: DataModel, wordsPerMinute: number): DataModel {
  if (typeof wordsPerMinute !== 'number' || !Number.isFinite(wordsPerMinute)) return model;
  const averagePace = Math.min(MAX_AVERAGE_PACE, Math.max(MIN_AVERAGE_PACE, wordsPerMinute));
  return { ...model, profile: { ...model.profile, averagePace } };
}

/** Turns the Pace_Guide on or off (7.12). */
export function setPaceGuide(model: DataModel, enabled: boolean): DataModel {
  return { ...model, profile: { ...model.profile, paceGuideEnabled: enabled === true } };
}

/** Marks onboarding as finished or skipped (Requirement 8). */
export function completeOnboarding(model: DataModel): DataModel {
  return { ...model, profile: { ...model.profile, onboardingCompleted: true } };
}
