import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { LedgerTab } from '../shell/LedgerTab';
import { EMPTY_DATA_MODEL, type DataModel, type Stats } from '../../library/model';
// Validates: Requirements 20.5, 20.7, 20.8, 20.9, 20.10, 20.11, 9.3, 9.4, 9.5, 9.6, 9.7
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
const stats = (over: Partial<Stats>): Stats => ({ ...ZERO, ...over });
function mount(daily: Record<string, Stats> = {}) {
  const model: DataModel = {
    ...EMPTY_DATA_MODEL,
    books: {
      a: { bookId: 'a', title: 'a', author: '', fileName: 'a.txt', source: 'upload', format: 'txt', addedAt: 1 },
    },
    shelves: { reading: ['a'], 'want-to-read': [], finished: [] },
    stats: { a: stats({ paragraphsRead: 17, chaptersFinished: 3, activeReadingSeconds: 300 }) },
    daily,
  };
  return render(<LedgerTab model={model} today={TODAY} />);
}
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});
describe('look-aways grid', () => {
  it('has 7 columns, today last and marked, with its full count as text', () => {
    mount({ [TODAY]: stats({ lookAwayCount: 25 }), '2025-03-09': stats({ lookAwayCount: 1 }) });
    const list = screen.getByRole('list', { name: 'Look-aways in the last 7 days' });
    const days = within(list).getAllByRole('listitem');
    expect(days).toHaveLength(7);
    expect(days.filter((d) => d.getAttribute('aria-current') === 'date')).toEqual([days[6]]);
    expect(days[6]).toHaveTextContent('25 look-aways (20 marks shown)');
    expect(days[6]).toHaveTextContent('Mon (today)');
    expect(days[6].querySelectorAll('line')).toHaveLength(20);
    expect(days[5]).toHaveTextContent('1 look-away');
    expect(days[5]).toHaveTextContent('Sun');
  });
});
describe('moon row', () => {
  it('has 30 moons, a text alternative for each, and today marked last', () => {
    mount({ [TODAY]: stats({ activeReadingSeconds: 15 * 60 }) });
    const moons = within(screen.getByRole('list', { name: 'The last 30 days, oldest first' })).getAllByRole('listitem');
    expect(moons).toHaveLength(30);
    for (const m of moons) expect(m.textContent).toMatch(/\S+: \S/);
    expect(moons.filter((m) => m.getAttribute('aria-current') === 'date')).toEqual([moons[29]]);
    expect(moons[29]).toHaveTextContent('(today)');
    expect(moons[29]).toHaveTextContent('Mon 10 Mar: full moon (today)');
    expect(moons[28]).not.toHaveTextContent('(today)');
  });
  it('shows a legend with five phases and the today ring', () => {
    mount();
    const legend = screen.getByRole('list', { name: 'Moon phases' });
    expect(within(legend).getAllByRole('listitem')).toHaveLength(6);
    expect(legend).toHaveTextContent('today');
  });
});
describe('Your reading tiles', () => {
  it('shows four tiles with their numbers', () => {
    mount();
    const tiles = screen.getByRole('heading', { name: 'Your reading' }).closest('section')!;
    const get = (label: string) => within(within(tiles).getByText(label).closest('div')!).getByRole('definition');
    expect(tiles.querySelectorAll('.stat-tile')).toHaveLength(4);
    expect(get('Books finished')).toHaveTextContent('0');
    expect(get('Books in progress')).toHaveTextContent('1');
    expect(get('Paragraphs read')).toHaveTextContent('17');
    expect(get('Chapters read')).toHaveTextContent('3');
  });
});
describe('dashboard order', () => {
  it('puts Focus, Your pace and Daily goal in the top row, then the rest in order', () => {
    const { container } = mount();
    const top = container.querySelector('.ledger__top')!;
    const names = (el: Element) => [...el.querySelectorAll(':scope > section h3')].map((h) => h.textContent);
    expect(names(top)).toEqual(['Focus', 'Your pace', 'Daily goal']);
    const rest = [...container.querySelectorAll('.ledger > section h3')].map((h) => h.textContent);
    expect(rest).toEqual(['Look-aways', 'The last 30 days', 'Your reading']);
  });
});
describe('progress ring and pace bar', () => {
  it('exposes progressbar semantics on the ring', () => {
    mount({ [TODAY]: stats({ activeReadingSeconds: 9 * 60 }) });
    const ring = screen.getByRole('progressbar');
    expect(ring).toHaveAttribute('aria-valuemin', '0');
    expect(ring).toHaveAttribute('aria-valuemax', '100');
    expect(ring).toHaveAttribute('aria-valuenow', '60');
    expect(ring).toHaveAttribute('aria-valuetext', '9 of 15 minutes');
  });
  it('gives the pace bar a text alternative with the pace and both markers', () => {
    mount({ '2025-03-08': stats({ wordsRead: 600, activeReadingSeconds: 120 }) });
    const bar = screen.getByRole('img', { name: /Your pace is/ });
    expect(bar.getAttribute('aria-label')).toBe(
      'Your pace is 300 wpm on a scale from 0 to 400 wpm. Typical adult markers at 238 wpm (non-fiction) and 260 wpm (fiction).',
    );
  });
  it('omits the pace from the alternative when there is no measured pace', () => {
    mount();
    const bar = screen.getByRole('img', { name: /Pace scale/ });
    expect(bar.getAttribute('aria-label')).toContain('238 wpm (non-fiction)');
    expect(bar.getAttribute('aria-label')).toContain('260 wpm (fiction)');
    expect(bar.getAttribute('aria-label')).not.toContain('Your pace');
  });
});
