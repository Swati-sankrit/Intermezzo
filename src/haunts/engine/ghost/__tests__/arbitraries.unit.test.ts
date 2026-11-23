import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BOUNDARY_AWAY_MS,
  awayMsArb,
  chapterScriptArb,
  classicInputArb,
  countWords,
  gentleInputArb,
  lookAwayScriptArb,
  nightmareInputArb,
  paragraphArb,
  paragraphWithLongMessageArb,
  returnInputAnyModeArb,
  returnRollsArb,
  sentenceListArb,
  unitFractionArb,
} from './arbitraries';

const RUNS = { numRuns: 300 };

describe('ghost generators', () => {
  it('unit fractions and rolls are in [0, 1)', () => {
    fc.assert(
      fc.property(unitFractionArb, returnRollsArb, (f, rolls) => {
        expect(f >= 0 && f < 1).toBe(true);
        for (const v of Object.values(rolls)) expect(v >= 0 && v < 1).toBe(true);
      }),
      RUNS,
    );
  });

  it('inputs have the requested mode and a paragraph of at most 40 words', () => {
    fc.assert(
      fc.property(gentleInputArb, classicInputArb, nightmareInputArb, (g, c, n) => {
        expect([g.mode, c.mode, n.mode]).toEqual(['gentle', 'classic', 'nightmare']);
        for (const i of [g, c, n]) expect(countWords(i.paragraph)).toBeLessThanOrEqual(40);
      }),
      RUNS,
    );
  });

  it('awayMs covers every boundary value and very large values', () => {
    const seen = new Set(fc.sample(awayMsArb, 2000));
    for (const v of BOUNDARY_AWAY_MS) expect(seen.has(v), String(v)).toBe(true);
    expect([...seen].some((v) => v >= 1e9)).toBe(true);
  });

  it('paragraphs include empty, irregular-whitespace and 40-word cases', () => {
    const sample = fc.sample(paragraphArb, 2000);
    expect(sample.some((p) => countWords(p) === 0)).toBe(true);
    expect(sample.some((p) => /[\t\n]|\s{2}/.test(p))).toBe(true);
    expect(sample.some((p) => countWords(p) >= 30)).toBe(true);
  });

  it('a pool can hold a message longer than the paragraph', () => {
    fc.assert(
      fc.property(paragraphWithLongMessageArb, ({ paragraph, messages }) => {
        const n = countWords(paragraph);
        expect(messages.some((m) => countWords(m) > n)).toBe(true);
      }),
      RUNS,
    );
  });

  it('sentence lists contain duplicates, short and long sentences', () => {
    const lists = fc.sample(sentenceListArb, 500);
    const words = (s: string): number => countWords(s);
    expect(lists.some((l) => new Set(l).size < l.length)).toBe(true);
    expect(lists.some((l) => l.some((s) => words(s) < 5))).toBe(true);
    expect(lists.some((l) => l.some((s) => words(s) > 25))).toBe(true);
  });

  it('scripts include repeated look-aways and chapter changes', () => {
    expect(fc.sample(lookAwayScriptArb, 200).some((s) => s.length >= 5)).toBe(true);
    expect(fc.sample(chapterScriptArb, 200).some((s) => s.ops.some((o) => o.k === 'chapter'))).toBe(true);
  });

  it('any-mode input produces all three modes', () => {
    const modes = new Set(fc.sample(returnInputAnyModeArb, 200).map((i) => i.mode));
    expect(modes.size).toBe(3);
  });
});
