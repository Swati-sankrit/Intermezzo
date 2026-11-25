import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { countWords, suggestedSeconds, updateAveragePace } from '../reader/paceCalc';
import { absoluteIndex, calculateProgress, countTotalParagraphs } from '../reader/progress';
import { splitIntoParagraphs } from '../reader/splitter';
import { setPaceGuide } from '../library/profileOps';
import { loadPaceGuide, savePaceGuide } from '../reader/storage';
import type { Paragraph } from '../reader/types';
import {
  READER_MESSAGES,
  savePositionUpdate,
  type ReaderSession,
} from './bookSession';
import { INITIAL_READER_STATE, type ReaderState } from './readerState';
import { useLegacyBook } from './useLegacyBook';
import { useSessionLoad } from './useSessionLoad';

export type { ReaderState } from './readerState';

/**
 * Without a `session` the reader keeps its old single-book behaviour (localStorage, bookStore),
 * unless `options.legacy` is false (the library app, before a book is chosen).
 * With one, it opens `session.bookId`, restores that book's Position and saves progress to the model.
 */
export function useReader(session?: ReaderSession, options: { legacy?: boolean } = {}) {
  const [s, setS] = useState<ReaderState>(() => ({ ...INITIAL_READER_STATE, paceGuideEnabled: loadPaceGuide() ?? false }));
  // When the active paragraph appeared. Set in the load handlers; no book is shown before then.
  const shownAt = useRef(0);
  const loadToken = useRef(0);

  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  });
  const { persist } = useLegacyBook(
    options.legacy ?? session === undefined,
    setS,
    shownAt,
    loadToken,
  );

  useSessionLoad(session, {
    onLoading: () => setS((prev) => ({ ...prev, book: null, loading: true, failure: null, notice: null })),
    onOpened: (book, at) => {
      shownAt.current = Date.now();
      setS((prev) => ({
        ...prev,
        book,
        chapterIndex: at.chapterIndex,
        paragraphIndex: at.paragraphIndex,
        chapterComplete: false,
        loading: false,
        failure: null,
        error: null,
        notice: at.malformed ? READER_MESSAGES.positionLost : null,
        averagePace: session?.model.profile.averagePace ?? prev.averagePace,
        paceGuideEnabled: session?.model.profile.paceGuideEnabled ?? prev.paceGuideEnabled,
      }));
    },
    onFailed: (failure) =>
      setS((prev) => ({
        ...prev,
        book: null,
        loading: false,
        failure,
        error: failure === 'text' ? READER_MESSAGES.textMissing : READER_MESSAGES.epubFailed,
      })),
  });

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
    const sess = sessionRef.current;
    if (sess) {
      const lastChapter = s.chapterIndex + 1 >= s.book.chapters.length;
      savePositionUpdate(sess, s.book, next, next.chapterComplete, next.chapterComplete && lastChapter);
    }
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
    if (sessionRef.current) savePositionUpdate(sessionRef.current, s.book, next, false, false);
  }, [s, persist]);

  // Clears the book from view only. The saved book and position stay on the device.
  const closeBook = useCallback(() => {
    loadToken.current++;
    setS((prev) => ({
      ...prev,
      book: null,
      chapterComplete: false,
      error: null,
      loading: false,
      failure: null,
      notice: null,
    }));
  }, []);

  const togglePaceGuide = useCallback(() => {
    const next = { ...s, paceGuideEnabled: !s.paceGuideEnabled };
    savePaceGuide(next.paceGuideEnabled);
    // In library mode the Profile is the source of truth; the old key is kept in step above.
    sessionRef.current?.updateModel((m) => setPaceGuide(m, next.paceGuideEnabled));
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
    loading: s.loading,
    notice: s.notice,
    failure: s.failure,
    averagePace: s.averagePace,
    paceGuideEnabled: s.paceGuideEnabled,
    chapterComplete,
    hasNextChapter: !lastChapter,
    paragraphs,
    ...derived,
    advance,
    nextChapter,
    closeBook,
    togglePaceGuide,
  };
}
