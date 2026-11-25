import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { isDeepStrictEqual } from 'node:util';
import { dataModel } from './dataModelArb';
import { parse, serialize } from '../serializer';
import { validate } from '../validator';

/**
 * Feature: library-v2, Property 8: Serialization round trip
 * **Validates: Requirements 18.5**
 */

describe('Property 8: Serialization round trip', () => {
  it('the generator only produces models the validator accepts', () => {
    fc.assert(
      fc.property(dataModel, (m) => {
        expect(validate(m).ok).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('validate(parse(serialize(m))) equals m', () => {
    fc.assert(
      fc.property(dataModel, (m) => {
        const result = validate(parse(serialize(m)));
        expect(result.ok).toBe(true);
        // isDeepStrictEqual, not toStrictEqual: Vitest's toStrictEqual reads obj.constructor and
        // wrongly fails for Book_Id "constructor" (see docs/BUILD_LOG.md, library-v2 task 1.2).
        if (result.ok) expect(isDeepStrictEqual(result.value, m)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it('serializing the round-tripped model gives the same text', () => {
    fc.assert(
      fc.property(dataModel, (m) => {
        const text = serialize(m);
        const result = validate(parse(text));
        expect(result.ok).toBe(true);
        if (result.ok) expect(serialize(result.value)).toBe(text);
      }),
      { numRuns: 300 },
    );
  });
});
