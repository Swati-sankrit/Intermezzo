import type { HauntMode } from '../../haunts/engine/types';
import { useHauntSettings } from '../useHauntSettings';

/** Each description is at most 120 characters. */
export const HAUNT_MODE_OPTIONS: readonly { mode: HauntMode; label: string; description: string }[] = [
  { mode: 'gentle', label: 'Gentle', description: 'The candle only dims a little. No ghosts, glitches or sudden scares.' },
  { mode: 'classic', label: 'Classic', description: 'Ghosts and glitches, and a jolt when you look back. The default.' },
  { mode: 'nightmare', label: 'Nightmare', description: 'The darkest haunts and the sharpest jolts. Frightening, never gory or cruel.' },
];

/** Haunt_Mode radio group. It reads and writes the same store as the top-bar control. */
export function SeanceHaunt() {
  const { settings, update } = useHauntSettings();
  return (
    <fieldset className="seance__group">
      <legend className="settings__label">Haunt mode</legend>
      {HAUNT_MODE_OPTIONS.map((o) => (
        <label key={o.mode} className="seance__option">
          <input
            type="radio"
            name="seance-haunt-mode"
            value={o.mode}
            checked={settings.mode === o.mode}
            onChange={() => update({ mode: o.mode })}
          />
          <span>
            <span className="seance__option-label">{o.label}</span>
            <span className="seance__option-text">{o.description}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
