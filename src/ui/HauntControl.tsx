import { useHauntSettings } from './useHauntSettings';
import './HauntControl.css';

/** Top-bar toggles for haunt sound and Gentle mode. Buttons reuse `reader__button`. */
export function HauntControl() {
  const { settings, update } = useHauntSettings();

  return (
    <div className="haunt-control">
      <button
        type="button"
        className="reader__button"
        aria-pressed={settings.sound}
        onClick={() => update({ sound: !settings.sound })}
      >
        Haunt sound: {settings.sound ? 'on' : 'off'}
      </button>
      <button
        type="button"
        className="reader__button"
        aria-pressed={settings.mode === 'gentle'}
        onClick={() => update({ mode: settings.mode === 'gentle' ? 'classic' : 'gentle' })}
      >
        Gentle mode: {settings.mode === 'gentle' ? 'on' : 'off'}
      </button>
    </div>
  );
}
