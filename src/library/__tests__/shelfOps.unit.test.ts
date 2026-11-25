import { describe, expect, it } from 'vitest';
import { EMPTY_DATA_MODEL, type BookEntry, type DataModel, type Position } from '../model';
import { addBookEntry, currentBook, moveToShelf, removeBook, savePosition } from '../shelfOps';

function entry(bookId: string, addedAt: number): BookEntry {
  return {
    bookId,
    title: bookId,
    author: '',
    fileName: `${bookId}.txt`,
    source: 'upload',
    format: 'txt',
    addedAt,
  };
}

function pos(savedAt: number, paragraphIndex = 0): Position {
  return { chapterIndex: 0, paragraphIndex, savedAt, progress: 10 };
}

function build(entries: BookEntry[]): DataModel {
  return entries.reduce((m, e) => addBookEntry(m, e), EMPTY_DATA_MODEL);
}

describe('shelfOps examples', () => {
  it('savePosition changes only the target book position (Property 2)', () => {
    const base = savePosition(build([entry('a', 1), entry('b', 2)]), 'b', pos(50, 3));
    const next = savePosition(base, 'a', pos(60, 7));
    expect(next.positions.a).toEqual(pos(60, 7));
    expect(next.positions.b).toEqual(pos(50, 3));
    expect(next.shelves).toEqual(base.shelves);
    expect(next.stats).toEqual(base.stats);
  });

  it('moveToShelf leaves the book on exactly the target shelf (Property 3)', () => {
    const m = build([entry('a', 1), entry('b', 2)]);
    const moved = moveToShelf(moveToShelf(m, 'a', 'finished'), 'a', 'want-to-read');
    const holding = Object.entries(moved.shelves)
      .filter(([, ids]) => ids.includes('a'))
      .map(([name]) => name);
    expect(holding).toEqual(['want-to-read']);
    expect(moved.shelves.reading).toEqual(['b']);
    expect(moved.shelves['want-to-read'].filter((id) => id === 'a')).toHaveLength(1);
  });

  it('returns the model unchanged for an unknown Book_Id', () => {
    const m = build([entry('a', 1)]);
    expect(moveToShelf(m, 'zzz', 'finished')).toBe(m);
    expect(savePosition(m, 'zzz', pos(1))).toBe(m);
    expect(removeBook(m, 'zzz')).toBe(m);
  });

  it('addBookEntry zeroes every stat including awaySeconds; removeBook leaves daily unchanged', () => {
    const added = build([entry('a', 1), entry('b', 2)]);
    expect(added.stats.a).toEqual({
      paragraphsRead: 0, chaptersFinished: 0, activeReadingSeconds: 0,
      lookAwayCount: 0, sessionCount: 0, awaySeconds: 0,
    });
    const day = { ...added.stats.a, paragraphsRead: 4, awaySeconds: 9 };
    const withDaily: DataModel = { ...added, daily: { '2025-03-04': day } };
    const removed = removeBook(withDaily, 'a');
    expect(removed.stats.a).toBeUndefined();
    expect(removed.daily).toEqual({ '2025-03-04': day });
  });

  it('does not mutate its inputs', () => {
    const m = savePosition(build([entry('a', 1), entry('b', 2)]), 'a', pos(5));
    const position = pos(9);
    const snapshot = structuredClone(m);
    const positionSnapshot = structuredClone(position);
    moveToShelf(m, 'a', 'finished');
    savePosition(m, 'b', position);
    removeBook(m, 'a');
    addBookEntry(m, entry('c', 3));
    currentBook(m);
    expect(m).toEqual(snapshot);
    expect(position).toEqual(positionSnapshot);
  });

  it('currentBook picks the latest savedAt among reading books', () => {
    let m = build([entry('a', 1), entry('b', 2), entry('c', 3)]);
    m = savePosition(m, 'a', pos(100));
    m = savePosition(m, 'b', pos(200));
    expect(currentBook(m)?.bookId).toBe('b');
  });

  it('currentBook ignores books not on the reading shelf', () => {
    let m = build([entry('a', 1), entry('b', 2)]);
    m = savePosition(m, 'a', pos(100));
    m = savePosition(m, 'b', pos(200));
    m = moveToShelf(m, 'b', 'finished');
    expect(currentBook(m)?.bookId).toBe('a');
  });

  it('currentBook returns null when no reading book has progress above 0', () => {
    let m = build([entry('a', 5), entry('b', 9)]);
    expect(currentBook(m)).toBeNull();
    m = savePosition(m, 'a', { ...pos(100), progress: 0 });
    expect(currentBook(m)).toBeNull();
  });

  it('currentBook ignores progress 0 even when its savedAt is the latest', () => {
    let m = build([entry('a', 1), entry('b', 2)]);
    m = savePosition(m, 'a', pos(100));
    m = savePosition(m, 'b', { ...pos(200), progress: 0 });
    expect(currentBook(m)?.bookId).toBe('a');
  });

  it('currentBook ignores want-to-read books with progress', () => {
    let m = build([entry('a', 1), entry('b', 2)]);
    m = savePosition(m, 'a', pos(100));
    m = savePosition(m, 'b', pos(200));
    m = moveToShelf(m, 'b', 'want-to-read');
    expect(currentBook(m)?.bookId).toBe('a');
  });

  it('currentBook returns null when the only started book is finished', () => {
    let m = savePosition(build([entry('a', 1)]), 'a', pos(100));
    m = moveToShelf(m, 'a', 'finished');
    expect(currentBook(m)).toBeNull();
  });

  it('currentBook returns null with no reading books', () => {
    expect(currentBook(EMPTY_DATA_MODEL)).toBeNull();
  });
});
