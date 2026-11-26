/**
 * Persistence for the Shell's active tab. Every storage call is guarded: a
 * missing, unreadable or invalid value reads as 'library', and a failed write
 * is silent.
 */

export type ShellTabName = 'library' | 'ledger' | 'seance';

export const SHELL_TAB_NAMES: readonly ShellTabName[] = ['library', 'ledger', 'seance'];

export const TAB_STORAGE_KEY = 'rod_shell_tab';

export function isShellTabName(v: unknown): v is ShellTabName {
  return typeof v === 'string' && (SHELL_TAB_NAMES as readonly string[]).includes(v);
}

/** The saved tab, or 'library' when it is missing, invalid or unreadable. */
export function loadShellTab(): ShellTabName {
  try {
    const v = localStorage.getItem(TAB_STORAGE_KEY);
    return isShellTabName(v) ? v : 'library';
  } catch {
    return 'library';
  }
}

/** Save the tab. Returns false when the write fails; callers ignore it. */
export function saveShellTab(tab: ShellTabName): boolean {
  try {
    localStorage.setItem(TAB_STORAGE_KEY, tab);
    return true;
  } catch {
    return false;
  }
}
