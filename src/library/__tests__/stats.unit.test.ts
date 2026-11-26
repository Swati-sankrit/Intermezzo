// Validates: Requirements 20.6, 20.7, 20.10, 20.12, 20.13, 20.14, 23.4, 23.5
import { describe, expect, it } from 'vitest';
import { EMPTY_DATA_MODEL, STATS_FIELDS, type BookEntry, type DataModel, type Stats } from '../model';
import { addBookEntry, removeBook } from '../shelfOps';
import { overallStats, pruneDaily, recordEvent, ZERO_STATS, type StatEvent } from '../statsOps';
import { localDateString, statsForBook, statsForDate } from '../statsSelectors';
import { changeTimer, IDLE_TIMER, tickTimer } from '../statsTimer';

function entry(id: string): BookEntry {
  return { bookId: id, title: 't', author: '', fileName: 'f.txt', source: 'upload', format: 'txt', addedAt: 1 };
}

function seeded(): DataModel {
  return addBookEntry(addBookEntry(EMPTY_DATA_MODEL, entry('a')), entry('b'));
}

const D1 = '2025-03-10';
const D2 = '2025-03-11';

describe('stats events', () => {
  const sequence: Array<[string, StatEvent, string]> = [
    ['a', { kind: 'session' }, D1],
    ['a', { kind: 'paragraphs', count: 3, words: 30 }, D1],
    ['a', { kind: 'active', seconds: 40 }, D1],
    ['a', { kind: 'lookAway' }, D1],
    ['a', { kind: 'away', seconds: 12 }, D1],
    ['b', { kind: 'paragraphs', count: 2, words: 20 }, D2],
    ['b', { kind: 'chapter' }, D2],
    ['a', { kind: 'active', seconds: 5 }, D2],
  ];

  function allNonDecreasing(prev: Stats, next: Stats): boolean {
    return STATS_FIELDS.every((f) => next[f] >= prev[f]);
  }

  it('never decreases any per-book or daily count over a fixed sequence', () => {
    let model = seeded();
    for (const [id, ev, day] of sequence) {
      const next = recordEvent(model, id, ev, day);
      expect(allNonDecreasing(statsForBook(model, id), statsForBook(next, id))).toBe(true);
      expect(allNonDecreasing(statsForDate(model, day), statsForDate(next, day))).toBe(true);
      model = next;
    }
    expect(statsForBook(model, 'a')).toEqual({
      paragraphsRead: 3, chaptersFinished: 0, activeReadingSeconds: 45,
      lookAwayCount: 1, sessionCount: 1, awaySeconds: 12,
      wordsRead: 30,
    });
  });

  it('keys events by the injected local date (two dates, two daily records)', () => {
    let model = seeded();
    for (const [id, ev, day] of sequence) model = recordEvent(model, id, ev, day);
    expect(Object.keys(model.daily).sort()).toEqual([D1, D2]);
    expect(statsForDate(model, D1).activeReadingSeconds).toBe(40);
    expect(statsForDate(model, D2).activeReadingSeconds).toBe(5);
    expect(statsForDate(model, D2).chaptersFinished).toBe(1);
  });

  it('overall equals the sum of per-book stats', () => {
    let model = seeded();
    for (const [id, ev, day] of sequence) model = recordEvent(model, id, ev, day);
    const a = statsForBook(model, 'a');
    const b = statsForBook(model, 'b');
    const overall = overallStats(model);
    for (const f of STATS_FIELDS) expect(overall[f]).toBe(a[f] + b[f]);
  });

  it('removing a book drops its per-book contribution but leaves daily untouched', () => {
    let model = seeded();
    for (const [id, ev, day] of sequence) model = recordEvent(model, id, ev, day);
    const dailyBefore = structuredClone(model.daily);
    const bBefore = statsForBook(model, 'b');
    const overallBefore = overallStats(model);
    const removed = removeBook(model, 'b');
    expect(removed.daily).toEqual(dailyBefore);
    const overallAfter = overallStats(removed);
    for (const f of STATS_FIELDS) expect(overallAfter[f]).toBe(overallBefore[f] - bBefore[f]);
  });

  it('empty stats show zero for every value', () => {
    expect(overallStats(EMPTY_DATA_MODEL)).toEqual(ZERO_STATS);
    expect(statsForBook(EMPTY_DATA_MODEL, 'none')).toEqual(ZERO_STATS);
    expect(statsForDate(EMPTY_DATA_MODEL, D1)).toEqual(ZERO_STATS);
  });

  it('invalid amounts leave the model unchanged', () => {
    const model = seeded();
    for (const bad of [-1, 1.5, NaN, Infinity]) {
      expect(recordEvent(model, 'a', { kind: 'paragraphs', count: bad, words: 1 }, D1)).toBe(model);
      expect(recordEvent(model, 'a', { kind: 'active', seconds: bad }, D1)).toBe(model);
      expect(recordEvent(model, 'a', { kind: 'away', seconds: bad }, D1)).toBe(model);
    }
  });
});

