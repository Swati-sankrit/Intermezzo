import {
  STATS_FIELDS,
  type BookEntry,
  type DataModel,
  type Position,
  type Stats,
} from './model';

function sortedKeys<T>(rec: Record<string, T>): string[] {
  return Object.keys(rec).sort();
}

function orderBook(b: BookEntry): BookEntry {
  const out: BookEntry = {
    bookId: b.bookId,
    title: b.title,
    author: b.author,
    fileName: b.fileName,
    source: b.source,
    format: b.format,
    addedAt: b.addedAt,
  };
  if (b.catalogueSlug !== undefined) out.catalogueSlug = b.catalogueSlug;
  return out;
}

function orderPosition(p: Position): Position {
  return {
    chapterIndex: p.chapterIndex,
    paragraphIndex: p.paragraphIndex,
    savedAt: p.savedAt,
    progress: p.progress,
  };
}

function orderStats(s: Stats): Stats {
  const out = {} as Stats;
  for (const f of STATS_FIELDS) out[f] = s[f];
  return out;
}

function mapSorted<T>(rec: Record<string, T>, fn: (v: T) => T): Record<string, T> {
  const out: Record<string, T> = {};
  for (const k of sortedKeys(rec)) Object.defineProperty(out, k, {
    value: fn(rec[k]), enumerable: true, writable: true, configurable: true,
  });
  return out;
}

/** Text form of a model with a fixed key order, so equal models give equal text. */
export function serialize(model: DataModel): string {
  const p = model.profile;
  const ordered: DataModel = {
    schemaVersion: model.schemaVersion,
    profile: {
      displayName: p.displayName,
      candleColour: p.candleColour,
      onboardingCompleted: p.onboardingCompleted,
      paceGuideEnabled: p.paceGuideEnabled,
      averagePace: p.averagePace,
    },
    shelves: {
      reading: [...model.shelves.reading],
      'want-to-read': [...model.shelves['want-to-read']],
      finished: [...model.shelves.finished],
    },
    books: mapSorted(model.books, orderBook),
    positions: mapSorted(model.positions, orderPosition),
    stats: mapSorted(model.stats, orderStats),
    daily: mapSorted(model.daily, orderStats),
  };
  return JSON.stringify(ordered);
}

/** Parses text into unknown data. Returns undefined on bad JSON; never throws. */
export function parse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
