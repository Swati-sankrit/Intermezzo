import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { STATS_FIELDS } from '../model';
import { migrateV2ToV3 } from '../schemaV3';
import { dataModelV2 } from './arbitraries';

/**
 * Property 7: migrating a Schema_Version 2 Data_Model gives Schema_Version 3 with wordsRead 0 in
 * every per-book and per-day Stats record, and nothing else changed.
 * **Validates: Requirements 11.6**
 */
describe('Property 7: v2 -> v3 migration', () => {
  it('sets wordsRead to 0 everywhere and changes nothing else', () => {
    fc.assert(
      fc.property(dataModelV2, (v2) => {
        const before = structuredClone(v2);
        const v3 = migrateV2ToV3(v2 as never) as unknown as typeof v2 & { schemaVersion: number };

        expect(v3.schemaVersion).toBe(3);

        // Everything outside the stats tables is identical.
        expect(v3.profile).toEqual(before.profile);
        expect(v3.shelves).toEqual(before.shelves);
        expect(v3.books).toEqual(before.books);
        expect(v3.positions).toEqual(before.positions);

        for (const table of ['stats', 'daily'] as const) {
          const out = v3[table] as Record<string, Record<string, unknown>>;
          const inp = before[table] as Record<string, Record<string, unknown>>;
          // Same keys, in the same order.
          expect(Object.keys(out)).toEqual(Object.keys(inp));
          for (const key of Object.keys(inp)) {
            const migrated = Object.getOwnPropertyDescriptor(out, key)!.value as Record<string, unknown>;
            const original = Object.getOwnPropertyDescriptor(inp, key)!.value as Record<string, unknown>;
            expect(migrated.wordsRead).toBe(0);
            // All other stats fields are identical.
            const { wordsRead: _w, ...rest } = migrated;
            expect(rest).toEqual(original);
            expect(Object.keys(migrated).sort()).toEqual([...STATS_FIELDS].sort());
          }
        }

        // The input was not mutated.
        expect(v2).toEqual(before);
      }),
      { numRuns: 200 },
    );
  });
});
