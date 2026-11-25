import { useEffect, useRef, useState } from 'react';
import { CANDLE_COLOURS, MAX_DISPLAY_NAME, type CandleColour, type Profile } from '../library/model';
import { Avatar } from './Avatar';
import { COLOUR_NAMES } from './colourNames';
import { LIBRARY_MESSAGES as MSG } from './libraryMessages';
import { useFocusTrap } from './useFocusTrap';
import type { useProfileActions } from './useProfileActions';
import './theme.css';
import './LibraryScreen.css';
import './ProfileSettings.css';

export interface ProfileSettingsProps {
  profile: Profile;
  actions: Pick<ReturnType<typeof useProfileActions>, 'changeName' | 'changeColour' | 'changePaceGuide' | 'deleteProfile'>;
  /** The library message; the retry text shows here when a save failed. */
  message: string | null;
  onClose: () => void;
}

/** A dialog for the name, candle colour and pace guide, with "Delete my profile". */
export function ProfileSettings({ profile, actions, message, onClose }: ProfileSettingsProps) {
  const [name, setName] = useState(profile.displayName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);

  // Escape cancels the confirmation first, then closes the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (confirming) setConfirming(false);
      else onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [confirming, onClose]);

  // Move focus to the first control when the confirmation opens or closes.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    ref.current?.querySelector<HTMLElement>('[data-first]')?.focus();
  }, [confirming]);

  const saveFailed = message === MSG.profileSaveFailed;
  const shownName = profile.displayName.trim();

  return (
    <div className="settings__backdrop">
      <div ref={ref} className="settings" role="dialog" aria-modal="true" aria-labelledby="settings-heading">
        {confirming ? (
          <>
            <h2 id="settings-heading" className="settings__heading">Delete my profile?</h2>
            <p className="settings__text">
              Your name{shownName ? ` (${shownName})` : ''} and your candle colour ({COLOUR_NAMES[profile.candleColour]})
              will be removed. Your books, shelves, reading positions and stats are kept.
            </p>
            <div className="settings__actions">
              <button type="button" data-first className="settings__secondary" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="settings__danger"
                onClick={() => {
                  actions.deleteProfile();
                  onClose();
                }}
              >
                Delete my profile
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="settings-heading" className="settings__heading">Settings</h2>
            {saveFailed && (
              <p className="settings__error" role="alert">
                Your changes couldn&apos;t be saved. Try again.
              </p>
            )}
            <label className="settings__label" htmlFor="settings-name">Your name (optional)</label>
            <input
              id="settings-name"
              data-first
              className="settings__input"
              type="text"
              autoComplete="off"
              value={name}
              aria-invalid={nameError !== null}
              aria-describedby={nameError ? 'settings-name-error' : undefined}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(actions.changeName(e.target.value));
              }}
            />
            {nameError && (
              <p id="settings-name-error" className="settings__error" role="alert">{nameError}</p>
            )}
            <p className="settings__hint">Up to {MAX_DISPLAY_NAME} characters.</p>

            <fieldset className="settings__colours">
              <legend className="settings__label">Candle colour</legend>
              {CANDLE_COLOURS.map((c: CandleColour) => (
                <label key={c} className="settings__colour">
                  <input
                    type="radio"
                    name="settings-candle-colour"
                    value={c}
                    checked={profile.candleColour === c}
                    onChange={() => actions.changeColour(c)}
                  />
                  <Avatar candleColour={c} size={28} />
                  <span>{COLOUR_NAMES[c]}</span>
                </label>
              ))}
            </fieldset>

            <label className="settings__colour settings__toggle">
              <input
                type="checkbox"
                checked={profile.paceGuideEnabled}
                onChange={(e) => actions.changePaceGuide(e.target.checked)}
              />
              <span>Show the pace guide while reading</span>
            </label>

            <div className="settings__actions">
              <button type="button" className="settings__secondary" onClick={() => setConfirming(true)}>
                Delete my profile
              </button>
              <button type="button" className="library__button btn-quiet" onClick={onClose}>
                Close settings
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
