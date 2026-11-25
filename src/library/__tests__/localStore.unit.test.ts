import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalStore, LIBRARY_STORAGE_KEY } from '../localStore';
import { EMPTY_DATA_MODEL, type DataModel } from '../model';
import { serialize } from '../serializer';

/** Requirements 17.2-17.6, 18.3, 18.4, 18.8, 19.10, 23.5-23.7. The real store runs; only the browser storage is faulted. */

function savedModel(): DataModel {
  return {
    ...structuredClone(EMPTY_DATA_MODEL),
    profile: { ...EMPTY_DATA_MODEL.profile, displayName: 'Mina' },
    shelves: { reading: ['b1'], 'want-to-read': [], finished: [] },
    books: {
      b1: { bookId: 'b1', title: 'One', author: 'A', fileName: 'one.txt', source: 'upload', format: 'txt', addedAt: 1 },
    },
    stats: {
      b1: { paragraphsRead: 3, chaptersFinished: 0, activeReadingSeconds: 60, lookAwayCount: 1, sessionCount: 1, awaySeconds: 0 },
    },
  };
}

const quotaError = () => Object.assign(new Error('full'), { name: 'QuotaExceededError' });

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Local_Store model record', () => {
  it('first run: no record loads as the empty model, and writes nothing', async () => {
    const r = await createLocalStore().load();
    expect(r).toEqual({ ok: true, value: EMPTY_DATA_MODEL });
    expect(localStorage.getItem(LIBRARY_STORAGE_KEY)).toBeNull();
  });

  it('a saved model loads back unchanged', async () => {
    const store = createLocalStore();
    expect((await store.save(savedModel())).ok).toBe(true);
    expect(await createLocalStore().load()).toEqual({ ok: true, value: savedModel() });
  });

  it('corrupt record: reports invalid and leaves the stored text untouched', async () => {
    for (const bad of ['{not json', JSON.stringify({ ...savedModel(), shelves: { reading: ['ghost'] } })]) {
      localStorage.setItem(LIBRARY_STORAGE_KEY, bad);
      expect(await createLocalStore().load()).toEqual({ ok: false, kind: 'invalid' });
      expect(localStorage.getItem(LIBRARY_STORAGE_KEY)).toBe(bad);
    }
  });

  it('newer schema version: reports newer_version, refuses save and clear, stored data not changed', async () => {
    const newer = JSON.stringify({ ...savedModel(), schemaVersion: 3, extra: 'future' });
    localStorage.setItem(LIBRARY_STORAGE_KEY, newer);
    const store = createLocalStore();
    expect(await store.load()).toEqual({ ok: false, kind: 'newer_version' });
    expect(await store.save(EMPTY_DATA_MODEL)).toEqual({ ok: false, kind: 'newer_version' });
    expect(await store.clear()).toEqual({ ok: false, kind: 'newer_version' });
    expect(localStorage.getItem(LIBRARY_STORAGE_KEY)).toBe(newer);
  });

  it('write failure: reports unavailable and keeps the earlier record', async () => {
    const store = createLocalStore();
    await store.save(savedModel());
    const before = localStorage.getItem(LIBRARY_STORAGE_KEY);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('write failed');
    });
    const changed = { ...savedModel(), profile: { ...savedModel().profile, displayName: 'Other' } };
    expect(await store.save(changed)).toEqual({ ok: false, kind: 'unavailable' });
    expect(localStorage.getItem(LIBRARY_STORAGE_KEY)).toBe(before);
  });

  it('quota exceeded: reports quota and keeps the earlier record', async () => {
    const store = createLocalStore();
    await store.save(savedModel());
    const before = localStorage.getItem(LIBRARY_STORAGE_KEY);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError();
    });
    expect(await store.save(EMPTY_DATA_MODEL)).toEqual({ ok: false, kind: 'quota' });
    expect(localStorage.getItem(LIBRARY_STORAGE_KEY)).toBe(before);
  });

  it('unavailable localStorage: load, save and clear report unavailable, not a default model', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const store = createLocalStore();
    expect(await store.load()).toEqual({ ok: false, kind: 'unavailable' });
    expect(await store.save(savedModel())).toEqual({ ok: false, kind: 'unavailable' });
    expect(await store.clear()).toEqual({ ok: false, kind: 'unavailable' });
  });

  it('a rejected model is never written', async () => {
    const store = createLocalStore();
    await store.save(savedModel());
    const before = localStorage.getItem(LIBRARY_STORAGE_KEY);
    const bad = { ...savedModel(), shelves: { reading: ['ghost'], 'want-to-read': [], finished: [] } };
    expect(await store.save(bad)).toEqual({ ok: false, kind: 'invalid' });
    expect(localStorage.getItem(LIBRARY_STORAGE_KEY)).toBe(before);
    expect(before).toBe(serialize(savedModel()));
  });
});

describe('Local_Store book text', () => {
  it('missing text reports not_found, and deleting absent text succeeds', async () => {
    const store = createLocalStore();
    expect(await store.getText('nope')).toEqual({ ok: false, kind: 'not_found' });
    expect(await store.deleteText('nope')).toEqual({ ok: true, value: undefined });
  });

  it('text round-trips and a failed write leaves the earlier text in place', async () => {
    const store = createLocalStore();
    expect((await store.putText('b1', 'first')).ok).toBe(true);
    expect(await store.getText('b1')).toEqual({ ok: true, value: 'first' });

    const realOpen = indexedDB.open.bind(indexedDB);
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw quotaError();
    });
    expect(await store.putText('b1', 'second')).toEqual({ ok: false, kind: 'quota' });
    vi.mocked(indexedDB.open).mockImplementation(realOpen);
    expect(await store.getText('b1')).toEqual({ ok: true, value: 'first' });
  });

  it('unavailable IndexedDB reports unavailable for every text operation', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const store = createLocalStore();
    expect(await store.getText('b1')).toEqual({ ok: false, kind: 'unavailable' });
    expect(await store.putText('b1', 'x')).toEqual({ ok: false, kind: 'unavailable' });
    expect(await store.deleteText('b1')).toEqual({ ok: false, kind: 'unavailable' });
  });
});
