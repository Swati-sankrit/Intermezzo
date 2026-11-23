/**
 * Haunt settings: parse, serialize and a small store over localStorage.
 * No DOM access here: the storage object is passed in.
 *
 * Nothing in this file writes `rod_volume_cap`. Only the gate reads it (Req 6.16).
 */
import { DEFAULT_MODE, resolveMode } from './ghost/mode';
import type { HauntSettings, SettingsStore, Unsubscribe } from './types';

export type { HauntSettings, SettingsStore } from './types';

export const DEFAULT_SETTINGS: HauntSettings = {
  sound: true,
  mode: DEFAULT_MODE,
  noticeSeen: false,
  headphonesTipSeen: false,
};

export const KEYS = {
  sound: 'rod_haunt_sound',
  mode: 'rod_haunt_mode',
  /** Legacy flag. Read only, for migration. Never written. */
  gentleLegacy: 'rod_haunt_gentle',
  noticeSeen: 'rod_safety_notice_seen',
  headphonesTipSeen: 'rod_headphones_tip_seen',
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
    mode: resolveMode(read(KEYS.mode), read(KEYS.gentleLegacy)),
    noticeSeen: parseBool(read(KEYS.noticeSeen), DEFAULT_SETTINGS.noticeSeen),
    headphonesTipSeen: parseBool(read(KEYS.headphonesTipSeen), DEFAULT_SETTINGS.headphonesTipSeen),
  };
}

/** Pure. Storage key to value. Never includes `rod_volume_cap` or the legacy gentle key. */
export function serializeSettings(s: HauntSettings): Record<string, string> {
  return {
    [KEYS.sound]: String(s.sound),
    [KEYS.mode]: s.mode,
    [KEYS.noticeSeen]: String(s.noticeSeen),
    [KEYS.headphonesTipSeen]: String(s.headphonesTipSeen),
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
        mode: patch.mode ?? current.mode,
        noticeSeen: patch.noticeSeen ?? current.noticeSeen,
        headphonesTipSeen: patch.headphonesTipSeen ?? current.headphonesTipSeen,
      };
      if (
        next.sound === current.sound &&
        next.mode === current.mode &&
        next.noticeSeen === current.noticeSeen &&
        next.headphonesTipSeen === current.headphonesTipSeen
      ) {
        return storage !== null;
      }
      // Memory first: the value holds for the session even if the write fails.
      current = next;
      let saved = storage !== null;
      if (storage !== null) {
        for (const [key, value] of Object.entries(serializeSettings(next))) {
          try {
            storage.setItem(key, value);
          } catch {
            saved = false; // Best-effort save; the caller decides whether to tell the reader.
          }
        }
      }
      for (const cb of [...listeners]) cb();
      return saved;
    },

    subscribe(cb): Unsubscribe {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}
