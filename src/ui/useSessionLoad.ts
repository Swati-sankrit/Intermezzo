import { useEffect, useRef } from 'react';
import type { Book } from '../reader/types';
import { openBookById, restorePosition, type OpenFailure, type ReaderSession, type Restored } from './bookSession';

interface Handlers {
  onLoading: () => void;
  onOpened: (book: Book, at: Restored) => void;
  onFailed: (failure: OpenFailure) => void;
}

/**
 * Opens `session.bookId` once the model has loaded, and again when the Book_Id changes.
 * The model is read through a ref so a position save does not reload the book.
 * Failures change nothing in the model.
 */
export function useSessionLoad(session: ReaderSession | undefined, handlers: Handlers): void {
  const modelRef = useRef(session?.model);
  const handlersRef = useRef(handlers);
  useEffect(() => {
    modelRef.current = session?.model;
    handlersRef.current = handlers;
  });
  const bookId = session?.bookId;
  const store = session?.store;
  const ready = session?.status === 'ready';

  useEffect(() => {
    if (!bookId || !store) return;
    let cancelled = false;
    handlersRef.current.onLoading();
    if (!ready) return;
    void (async () => {
      const model = modelRef.current;
      const opened = await openBookById(model?.books[bookId], store);
      if (cancelled) return;
      if (!opened.ok) {
        handlersRef.current.onFailed(opened.failure);
        return;
      }
      handlersRef.current.onOpened(opened.book, restorePosition(opened.book, model?.positions[bookId]));
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId, store, ready]);
}
