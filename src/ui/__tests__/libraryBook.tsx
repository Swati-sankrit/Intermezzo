import { render } from '@testing-library/react';
import { createOnboardedStore, ONBOARDED_MODEL } from './onboardedStore';
import type { DataStore } from '../../library/localStore';
import type { DataModel } from '../../library/model';
import { addBookEntry, savePosition } from '../../library/shelfOps';
import { DataStoreProvider } from '../dataStoreContext';
import { LibraryShell } from '../LibraryShell';

export const BOOK_ID = 'known-book-id';

/**
 * An onboarded memory store holding one uploaded .txt book (its text stored under BOOK_ID) and,
 * when given, a saved Position. A progress above 0 puts the book on the Continue card.
 */
export async function storeWithBook(
  title: string,
  text: string,
  position?: { chapterIndex: number; paragraphIndex: number; progress: number },
): Promise<DataStore> {
  const store = createOnboardedStore();
  let model: DataModel = addBookEntry(ONBOARDED_MODEL, {
    bookId: BOOK_ID,
    title,
    author: '',
    fileName: 'known-book.txt',
    source: 'upload',
    format: 'txt',
    addedAt: 1,
  });
  if (position) model = savePosition(model, BOOK_ID, { ...position, savedAt: 5 });
  await store.save(model);
  await store.putText(BOOK_ID, text);
  return store;
}

/** The real app shell (library and reader) over the given store. */
export const showLibrary = (store: DataStore) =>
  render(
    <DataStoreProvider store={store}>
      <LibraryShell />
    </DataStoreProvider>,
  );
