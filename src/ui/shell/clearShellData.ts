/**
 * After "Clear my data" succeeds, removes the Shell's own keys: the Daily_Goal, the Saved_Tab and
 * the Volume_Cap. Each removal is guarded on its own so one failure does not skip the others.
 */
import { GOAL_STORAGE_KEY } from './goalStorage';
import { TAB_STORAGE_KEY } from './tabStorage';
import { VOLUME_CAP_KEY } from './volumeCap';

export const SHELL_KEYS_CLEARED: readonly string[] = [GOAL_STORAGE_KEY, TAB_STORAGE_KEY, VOLUME_CAP_KEY];

export function clearShellData(): void {
  for (const key of SHELL_KEYS_CLEARED) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage unavailable: nothing to remove.
    }
  }
}
