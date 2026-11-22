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
        aria-pressed={settings.gentle}
        onClick={() => update({ gentle: !settings.gentle })}
      >
        Gentle mode: {settings.gentle ? 'on' : 'off'}
      </button>
    </div>
  );
}
