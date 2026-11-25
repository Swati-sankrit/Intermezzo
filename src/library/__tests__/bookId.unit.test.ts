import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashBytes } from '../bookId';
import { EMPTY_DATA_MODEL, type BookEntry, type DataModel } from '../model';
import { addBookEntry } from '../shelfOps';

const bytes = (s: string): ArrayBuffer => new TextEncoder().encode(s).buffer as ArrayBuffer;

/** Mirrors the add-book flow: hash, and add only when a Book_Id exists. */
async function addFile(model: DataModel, name: string, content: string): Promise<DataModel> {
  const bookId = await hashBytes(bytes(content));
  if (bookId === null) return model;
  const entry: BookEntry = {
    bookId,
    title: name,
    author: '',
    fileName: name,
    source: 'upload',
    format: 'txt',
    addedAt: 1,
  };
  return addBookEntry(model, entry);
}

afterEach(() => vi.restoreAllMocks());

describe('Book_Id', () => {
  it('matches the known SHA-256 vector for "abc" in lowercase hex', async () => {
    expect(await hashBytes(bytes('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('gives different ids to same-name, same-size files with different bytes', async () => {
    const a = await hashBytes(bytes('aaaa'));
    const b = await hashBytes(bytes('aaab'));
    expect(a).not.toBeNull();
    expect(a).not.toBe(b);
    const model = await addFile(await addFile(EMPTY_DATA_MODEL, 'same.txt', 'aaaa'), 'same.txt', 'aaab');
    expect(Object.keys(model.books)).toHaveLength(2);
  });

  it('reuses one entry for identical bytes', async () => {
    const once = await addFile(EMPTY_DATA_MODEL, 'one.txt', 'hello');
    const twice = await addFile(once, 'renamed.txt', 'hello');
    expect(Object.keys(twice.books)).toHaveLength(1);
    expect(twice).toEqual(once);
  });

  it('returns null on hash failure and leaves the model unchanged', async () => {
    vi.spyOn(crypto.subtle, 'digest').mockRejectedValue(new Error('fail'));
    expect(await hashBytes(bytes('abc'))).toBeNull();
    const model = await addFile(EMPTY_DATA_MODEL, 'x.txt', 'abc');
    expect(model).toBe(EMPTY_DATA_MODEL);
    expect(model.books).toEqual({});
  });
});
