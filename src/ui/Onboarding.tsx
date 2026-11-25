import { useEffect, useRef, useState } from 'react';
import { CANDLE_COLOURS, EMPTY_DATA_MODEL, MAX_DISPLAY_NAME, type CandleColour } from '../library/model';
import { updateProfile } from '../library/profileOps';
import { Avatar } from './Avatar';
import { COLOUR_NAMES } from './colourNames';
import { OpenOwnBook } from './OpenOwnBook';
import type { OnboardingChoices } from './useProfileActions';
import './theme.css';
import './LibraryScreen.css';
import './Onboarding.css';

const STEP_TEXT = [
  'Welcome to the reading room. Tell us what to call you, if you like, and choose the colour of your candle.',
  'Click a paragraph to open the next one. When you look away, the room slowly grows haunted. The camera is optional, and nothing leaves your device.',
  'Where shall we begin? Browse the library, or open a book of your own.',
] as const;

export interface OnboardingProps {
  /** Finish or skip: saves the choices and shows the library. */
  onDone: (choices: OnboardingChoices, then?: 'browse') => void;
  /** An uploaded book: finish, then open it. */
  onOpenFile: (file: File, choices: OnboardingChoices) => void;
}

/** A short, skippable introduction for the first visit. Three steps at most. */
export function Onboarding({ onDone, onOpenFile }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [colour, setColour] = useState<CandleColour>(EMPTY_DATA_MODEL.profile.candleColour);
  const rootRef = useRef<HTMLElement>(null);

  const nameCheck = updateProfile(EMPTY_DATA_MODEL, { displayName: name });
  const nameError = nameCheck.ok ? null : nameCheck.message;
  const choices: OnboardingChoices = { displayName: name, candleColour: colour };

  // Focus the first control of each step.
  useEffect(() => {
    rootRef.current?.querySelector<HTMLElement>('[data-first]')?.focus();
  }, [step]);

  return (
    <section ref={rootRef} className="onboarding" aria-labelledby="onboarding-heading">
      <p className="onboarding__count">
        Step {step + 1} of {STEP_TEXT.length}
      </p>
      <h2 id="onboarding-heading" className="onboarding__title">
        {['Your name and candle', 'How reading works', 'Choose a book'][step]}
      </h2>
      <p className="onboarding__text">{STEP_TEXT[step]}</p>

      {step === 0 && (
        <div className="onboarding__fields">
          <label className="onboarding__label" htmlFor="onboarding-name">
            Your name (optional)
          </label>
          <input
            id="onboarding-name"
            data-first
            className="onboarding__input"
            type="text"
            autoComplete="off"
            value={name}
            aria-invalid={nameError !== null}
            aria-describedby={nameError ? 'onboarding-name-error' : undefined}
            onChange={(e) => setName(e.target.value)}
          />
          {nameError && (
            <p id="onboarding-name-error" className="onboarding__error" role="alert">
              {nameError}
            </p>
          )}
          <fieldset className="onboarding__colours">
            <legend className="onboarding__label">Candle colour</legend>
            {CANDLE_COLOURS.map((c) => (
              <label key={c} className="onboarding__colour">
                <input
                  type="radio"
                  name="candle-colour"
                  value={c}
                  checked={colour === c}
                  onChange={() => setColour(c)}
                />
                <Avatar candleColour={c} size={28} />
                <span>{COLOUR_NAMES[c]}</span>
              </label>
            ))}
          </fieldset>
        </div>
      )}

      {step === 2 && (
        <div className="onboarding__fields">
          <button type="button" data-first className="library__button" onClick={() => onDone(choices, 'browse')}>
            Browse the library
          </button>
          <OpenOwnBook onSelectFile={(file) => onOpenFile(file, choices)} />
        </div>
      )}

      <div className="onboarding__actions">
        {step > 0 && (
          <button type="button" className="onboarding__secondary" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        {step < STEP_TEXT.length - 1 && (
          <button
            type="button"
            data-first={step === 1 ? '' : undefined}
            className="library__button"
            disabled={nameError !== null}
            onClick={() => setStep(step + 1)}
          >
            Next
          </button>
        )}
        <button type="button" className="onboarding__secondary" onClick={() => onDone(choices)}>
          Skip introduction
        </button>
      </div>
      <p className="onboarding__hint">The name is limited to {MAX_DISPLAY_NAME} characters.</p>
    </section>
  );
}
