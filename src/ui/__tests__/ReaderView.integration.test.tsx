// Integration tests: the real ReaderView and the real useReader hook, with
// fake-indexeddb for the saved book and jsdom localStorage for saved state.
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearSavedBook, saveBook } from '../../reader/bookStore';
import { restoreBook } from '../../reader/bookCodec';
import { absoluteIndex, calculateProgress, countTotalParagraphs } from '../../reader/progress';
import { splitIntoParagraphs } from '../../reader/splitter';
import { loadState, saveState } from '../../reader/storage';
import type { Book } from '../../reader/types';
import { ReaderView } from '../ReaderView';

const FILE = 'known-book.txt';
const TITLE = 'A Known Book';
const TEXT = [
  'Chapter 1',
  'Alpha one.',
  'Alpha two.',
  'Alpha three.',
  'Chapter 2',
  'Beta one.',
  'Beta two.',
].join('\n\n');

function knownBook(): Book {
  const r = restoreBook(FILE, TEXT, TITLE);
  if (!r.ok) throw new Error('fixture book must parse');
  return r.book;
}

/** Expected progress from the pure formula, for a position in the known book. */
function expectedProgress(chapterIndex: number, paragraphIndex: number, complete: boolean): number {
  const book = knownBook();
  const total = countTotalParagraphs(book, splitIntoParagraphs);
  const abs = absoluteIndex(book, { chapterIndex, paragraphIndex }, splitIntoParagraphs);
  return calculateProgress(abs + (complete ? 1 : 0), total);
}

const progress = () => Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'));
const active = () => screen.getByTestId('active-paragraph');
const nextButton = () => screen.queryByRole('button', { name: 'Next chapter' });

async function openKnownBook() {
  const view = render(<ReaderView />);
  await screen.findByTestId('active-paragraph');
  return view;
}

function savedState(chapterIndex: number, paragraphIndex: number) {
  saveState({
    fileName: FILE,
    position: { chapterIndex, paragraphIndex, savedAt: 1 },
    averagePace: 200,
    paceGuideEnabled: false,
  });
}

beforeEach(async () => {
  cleanup();
  localStorage.clear();
  await clearSavedBook();
  await saveBook(FILE, TEXT, TITLE);
});

