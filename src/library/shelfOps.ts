/** Pure shelf/position updates. Each returns a new model and never mutates its input. */

import type { BookEntry, DataModel, Position, ShelfName, Shelves, Stats } from './model';

const ZERO_STATS: Stats = {
  paragraphsRead: 0,
  chaptersFinished: 0,
  activeReadingSeconds: 0,
  lookAwayCount: 0,
  sessionCount: 0,
  awaySeconds: 0,
};

function hasBook(model: DataModel, bookId: string): boolean {
  return Object.prototype.hasOwnProperty.call(model.books, bookId);
}

function withoutBook(shelves: Shelves, bookId: string): Shelves {
  return {
    reading: shelves.reading.filter((id) => id !== bookId),
    'want-to-read': shelves['want-to-read'].filter((id) => id !== bookId),
    finished: shelves.finished.filter((id) => id !== bookId),
  };
}

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const copy = { ...record };
  delete copy[key];
  return copy;
}

/** Adds a new book on `reading` with zeroed stats. An existing Book_Id is reused unchanged. */
export function addBookEntry(model: DataModel, entry: BookEntry): DataModel {
  if (hasBook(model, entry.bookId)) return model;
  return {
    ...model,
    shelves: { ...model.shelves, reading: [...model.shelves.reading, entry.bookId] },
    books: { ...model.books, [entry.bookId]: entry },
    stats: { ...model.stats, [entry.bookId]: { ...ZERO_STATS } },
  };
}

/** Moves a book to `shelf`, removing it from every other shelf in the same result. */
export function moveToShelf(model: DataModel, bookId: string, shelf: ShelfName): DataModel {
  if (!hasBook(model, bookId)) return model;
  const cleared = withoutBook(model.shelves, bookId);
  return { ...model, shelves: { ...cleared, [shelf]: [...cleared[shelf], bookId] } };
}

/** Removes a book from its shelf and drops its entry, position and stats. */
export function removeBook(model: DataModel, bookId: string): DataModel {
  if (!hasBook(model, bookId)) return model;
  return {
    ...model,
    shelves: withoutBook(model.shelves, bookId),
    books: omitKey(model.books, bookId),
    positions: omitKey(model.positions, bookId),
    stats: omitKey(model.stats, bookId),
  };
}

/** Stores the single position for a book. */
export function savePosition(model: DataModel, bookId: string, position: Position): DataModel {
  if (!hasBook(model, bookId)) return model;
  return { ...model, positions: { ...model.positions, [bookId]: { ...position } } };
}

/** The `reading` book with the latest saved position, else the latest added. */
export function currentBook(model: DataModel): BookEntry | null {
  let best: BookEntry | null = null;
  let bestSaved = -Infinity;
  let bestAdded = -Infinity;
  for (const id of model.shelves.reading) {
    const entry = model.books[id];
    if (!entry) continue;
    const saved = model.positions[id]?.savedAt ?? -Infinity;
    const better =
      saved > bestSaved || (saved === bestSaved && saved === -Infinity && entry.addedAt > bestAdded);
    if (best === null || better) {
      best = entry;
      bestSaved = saved;
      bestAdded = entry.addedAt;
    }
  }
  return best;
}
