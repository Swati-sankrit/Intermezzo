import { useCallback, useState } from 'react';
import { EMPTY_DATA_MODEL, type CandleColour, type DataModel } from '../library/model';
import { completeOnboarding, resetProfile, setPaceGuide, updateProfile } from '../library/profileOps';
import type { UpdateOptions } from './useLibrary';

export interface OnboardingChoices {
  displayName: string;
  candleColour: CandleColour;
}

type UpdateModel = (fn: (m: DataModel) => DataModel, opts?: UpdateOptions) => void;

/**
 * Profile actions. Finishing or skipping onboarding saves the choices (a name over the limit is
 * dropped) and sets onboardingCompleted. `ended` stays true for the session so the shell can tell
 * a failed save apart from other messages. The settings actions use the debounced writer
 * (400 ms, inside the 1 s limit); a failed write keeps the in-session value and shows the retry message.
 */
export function useProfileActions(updateModel: UpdateModel) {
  const [ended, setEnded] = useState(false);

  const finishOnboarding = useCallback(
    (choices: OnboardingChoices) => {
      setEnded(true);
      updateModel(
        (m) => {
          const result = updateProfile(m, choices);
          if (result.ok) return completeOnboarding(result.model);
          return completeOnboarding(updateProfile(m, { candleColour: choices.candleColour }).model);
        },
        { delayMs: 0, kind: 'profile' },
      );
    },
    [updateModel],
  );

  /** Returns null when applied, or the message to show (name over 40 characters; nothing changes). */
  const changeName = useCallback(
    (displayName: string): string | null => {
      const check = updateProfile(EMPTY_DATA_MODEL, { displayName });
      if (!check.ok) return check.message;
      updateModel((m) => {
        const r = updateProfile(m, { displayName });
        return r.ok ? r.model : m;
      });
      return null;
    },
    [updateModel],
  );

  const changeColour = useCallback(
    (candleColour: CandleColour) =>
      updateModel((m) => {
        const r = updateProfile(m, { candleColour });
        return r.ok ? r.model : m;
      }),
    [updateModel],
  );

  const changePaceGuide = useCallback(
    (enabled: boolean) => updateModel((m) => setPaceGuide(m, enabled)),
    [updateModel],
  );

  /** Resets the Profile to the First_Visit_State; books, shelves, positions and stats stay. */
  const deleteProfile = useCallback(
    () => updateModel((m) => resetProfile(m), { delayMs: 0, kind: 'profile' }),
    [updateModel],
  );

  return { onboardingEnded: ended, finishOnboarding, changeName, changeColour, changePaceGuide, deleteProfile };
}
