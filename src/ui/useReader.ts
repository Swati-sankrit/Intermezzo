import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadSavedBook, saveBook } from '../reader/bookStore';
import { restoreBook } from '../reader/bookCodec';
import type { LibraryEntry } from '../reader/library';
import { DEFAULT_WPM, countWords, suggestedSeconds, updateAveragePace } from '../reader/paceCalc';
import { resolvePosition } from '../reader/position';
import { absoluteIndex, calculateProgress, countTotalParagraphs } from '../reader/progress';
import { splitIntoParagraphs } from '../reader/splitter';
import { loadPaceGuide, loadState, savePaceGuide, saveState } from '../reader/storage';
import type { Book, Paragraph } from '../reader/types';
import { loadFromFile, loadFromLibrary, type Loaded } from './loadSource';

export interface ReaderState {
  book: Book | null;
  chapterIndex: number;
  paragraphIndex: number; // last revealed paragraph in the chapter
  chapterComplete: boolean;
  error: string | null;
  averagePace: number;
  paceGuideEnabled: boolean;
}

const INITIAL: ReaderState = {
  book: null,
  chapterIndex: 0,
  paragraphIndex: 0,
  chapterComplete: false,
  error: null,
  averagePace: DEFAULT_WPM,
  paceGuideEnabled: false,
};

export function useReader() {
  const [s, setS] = useState<ReaderState>(() => ({ ...INITIAL, paceGuideEnabled: loadPaceGuide() ?? false }));
  // When the active paragraph appeared. Set in the load handlers; no book is shown before then.
  const shownAt = useRef(0);
  const loadToken = useRef(0);

  const persist = useCallback((next: ReaderState) => {
    if (!next.book) return;
    saveState({
      fileName: next.book.fileName,
      position: {
        chapterIndex: next.chapterIndex,
        paragraphIndex: next.paragraphIndex,
        savedAt: Date.now(),
      },
      averagePace: next.averagePace,
      paceGuideEnabled: next.paceGuideEnabled,
    });
  }, []);

  // Restore the saved book and position on mount.
  useEffect(() => {
    const token = ++loadToken.current;
    let cancelled = false;
    void (async () => {
      const saved = await loadSavedBook();
      if (!saved || cancelled || token !== loadToken.current) return;
      const restored = restoreBook(saved.fileName, saved.text, saved.title);
      if (!restored.ok) return; // unreadable: stay on the empty state (6.6)
      const state = loadState();
      const usable = state && state.fileName === saved.fileName ? state : null;
      const pos = usable
        ? resolvePosition(usable, restored.book)
        : { chapterIndex: 0, paragraphIndex: 0 };
      shownAt.current = Date.now();
      setS((prev) => ({
        ...prev,
        book: restored.book,
        ...pos,
        chapterComplete: false,
        error: null,
        averagePace: usable?.averagePace ?? prev.averagePace,
        paceGuideEnabled: loadPaceGuide() ?? usable?.paceGuideEnabled ?? prev.paceGuideEnabled,
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const finishLoad = useCallback(
    async (pending: Promise<Loaded>) => {
      const token = ++loadToken.current;
      const result = await pending;
      if (token !== loadToken.current) return;
      if (!result.ok) {
        setS((prev) => ({ ...prev, error: result.error })); // keep the previous book
        return;
      }
      await saveBook(result.book.fileName, result.storedText, result.book.title);
      if (token !== loadToken.current) return;
      shownAt.current = Date.now();
      setS((prev) => {
        const next: ReaderState = {
          ...prev,
          book: result.book,
          chapterIndex: 0,
          paragraphIndex: 0,
          chapterComplete: false,
          error: null,
        };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const selectBook = useCallback((file: File) => finishLoad(loadFromFile(file)), [finishLoad]);
  const selectLibraryBook = useCallback(
    (entry: LibraryEntry) => finishLoad(loadFromLibrary(entry)),
    [finishLoad],
  );

  const paragraphs: Paragraph[] = useMemo(
    () => (s.book ? splitIntoParagraphs(s.book.chapters[s.chapterIndex]?.text ?? '') : []),
    [s.book, s.chapterIndex],
  );

  const advance = useCallback(() => {
    if (!s.book || s.chapterComplete) return;
    const active = paragraphs[s.paragraphIndex];
    const elapsed = (Date.now() - shownAt.current) / 1000;
    const averagePace = active
      ? updateAveragePace(s.averagePace, countWords(active.text), elapsed)
      : s.averagePace;
    const hasNext = s.paragraphIndex + 1 < paragraphs.length;
    shownAt.current = Date.now();
    const next: ReaderState = {
      ...s,
      averagePace,
      paragraphIndex: hasNext ? s.paragraphIndex + 1 : s.paragraphIndex,
      chapterComplete: !hasNext,
    };
    persist(next);
    setS(next);
  }, [s, paragraphs, persist]);

  const nextChapter = useCallback(() => {
    if (!s.book || s.chapterIndex + 1 >= s.book.chapters.length) return;
    shownAt.current = Date.now();
    const next: ReaderState = {
      ...s,
      chapterIndex: s.chapterIndex + 1,
      paragraphIndex: 0,
      chapterComplete: false,
    };
    persist(next);
    setS(next);
  }, [s, persist]);

  // Clears the book from view only. The saved book and position stay on the device.
  const closeBook = useCallback(() => {
    loadToken.current++;
    setS((prev) => ({ ...prev, book: null, chapterComplete: false, error: null }));
  }, []);

  const togglePaceGuide = useCallback(() => {
    const next = { ...s, paceGuideEnabled: !s.paceGuideEnabled };
    savePaceGuide(next.paceGuideEnabled);
    persist(next);
    setS(next);
  }, [s, persist]);

  const derived = useMemo(() => {
    if (!s.book) return { progress: 0, suggestedSecs: 1 };
    const total = countTotalParagraphs(s.book, splitIntoParagraphs);
    const abs = absoluteIndex(s.book, s, splitIntoParagraphs) + (s.chapterComplete ? 1 : 0);
    const active = paragraphs[s.paragraphIndex];
    return {
      progress: calculateProgress(abs, total),
      suggestedSecs: suggestedSeconds(active ? countWords(active.text) : 0, s.averagePace),
    };
  }, [s, paragraphs]);

  const lastChapter = !s.book || s.chapterIndex + 1 >= s.book.chapters.length;
  const chapterComplete = s.chapterComplete || (!!s.book && paragraphs.length === 0);

  return {
    book: s.book,
    chapterIndex: s.chapterIndex,
    paragraphIndex: s.paragraphIndex,
    error: s.error,
    averagePace: s.averagePace,
    paceGuideEnabled: s.paceGuideEnabled,
    chapterComplete,
    hasNextChapter: !lastChapter,
    paragraphs,
    ...derived,
    selectBook,
    selectLibraryBook,
    advance,
    nextChapter,
    closeBook,
    togglePaceGuide,
  };
}
