import type { StoredState } from './types';

export const STORAGE_KEY = 'rod_state';

/** Standalone key so the setting survives when no book or position is saved yet. */
export const PACE_GUIDE_KEY = 'rod_pace_guide';

const MIN_PACE = 50;
const MAX_PACE = 1000;

function isIndex(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/** Persist reading state. Only metadata is written, never book text. Errors are swallowed. */
export function saveState(state: StoredState): void {
  try {
    const clean: StoredState = {
      fileName: state.fileName,
      position: {
        chapterIndex: state.position.chapterIndex,
        paragraphIndex: state.position.paragraphIndex,
        savedAt: state.position.savedAt,
      },
      averagePace: state.averagePace,
      paceGuideEnabled: state.paceGuideEnabled,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // Storage unavailable or full: persistence is best-effort.
  }
}

/** Read and validate saved state. Returns null if unavailable, absent, or invalid. */
export function loadState(): StoredState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return null;
    const o = v as Record<string, unknown>;
    const p = o.position as Record<string, unknown> | null | undefined;
    if (typeof o.fileName !== 'string') return null;
    if (typeof p !== 'object' || p === null) return null;
    if (!isIndex(p.chapterIndex) || !isIndex(p.paragraphIndex)) return null;
    if (typeof p.savedAt !== 'number' || !Number.isFinite(p.savedAt)) return null;
    if (
      typeof o.averagePace !== 'number' ||
      !Number.isFinite(o.averagePace) ||
      o.averagePace < MIN_PACE ||
      o.averagePace > MAX_PACE
    ) {
      return null;
    }
    if (typeof o.paceGuideEnabled !== 'boolean') return null;
    return {
      fileName: o.fileName,
      position: {
        chapterIndex: p.chapterIndex,
        paragraphIndex: p.paragraphIndex,
        savedAt: p.savedAt,
      },
      averagePace: o.averagePace,
      paceGuideEnabled: o.paceGuideEnabled,
    };
  } catch {
    return null;
  }
}

/** Remove saved state. Never throws. */
export function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Save the pace-guide setting on its own. Never throws; the setting then lasts for this session only. */
export function savePaceGuide(enabled: boolean): void {
  try {
    localStorage.setItem(PACE_GUIDE_KEY, String(enabled));
  } catch {
    // Storage unavailable: best-effort.
  }
}

/** Read the pace-guide setting. Returns null if absent, invalid, or storage is unavailable. */
export function loadPaceGuide(): boolean | null {
  try {
    const v = localStorage.getItem(PACE_GUIDE_KEY);
    return v === 'true' ? true : v === 'false' ? false : null;
  } catch {
    return null;
  }
}
