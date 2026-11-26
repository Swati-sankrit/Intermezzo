import type fc from 'fast-check';
import type { DataModel } from '../model';
import { dataModel } from './dataModelArb';

/** Shared DataModel arbitraries. The generator itself lives in dataModelArb.ts and is reused here. */
export { dataModel as dataModelV3 };

/** A Schema_Version 2 model as stored before wordsRead existed: no `wordsRead` in any Stats record. */
export interface DataModelV2 extends Omit<DataModel, 'schemaVersion' | 'stats' | 'daily'> {
  schemaVersion: 2;
  stats: Record<string, Omit<DataModel['stats'][string], 'wordsRead'>>;
  daily: Record<string, Omit<DataModel['daily'][string], 'wordsRead'>>;
}

function dropWordsRead(table: DataModel['stats']): DataModelV2['stats'] {
  // fromEntries defines own properties, so keys such as "__proto__" stay plain data.
  return Object.fromEntries(
    Object.entries(table).map(([key, s]) => {
      const { wordsRead: _unused, ...rest } = s;
      return [key, rest];
    }),
  );
}

export const dataModelV2: fc.Arbitrary<DataModelV2> = dataModel.map((m) => ({
  ...m,
  schemaVersion: 2 as const,
  stats: dropWordsRead(m.stats),
  daily: dropWordsRead(m.daily),
}));
