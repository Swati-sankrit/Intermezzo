import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { EMPTY_DATA_MODEL, type BookEntry, type DataModel, type Stats } from '../model';
import { addBookEntry } from '../shelfOps';
import { overallStats, recordEvent, ZERO_STATS, type StatEvent } from '../statsOps';
import { validate } from '../validator';

/**
 * Feature: library-v2, Property 11: Daily totals sum to per-book totals
 * **Validates: Requirements 20.18, 23.4**
 */

// Awkward ids included on purpose; the pool is added up front and never removed.
const POOL = ['a', 'b', 'c', '', '__proto__', 'constructor', 'toString'];
const bookId = fc.constantFrom(...POOL);

// Dates stay within 90 days of each other, so pruning (more than 90 days old) never fires.
function dateAt(offset: number): string {
  const d = new Date(Date.UTC(2026, 0, 1) + offset * 86_400_000);
  return d.toISOString().slice(0, 10);
}
const date = fc.integer({ min: 0, max: 89 }).map(dateAt);

const validEvent: fc.Arbitrary<StatEvent> = fc.oneof(
  fc.record({ kind: fc.constant('paragraphs' as const), count: fc.integer({ min: 0, max: 50 }) }),
  fc.constant<StatEvent>({ kind: 'chapter' }),
  fc.record({ kind: fc.constant('active' as const), seconds: fc.integer({ min: 0, max: 3600 }) }),
  fc.record({ kind: fc.constant('away' as const), seconds: fc.integer({ min: 0, max: 3600 }) }),
  fc.constant<StatEvent>({ kind: 'lookAway' }),
  fc.constant<StatEvent>({ kind: 'session' }),
);

const badAmount = fc.oneof(
  fc.integer({ min: -1000, max: -1 }),
  fc.double({ noNaN: true, noDefaultInfinity: true }).filter((n) => !Number.isInteger(n)),
);

const invalidEvent: fc.Arbitrary<StatEvent> = fc.oneof(
  fc.record({ kind: fc.constant('paragraphs' as const), count: badAmount }),
  fc.record({ kind: fc.constant('active' as const), seconds: badAmount }),
  fc.record({ kind: fc.constant('away' as const), seconds: badAmount }),
);

interface Step {
  id: string;
  today: string;
  event: StatEvent;
  valid: boolean;
}

const step: fc.Arbitrary<Step> = fc.oneof(
  { weight: 4, arbitrary: fc.record({ id: bookId, today: date, event: validEvent, valid: fc.constant(true) }) },
  { weight: 1, arbitrary: fc.record({ id: bookId, today: date, event: invalidEvent, valid: fc.constant(false) }) },
);

function entry(id: string): BookEntry {
  return { bookId: id, title: 't', author: '', fileName: 'f.txt', source: 'upload', format: 'txt', addedAt: 1 };
}

function seeded(ids: string[]): DataModel {
  return ids.reduce((m, id) => addBookEntry(m, entry(id)), EMPTY_DATA_MODEL);
}

function dailyTotal(model: DataModel): Stats {
  let t: Stats = { ...ZERO_STATS };
  for (const s of Object.values(model.daily)) {
    t = {
      paragraphsRead: t.paragraphsRead + s.paragraphsRead,
      chaptersFinished: t.chaptersFinished + s.chaptersFinished,
      activeReadingSeconds: t.activeReadingSeconds + s.activeReadingSeconds,
      lookAwayCount: t.lookAwayCount + s.lookAwayCount,
      sessionCount: t.sessionCount + s.sessionCount,
      awaySeconds: t.awaySeconds + s.awaySeconds,
    };
  }
  return t;
}

describe('Property 11: daily totals sum to per-book totals', () => {
  it('for all six fields, daily sums equal per-book sums after every step, and the model stays valid', () => {
    fc.assert(
      fc.property(
        fc.subarray(POOL, { minLength: 1 }),
        fc.array(step, { maxLength: 60 }),
        (ids, steps) => {
          let model = seeded(ids);
          for (const s of steps) {
            const before = model;
            // Events for books outside the pool subset are rejected and change nothing.
            model = recordEvent(model, s.id, s.event, s.today);
            if (!s.valid) expect(model).toBe(before);
            expect(dailyTotal(model)).toEqual(overallStats(model));
            expect(validate(model).ok).toBe(true);
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  it('valid events actually change both sides (the check is not vacuous)', () => {
    fc.assert(
      fc.property(date, fc.integer({ min: 1, max: 50 }), (today, count) => {
        const model = recordEvent(seeded(['__proto__']), '__proto__', { kind: 'paragraphs', count }, today);
        expect(overallStats(model).paragraphsRead).toBe(count);
        expect(dailyTotal(model).paragraphsRead).toBe(count);
      }),
      { numRuns: 100 },
    );
  });
});
