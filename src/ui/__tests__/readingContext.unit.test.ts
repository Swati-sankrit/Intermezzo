import { describe, expect, it, vi } from 'vitest';
import {
  NOOP_EVIDENCE_HOST,
  NOOP_SPOILER_HOST,
  createReadingContext,
  type ReadingState,
} from '../readingContext';
import type { Book } from '../../reader/types';

const book: Book = {
  fileName: 'tale.txt',
  title: 'Tale',
  chapters: [
    { title: 'One', text: 'a1 first.\n\na2 second.\n\na3 third.' },
    { title: 'Two', text: 'b1 only.' },
  ],
};

/** A tiny store: `set` replaces the state and notifies subscribers. */
function makeStore(initial: ReadingState) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    set(next: ReadingState) {
      state = next;
      for (const l of [...listeners]) l();
    },
    size: () => listeners.size,
  };
}

const at = (chapterIndex: number, paragraphIndex: number, b: Book | null = book): ReadingState =>
  Object.freeze({ book: b, chapterIndex, paragraphIndex });

describe('createReadingContext', () => {
  it('chapterKey, activeParagraph and readSoFar follow reader state', () => {
    const store = makeStore(at(0, 0));
    const ctx = createReadingContext(store.get, store.subscribe);
    expect(ctx.chapterKey()).toBe('tale.txt#0');
    expect(ctx.activeParagraph()).toBe('a1 first.');
    expect(ctx.readSoFar()).toEqual({ text: 'a1 first.', position: 9 });

    store.set(at(0, 2));
    expect(ctx.activeParagraph()).toBe('a3 third.');
    const so = ctx.readSoFar();
    expect(so.text).toBe('a1 first.\n\na2 second.\n\na3 third.');
    expect(so.position).toBe(so.text.length);

    store.set(at(1, 0));
    expect(ctx.chapterKey()).toBe('tale.txt#1');
    expect(ctx.activeParagraph()).toBe('b1 only.');
    expect(ctx.readSoFar().text).toBe('b1 only.');
  });

  it('with no book it gives an empty key, no paragraph and empty text', () => {
    const store = makeStore(at(0, 0, null));
    const ctx = createReadingContext(store.get, store.subscribe);
    expect(ctx.chapterKey()).toBe('');
    expect(ctx.activeParagraph()).toBeNull();
    expect(ctx.readSoFar()).toEqual({ text: '', position: 0 });
  });

  it('spoilerSource returns null for now', () => {
    const store = makeStore(at(0, 0));
    expect(createReadingContext(store.get, store.subscribe).spoilerSource()).toBeNull();
  });

  it('subscribeChapter fires once per chapter change, including a return to an earlier chapter', () => {
    const store = makeStore(at(0, 0));
    const ctx = createReadingContext(store.get, store.subscribe);
    const cb = vi.fn();
    ctx.subscribeChapter?.(cb);

    store.set(at(0, 1)); // paragraph change
    store.set(at(0, 2));
    expect(cb).not.toHaveBeenCalled();

    store.set(at(1, 0)); // forward
    expect(cb).toHaveBeenCalledTimes(1);
    store.set(at(1, 0)); // same state again
    expect(cb).toHaveBeenCalledTimes(1);

    store.set(at(0, 0)); // back to an earlier chapter
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('subscribeChapter stops after unsubscribe', () => {
    const store = makeStore(at(0, 0));
    const ctx = createReadingContext(store.get, store.subscribe);
    const cb = vi.fn();
    const off = ctx.subscribeChapter!(cb);
    off();
    expect(store.size()).toBe(0);
    store.set(at(1, 0));
    expect(cb).not.toHaveBeenCalled();
  });

  it('never writes to reader state or the book', () => {
    const frozenBook: Book = Object.freeze({
      ...book,
      chapters: Object.freeze(book.chapters.map((c) => Object.freeze({ ...c }))) as Book['chapters'],
    });
    const state = at(0, 1, frozenBook);
    const store = makeStore(state);
    const setSpy = vi.spyOn(store, 'set');
    const ctx = createReadingContext(store.get, store.subscribe);
    const off = ctx.subscribeChapter!(() => undefined);
    // Frozen objects throw on write in strict mode (ES modules), so any write would fail here.
    ctx.chapterKey();
    ctx.activeParagraph();
    ctx.readSoFar();
    ctx.spoilerSource();
    off();
    expect(setSpy).not.toHaveBeenCalled();
    expect(store.get()).toBe(state);
    expect(frozenBook.chapters[0]?.text).toBe(book.chapters[0]?.text);
  });
});

describe('no-op hosts', () => {
  it('do nothing and do not throw', () => {
    expect(NOOP_EVIDENCE_HOST.show('shown', 'original')).toBeUndefined();
    expect(NOOP_EVIDENCE_HOST.clear()).toBeUndefined();
    expect(
      NOOP_SPOILER_HOST.show({
        sentence: 's',
        legibility: 1,
        blurPx: 0,
        holding: false,
        placement: { kind: 'overlay' },
      }),
    ).toBeUndefined();
    expect(NOOP_SPOILER_HOST.setHolding(true)).toBeUndefined();
    expect(NOOP_SPOILER_HOST.hide()).toBeUndefined();
  });
});
