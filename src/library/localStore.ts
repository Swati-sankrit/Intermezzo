import { EMPTY_DATA_MODEL, SCHEMA_VERSION, type DataModel } from './model';
import { parse, serialize } from './serializer';
import { validate } from './validator';

/**
 * The only Data_Store implementation and the only file that touches the v2
 * localStorage key or the v2 IndexedDB database.
 *
 * Storage names are new on purpose. The legacy `rod_state`, `rod_pace_guide`
 * keys and the `rod_books` database stay untouched here so the migration
 * (task 11) can read them.
 */
export const LIBRARY_STORAGE_KEY = 'rod_library_v2';
/** IndexedDB database holding book text for uploaded books, keyed by Book_Id. */
export const LIBRARY_DB_NAME = 'rod_library_v2';
export const LIBRARY_TEXT_STORE = 'book_text';
const DB_VERSION = 1;

export type FailureKind = 'unavailable' | 'quota' | 'invalid' | 'not_found' | 'newer_version';
export type Result<T> = { ok: true; value: T } | { ok: false; kind: FailureKind };

export interface DataStore {
  load(): Promise<Result<DataModel>>;
  save(model: DataModel): Promise<Result<void>>;
  clear(): Promise<Result<void>>;
  getText(bookId: string): Promise<Result<string>>;
  putText(bookId: string, text: string): Promise<Result<void>>;
  deleteText(bookId: string): Promise<Result<void>>;
}

const OK: Result<void> = { ok: true, value: undefined };
const fail = (kind: FailureKind): Result<never> => ({ ok: false, kind });

function isQuotaError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { name?: unknown; code?: unknown };
  return e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22;
}

const kindOf = (err: unknown): FailureKind => (isQuotaError(err) ? 'quota' : 'unavailable');

/** Open the text database, run one transaction, close. Never throws or rejects. */
function runTransaction<T>(
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest | null,
  extract: (request: IDBRequest | null) => T,
): Promise<Result<T>> {
  return new Promise((resolve) => {
    let settled = false;
    let db: IDBDatabase | null = null;
    const finish = (result: Result<T>) => {
      if (settled) return;
      settled = true;
      try {
        db?.close();
      } catch {
        // already closed
      }
      resolve(result);
    };

    try {
      if (typeof indexedDB === 'undefined' || indexedDB === null) {
        finish(fail('unavailable'));
        return;
      }
      const openReq = indexedDB.open(LIBRARY_DB_NAME, DB_VERSION);
      openReq.onupgradeneeded = () => {
        try {
          const upgradeDb = openReq.result;
          if (!upgradeDb.objectStoreNames.contains(LIBRARY_TEXT_STORE)) {
            upgradeDb.createObjectStore(LIBRARY_TEXT_STORE);
          }
        } catch {
          // the transaction below will fail and report unavailable
        }
      };
      openReq.onblocked = () => finish(fail('unavailable'));
      openReq.onerror = () => finish(fail(kindOf(openReq.error)));
      openReq.onsuccess = () => {
        try {
          db = openReq.result;
          const tx = db.transaction(LIBRARY_TEXT_STORE, mode);
          const request = op(tx.objectStore(LIBRARY_TEXT_STORE));
          tx.oncomplete = () => {
            try {
              finish({ ok: true, value: extract(request) });
            } catch {
              finish(fail('unavailable'));
            }
          };
          tx.onerror = () => finish(fail(kindOf(tx.error ?? request?.error)));
          tx.onabort = () => finish(fail(kindOf(tx.error)));
        } catch (err) {
          finish(fail(kindOf(err)));
        }
      };
    } catch (err) {
      finish(fail(kindOf(err)));
    }
  });
}

function hasNewerVersion(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const v = (data as { schemaVersion?: unknown }).schemaVersion;
  return typeof v === 'number' && Number.isFinite(v) && v > SCHEMA_VERSION;
}

/** The single creation point for a Data_Store. Catalogue EPUBs are never stored here. */
export function createLocalStore(): DataStore {
  /** Set once a newer-version record is seen; all saves are refused afterwards. */
  let locked = false;

  return {
    async load() {
      try {
        const raw = localStorage.getItem(LIBRARY_STORAGE_KEY);
        if (raw === null) return { ok: true, value: EMPTY_DATA_MODEL };
        const data = parse(raw);
        if (hasNewerVersion(data)) {
          locked = true;
          return fail('newer_version');
        }
        const checked = validate(data);
        return checked.ok ? { ok: true, value: checked.value } : fail('invalid');
      } catch (err) {
        return fail(kindOf(err));
      }
    },

    async save(model) {
      try {
        if (locked) return fail('newer_version');
        const checked = validate(model);
        if (!checked.ok) return fail('invalid');
        localStorage.setItem(LIBRARY_STORAGE_KEY, serialize(checked.value));
        return OK;
      } catch (err) {
        return fail(kindOf(err));
      }
    },

    async clear() {
      try {
        if (locked) return fail('newer_version');
        localStorage.removeItem(LIBRARY_STORAGE_KEY);
      } catch (err) {
        return fail(kindOf(err));
      }
      const cleared = await runTransaction(
        'readwrite',
        (store) => store.clear(),
        () => undefined,
      );
      return cleared.ok ? OK : cleared;
    },

    async getText(bookId) {
      const out = await runTransaction(
        'readonly',
        (store) => store.get(bookId),
        (request): unknown => request?.result,
      );
      if (!out.ok) return out;
      return typeof out.value === 'string' ? { ok: true, value: out.value } : fail('not_found');
    },

    async putText(bookId, text) {
      const out = await runTransaction(
        'readwrite',
        (store) => store.put(text, bookId),
        () => undefined,
      );
      return out.ok ? OK : out;
    },

    async deleteText(bookId) {
      const out = await runTransaction(
        'readwrite',
        (store) => store.delete(bookId),
        () => undefined,
      );
      return out.ok ? OK : out;
    },
  };
}
