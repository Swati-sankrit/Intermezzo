import { useSyncExternalStore } from 'react';
import type { HauntSettings, SettingsStore } from '../haunts/engine';
import { getHauntSettingsStore } from './hauntSettingsStore';

export interface UseHauntSettings {
  settings: HauntSettings;
  update(patch: Partial<HauntSettings>): void;
}

/** Reads the shared settings store. `get()` keeps its object until a value changes. */
export function useHauntSettings(store: SettingsStore = getHauntSettingsStore()): UseHauntSettings {
  const settings = useSyncExternalStore(store.subscribe, store.get, store.get);
  return { settings, update: store.set };
}
