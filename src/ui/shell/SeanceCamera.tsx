import { useState } from 'react';
import { loadChoice, saveChoice, type CameraChoice } from '../../attention/storage';

/** Camera choice. It only saves the choice; the attention module asks for the camera when a book opens. */
export function SeanceCamera() {
  const [choice, setChoice] = useState<CameraChoice | null>(() => loadChoice());
  const [failed, setFailed] = useState(false);

  const pick = (next: CameraChoice) => {
    const ok = saveChoice(next);
    setFailed(!ok);
    if (ok) setChoice(next);
  };

  return (
    <fieldset className="seance__group" aria-describedby="seance-camera-note">
      <legend className="settings__label">Camera</legend>
      <label className="seance__option">
        <input type="radio" name="seance-camera" checked={choice === 'camera'} onChange={() => pick('camera')} />
        <span className="seance__option-label">Camera on</span>
      </label>
      <label className="seance__option">
        <input type="radio" name="seance-camera" checked={choice === 'no-camera'} onChange={() => pick('no-camera')} />
        <span className="seance__option-label">Camera off</span>
      </label>
      <p id="seance-camera-note" className="settings__hint">
        The camera feed is processed on your device. No frame is stored or sent anywhere.
        {choice === 'camera'
          ? ' Your browser asks for permission when the next book opens.'
          : choice === null
            ? " Your browser's camera question is asked when the next book opens."
            : ''}
      </p>
      {failed && (
        <p className="settings__error" role="alert">Your choice couldn&apos;t be saved. Try again.</p>
      )}
    </fieldset>
  );
}
