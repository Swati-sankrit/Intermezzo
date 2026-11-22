/**
 * Detection rate gate. Pure: no DOM, clock, camera, or storage access.
 * The caller supplies the current time, the start time of the previous
 * detection, and whether the tab is visible.
 */

/** Minimum gap between two detection starts (10 Hz cap). */
export const MIN_DETECTION_GAP_MS = 100;

/**
 * True only when the tab is visible and either no detection has started yet
 * (`lastStartMs === null`) or at least MIN_DETECTION_GAP_MS has passed since
 * the previous start.
 */
export function canStartDetection(
  nowMs: number,
  lastStartMs: number | null,
  tabVisible: boolean,
): boolean {
  if (!tabVisible) return false;
  if (lastStartMs === null) return true;
  return nowMs - lastStartMs >= MIN_DETECTION_GAP_MS;
}
