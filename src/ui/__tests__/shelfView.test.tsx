// Example tests for the Shelf view (library-v2, task 7.3).
// Real LibraryShell, LibraryScreen, ShelfView, ShelfBook, useLibrary and useShelfActions, with the
// in-memory store provided through context. A wrapper store makes deleteText or save fail on demand.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CATALOGUE } from '../../library/catalogueData';
import type { DataStore, Result } from '../../library/localStore';
import { createOnboardedStore, ONBOARDED_MODEL } from './onboardedStore';
import type { DataModel } from '../../library/model';
import { addBookEntry, moveToShelf } from '../../library/shelfOps';
import { DataStoreProvider } from '../dataStoreContext';
import { LIBRARY_MESSAGES } from '../libraryMessages';
import { LibraryShell } from '../LibraryShell';

const [A, B] = CATALOGUE;

/** Wraps a real store; `deleteText` or `save` fails while its flag is set. */
function failableStore(inner: DataStore) {
  const flags = { failDelete: false, failSave: false };
  const store: DataStore = {
    ...inner,
    async deleteText(id): Promise<Result<void>> {
      return flags.failDelete ? { ok: false, kind: 'unavailable' } : inner.deleteText(id);
    },
    async save(model: DataModel): Promise<Result<void>> {
      return flags.failSave ? { ok: false, kind: 'unavailable' } : inner.save(model);
    },
  };
  return { store, flags };
}

const entryFor = (e: (typeof CATALOGUE)[number]) => ({
  bookId: e.slug,
  title: e.title,
  author: e.author,
  fileName: `${e.slug}.epub`,
  source: 'catalogue' as const,
  format: 'epub' as const,
  catalogueSlug: e.slug,
  addedAt: 1,
});

/** Book A on Reading, book B on Want to read, Finished empty. */
async function seed(store: DataStore) {
  let m = addBookEntry(ONBOARDED_MODEL, entryFor(A));
  m = moveToShelf(addBookEntry(m, entryFor(B)), B.slug, 'want-to-read');
  expect((await store.save(m)).ok).toBe(true);
}

async function show(store: DataStore) {
  await seed(store);
  render(
    <DataStoreProvider store={store}>
      <LibraryShell />
    </DataStoreProvider>,
  );
  await screen.findByRole('region', { name: 'Reading' });
}
const shelf = (name: string) => within(screen.getByRole('region', { name }));
const savedShelves = async (store: DataStore) => {
  const r = await store.load();
  if (!r.ok) throw new Error('load failed');
  return r.value;
};
const startRemoving = (title: string) => fireEvent.click(shelf('Reading').getByRole('button', { name: new RegExp(`^Remove ${title}`) }));

afterEach(cleanup);

describe('Shelf view', () => {
  it('omits the current shelf from each book\'s move buttons', async () => {
    await show(createOnboardedStore());
    const moves = (name: string) =>
      shelf(name)
        .getAllByRole('button', { name: /^Move to / })
        .map((b) => b.textContent?.split(':')[0]);
    expect(moves('Reading')).toEqual(['Move to Want to read', 'Move to Finished']);
    expect(moves('Want to read')).toEqual(['Move to Reading', 'Move to Finished']);
  });

  it('a move updates both shelves in one render and is saved', async () => {
    const store = createOnboardedStore();
    await show(store);
    expect(shelf('Reading').getByRole('heading', { name: A.title })).toBeTruthy();
    fireEvent.click(shelf('Reading').getByRole('button', { name: `Move to Finished: ${A.title}` }));
    // No waiting: the click's render must already show the book on the new shelf only.
    expect(shelf('Reading').queryByRole('heading', { name: A.title })).toBeNull();
    expect(shelf('Finished').getByRole('heading', { name: A.title })).toBeTruthy();
    await waitFor(async () => expect((await savedShelves(store)).shelves.finished).toEqual([A.slug]), { timeout: 2000 });
    expect((await savedShelves(store)).shelves.reading).toEqual([]);
  });

  it('removes the book after confirmation, with its text and entry gone', async () => {
    const store = createOnboardedStore();
    await store.putText(A.slug, 'uploaded text');
    await show(store);
    startRemoving(A.title);
    fireEvent.click(screen.getByRole('button', { name: 'Remove book' }));
    await waitFor(() => expect(shelf('Reading').queryByRole('heading', { name: A.title })).toBeNull());
    const model = await savedShelves(store);
    expect(model.books[A.slug]).toBeUndefined();
    expect(model.shelves.reading).toEqual([]);
    expect((await store.getText(A.slug)).ok).toBe(false);
  });

  it('keeps the book when Cancel is pressed or Escape is pressed', async () => {
    const store = createOnboardedStore();
    await store.putText(A.slug, 'uploaded text');
    await show(store);
    startRemoving(A.title);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('group', { name: `Remove ${A.title}` })).toBeNull();
    startRemoving(A.title);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), { key: 'Escape' });
    expect(screen.queryByRole('group', { name: `Remove ${A.title}` })).toBeNull();
    expect(shelf('Reading').getByRole('heading', { name: A.title })).toBeTruthy();
    expect((await savedShelves(store)).books[A.slug]).toBeDefined();
    expect((await store.getText(A.slug)).ok).toBe(true);
  });

  it.each([['deleteText', 'failDelete'], ['save', 'failSave']] as const)(
    'leaves the entry, shelf and text unchanged and shows the message when %s fails',
    async (_label, flag) => {
      const { store, flags } = failableStore(createOnboardedStore());
      await store.putText(A.slug, 'uploaded text');
      await show(store);
      flags[flag] = true;
      startRemoving(A.title);
      fireEvent.click(screen.getByRole('button', { name: 'Remove book' }));
      expect(await screen.findByText(LIBRARY_MESSAGES.removeFailed)).toBeTruthy();
      expect(LIBRARY_MESSAGES.removeFailed).toBe('This book could not be removed. You can try again.');
      expect(shelf('Reading').getByRole('heading', { name: A.title })).toBeTruthy();
      flags[flag] = false;
      const model = await savedShelves(store);
      expect(model.books[A.slug]).toBeDefined();
      expect(model.shelves.reading).toEqual([A.slug]);
      const text = await store.getText(A.slug);
      expect(text).toEqual({ ok: true, value: 'uploaded text' });
    },
  );

  it('shows the empty-shelf message and its button moves focus to the catalogue grid', async () => {
    await show(createOnboardedStore());
    const finished = shelf('Finished');
    expect(finished.getByText('Nothing on this shelf yet')).toBeTruthy();
    fireEvent.click(finished.getByRole('button', { name: 'Choose a book' }));
    expect(screen.getByRole('region', { name: 'Choose a book' })).toHaveFocus();
  });
});
