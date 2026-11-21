import type { SavedBook } from './types';

export const BOOK_DB_NAME = 'rod_books';
export const BOOK_STORE_NAME = 'books';

const DB_VERSION = 1;
/** Fixed key: only one book is kept, so every save overwrites this record. */
const RECORD_KEY = 'current';

type Outcome<T> = { ok: true; value: T } | { ok: false };

/**
 * Open the database, run one transaction, and close the connection.
 * Resolves only when the transaction completes. Never rejects or throws.
 */
function runTransaction<T>(
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest | null,
  extract: (request: IDBRequest | null) => T,
): Promise<Outcome<T>> {
  return new Promise((resolve) => {
    let settled = false;
    let db: IDBDatabase | null = null;
    const finish = (outcome: Outcome<T>) => {
      if (settled) return;
      settled = true;
      try {
        db?.close();
      } catch {
        // already closed
      }
      resolve(outcome);
    };

    try {
      if (typeof indexedDB === 'undefined' || indexedDB === null) {
        finish({ ok: false });
        return;
      }
      const openReq = indexedDB.open(BOOK_DB_NAME, DB_VERSION);
      openReq.onupgradeneeded = () => {
        try {
          const upgradeDb = openReq.result;
          if (!upgradeDb.objectStoreNames.contains(BOOK_STORE_NAME)) {
            upgradeDb.createObjectStore(BOOK_STORE_NAME);
          }
        } catch {
          // open will fail or the store lookup below will fail
        }
      };
      openReq.onblocked = () => finish({ ok: false });
      openReq.onerror = () => finish({ ok: false });
      openReq.onsuccess = () => {
        try {
          db = openReq.result;
          const tx = db.transaction(BOOK_STORE_NAME, mode);
          const request = op(tx.objectStore(BOOK_STORE_NAME));
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

/** Store the book, replacing any earlier one. Returns false on any failure. */
export async function saveBook(fileName: string, text: string, title?: string): Promise<boolean> {
  try {
    const record: SavedBook = title === undefined ? { fileName, text } : { fileName, text, title };
    const outcome = await runTransaction(
      'readwrite',
      (store) => store.put(record, RECORD_KEY),
      () => true,
    );
    return outcome.ok;
  } catch {
    return false;
  }
}

/** Read the saved book. Returns null if absent, malformed, or on any failure. */
export async function loadSavedBook(): Promise<SavedBook | null> {
  try {
    const outcome = await runTransaction(
      'readonly',
      (store) => store.get(RECORD_KEY),
      (request): unknown => request?.result,
    );
    if (!outcome.ok) return null;
    const v = outcome.value;
    if (typeof v !== 'object' || v === null) return null;
    const o = v as Record<string, unknown>;
    if (typeof o.fileName !== 'string' || typeof o.text !== 'string') return null;
    return typeof o.title === 'string'
      ? { fileName: o.fileName, text: o.text, title: o.title }
      : { fileName: o.fileName, text: o.text };
  } catch {
    return null;
  }
}

/** Remove the saved book. Returns false on any failure. */
export async function clearSavedBook(): Promise<boolean> {
  try {
    const outcome = await runTransaction(
      'readwrite',
      (store) => store.delete(RECORD_KEY),
      () => true,
    );
    return outcome.ok;
  } catch {
    return false;
  }
}
