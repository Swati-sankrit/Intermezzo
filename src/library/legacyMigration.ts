import { hashBytes } from './bookId';
import { migrateWithReport, type LegacyKey } from './migrator';
import { EMPTY_DATA_MODEL, type DataModel } from './model';

/**
 * Startup migration from the legacy `rod_state`, `rod_pace_guide` keys and the
 * `rod_books` IndexedDB record `current`. Called only by localStore.ts, the one
 * file allowed to touch storage. The v2 writes are passed in as callbacks so
 * this file never knows the v2 storage names.
 *
 * Legacy data is only removed after the v2 model is saved and read back, and
 * the book text is copied to its Book_Id key and read back identical.
 */
const LEGACY_DB = 'rod_books';
const LEGACY_STORE = 'books';
const LEGACY_RECORD = 'current';

export interface MigrationIo {
  /** Write the model and read it back through the validator. True only when it read back valid and equal. */
  writeModel(model: DataModel): boolean;
  /** Remove the v2 model record (rollback after a failed copy). */
  removeModel(): void;
  putText(bookId: string, text: string): Promise<boolean>;
  getText(bookId: string): Promise<string | null>;
}

export type MigrationOutcome =
  | { status: 'none' }
  | { status: 'migrated'; model: DataModel }
  | { status: 'failed' };

type Outcome<T> = { ok: true; value: T } | { ok: false };

function legacyTransaction<T>(
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest,
  extract: (request: IDBRequest) => T,
): Promise<Outcome<T>> {
  return new Promise((resolve) => {
    let settled = false;
    let db: IDBDatabase | null = null;
    const finish = (out: Outcome<T>) => {
      if (settled) return;
      settled = true;
      try {
        db?.close();
      } catch {
        // already closed
      }
      resolve(out);
    };
    try {
      if (typeof indexedDB === 'undefined' || indexedDB === null) return finish({ ok: false });
      const req = indexedDB.open(LEGACY_DB);
      req.onblocked = () => finish({ ok: false });
      req.onerror = () => finish({ ok: false });
      req.onsuccess = () => {
        try {
          db = req.result;
          // A database with no store means there is no legacy record.
          if (!db.objectStoreNames.contains(LEGACY_STORE)) return finish({ ok: true, value: extract({ result: undefined } as IDBRequest) });
          const tx = db.transaction(LEGACY_STORE, mode);
          const request = op(tx.objectStore(LEGACY_STORE));
          tx.oncomplete = () => {
            try {
              finish({ ok: true, value: extract(request) });
            } catch {
              finish({ ok: false });
            }
          };
          tx.onerror = () => finish({ ok: false });
          tx.onabort = () => finish({ ok: false });
        } catch {
          finish({ ok: false });
        }
      };
    } catch {
      finish({ ok: false });
    }
  });
}

/** The legacy book text. `null` means there is no usable record; `undefined` means the read failed. */
async function readLegacyText(): Promise<string | null | undefined> {
  const out = await legacyTransaction(
    'readonly',
    (s) => s.get(LEGACY_RECORD),
    (r): unknown => r.result,
  );
  if (!out.ok) return undefined;
  const v = out.value;
  if (typeof v !== 'object' || v === null) return null;
  const text = (v as { text?: unknown }).text;
  return typeof text === 'string' ? text : null;
}

/** Cheap check so a fresh visit never opens the legacy database. */
export function hasLegacyKeys(): boolean {
  return localStorage.getItem('rod_state') !== null || localStorage.getItem('rod_pace_guide') !== null;
}

/**
 * Deletes all legacy data: the `rod_state` and `rod_pace_guide` keys and the `rod_books` database
 * (including its `current` text). Resolves false if anything could not be removed.
 */
export async function clearLegacyData(): Promise<boolean> {
  try {
    localStorage.removeItem('rod_state');
    localStorage.removeItem('rod_pace_guide');
  } catch {
    return false;
  }
  if (typeof indexedDB === 'undefined' || indexedDB === null) return true;
  return new Promise<boolean>((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(LEGACY_DB);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
      // `onblocked` only means another tab still holds the database; the delete finishes when it lets go.
    } catch {
      resolve(false);
    }
  });
}

export async function migrateLegacy(io: MigrationIo): Promise<MigrationOutcome> {
  let rolledBackNeeded = false;
  try {
    if (!hasLegacyKeys()) return { status: 'none' };
    const rodState = localStorage.getItem('rod_state');
    const rodPaceGuide = localStorage.getItem('rod_pace_guide');

    const text = await readLegacyText();
    if (text === undefined) return { status: 'failed' };
    let legacyBookId: string | null = null;
    if (text !== null) {
      legacyBookId = await hashBytes(new TextEncoder().encode(text).buffer as ArrayBuffer);
      if (legacyBookId === null) return { status: 'failed' };
    }

    const preV2 = { ...EMPTY_DATA_MODEL, schemaVersion: 1 } as unknown as DataModel;
    const report = migrateWithReport({ rodState, rodPaceGuide, legacyBookId, chapterParagraphCounts: null }, preV2);
    if (report.consumed.length === 0) return { status: 'none' };

    rolledBackNeeded = true;
    if (!io.writeModel(report.model)) throw new Error('model write');

    const bookIds = Object.keys(report.model.books);
    const copyText = text !== null && legacyBookId !== null && bookIds.includes(legacyBookId);
    if (copyText && text !== null && legacyBookId !== null) {
      if (!(await io.putText(legacyBookId, text))) throw new Error('text copy');
      if ((await io.getText(legacyBookId)) !== text) throw new Error('text readback');
    }
    rolledBackNeeded = false;

    // Everything is confirmed. Clean up; a failure here only leaves harmless leftovers.
    try {
      const keys: LegacyKey[] = report.consumed;
      for (const k of keys) localStorage.removeItem(k);
    } catch {
      // v2 data is saved; the legacy keys stay and are ignored
    }
    if (copyText) await legacyTransaction('readwrite', (s) => s.delete(LEGACY_RECORD), () => true);

    return { status: 'migrated', model: report.model };
  } catch {
    if (rolledBackNeeded) {
      try {
        io.removeModel();
      } catch {
        // nothing more can be done
      }
    }
    return { status: 'failed' };
  }
}
