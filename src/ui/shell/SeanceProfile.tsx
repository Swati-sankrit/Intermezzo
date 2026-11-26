import { useEffect, useRef, useState } from 'react';
import { CANDLE_COLOURS, MAX_DISPLAY_NAME, type CandleColour, type Profile } from '../../library/model';
import { Avatar } from '../Avatar';
import { ClearDataConfirm } from '../ClearDataConfirm';
import { COLOUR_NAMES } from '../colourNames';
import type { useProfileActions } from '../useProfileActions';

export interface SeanceProfileProps {
  profile: Profile;
  actions: Pick<ReturnType<typeof useProfileActions>, 'changeName' | 'changeColour' | 'changePaceGuide' | 'deleteProfile'>;
  /** True when the last profile save failed. */
  saveFailed: boolean;
  /** True while the Data_Store loads; the controls are disabled. */
  loading: boolean;
  /** Deletes everything through the store. Resolves true only when all of it is gone. */
  onClearData: () => Promise<boolean>;
}

type Confirming = 'profile' | 'data' | null;

/** Name, candle colour, pace guide, "Delete my profile" and "Clear my data", with their confirmations. */
export function SeanceProfile({ profile, actions, saveFailed, loading, onClearData }: SeanceProfileProps) {
  const [name, setName] = useState(profile.displayName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<Exclude<Confirming, null>>('profile');

  const ask = (which: Exclude<Confirming, null>) => {
    opener.current = which;
    setConfirming(which);
  };

  // Escape cancels an open confirmation.
  useEffect(() => {
    if (!confirming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setConfirming(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [confirming]);

  // Focus goes to the first control when a confirmation opens, and back to its button when it closes.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const target = confirming ? '[data-first]' : `[data-opener="${opener.current}"]`;
    ref.current?.querySelector<HTMLElement>(target)?.focus();
  }, [confirming]);

  const shownName = profile.displayName.trim();

  return (
    <div ref={ref} className="seance__section">
      {confirming === 'data' ? (
        <ClearDataConfirm onCancel={() => setConfirming(null)} onConfirm={onClearData} />
      ) : confirming === 'profile' ? (
        <>
          <h3 id="settings-heading" className="settings__heading">Delete my profile?</h3>
          <p className="settings__text">
            Your name{shownName ? ` (${shownName})` : ''} and your candle colour ({COLOUR_NAMES[profile.candleColour]})
            will be removed. Your books, shelves, reading positions and stats are kept.
          </p>
          <div className="settings__actions">
            <button type="button" data-first className="settings__secondary" onClick={() => setConfirming(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="settings__danger"
              onClick={() => {
                actions.deleteProfile();
                setConfirming(null);
              }}
            >
              Delete my profile
            </button>
          </div>
        </>
      ) : (
        <>
          {saveFailed && (
            <p className="settings__error" role="alert">
              Your changes couldn&apos;t be saved. Try again.
            </p>
          )}
          <label className="settings__label" htmlFor="seance-name">Your name (optional)</label>
          <input
            id="seance-name"
            className="settings__input"
            type="text"
            autoComplete="off"
            disabled={loading}
            value={name}
            aria-invalid={nameError !== null}
            aria-describedby={nameError ? 'seance-name-error' : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(actions.changeName(e.target.value));
            }}
          />
          {nameError && <p id="seance-name-error" className="settings__error" role="alert">{nameError}</p>}
          <p className="settings__hint">Up to {MAX_DISPLAY_NAME} characters.</p>

          <fieldset className="settings__colours" disabled={loading}>
            <legend className="settings__label">Candle colour</legend>
            {CANDLE_COLOURS.map((c: CandleColour) => (
              <label key={c} className="settings__colour">
                <input
                  type="radio"
                  name="seance-candle-colour"
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
              disabled={loading}
              checked={profile.paceGuideEnabled}
              onChange={(e) => actions.changePaceGuide(e.target.checked)}
            />
            <span>Show the pace guide while reading</span>
          </label>

          <div className="settings__actions">
            <button type="button" data-opener="profile" className="settings__secondary" disabled={loading} onClick={() => ask('profile')}>
              Delete my profile
            </button>
            <button type="button" data-opener="data" className="settings__secondary" disabled={loading} onClick={() => ask('data')}>
              Clear my data
            </button>
          </div>
        </>
      )}
    </div>
  );
}
