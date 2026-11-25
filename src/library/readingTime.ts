/**
 * Format an estimated reading time for display on a hover card.
 * Under 90 minutes: nearest 5 minutes ("About 45 min").
 * 90 minutes or more: whole hours ("About 3 hours", "About 1 hour").
 * Non-finite or non-positive input returns "About 5 min" (the smallest label).
 */
const MIN_LABEL = 'About 5 min';

export function formatReadingTime(minutes: number): string {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) {
    return MIN_LABEL;
  }
  if (minutes < 90) {
    const rounded = Math.round(minutes / 5) * 5;
    // Requirement 3.3: under 90 minutes is always shown as minutes, even
    // when rounding reaches 90 ("About 90 min").
    return rounded < 5 ? MIN_LABEL : `About ${rounded} min`;
  }
  const hours = Math.max(1, Math.round(minutes / 60));
  return hours === 1 ? 'About 1 hour' : `About ${hours} hours`;
}
