import { describe, expect, it } from 'vitest';
import { EMPTY_DATA_MODEL, type DataModel } from '../model';
import { validate } from '../validator';

/** Stands in for design Property 7. Requirements 16.4-16.8, 16.10, 7.5. */

function baseModel(): DataModel {
  return {
    ...structuredClone(EMPTY_DATA_MODEL),
    profile: { ...EMPTY_DATA_MODEL.profile, displayName: 'Mina', candleColour: 'rose' },
    shelves: { reading: ['b1'], 'want-to-read': ['b2'], finished: [] },
    books: {
      b1: { bookId: 'b1', title: 'One', author: 'A', fileName: 'one.txt', source: 'upload', format: 'txt', addedAt: 1 },
      b2: { bookId: 'b2', title: 'Two', author: '', fileName: 'two.epub', source: 'upload', format: 'epub', addedAt: 2 },
    },
    positions: { b1: { chapterIndex: 0, paragraphIndex: 3, savedAt: 5, progress: 40 } },
    stats: {
      b1: { paragraphsRead: 3, chaptersFinished: 0, activeReadingSeconds: 60, lookAwayCount: 1, sessionCount: 1, awaySeconds: 5 },
      b2: { paragraphsRead: 0, chaptersFinished: 0, activeReadingSeconds: 0, lookAwayCount: 0, sessionCount: 0, awaySeconds: 0 },
    },
  };
}

const DAY = { paragraphsRead: 2, chaptersFinished: 0, activeReadingSeconds: 30, lookAwayCount: 1, sessionCount: 1, awaySeconds: 4 };

function problemsOf(model: unknown): string[] {
  const r = validate(model);
  if (r.ok) throw new Error('expected the model to be rejected');
  return r.problems;
}

describe('validate', () => {
  it('accepts a well-formed model and the empty model', () => {
    const m = baseModel();
    const r = validate(m);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(m);
    expect(validate(EMPTY_DATA_MODEL).ok).toBe(true);
  });

  it('rejects a Book_Id in a shelf, position or stats with no book entry, naming it', () => {
    const shelf = baseModel();
    shelf.shelves.finished.push('ghost');
    expect(problemsOf(shelf).join('\n')).toMatch(/shelves\.finished.*"ghost"/);

    const pos = baseModel();
    pos.positions.ghost = { chapterIndex: 0, paragraphIndex: 0, savedAt: 1, progress: 0 };
    expect(problemsOf(pos).join('\n')).toMatch(/positions\[ghost\].*"ghost"/);

    const stats = baseModel();
    stats.stats.ghost = { ...stats.stats.b1 };
    expect(problemsOf(stats).join('\n')).toMatch(/stats\[ghost\].*"ghost"/);
  });

  it('rejects a Book_Id on two shelves or twice on one shelf, naming it', () => {
    const across = baseModel();
    across.shelves.finished.push('b1');
    expect(problemsOf(across).join('\n')).toMatch(/"b1" appears more than once/);

    const within = baseModel();
    within.shelves.reading.push('b1');
    expect(problemsOf(within).join('\n')).toMatch(/"b1" appears more than once/);
  });

  it('rejects bad positions, naming the field', () => {
    const cases: [Partial<DataModel['positions'][string]>, string][] = [
      [{ chapterIndex: -1 }, 'positions[b1].chapterIndex'],
      [{ paragraphIndex: 1.5 }, 'positions[b1].paragraphIndex'],
      [{ progress: 101 }, 'positions[b1].progress'],
      [{ progress: -1 }, 'positions[b1].progress'],
      [{ progress: Number.NaN }, 'positions[b1].progress'],
    ];
    for (const [patch, field] of cases) {
      const m = baseModel();
      m.positions.b1 = { ...m.positions.b1, ...patch };
      expect(problemsOf(m).some((p) => p.startsWith(field))).toBe(true);
    }
  });

  it('rejects negative or non-whole stats, naming the book and field', () => {
    const cases: [Partial<DataModel['stats'][string]>, string][] = [
      [{ paragraphsRead: -1 }, 'stats[b1].paragraphsRead'],
      [{ activeReadingSeconds: -0.5 }, 'stats[b1].activeReadingSeconds'],
      [{ sessionCount: Number.POSITIVE_INFINITY }, 'stats[b1].sessionCount'],
    ];
    for (const [patch, field] of cases) {
      const m = baseModel();
      m.stats.b1 = { ...m.stats.b1, ...patch };
      expect(problemsOf(m).some((p) => p.startsWith(field))).toBe(true);
    }
  });

  it('accepts a daily record, including a leap day, an orphan date and an empty record', () => {
    const m = baseModel();
    m.daily = { '2024-02-29': { ...DAY }, '2025-01-01': { ...DAY } };
    expect(validate(m).ok).toBe(true);
    expect(validate({ ...baseModel(), daily: {} }).ok).toBe(true);
  });

  it('rejects malformed or impossible daily date keys, naming the date', () => {
    for (const key of ['2025-13-40', '25-1-1', '2025-02-30', '2023-02-29', '2025-1-01', 'today']) {
      const m = baseModel();
      m.daily = { [key]: { ...DAY } };
      expect(problemsOf(m).some((p) => p.startsWith(`daily[${key}]`))).toBe(true);
    }
  });

  it('rejects negative, fractional or non-finite daily counts, naming the date and count', () => {
    const cases: [Partial<typeof DAY>, string][] = [
      [{ paragraphsRead: -1 }, 'paragraphsRead'],
      [{ awaySeconds: 1.5 }, 'awaySeconds'],
      [{ sessionCount: Number.NaN }, 'sessionCount'],
    ];
    for (const [patch, field] of cases) {
      const m = baseModel();
      m.daily = { '2025-03-04': { ...DAY, ...patch } };
      expect(problemsOf(m).some((p) => p.startsWith(`daily[2025-03-04].${field}`))).toBe(true);
    }
  });

  it('rejects an unknown field in a daily entry and a missing daily record', () => {
    const extra = baseModel() as unknown as { daily: Record<string, Record<string, unknown>> };
    extra.daily = { '2025-03-04': { ...DAY, text: 'hi' } };
    expect(problemsOf(extra).some((p) => p.includes('unexpected field "text"'))).toBe(true);

    const { daily: _omit, ...noDaily } = baseModel();
    void _omit;
    expect(problemsOf(noDaily).some((p) => p.startsWith('daily'))).toBe(true);
  });

  it('rejects an unknown candle colour, naming the field', () => {
    for (const bad of ['red', '', 'AMBER', 3]) {
      const m = baseModel() as unknown as { profile: Record<string, unknown> };
      m.profile.candleColour = bad;
      expect(problemsOf(m).some((p) => p.startsWith('profile.candleColour'))).toBe(true);
    }
  });

  it('rejects a 41-character name and accepts 40', () => {
    const long = baseModel();
    long.profile.displayName = 'x'.repeat(41);
    expect(problemsOf(long).some((p) => p.startsWith('profile.displayName'))).toBe(true);

    const ok = baseModel();
    ok.profile.displayName = 'x'.repeat(40);
    expect(validate(ok).ok).toBe(true);
  });

  it('measures the name after trimming spaces', () => {
    const padded = baseModel();
    padded.profile.displayName = `  ${'x'.repeat(40)}  `;
    expect(validate(padded).ok).toBe(true);

    const tooLong = baseModel();
    tooLong.profile.displayName = `  ${'x'.repeat(41)}  `;
    expect(problemsOf(tooLong).some((p) => p.startsWith('profile.displayName'))).toBe(true);
  });
});
