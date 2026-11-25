import { describe, it, expect } from 'vitest';
import { formatReadingTime } from '../readingTime';

// Expected values come from Requirement 3.3: under 90 minutes shows minutes
// rounded to the nearest 5; 90 or more shows whole hours rounded to the
// nearest hour.
describe('formatReadingTime (Requirements 3.3, 23.5)', () => {
  it('rounds minutes under 90 to the nearest 5', () => {
    expect(formatReadingTime(5)).toBe('About 5 min');
    expect(formatReadingTime(42)).toBe('About 40 min');
    expect(formatReadingTime(43)).toBe('About 45 min');
    expect(formatReadingTime(87)).toBe('About 85 min');
    expect(formatReadingTime(88)).toBe('About 90 min');
  });

  it('keeps 89 minutes in minutes, rounded to 90 (under 90 stays in minutes)', () => {
    expect(formatReadingTime(89)).toBe('About 90 min');
  });

  it('switches to hours at exactly 90 minutes (1.5 h rounds to 2)', () => {
    expect(formatReadingTime(90)).toBe('About 2 hours');
  });

  it('rounds hours to the nearest hour around 134 minutes', () => {
    expect(formatReadingTime(134)).toBe('About 2 hours'); // 2.23 h
    expect(formatReadingTime(149)).toBe('About 2 hours'); // 2.48 h
    expect(formatReadingTime(150)).toBe('About 3 hours'); // 2.5 h
  });

  it('shows exact multiples exactly', () => {
    expect(formatReadingTime(30)).toBe('About 30 min');
    expect(formatReadingTime(60)).toBe('About 60 min');
    expect(formatReadingTime(120)).toBe('About 2 hours');
    expect(formatReadingTime(180)).toBe('About 3 hours');
    expect(formatReadingTime(600)).toBe('About 10 hours');
  });

  it('falls back safely to the smallest label for 0, negative, NaN, and infinite input', () => {
    for (const bad of [0, -10, Number.NaN, Infinity, -Infinity]) {
      expect(formatReadingTime(bad)).toBe('About 5 min');
    }
  });
});
