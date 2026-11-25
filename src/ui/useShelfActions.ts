import { useCallback, useMemo, type MutableRefObject } from 'react';
import type { DataStore } from '../library/localStore';
import type { ModelSaver } from '../library/modelSaver';
import type { BookEntry, DataModel, ShelfName } from '../library/model';
import { moveToShelf, removeBook as removeBookEntry } from '../library/shelfOps';
import { LIBRARY_MESSAGES as MSG } from './libraryMessages';

interface Deps {
  store: DataStore;
  model: DataModel;
  modelRef: MutableRefObject<DataModel>;
  readyRef: MutableRefObject<boolean>;
  saverRef: MutableRefObject<ModelSaver | null>;
  setModel: (m: DataModel) => void;
  setMessage: (m: string | null) => void;
  updateModel: (fn: (m: DataModel) => DataModel) => void;
}

export type ShelfBooks = Record<ShelfName, BookEntry[]>;

/** Shelf selectors plus move and remove. Removal commits the model only after the text is gone. */
export function useShelfActions(d: Deps) {
  const { store, model, modelRef, readyRef, saverRef, setModel, setMessage, updateModel } = d;

  const shelfBooks = useMemo<ShelfBooks>(() => {
    const pick = (ids: string[]) => ids.map((id) => model.books[id]).filter((b): b is BookEntry => !!b);
    return {
      reading: pick(model.shelves.reading),
      'want-to-read': pick(model.shelves['want-to-read']),
      finished: pick(model.shelves.finished),
    };
  }, [model]);

  const shelfOf = useCallback(
    (bookId: string): ShelfName | null =>
      (['reading', 'want-to-read', 'finished'] as const).find((s) => model.shelves[s].includes(bookId)) ?? null,
    [model],
  );

  const moveBook = useCallback(
    (bookId: string, shelf: ShelfName) => updateModel((m) => moveToShelf(m, bookId, shelf)),
    [updateModel],
  );

  /** Resolves true when the book is gone. On any failure nothing changes and a message shows. */
  const removeBook = useCallback(
    async (bookId: string): Promise<boolean> => {
      if (!readyRef.current || !modelRef.current.books[bookId]) return false;
      const fail = () => {
        setMessage(MSG.removeFailed);
        return false;
      };
      try {
        await saverRef.current?.flush();
        const backup = await store.getText(bookId);
        const deleted = await store.deleteText(bookId);
        if (!deleted.ok) return fail();
        const next = removeBookEntry(modelRef.current, bookId);
        const saved = await store.save(next);
        if (!saved.ok) {
          if (backup.ok) await store.putText(bookId, backup.value).catch(() => undefined);
          return fail();
        }
        modelRef.current = next;
        setModel(next);
        setMessage(null);
        return true;
      } catch {
        return fail();
      }
    },
    [store, modelRef, readyRef, saverRef, setModel, setMessage],
  );

  return { shelfBooks, shelfOf, moveBook, removeBook };
}
