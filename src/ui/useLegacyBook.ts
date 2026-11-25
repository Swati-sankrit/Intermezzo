// The reader's old single-book persistence (rod_state + bookStore). Idle when a session is used.
// Removed with the migration work (library-v2 tasks 11.x).
import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { loadSavedBook } from '../reader/bookStore';
import { restoreBook } from '../reader/bookCodec';
import { resolvePosition } from '../reader/position';
import { loadPaceGuide, loadState, saveState } from '../reader/storage';
import type { ReaderState } from './readerState';

type SetState = Dispatch<SetStateAction<ReaderState>>;

export function useLegacyBook(
  active: boolean,
  setS: SetState,
  shownAtRef: MutableRefObject<number>,
  loadTokenRef: MutableRefObject<number>,
) {
  const persist = useCallback((next: ReaderState) => {
    if (!next.book || !active) return;
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
  }, [active]);

  // Restore the saved book and position on mount.
  useEffect(() => {
    if (!active) return;
    const token = ++loadTokenRef.current;
    let cancelled = false;
    void (async () => {
      const saved = await loadSavedBook();
      if (!saved || cancelled || token !== loadTokenRef.current) return;
      const restored = restoreBook(saved.fileName, saved.text, saved.title);
      if (!restored.ok) return; // unreadable: stay on the empty state (6.6)
      const state = loadState();
      const usable = state && state.fileName === saved.fileName ? state : null;
      const pos = usable
        ? resolvePosition(usable, restored.book)
        : { chapterIndex: 0, paragraphIndex: 0 };
      shownAtRef.current = Date.now();
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
  }, [active, setS, shownAtRef, loadTokenRef]);

  return { persist };
}
