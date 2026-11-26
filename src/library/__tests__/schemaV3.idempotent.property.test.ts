import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { migrateV2ToV3 } from '../schemaV3';
import { dataModelV2, dataModelV3 } from './arbitraries';

/**
 * Property 8: migration is idempotent, and an existing wordsRead value is preserved.
 * **Validates: Requirements 11.7**
 */
describe('Property 8: v2 -> v3 migration is idempotent and keeps wordsRead', () => {
  it('returns a Schema_Version 3 model unchanged, including nonzero wordsRead', () => {
    fc.assert(
      fc.property(dataModelV3, (v3) => {
        const before = structuredClone(v3);
        const out = migrateV2ToV3(v3);
        expect(out).toEqual(before);
        expect(migrateV2ToV3(out)).toEqual(out);
        expect(v3).toEqual(before);
      }),
      { numRuns: 200 },
    );
  });

  it('migrating a migrated v2 model again changes nothing', () => {
    fc.assert(
      fc.property(dataModelV2, (v2) => {
        const once = migrateV2ToV3(v2);
        expect(migrateV2ToV3(once)).toEqual(once);
      }),
      { numRuns: 200 },
    );
  });

  it('keeps a stray wordsRead on a v2 model and still migrates to v3', () => {
    fc.assert(
      fc.property(dataModelV3, (v3) => {
        // A v2 model whose Stats records already carry wordsRead (arbitrary, often nonzero).
        const stray = { ...structuredClone(v3), schemaVersion: 2 as const };
        const once = migrateV2ToV3(stray as never) as unknown as typeof v3;
        expect(once.schemaVersion).toBe(3);
        expect(once.stats).toEqual(v3.stats);
        expect(once.daily).toEqual(v3.daily);
        expect(migrateV2ToV3(once)).toEqual(once);
      }),
      { numRuns: 200 },
    );
  });
});
