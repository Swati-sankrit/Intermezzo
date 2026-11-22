import { createSettingsStore, type SettingsStore } from '../haunts/engine';

let store: SettingsStore | null = null;

function getStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  // Accessing localStorage can throw (blocked cookies, private mode).
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The one settings store for the app. HauntLayer, HauntControl and the engine
 * all call this, so a toggle in the top bar reaches the engine.
 */
export function getHauntSettingsStore(): SettingsStore {
  store ??= createSettingsStore(getStorage());
  return store;
}
