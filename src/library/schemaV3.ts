/** Pure v2 -> v3 migration: adds `wordsRead` to every Stats record. No DOM, never throws. */
import type { DataModel } from './model';

type Rec = Record<string, unknown>;

function isRecord(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Returns the Stats with `wordsRead` set to 0 when it is missing. An existing value is kept as it is. */
export function addWordsRead<T extends object>(stats: T): T & { wordsRead: unknown } {
  if (Object.hasOwn(stats, 'wordsRead')) return stats as T & { wordsRead: unknown };
  return { ...stats, wordsRead: 0 };
}

/** Maps every record-shaped entry; entries that are not records are left for the Validator to reject. */
function withWordsRead(table: unknown): unknown {
  if (!isRecord(table)) return table;
  // fromEntries defines own properties, so a key such as "__proto__" stays plain data.
  return Object.fromEntries(
    Object.entries(table).map(([key, s]) => [key, isRecord(s) ? addWordsRead(s) : s]),
  );
}

/**
 * Schema_Version 2 -> 3: every per-book and per-day Stats record gains `wordsRead` (0 when
 * missing); every other field is untouched. Any other input, including a version 3 model,
 * is returned as the same value (idempotent).
 */
export function migrateV2ToV3(model: DataModel): DataModel;
export function migrateV2ToV3(model: unknown): unknown;
export function migrateV2ToV3(model: unknown): unknown {
  if (!isRecord(model) || model.schemaVersion !== 2) return model;
  return {
    ...model,
    schemaVersion: 3,
    stats: withWordsRead(model.stats),
    daily: withWordsRead(model.daily),
  };
}
