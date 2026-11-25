import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { EMPTY_DATA_MODEL, type BookEntry, type DataModel, type Position } from '../model';
import { addBookEntry, savePosition } from '../shelfOps';
import { validate } from '../validator';

/**
 * Feature: library-v2, Property 1: Position save/restore round trip
 * **Validates: Requirements 5.3**
 */

const count = fc.nat({ max: 1_000_000 });
const position: fc.Arbitrary<Position> = fc.record({
  chapterIndex: count,
  paragraphIndex: count,
  savedAt: fc.double({ noNaN: true, noDefaultInfinity: true }),
  progress: fc.integer({ min: 0, max: 100 }),
});

// Includes awkward keys so object-key handling is exercised.
const bookId = fc.oneof(
  { weight: 8, arbitrary: fc.string({ maxLength: 12 }) },
  { weight: 1, arbitrary: fc.constantFrom('__proto__', 'constructor', 'toString', '') },
);

function entry(id: string): BookEntry {
  return {
    bookId: id,
    title: 't',
    author: '',
    fileName: 'f.txt',
    source: 'upload',
    format: 'txt',
    addedAt: 1,
  };
}

/** A valid model built through the real operations, some books already holding a position. */
const modelWithBooks: fc.Arbitrary<{ model: DataModel; ids: string[] }> = fc
  .uniqueArray(bookId, { minLength: 1, maxLength: 6 })
  .chain((ids) =>
    fc.array(fc.option(position, { nil: undefined }), { minLength: ids.length, maxLength: ids.length }).map((prior) => {
      let model: DataModel = EMPTY_DATA_MODEL;
      ids.forEach((id) => {
        model = addBookEntry(model, entry(id));
      });
      ids.forEach((id, i) => {
        const p = prior[i];
        if (p) model = savePosition(model, id, p);
      });
      return { model, ids };
    }),
  );

function positionOf(model: DataModel, id: string): Position | undefined {
  return Object.getOwnPropertyDescriptor(model.positions, id)?.value as Position | undefined;
}

function same(a: Position | undefined, b: Position): boolean {
  return (
    a !== undefined &&
    a.chapterIndex === b.chapterIndex &&
    a.paragraphIndex === b.paragraphIndex &&
    Object.is(a.savedAt, b.savedAt) &&
    a.progress === b.progress
  );
}

describe('Property 1: Position save/restore round trip', () => {
  it('reading back a saved position returns the one saved', () => {
    fc.assert(
      fc.property(modelWithBooks, fc.nat(), position, ({ model, ids }, pick, saved) => {
        const id = ids[pick % ids.length];
        const next = savePosition(model, id, saved);
        expect(same(positionOf(next, id), saved)).toBe(true);
        // The result is still a model the validator accepts.
        expect(validate(next).ok).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it('saving again replaces the earlier position for that book', () => {
    fc.assert(
      fc.property(modelWithBooks, fc.nat(), position, position, ({ model, ids }, pick, first, second) => {
        const id = ids[pick % ids.length];
        const next = savePosition(savePosition(model, id, first), id, second);
        expect(same(positionOf(next, id), second)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});
