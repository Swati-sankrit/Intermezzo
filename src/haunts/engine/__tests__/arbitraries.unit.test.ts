import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  awayHistoryArb,
  eventHistoryArb,
  gainRequestsArb,
  hauntIdsArb,
  moduleEntriesArb,
  nonNumericCapTextArb,
  outOfRangeCapTextArb,
  presentHistoryArb,
  rollArb,
  validCapTextArb,
  viewportColumnArb,
} from './arbitraries';

describe('haunt arbitraries', () => {
  it('histories have non-decreasing timestamps', () => {
    fc.assert(
      fc.property(eventHistoryArb, (events) => {
        for (let i = 1; i < events.length; i++) {
          expect(events[i].timestamp).toBeGreaterThanOrEqual(events[i - 1].timestamp);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('away and present histories end with the requested value', () => {
    fc.assert(
      fc.property(awayHistoryArb, presentHistoryArb, (a, p) => {
        expect(a[a.length - 1].value).toBe('away');
        expect(p[p.length - 1].value).toBe('present');
      }),
      { numRuns: 100 },
    );
  });

  it('haunt id lists are 0 to 5 distinct ids and rolls are in [0, 1)', () => {
    fc.assert(
      fc.property(hauntIdsArb, rollArb, (ids, roll) => {
        expect(ids.length).toBeLessThanOrEqual(5);
        expect(new Set(ids).size).toBe(ids.length);
        expect(roll).toBeGreaterThanOrEqual(0);
        expect(roll).toBeLessThan(1);
      }),
      { numRuns: 200 },
    );
  });

  it('gain requests reach non-finite and negative values', () => {
    const seen = { nan: false, inf: false, neg: false };
    fc.assert(
      fc.property(gainRequestsArb, (reqs) => {
        for (const r of reqs) {
          if (Number.isNaN(r.gain)) seen.nan = true;
          else if (!Number.isFinite(r.gain)) seen.inf = true;
          else if (r.gain < 0) seen.neg = true;
        }
      }),
      { numRuns: 500 },
    );
    expect(seen).toEqual({ nan: true, inf: true, neg: true });
  });

  it('cap text generators match their descriptions', () => {
    fc.assert(
      fc.property(validCapTextArb, nonNumericCapTextArb, outOfRangeCapTextArb, (v, bad, out) => {
        expect(Number(v.text)).toBe(v.value);
        expect(Number.isNaN(Number(bad))).toBe(true);
        const n = Number(out);
        expect(n < 0 || n > 1).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('columns lie inside the viewport', () => {
    fc.assert(
      fc.property(viewportColumnArb, ({ width, height, column }) => {
        expect(column.left).toBeGreaterThanOrEqual(0);
        expect(column.left).toBeLessThanOrEqual(column.right);
        expect(column.right).toBeLessThanOrEqual(width);
        expect(column.top).toBeLessThanOrEqual(column.bottom);
        expect(column.bottom).toBeLessThanOrEqual(height);
      }),
      { numRuns: 200 },
    );
  });

  it('module entries cover every kind and duplicate ids', () => {
    const kinds = new Set<string>();
    let duplicate = false;
    fc.assert(
      fc.property(moduleEntriesArb, (entries) => {
        const ids = new Set<unknown>();
        for (const e of entries) {
          kinds.add(e.kind);
          const id = (e.module as { id?: unknown }).id;
          if (e.kind === 'valid') {
            if (ids.has(id)) duplicate = true;
            ids.add(id);
          }
        }
      }),
      { numRuns: 300 },
    );
    expect([...kinds].sort()).toEqual(['empty-id', 'helper-like', 'missing-field', 'valid', 'wrong-type']);
    expect(duplicate).toBe(true);
  });
});
