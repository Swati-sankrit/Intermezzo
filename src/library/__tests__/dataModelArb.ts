import fc from 'fast-check';
import {
  CANDLE_COLOURS,
  MAX_AVERAGE_PACE,
  MAX_DISPLAY_NAME,
  MIN_AVERAGE_PACE,
  SCHEMA_VERSION,
  type BookEntry,
  type DataModel,
  type Position,
  type Stats,
} from '../model';

/** Shared generator of valid version-2 DataModels (moved unchanged from serializer.p8.prop.test.ts). */

// JSON text cannot carry -0 (it becomes 0), so timestamps never use -0.
const timestamp = fc
  .double({ noNaN: true, noDefaultInfinity: true })
  .map((n) => (Object.is(n, -0) ? 0 : n));
const count = fc.nat({ max: 1_000_000 });

// Includes the awkward key "__proto__" so key handling is exercised.
const bookId = fc.oneof(
  { weight: 8, arbitrary: fc.string({ maxLength: 12 }) },
  { weight: 1, arbitrary: fc.constantFrom('__proto__', 'constructor', 'toString', '') },
);

// fc.record can emit null-prototype objects; JSON.parse gives plain ones, so spread into plain objects.
const stats: fc.Arbitrary<Stats> = fc
  .record({
    paragraphsRead: count,
    chaptersFinished: count,
    activeReadingSeconds: count,
    lookAwayCount: count,
    sessionCount: count,
    awaySeconds: count,
  })
  .map((s) => ({ ...s }));

// Real calendar dates (leap days included), formatted as Local_Date YYYY-MM-DD.
const localDate = fc
  .date({ min: new Date('1970-01-01T00:00:00Z'), max: new Date('2100-12-31T00:00:00Z'), noInvalidDate: true })
  .map((d) => d.toISOString().slice(0, 10));

const position: fc.Arbitrary<Position> = fc
  .record({
    chapterIndex: count,
    paragraphIndex: count,
    savedAt: timestamp,
    progress: fc.integer({ min: 0, max: 100 }),
  })
  .map((p) => ({ ...p }));

function bookArb(id: string): fc.Arbitrary<BookEntry> {
  return fc
    .record(
      {
        bookId: fc.constant(id),
        title: fc.string({ maxLength: 30 }),
        author: fc.string({ maxLength: 30 }),
        fileName: fc.string({ maxLength: 30 }),
        source: fc.constantFrom('catalogue' as const, 'upload' as const),
        format: fc.constantFrom('txt' as const, 'epub' as const),
        catalogueSlug: fc.string({ maxLength: 20 }),
        addedAt: timestamp,
      },
      { requiredKeys: ['bookId', 'title', 'author', 'fileName', 'source', 'format', 'addedAt'] },
    )
    .map((b) => ({ ...b }) as BookEntry);
}

/** A valid model: unique ids, each book on at most one shelf, stats for every book. */
export const dataModel: fc.Arbitrary<DataModel> = fc
  .uniqueArray(bookId, { maxLength: 6 })
  .chain((ids) =>
    fc.record({
      profile: fc.record({
        displayName: fc.string({ maxLength: MAX_DISPLAY_NAME }),
        candleColour: fc.constantFrom(...CANDLE_COLOURS),
        onboardingCompleted: fc.boolean(),
        paceGuideEnabled: fc.boolean(),
        averagePace: fc.double({
          min: MIN_AVERAGE_PACE,
          max: MAX_AVERAGE_PACE,
          noNaN: true,
        }),
      }),
      books: fc.tuple(...ids.map(bookArb)),
      shelfOf: fc.tuple(...ids.map(() => fc.integer({ min: -1, max: 2 }))),
      positions: fc.tuple(...ids.map(() => fc.option(position, { nil: undefined }))),
      stats: fc.tuple(...ids.map(() => stats)),
      daily: fc.uniqueArray(fc.tuple(localDate, stats), { maxLength: 6, selector: ([d]) => d }),
    }).map((g) => {
      const model: DataModel = {
        schemaVersion: SCHEMA_VERSION,
        profile: { ...g.profile },
        shelves: { reading: [], 'want-to-read': [], finished: [] },
        books: {},
        positions: {},
        stats: {},
        daily: {},
      };
      const names = ['reading', 'want-to-read', 'finished'] as const;
      ids.forEach((id, i) => {
        Object.defineProperty(model.books, id, { value: g.books[i], enumerable: true, writable: true, configurable: true });
        Object.defineProperty(model.stats, id, { value: g.stats[i], enumerable: true, writable: true, configurable: true });
        const pos = g.positions[i];
        if (pos) Object.defineProperty(model.positions, id, { value: pos, enumerable: true, writable: true, configurable: true });
        if (g.shelfOf[i] >= 0) model.shelves[names[g.shelfOf[i]]].push(id);
      });
      for (const [date, s] of g.daily) model.daily[date] = s;
      return model;
    }),
  );
