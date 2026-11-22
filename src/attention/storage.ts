/**
 * Persistence for the reader's camera choice. Only the choice string is
 * written, never pose, landmark, or frame data. Every storage call is guarded.
 */

export type CameraChoice = 'camera' | 'no-camera';

export const CHOICE_KEY = 'rod_attention_choice';

/** Read the recorded choice. Returns null if absent, invalid, or storage is unreadable. */
export function loadChoice(): CameraChoice | null {
  try {
    const v = localStorage.getItem(CHOICE_KEY);
    return v === 'camera' || v === 'no-camera' ? v : null;
  } catch {
    return null;
  }
}

/** Record the choice. Returns false when the write fails. */
export function saveChoice(choice: CameraChoice): boolean {
  try {
    localStorage.setItem(CHOICE_KEY, choice);
    return true;
  } catch {
    return false;
  }
}
