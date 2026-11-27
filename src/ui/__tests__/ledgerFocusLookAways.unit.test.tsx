import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { LedgerTab } from '../shell/LedgerTab';
import { EMPTY_DATA_MODEL, type DataModel, type Stats } from '../../library/model';

// Validates: Requirements 23.5, 23.6, 23.7, 23.8, 12.17
const TODAY = '2025-03-10';
const ZERO: Stats = {
  paragraphsRead: 0,
  chaptersFinished: 0,
  activeReadingSeconds: 0,
  lookAwayCount: 0,
  sessionCount: 0,
  awaySeconds: 0,
  wordsRead: 0,
};

function mount(lookAwayCount: number) {
  const model: DataModel = {
    ...EMPTY_DATA_MODEL,
    books: {
      a: { bookId: 'a', title: 'a', author: '', fileName: 'a.txt', source: 'upload', format: 'txt', addedAt: 1 },
    },
    shelves: { reading: ['a'], 'want-to-read': [], finished: [] },
    stats: { a: { ...ZERO, paragraphsRead: 17, activeReadingSeconds: 300 } },
    daily: { [TODAY]: { ...ZERO, activeReadingSeconds: 300, lookAwayCount } },
  };
  return render(<LedgerTab model={model} today={TODAY} />);
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('Focus card look-aways line', () => {
  it.each([
    [0, '0 look-aways today'],
    [1, '1 look-away today'],
    [7, '7 look-aways today'],
  ])('shows the count %i as "%s", under the gauges', (count, text) => {
    mount(count);
    const focus = screen.getByRole('heading', { name: 'Focus' }).closest('section')!;
    const line = within(focus).getByText(text);
    expect(line.textContent).toBe(text);
    expect(within(focus).getAllByRole('img')).toHaveLength(2);
    expect(focus.querySelector('.ledger-gauges')!.nextElementSibling).toBe(line);
  });
});
