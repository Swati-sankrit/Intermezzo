import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { EMPTY_DATA_MODEL, SHELF_NAMES, type BookEntry, type DataModel, type ShelfName } from '../model';
import { addBookEntry, moveToShelf, removeBook } from '../shelfOps';
import { validate } from '../validator';

/**
 * Feature: library-v2, Property 4: Shelf invariant holds across any sequence of operations
 * **Validates: Requirements 6.11**
 */

// A small pool so operations often hit the same book (re-add, move after remove, unknown ids).
const bookId = fc.constantFrom('a', 'b', 'c', 'd', '', '__proto__', 'constructor');
const shelf = fc.constantFrom<ShelfName>(...SHELF_NAMES);

type Op =
  | { kind: 'add'; id: string }
  | { kind: 'finish'; id: string }
  | { kind: 'move'; id: string; shelf: ShelfName }
  | { kind: 'remove'; id: string };

const op: fc.Arbitrary<Op> = fc.oneof(
  fc.record({ kind: fc.constant('add' as const), id: bookId }),
  fc.record({ kind: fc.constant('finish' as const), id: bookId }),
  fc.record({ kind: fc.constant('move' as const), id: bookId, shelf }),
  fc.record({ kind: fc.constant('remove' as const), id: bookId }),
);

function entry(id: string): BookEntry {
  return { bookId: id, title: 't', author: '', fileName: 'f.txt', source: 'upload', format: 'txt', addedAt: 1 };
}

function apply(model: DataModel, o: Op): DataModel {
  switch (o.kind) {
    case 'add':
      return addBookEntry(model, entry(o.id));
    case 'finish':
      return moveToShelf(model, o.id, 'finished');
    case 'move':
      return moveToShelf(model, o.id, o.shelf);
    case 'remove':
      return removeBook(model, o.id);
  }
}

function shelvesHolding(model: DataModel, id: string): number {
  return SHELF_NAMES.reduce((n, name) => n + model.shelves[name].filter((x) => x === id).length, 0);
}

describe('Property 4: shelf invariant across operation sequences', () => {
  it('each Book_Id is on at most one shelf, removed ids are on none, and the model stays valid', () => {
    fc.assert(
      fc.property(fc.array(op, { maxLength: 40 }), (ops) => {
        let model: DataModel = EMPTY_DATA_MODEL;
        const removed = new Set<string>();
        for (const o of ops) {
          model = apply(model, o);
          if (o.kind === 'remove') removed.add(o.id);
          // A removed id counts as removed only until it is added again.
          if (o.kind === 'add') removed.delete(o.id);

          const all = SHELF_NAMES.flatMap((name) => model.shelves[name]);
          for (const id of new Set(all)) expect(shelvesHolding(model, id)).toBe(1);
          for (const id of removed) expect(shelvesHolding(model, id)).toBe(0);
          expect(validate(model).ok).toBe(true);
        }
      }),
      { numRuns: 500 },
    );
  });
});
