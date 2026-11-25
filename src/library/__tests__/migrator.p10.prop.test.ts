import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { isDeepStrictEqual } from 'node:util';
import { EMPTY_DATA_MODEL, SCHEMA_VERSION, type DataModel } from '../model';
import { migrate, migrateWithReport, type LegacyInput } from '../migrator';
import { validate } from '../validator';
import { dataModel } from './dataModelArb';

/**
 * Feature: library-v2, Property 10: Migration is idempotent on current-version data
 * **Validates: Requirements 19.8**
 */

const PRE_V2_EMPTY = { ...EMPTY_DATA_MODEL, schemaVersion: 1 } as unknown as DataModel;

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

// ---- legacy input: valid, invalid and absent values, with or without paragraph counts ----------

const validStateObject = fc.record(
  {
    fileName: fc.string({ minLength: 1, maxLength: 40 }),
    position: fc.record(
      { chapterIndex: fc.nat({ max: 50 }), paragraphIndex: fc.nat({ max: 500 }), savedAt: fc.nat({ max: 4e12 }) },
      { requiredKeys: ['chapterIndex', 'paragraphIndex'] },
    ),
    averagePace: fc.double({ min: 5e-324, max: 5000, noNaN: true }),
    paceGuideEnabled: fc.boolean(),
  },
  { requiredKeys: ['fileName', 'position', 'averagePace'] },
);

const rodState: fc.Arbitrary<unknown> = fc.oneof(
  validStateObject.map((o) => JSON.stringify(o)),
  validStateObject,
  fc.constantFrom('{not json', '', '[]', '42', '{"fileName":""}', undefined, null),
  fc.anything(),
);
const rodPaceGuide: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom('true', 'false', true, false, undefined, null, 'maybe', 7),
  fc.anything(),
);
const legacyInput: fc.Arbitrary<LegacyInput> = fc.record(
  {
    rodState,
    rodPaceGuide,
    legacyBookId: fc.option(fc.stringMatching(/^[0-9a-f]{64}$/), { nil: null }),
    chapterParagraphCounts: fc.option(fc.array(fc.nat({ max: 200 }), { maxLength: 20 }), { nil: null }),
  },
  { requiredKeys: ['rodState', 'rodPaceGuide', 'legacyBookId'] },
);

describe('Property 10: Migration is idempotent on current-version data', () => {
  it('the generated models are at schema version 2 and valid', () => {
    fc.assert(
      fc.property(dataModel, (m) => {
        expect(m.schemaVersion).toBe(SCHEMA_VERSION);
        expect(validate(m).ok).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('migrate(legacy, model) is deeply equal to model for any legacy input, with nothing consumed', () => {
    fc.assert(
      fc.property(dataModel, legacyInput, (m, legacy) => {
        const before = JSON.stringify(m);
        const out = migrate(deepFreeze(legacy), m);
        // isDeepStrictEqual, not toStrictEqual: Vitest's toStrictEqual reads obj.constructor and
        // wrongly fails for Book_Id "constructor" (see docs/BUILD_LOG.md, library-v2 task 1.2).
        expect(isDeepStrictEqual(out, m)).toBe(true);
        expect(JSON.stringify(m)).toBe(before);
        const report = migrateWithReport(legacy, m);
        expect(report.consumed).toEqual([]);
        expect(report.invalid).toEqual([]);
        expect(isDeepStrictEqual(report.model, m)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it('migrating twice equals migrating once: pre-v2 model, generated legacy input, same input again', () => {
    fc.assert(
      fc.property(legacyInput, (legacy) => {
        const input = deepFreeze(legacy);
        const once = migrate(input, deepFreeze({ ...PRE_V2_EMPTY }));
        expect(once.schemaVersion).toBe(SCHEMA_VERSION);
        const snapshot = JSON.stringify(once);
        const twice = migrate(input, once);
        expect(isDeepStrictEqual(twice, once)).toBe(true);
        expect(JSON.stringify(twice)).toBe(snapshot);
        expect(validate(twice).ok).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it('a model that already holds data is not overwritten by migrating again with the same legacy input', () => {
    fc.assert(
      fc.property(dataModel, legacyInput, (m, legacy) => {
        const once = migrate(legacy, m);
        const twice = migrate(legacy, once);
        expect(isDeepStrictEqual(twice, once)).toBe(true);
        expect(isDeepStrictEqual(twice, m)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});
