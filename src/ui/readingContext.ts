/**
 * Reader state as a `ReadingContext` for the haunt engine (ghost-dread task 6.1).
 * Read-only: nothing here writes to reader state, stored text or progress.
 * The pure factory takes a state getter and a "state changed" subscription;
 * `useReadingContext` supplies both from React props.
 */
import { useLayoutEffect, useState } from 'react';
import type { EvidenceHost, ReadingContext, SpoilerHost } from '../haunts/engine/returnTypes';
import { splitIntoParagraphs } from '../reader/splitter';
import type { Book, Paragraph } from '../reader/types';

/** The slice of reader state the context reads. */
export interface ReadingState {
  readonly book: Book | null;
  readonly chapterIndex: number;
  /** Last revealed paragraph in the chapter. */
  readonly paragraphIndex: number;
}

/** Calls `onChange` after the reader state changes. Returns an unsubscribe function. */
export type StateSubscribe = (onChange: () => void) => () => void;

/** Book file name plus chapter index. Empty when no book is open. */
export function chapterKeyOf(state: ReadingState): string {
  return state.book ? `${state.book.fileName}#${state.chapterIndex}` : '';
}

/** Paragraphs of the active chapter. Empty with no book or an out-of-range chapter. */
export function chapterParagraphs(state: ReadingState): Paragraph[] {
  return splitIntoParagraphs(state.book?.chapters[state.chapterIndex]?.text ?? '');
}

/** Text of the active paragraph, or null when there is none. */
export function activeParagraphOf(paragraphs: readonly Paragraph[], index: number): string | null {
  return paragraphs[index]?.text ?? null;
}

/** Paragraphs 0..index of the chapter joined by blank lines, and the offset where they end. */
export function readSoFarOf(
  paragraphs: readonly Paragraph[],
  index: number,
): { text: string; position: number } {
  const text = paragraphs
    .slice(0, Math.max(0, index + 1))
    .map((p) => p.text)
    .join('\n\n');
  return { text, position: text.length };
}

export function createReadingContext(
  getState: () => ReadingState,
  subscribe: StateSubscribe,
): ReadingContext {
  // Split once per chapter text, not on every call.
  let cachedText: string | undefined;
  let cached: Paragraph[] = [];
  const paragraphs = (): Paragraph[] => {
    const state = getState();
    const text = state.book?.chapters[state.chapterIndex]?.text ?? '';
    if (text !== cachedText) {
      cachedText = text;
      cached = chapterParagraphs(state);
    }
    return cached;
  };
  return {
    chapterKey: () => chapterKeyOf(getState()),
    activeParagraph: () => activeParagraphOf(paragraphs(), getState().paragraphIndex),
    readSoFar: () => readSoFarOf(paragraphs(), getState().paragraphIndex),
    spoilerSource: () => null, // task 10.8
    subscribeChapter(cb) {
      let last = chapterKeyOf(getState());
      return subscribe(() => {
        const key = chapterKeyOf(getState());
        if (key === last) return; // a paragraph change, not a chapter change
        last = key;
        cb();
      });
    },
  };
}

/** Shows nothing, until the evidence display exists (task 9.5). */
export const NOOP_EVIDENCE_HOST: EvidenceHost = {
  show: () => undefined,
  clear: () => undefined,
};

/** Shows nothing, until the spoiler card exists (task 10.8). */
export const NOOP_SPOILER_HOST: SpoilerHost = {
  show: () => undefined,
  setHolding: () => undefined,
  hide: () => undefined,
};

/** A stable `ReadingContext` that follows the given reader state. */
export function useReadingContext(state: ReadingState): ReadingContext {
  const [store] = useState(() => {
    let current = state;
    const listeners = new Set<() => void>();
    const context = createReadingContext(
      () => current,
      (onChange) => {
        listeners.add(onChange);
        return () => {
          listeners.delete(onChange);
        };
      },
    );
    const update = (next: ReadingState) => {
      current = next;
      for (const notify of [...listeners]) notify();
    };
    return { update, context };
  });
  const { book, chapterIndex, paragraphIndex } = state;
  useLayoutEffect(() => {
    store.update({ book, chapterIndex, paragraphIndex });
  }, [store, book, chapterIndex, paragraphIndex]);
  return store.context;
}
