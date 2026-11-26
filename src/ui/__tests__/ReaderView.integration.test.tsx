// Integration tests: the real LibraryShell, ReaderView and useReader hook over the in-memory
// store, which holds one uploaded book and its saved Position (the library path).
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { restoreBook } from '../../reader/bookCodec';
import { absoluteIndex, calculateProgress, countTotalParagraphs } from '../../reader/progress';
import { splitIntoParagraphs } from '../../reader/splitter';
import type { DataStore } from '../../library/localStore';
import type { Book } from '../../reader/types';
import { BOOK_ID, showLibrary, storeWithBook } from './libraryBook';

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

type Place = { chapterIndex: number; paragraphIndex: number; progress: number };

/** Opens the known book from the Continue card. Without a saved place it starts at the beginning. */
async function openKnownBook(position: Place = { chapterIndex: 0, paragraphIndex: 0, progress: 1 }, store?: DataStore) {
  const used = store ?? (await storeWithBook(TITLE, TEXT, position));
  const view = showLibrary(used);
  fireEvent.click(await screen.findByRole('button', { name: 'Continue reading' }));
  await screen.findByTestId('active-paragraph');
  return { view, store: used };
}

const savedPosition = async (store: DataStore) => {
  const r = await store.load();
  return r.ok ? r.value.positions[BOOK_ID] : undefined;
};

beforeEach(() => {
  cleanup();
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
    await openKnownBook({ chapterIndex: 1, paragraphIndex: 1, progress: 50 });
    expect(screen.getByRole('heading', { name: 'Chapter 2' })).toBeInTheDocument();
    expect(active()).toHaveTextContent('Beta two.');
    expect(progress()).toBe(expectedProgress(1, 1, false));
  });

  it('restores the position the previous session saved by itself', async () => {
    const first = await openKnownBook();
    fireEvent.click(active());
    fireEvent.click(active());
    await waitFor(async () => expect(await savedPosition(first.store)).toMatchObject({ chapterIndex: 0, paragraphIndex: 2 }));
    first.view.unmount();

    await openKnownBook(undefined, first.store);
    expect(active()).toHaveTextContent('Alpha three.');
    expect(progress()).toBe(expectedProgress(0, 2, false));
  });

  it.each([
    ['chapter past the end', 9, 0, 'Chapter 2', 'Beta two.', 1, 1],
    ['paragraph past the end', 0, 99, 'Chapter 1', 'Alpha three.', 0, 2],
  ])('opens at the last paragraph that exists when the saved place is outside the book (%s)', async (_n, c, p, heading, text, rc, rp) => {
    await openKnownBook({ chapterIndex: c, paragraphIndex: p, progress: 50 });
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    expect(active()).toHaveTextContent(text);
    expect(progress()).toBe(expectedProgress(rc, rp, false));
  });

  it('works out the progress of a migrated place (progress 0, place not at the start) without moving the reader', async () => {
    const store = await storeWithBook(TITLE, TEXT, { chapterIndex: 1, paragraphIndex: 1, progress: 0 });
    showLibrary(store);
    fireEvent.click(await screen.findByRole('button', { name: /Start reading/ }));
    await screen.findByTestId('active-paragraph');
    expect(active()).toHaveTextContent('Beta two.');
    await waitFor(async () => expect((await savedPosition(store))?.progress).toBe(expectedProgress(1, 1, false)));
    expect(await savedPosition(store)).toMatchObject({ chapterIndex: 1, paragraphIndex: 1 });
    expect(active()).toHaveTextContent('Beta two.');
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
        const { store } = await openKnownBook();

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
        // Any advance raises progress above 0; the saved Position then carries the same value.
        if (last > 0) {
          await waitFor(async () => expect((await savedPosition(store))?.progress).toBe(last));
        }
      }),
      { numRuns: 30 },
    );
    // 30 runs each mount the whole shell (about 130 ms per run, 3.6 to 4.3 s in total), so the
    // default 5 s limit leaves too little room when the full suite runs files in parallel.
  }, 30_000);
});
