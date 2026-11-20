// Pace calculation: pure functions, no DOM or React.

export const DEFAULT_WPM = 200;
export const MIN_WPM = 50;
export const MAX_WPM = 1000;
export const MIN_TIME_SECONDS = 1;
export const MAX_TIME_SECONDS = 600;

/** Count words by splitting on whitespace runs. Empty or whitespace-only text has 0 words. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Suggested reading time in whole seconds (minimum 1).
 * Falls back to DEFAULT_WPM when the pace is missing, zero, negative, or not finite.
 */
export function suggestedSeconds(wordCount: number, averagePaceWpm?: number): number {
  if (!(wordCount > 0)) return 1;
  const wpm =
    averagePaceWpm !== undefined && Number.isFinite(averagePaceWpm) && averagePaceWpm > 0
      ? averagePaceWpm
      : DEFAULT_WPM;
  return Math.max(1, Math.ceil((wordCount / wpm) * 60));
}

/** Exponentially weighted moving average step. No clamping. */
export function ewmaUpdate(previousWpm: number, actualWpm: number): number {
  return 0.8 * previousWpm + 0.2 * actualWpm;
}

/**
 * Update the average pace after a paragraph. Returns previousWpm unchanged when the
 * observation is unusable (time < 1s or > 600s, or zero words); otherwise the EWMA
 * result clamped to [MIN_WPM, MAX_WPM].
 */
export function updateAveragePace(
  previousWpm: number,
  wordCount: number,
  timeSeconds: number,
): number {
  if (
    !Number.isFinite(timeSeconds) ||
    !Number.isFinite(wordCount) ||
    timeSeconds < MIN_TIME_SECONDS ||
    timeSeconds > MAX_TIME_SECONDS ||
    wordCount === 0
  ) {
    return previousWpm;
  }
  const actualWpm = wordCount / (timeSeconds / 60);
  const next = ewmaUpdate(previousWpm, actualWpm);
  return Math.min(MAX_WPM, Math.max(MIN_WPM, next));
}
