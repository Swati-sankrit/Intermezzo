import { EMPTY_DATA_MODEL, type DataModel } from './model';
import type { DataStore, Result } from './localStore';
import { validate } from './validator';

const OK: Result<void> = { ok: true, value: undefined };

/** In-memory DataStore with the same Result semantics as the local store. */
export function createMemoryStore(): DataStore {
  let model: DataModel = EMPTY_DATA_MODEL;
  const texts = new Map<string, string>();

  return {
    async load() {
      return { ok: true, value: model };
    },
    async save(next) {
      const checked = validate(next);
      if (!checked.ok) return { ok: false, kind: 'invalid' };
      model = checked.value;
      return OK;
    },
    async clear() {
      model = EMPTY_DATA_MODEL;
      texts.clear();
      return OK;
    },
    async getText(bookId) {
      const text = texts.get(bookId);
      return text === undefined ? { ok: false, kind: 'not_found' } : { ok: true, value: text };
    },
    async putText(bookId, text) {
      texts.set(bookId, text);
      return OK;
    },
    async deleteText(bookId) {
      texts.delete(bookId);
      return OK;
    },
  };
}