describe('90-day pruning', () => {
  it('keeps a record 90 days old and drops one 91 days old', () => {
    const today = '2025-06-01';
    const kept = '2025-03-03'; // 90 days before
    const dropped = '2025-03-02'; // 91 days before
    const s = { ...ZERO_STATS, paragraphsRead: 1 };
    const out = pruneDaily({ [kept]: s, [dropped]: s, [today]: s }, today);
    expect(Object.keys(out).sort()).toEqual([kept, today]);
  });

  it('applies when recording an event', () => {
    const model = { ...seeded(), daily: { '2025-03-02': { ...ZERO_STATS, awaySeconds: 9 } } };
    const next = recordEvent(model, 'a', { kind: 'lookAway' }, '2025-06-01');
    expect(Object.keys(next.daily)).toEqual(['2025-06-01']);
  });
});

describe('localDateString', () => {
  it('uses local parts around local midnight', () => {
    expect(localDateString(new Date(2025, 0, 31, 23, 59))).toBe('2025-01-31');
    expect(localDateString(new Date(2025, 1, 1, 0, 0))).toBe('2025-02-01');
  });
});

describe('statsTimer', () => {
  it('credits whole seconds and carries the remainder', () => {
    let step = changeTimer(IDLE_TIMER, 'present', 0);
    step = tickTimer(step.state, 1500);
    expect(step.active).toBe(1);
    expect(step.state.rest).toBe(500);
    step = tickTimer(step.state, 1900);
    expect(step.active).toBe(0);
    expect(step.state.rest).toBe(900);
    step = tickTimer(step.state, 2600);
    expect(step.active).toBe(1);
    expect(step.state.rest).toBe(600);
  });

  it('counts away seconds only while away, active only while present', () => {
    let step = changeTimer(IDLE_TIMER, 'present', 0);
    step = changeTimer(step.state, 'away', 3000);
    expect(step.active).toBe(3);
    expect(step.away).toBe(0);
    step = tickTimer(step.state, 7000);
    expect(step.active).toBe(0);
    expect(step.away).toBe(4);
  });

  it('reports a look-away only on present to away', () => {
    const present = changeTimer(IDLE_TIMER, 'present', 0);
    expect(present.lookAway).toBe(0);
    const away = changeTimer(present.state, 'away', 1000);
    expect(away.lookAway).toBe(1);
    expect(changeTimer(away.state, 'away', 2000).lookAway).toBe(0);
    expect(changeTimer(away.state, 'present', 2000).lookAway).toBe(0);
    expect(changeTimer(IDLE_TIMER, 'away', 0).lookAway).toBe(0);
    expect(changeTimer(present.state, null, 2000).lookAway).toBe(0);
  });

  it('counts nothing while no book is open', () => {
    const step = tickTimer(IDLE_TIMER, 10_000);
    expect(step.active + step.away + step.lookAway).toBe(0);
  });
});
