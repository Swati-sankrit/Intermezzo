import { useState } from 'react';
import { loadVolumeCapPercent, saveVolumeCapPercent, VOLUME_STEP_PERCENT } from './volumeCap';

/** Volume_Cap slider. It saves a number from 0 to 1; the Safety_Gate applies it. */
export function SeanceVolume() {
  const [percent, setPercent] = useState(() => loadVolumeCapPercent());
  const [changed, setChanged] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div className="seance__group">
      <label className="settings__label" htmlFor="seance-volume">Haunt volume cap</label>
      <div className="seance__slider">
        <input
          id="seance-volume"
          type="range"
          min={0}
          max={100}
          step={VOLUME_STEP_PERCENT}
          value={percent}
          aria-valuetext={`${percent} percent`}
          aria-describedby="seance-volume-note"
          onChange={(e) => {
            const next = Number(e.target.value);
            setPercent(next);
            setChanged(true);
            setFailed(!saveVolumeCapPercent(next));
          }}
        />
        <output htmlFor="seance-volume">{percent}%</output>
      </div>
      <p id="seance-volume-note" className="settings__hint">
        The loudest any haunt sound will be.
        {changed && ' The new value is used from the next time a book opens.'}
      </p>
      {failed && (
        <p className="settings__error" role="alert">Your volume couldn&apos;t be saved. Try again.</p>
      )}
    </div>
  );
}
