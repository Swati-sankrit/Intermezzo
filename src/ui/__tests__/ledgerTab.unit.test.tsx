import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { ShellFrame } from '../shell/ShellFrame';
import { EMPTY_DATA_MODEL, type BookEntry, type DataModel, type Stats } from '../../library/model';

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

function book(id: string): BookEntry {
  return { bookId: id, title: id, author: '', fileName: `${id}.txt`, source: 'upload', format: 'txt', addedAt: 1 };
}

function model(over: Partial<DataModel> = {}): DataModel {
  return { ...EMPTY_DATA_MODEL, ...over };
}

/** A model that is not blank (one book has recorded reading) plus the given daily stats. */
function readerModel(daily: Record<string, Stats> = {}, perBook: Partial<Stats> = {}): DataModel {
  return model({
    books: { b1: book('b1') },
    shelves: { reading: ['b1'], 'want-to-read': [], finished: [] },
    stats: { b1: stats({ paragraphsRead: 3, activeReadingSeconds: 300, ...perBook }) },
    daily,
  });
}

function mount(m: DataModel | undefined) {
  return render(<ShellFrame library={<p>Library content</p>} initialTab="ledger" model={m} today={TODAY} />);
}

/** Two days with the given words and active seconds, so Measured_Pace comes from them. */
const paceDays = (a: Partial<Stats>, b: Partial<Stats> = {}) => ({
  '2025-03-08': stats(a),
  '2025-03-09': stats(b),
});