describe('ReaderView integration: advancing', () => {
  it('advances paragraph by paragraph by click and by keyboard, with progress matching calculateProgress', async () => {
    await openKnownBook();
    expect(screen.getByText(TITLE)).toBeInTheDocument();
    expect(active()).toHaveTextContent('Alpha one.');
    expect(progress()).toBe(expectedProgress(0, 0, false));

    fireEvent.click(active());
    expect(active()).toHaveTextContent('Alpha two.');
    expect(progress()).toBe(expectedProgress(0, 1, false));

    fireEvent.keyDown(active(), { key: ' ' });
    expect(active()).toHaveTextContent('Alpha three.');
    expect(progress()).toBe(expectedProgress(0, 2, false));
    // Earlier paragraphs stay on the page.
    expect(screen.getByText('Alpha one.')).toBeInTheDocument();
    expect(screen.getByText('Alpha two.')).toBeInTheDocument();
  });

  it('advances with Enter as well', async () => {
    await openKnownBook();
    fireEvent.keyDown(active(), { key: 'Enter' });
    expect(active()).toHaveTextContent('Alpha two.');
  });

  it('shows the completion indicator at chapter end and suppresses further advance', async () => {
    await openKnownBook();
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(active());
    fireEvent.click(active());
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(active()); // past the last paragraph of chapter 1

    expect(screen.getByRole('status')).toHaveTextContent('Chapter complete.');
    expect(active()).toHaveTextContent('Alpha three.');
    const done = progress();
    expect(done).toBe(expectedProgress(0, 2, true));

    fireEvent.click(active());
    fireEvent.keyDown(active(), { key: ' ' });
    fireEvent.keyDown(active(), { key: 'Enter' });
    expect(active()).toHaveTextContent('Alpha three.');
    expect(progress()).toBe(done);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('ReaderView integration: chapters', () => {
  it('shows Next chapter only when a later chapter exists, and it opens that chapter', async () => {
    await openKnownBook();
    expect(nextButton()).toBeNull();
    for (let i = 0; i < 3; i++) fireEvent.click(active());
    expect(nextButton()).not.toBeNull();

    fireEvent.click(nextButton()!);
    expect(screen.getByRole('heading', { name: 'Chapter 2' })).toBeInTheDocument();
    expect(active()).toHaveTextContent('Beta one.');
    expect(screen.queryByRole('status')).toBeNull();
    expect(nextButton()).toBeNull();
    expect(progress()).toBe(expectedProgress(1, 0, false));
  });

  it('has no Next chapter button on the last chapter', async () => {
    await openKnownBook();
    for (let i = 0; i < 3; i++) fireEvent.click(active());
    fireEvent.click(nextButton()!);
    fireEvent.click(active());
    fireEvent.click(active()); // chapter 2 complete

    expect(screen.getByRole('status')).toHaveTextContent('You have reached the end of the book.');
    expect(nextButton()).toBeNull();
    expect(progress()).toBe(100);
  });
});

describe('ReaderView integration: restore after reload', () => {
  it('shows the saved paragraph as active with no user action', async () => {
    savedState(1, 1);
    await openKnownBook();
    expect(screen.getByRole('heading', { name: 'Chapter 2' })).toBeInTheDocument();
    expect(active()).toHaveTextContent('Beta two.');
    expect(progress()).toBe(expectedProgress(1, 1, false));
  });

  it('restores the position the previous session saved by itself', async () => {
    const first = await openKnownBook();
    fireEvent.click(active());
    fireEvent.click(active());
    expect(loadState()?.position).toMatchObject({ chapterIndex: 0, paragraphIndex: 2 });
    first.unmount();

    await openKnownBook();
    expect(active()).toHaveTextContent('Alpha three.');
    expect(progress()).toBe(expectedProgress(0, 2, false));
  });

  it.each([
    ['chapter past the end', 9, 0],
    ['paragraph past the end', 0, 99],
  ])('falls back to chapter 0, paragraph 0 when the saved position is outside the book (%s)', async (_n, c, p) => {
    savedState(c, p);
    await openKnownBook();
    expect(screen.getByRole('heading', { name: 'Chapter 1' })).toBeInTheDocument();
    expect(active()).toHaveTextContent('Alpha one.');
    expect(progress()).toBe(0);
  });
});

describe('ReaderView integration: properties', () => {
  // Feature: reader-core, Property 20: UI progress stays in 0..100, never decreases, and matches the formula
  // **Validates: Requirements 5.2, 5.3**
  it('Property 20: any sequence of advances and chapter changes keeps progress valid and non-decreasing', async () => {
    const ops = fc.array(fc.constantFrom('advance', 'next'), { maxLength: 12 });
    await fc.assert(
      fc.asyncProperty(ops, async (sequence) => {
        cleanup();
        localStorage.clear();
        await clearSavedBook();
        await saveBook(FILE, TEXT, TITLE);
        await openKnownBook();

        let last = progress();
        for (const op of sequence) {
          if (op === 'advance') fireEvent.click(active());
          else if (nextButton()) fireEvent.click(nextButton()!);
          const now = progress();
          expect(now).toBeGreaterThanOrEqual(0);
          expect(now).toBeLessThanOrEqual(100);
          expect(now).toBeGreaterThanOrEqual(last);
          last = now;
        }
        const saved = loadState();
        if (saved) {
          const { chapterIndex: c, paragraphIndex: p } = saved.position;
          const complete = screen.queryByRole('status') !== null;
          expect(last).toBe(expectedProgress(c, p, complete));
        }
      }),
      { numRuns: 30 },
    );
  });
});
