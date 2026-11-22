/**
 * Haunt settings: parse, serialize and a small store over localStorage.
 * No DOM access here: the storage object is passed in.
 *
 * Nothing in this file writes `rod_volume_cap`. Only the gate reads it (Req 6.16).
 */
import type { HauntSettings, SettingsStore, Unsubscribe } from './types';

export type { HauntSettings, SettingsStore } from './types';

export const DEFAULT_SETTINGS: HauntSettings = {
  sound: true,
  gentle: false,
  noticeSeen: false,
};

export const KEYS = {
  sound: 'rod_haunt_sound',
  gentle: 'rod_haunt_gentle',
  noticeSeen: 'rod_safety_notice_seen',
  volumeCap: 'rod_volume_cap',
} as const;

function parseBool(raw: string | null, fallback: boolean): boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
}

/** Pure. `read(key)` returns a string or null. Anything unreadable gives the default. */
export function parseSettings(read: (key: string) => string | null): HauntSettings {
  return {
    sound: parseBool(read(KEYS.sound), DEFAULT_SETTINGS.sound),
    gentle: parseBool(read(KEYS.gentle), DEFAULT_SETTINGS.gentle),
    noticeSeen: parseBool(read(KEYS.noticeSeen), DEFAULT_SETTINGS.noticeSeen),
  };
}

/** Pure. Storage key to 'true' | 'false'. Never includes `rod_volume_cap`. */
export function serializeSettings(s: HauntSettings): Record<string, string> {
  return {
    [KEYS.sound]: String(s.sound),
    [KEYS.gentle]: String(s.gentle),
    [KEYS.noticeSeen]: String(s.noticeSeen),
  };
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function createSettingsStore(storage: StorageLike | null): SettingsStore {
  // The only try/catch blocks in this file wrap a single storage call each.
  // They guard against storage being unavailable or throwing (private mode,
  // quota, blocked access). They never wrap parsing or merging logic.
  const readKey = (key: string): string | null => {
    if (storage === null) return null;
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  };

  let current: HauntSettings = parseSettings(readKey);
  const listeners = new Set<() => void>();

  return {
    get: () => current,

    set(patch) {
      const next: HauntSettings = {
        sound: patch.sound ?? current.sound,
        gentle: patch.gentle ?? current.gentle,
        noticeSeen: patch.noticeSeen ?? current.noticeSeen,
      };
      if (
        next.sound === current.sound &&
        next.gentle === current.gentle &&
        next.noticeSeen === current.noticeSeen
      ) {
        return;
      }
      // Memory first: the value holds for the session even if the write fails.
      current = next;
      if (storage !== null) {
        for (const [key, value] of Object.entries(serializeSettings(next))) {
          try {
            storage.setItem(key, value);
          } catch {
            // Best-effort save; no error is shown.
          }
        }
      }
      for (const cb of [...listeners]) cb();
    },

    subscribe(cb): Unsubscribe {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}
