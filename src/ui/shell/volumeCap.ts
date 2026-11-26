/**
 * Storage for the Volume_Cap slider (`rod_volume_cap`). The Safety_Gate is the only code that
 * applies the cap to sound; this file only reads and writes the saved number. It reuses the
 * gate's own parser and default, so the slider and the gate always agree on a missing value.
 */
import { DEFAULT_VOLUME_CAP, parseVolumeCap } from '../../haunts/engine/gate/plan';

export const VOLUME_CAP_KEY = 'rod_volume_cap';
export const VOLUME_STEP_PERCENT = 5;

/** The slider position for a saved value: 0 to 100 in steps of 5. */
export function capToPercent(cap: number): number {
  const steps = Math.round((cap * 100) / VOLUME_STEP_PERCENT);
  return Math.min(100, Math.max(0, steps * VOLUME_STEP_PERCENT));
}

/** The text saved for a slider position: a number from 0 to 1. */
export function percentToCapText(percent: number): string {
  const safe = Number.isFinite(percent) ? percent : DEFAULT_VOLUME_CAP * 100;
  return String(capToPercent(safe / 100) / 100);
}

/** The saved cap as a slider position. Missing or unreadable gives 40. */
export function loadVolumeCapPercent(): number {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(VOLUME_CAP_KEY);
  } catch {
    raw = null;
  }
  return capToPercent(parseVolumeCap(raw));
}

/** Saves the slider position as 0 to 1. Returns false when the write fails. */
export function saveVolumeCapPercent(percent: number): boolean {
  try {
    localStorage.setItem(VOLUME_CAP_KEY, percentToCapText(percent));
    return true;
  } catch {
    return false;
  }
}