const EMPTY = 'The ledger is blank. Read a page and the candle will remember.';
const FALLBACK = 'Read a little longer to see your pace.';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('empty state (Req 8.19, 12.4)', () => {
  it('shows the exact text for a model with nothing in it', () => {
    mount(model());
    expect(screen.getByText(EMPTY)).toBeInTheDocument();
  });

  it('still offers the goal field and no progress bar when blank', () => {
    mount(model());
    expect(screen.getByLabelText('Daily goal in minutes')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('stays blank when a shelf lists an id that has no Book_Entry', () => {
    mount(model({ shelves: { reading: ['ghost'], 'want-to-read': [], finished: ['ghost2'] } }));
    expect(screen.getByText(EMPTY)).toBeInTheDocument();
  });

  it.each([
    ['active reading time', model({ stats: { b1: stats({ activeReadingSeconds: 1 }) } })],
    ['a paragraph read', model({ stats: { b1: stats({ paragraphsRead: 1 }) } })],
    [
      'a finished book',
      model({ books: { b1: book('b1') }, shelves: { reading: [], 'want-to-read': [], finished: ['b1'] } }),
    ],
    [
      'a book in progress',
      model({ books: { b1: book('b1') }, shelves: { reading: ['b1'], 'want-to-read': [], finished: [] } }),
    ],
  ])('hides the empty text when there is %s', (_name, m) => {
    mount(m);
    expect(screen.queryByText(EMPTY)).toBeNull();
    expect(screen.getByRole('heading', { name: 'Focus' })).toBeInTheDocument();
  });

  it('shows a loading status, not the empty text, while the model is undefined', () => {
    mount(undefined);
    expect(screen.getByText('Opening the ledger…')).toBeInTheDocument();
    expect(screen.queryByText(EMPTY)).toBeNull();
  });
});

describe('goal progress bar (Req 8.19)', () => {
  it('exposes role, min, max, now and a "9 of 15 minutes" text', () => {
    mount(readerModel({ [TODAY]: stats({ activeReadingSeconds: 9 * 60 }) }));
    const bar = screen.getByRole('progressbar', { name: "Progress toward today's goal" });
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-valuenow', '60');
    expect(bar).toHaveAttribute('aria-valuetext', '9 of 15 minutes');
    expect(screen.getByText('9 of 15 minutes')).toBeInTheDocument();
  });

  it('caps the value at 100 when today exceeds the goal', () => {
    mount(readerModel({ [TODAY]: stats({ activeReadingSeconds: 40 * 60 }) }));
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(bar).toHaveAttribute('aria-valuetext', '40 of 15 minutes');
  });

  it('reads 0 when nothing was read today', () => {
    mount(readerModel({}));
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(bar).toHaveAttribute('aria-valuetext', '0 of 15 minutes');
  });

  it('follows a changed goal', () => {
    mount(readerModel({ [TODAY]: stats({ activeReadingSeconds: 9 * 60 }) }));
    fireEvent.change(screen.getByLabelText('Daily goal in minutes'), { target: { value: '30' } });
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '30');
    expect(bar).toHaveAttribute('aria-valuetext', '9 of 30 minutes');
  });
});

describe('Measured_Pace and fallback (Req 8.19)', () => {
  it('shows the fallback when Pace_Days have under 120 active seconds', () => {
    mount(readerModel(paceDays({ wordsRead: 500, activeReadingSeconds: 119 })));
    expect(screen.getByText(FALLBACK)).toBeInTheDocument();
    expect(screen.queryByText(/ wpm$/)).toBeNull();
  });

  it('shows the pace at exactly 120 active seconds', () => {
    mount(readerModel(paceDays({ wordsRead: 500, activeReadingSeconds: 120 })));
    expect(screen.queryByText(FALLBACK)).toBeNull();
    expect(screen.getByText('250 wpm')).toBeInTheDocument();
  });

  it('adds seconds and words across days before dividing', () => {
    mount(readerModel(paceDays({ wordsRead: 100, activeReadingSeconds: 60 }, { wordsRead: 300, activeReadingSeconds: 60 })));
    expect(screen.getByText('200 wpm')).toBeInTheDocument();
  });

  it('ignores days with wordsRead 0 when summing seconds', () => {
    // Counting the 1000 s of the zero-word day would give 60 s + 1000 s and a different pace.
    mount(readerModel(paceDays({ wordsRead: 0, activeReadingSeconds: 1000 }, { wordsRead: 100, activeReadingSeconds: 60 })));
    expect(screen.getByText(FALLBACK)).toBeInTheDocument();
  });

  it('ignores zero-word days when a pace is shown', () => {
    mount(readerModel(paceDays({ wordsRead: 0, activeReadingSeconds: 600 }, { wordsRead: 520, activeReadingSeconds: 120 })));
    expect(screen.getByText('260 wpm')).toBeInTheDocument();
  });

  it.each([
    [426, 213, 'Your pace is below the typical adult speeds.'],
    [428, 214, 'Your pace is near the typical adult speeds.'],
    [572, 286, 'Your pace is near the typical adult speeds.'],
    [574, 287, 'Your pace is above the typical adult speeds.'],
  ])('with %i words in 120 s (%i wpm) it says: %s', (words, wpm, sentence) => {
    mount(readerModel(paceDays({ wordsRead: words, activeReadingSeconds: 120 })));
    expect(screen.getByText(`${wpm} wpm`)).toBeInTheDocument();
    expect(screen.getByText(sentence)).toBeInTheDocument();
  });

  it('always shows the Typical_Speeds text and the Source note with its citation', () => {
    mount(readerModel());
    expect(screen.getByText('Typical adult: 238 wpm (non-fiction), 260 wpm (fiction)')).toBeInTheDocument();
    const note = screen.getByText('Source:').closest('p')!;
    expect(note).toHaveTextContent(/Brysbaert, M\. \(2019\)\. How many words do we read per minute\?/);
    expect(note).toHaveTextContent('Journal of Memory and Language, 109, 104047.');
  });
});

describe('tally marks (Req 8.19)', () => {
  const row = (label: RegExp) => screen.getByText(label).closest('li')!;

  it('draws every mark below the cap and writes the number', () => {
    mount(readerModel({ [TODAY]: stats({ lookAwayCount: 12 }) }));
    const li = row(/^12 look-aways$/);
    expect(li.querySelectorAll('line')).toHaveLength(12);
  });

  it('draws 20 marks at the cap with no extra note', () => {
    mount(readerModel({ [TODAY]: stats({ lookAwayCount: 20 }) }));
    const li = row(/^20 look-aways$/);
    expect(li.querySelectorAll('line')).toHaveLength(20);
  });

  it('draws only 20 marks for 25 look-aways and writes 25 beside them', () => {
    mount(readerModel({ [TODAY]: stats({ lookAwayCount: 25 }) }));
    const li = row(/^25 look-aways \(20 marks shown\)$/);
    expect(li.querySelectorAll('line')).toHaveLength(20);
  });

  it('writes "1 look-away" in the singular', () => {
    mount(readerModel({ [TODAY]: stats({ lookAwayCount: 1 }) }));
    expect(screen.getByText('1 look-away')).toBeInTheDocument();
  });
});

describe('book, paragraph and chapter counts (Req 8.19)', () => {
  const count = (label: string) => within(screen.getByText(label).closest('div')!).getByRole('definition');

  it('shows books finished and in progress, paragraphs and chapters read', () => {
    mount(
      model({
        books: { a: book('a'), b: book('b'), c: book('c') },
        shelves: { reading: ['a', 'b'], 'want-to-read': [], finished: ['c'] },
        stats: {
          a: stats({ paragraphsRead: 10, chaptersFinished: 1 }),
          b: stats({ paragraphsRead: 7, chaptersFinished: 2 }),
        },
      }),
    );
    expect(count('Books finished')).toHaveTextContent('1');
    expect(count('Books in progress')).toHaveTextContent('2');
    expect(count('Paragraphs read')).toHaveTextContent('17');
    expect(count('Chapters read')).toHaveTextContent('3');
  });
});

describe('Daily_Goal field and rod_daily_goal (Req 12.2, 8.19)', () => {
  const field = () => screen.getByLabelText('Daily goal in minutes') as HTMLInputElement;
  const set = (v: string) => fireEvent.change(field(), { target: { value: v } });

  it('starts at 15 when nothing is saved', () => {
    mount(model());
    expect(field().value).toBe('15');
  });

  it.each([
    ['0', '1'],
    ['1', '1'],
    ['2', '2'],
    ['239', '239'],
    ['240', '240'],
    ['241', '240'],
    ['-5', '1'],
    ['14.4', '14'],
  ])('typing %s saves %s', (typed, saved) => {
    mount(model());
    set(typed);
    expect(localStorage.getItem('rod_daily_goal')).toBe(saved);
  });

  it('shows the clamped value in the field after leaving it', () => {
    mount(model());
    set('999');
    fireEvent.blur(field());
    expect(field().value).toBe('240');
  });

  it('does not save an empty field', () => {
    mount(model());
    set('');
    expect(localStorage.getItem('rod_daily_goal')).toBeNull();
  });

  it('writes the goal, then reads it back after a re-mount', () => {
    const first = mount(model());
    set('42');
    expect(localStorage.getItem('rod_daily_goal')).toBe('42');
    first.unmount();
    mount(model());
    expect(field().value).toBe('42');
  });

  it.each(['abc', '0', '241', '-5', '1.5', '', ' 20'])('falls back to 15 for the saved value %j', (raw) => {
    localStorage.setItem('rod_daily_goal', raw);
    mount(model());
    expect(field().value).toBe('15');
  });

  it('reads a valid saved value', () => {
    localStorage.setItem('rod_daily_goal', '240');
    mount(model());
    expect(field().value).toBe('240');
  });

  it('shows the short message when the write fails, and still uses the new goal', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    mount(readerModel({ [TODAY]: stats({ activeReadingSeconds: 9 * 60 }) }));
    expect(screen.queryByText('Your goal may not be remembered after a reload.')).toBeNull();
    set('30');
    expect(screen.getByRole('status')).toHaveTextContent('Your goal may not be remembered after a reload.');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '9 of 30 minutes');
  });
});
