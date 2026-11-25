// Example tests for the Continue card and progress flow (library-v2, task 5.5).
// Real LibraryShell, LibraryScreen, useLibrary, useReader and EPUB parser, with the in-memory
// store provided through context. Only `fetch` is stubbed, to serve a small generated EPUB.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOnboardedStore, ONBOARDED_MODEL } from './onboardedStore';
import type { DataStore, Result } from '../../library/localStore';
import type { DataModel } from '../../library/model';
import { addBookEntry, savePosition } from '../../library/shelfOps';
import { DataStoreProvider } from '../dataStoreContext';
import { LIBRARY_MESSAGES } from '../libraryMessages';
import { LibraryShell } from '../LibraryShell';

const SLUG = 'bram-stoker/dracula';
const PARAS = ['Alpha one.', 'Bravo two.', 'Charlie three.', 'Delta four.', 'Echo five.'];

async function makeEpub(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">x</dc:identifier><dc:title>Fixture</dc:title><dc:language>en</dc:language></metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>`,
  );
  const body = PARAS.map((p) => `<p>${p}</p>`).join('');
  zip.file(
    'OEBPS/c1.xhtml',
    `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title></head><body>${body}</body></html>`,
  );
  return zip.generateAsync({ type: 'arraybuffer' });
}

/** A store whose `save` fails on demand; everything else is the real in-memory store. */
function failableStore(inner: DataStore) {
  const flags = { failSave: false };
  const store: DataStore = {
    ...inner,
    async save(model: DataModel): Promise<Result<void>> {
      return flags.failSave ? { ok: false, kind: 'unavailable' } : inner.save(model);
    },
  };
  return { store, flags };
}

async function seed(store: DataStore, position?: { chapterIndex: number; paragraphIndex: number; progress: number }) {
  let m = addBookEntry(ONBOARDED_MODEL, {
    bookId: SLUG,
    title: 'Dracula',
    author: 'Bram Stoker',
    fileName: 'dracula.epub',
    source: 'catalogue',
    format: 'epub',
    catalogueSlug: SLUG,
    addedAt: 1,
  });
  if (position) m = savePosition(m, SLUG, { ...position, savedAt: 5 });
  expect((await store.save(m)).ok).toBe(true);
}

const show = (store: DataStore) =>
  render(
    <DataStoreProvider store={store}>
      <LibraryShell />
    </DataStoreProvider>,
  );
// Shelf buttons also carry the title (visually hidden), so scope cover queries to the catalogue.
// The cover grid renders before the store has loaded, and a cover click is ignored until then
// (LibraryShell.openCatalogue). Wait for the Continue card, which replaces its skeleton only
// once the library is ready, so the click is never made during loading.
const coverButton = async () => {
  await screen.findByRole('region', { name: 'Continue reading' });
  return within(await screen.findByRole('region', { name: 'Choose a book' })).getByRole('button', { name: /Dracula/ });
};
const active = () => screen.getByTestId('active-paragraph');
const savedModel = async (store: DataStore) => {
  const r = await store.load();
  if (!r.ok) throw new Error('load failed');
  return r.value;
};

beforeEach(async () => {
  const buf = await makeEpub();
  vi.stubGlobal('fetch', async () => ({ ok: true, arrayBuffer: async () => buf }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Continue card and progress flow', () => {
  it('shows "Choose a book" on an empty shelf', async () => {
    show(createOnboardedStore());
    const card = await screen.findByRole('region', { name: 'Continue reading' });
    expect(within(card).getByText(/shelf is quiet/i)).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Choose a book' })).toBeTruthy();
  });

  it('opening a catalogue book creates one entry on reading; progress is saved; reopening reuses the entry and restores the place', async () => {
    const store = createOnboardedStore();
    show(store);
    fireEvent.click(await coverButton());
    await screen.findByTestId('active-paragraph');
    expect(active()).toHaveTextContent('Alpha one.');
    fireEvent.click(active());
    expect(active()).toHaveTextContent('Bravo two.');
    // Saved within 500 ms of the chunk opening (Requirement 5.1).
    await waitFor(async () => expect((await savedModel(store)).positions[SLUG]?.paragraphIndex).toBe(1), { timeout: 2000 });
    let model = await savedModel(store);
    expect(model.shelves.reading).toEqual([SLUG]);
    expect(Object.keys(model.books)).toEqual([SLUG]);
    expect(model.positions[SLUG].progress).toBe(20);

    // Leave, then open the same book again from the cover card.
    fireEvent.click(screen.getByRole('button', { name: 'Back to library' }));
    fireEvent.click(await coverButton());
    await screen.findByTestId('active-paragraph');
    expect(active()).toHaveTextContent('Bravo two.');
    model = await savedModel(store);
    expect(model.shelves.reading).toEqual([SLUG]);
    expect(Object.keys(model.books)).toEqual([SLUG]);
  });

  it('shows the progress bar and whole percentage on the Continue card and the cover card; Continue opens the saved place', async () => {
    const store = createOnboardedStore();
    await seed(store, { chapterIndex: 0, paragraphIndex: 2, progress: 40 });
    show(store);
    const card = await screen.findByRole('region', { name: 'Continue reading' });
    const bar = await within(card).findByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('40');
    expect(within(card).getByText('40%')).toBeTruthy();
    const cover = await coverButton();
    expect(within(cover).getByText('40%')).toBeTruthy();

    fireEvent.click(within(card).getByRole('button', { name: 'Continue' }));
    await screen.findByTestId('active-paragraph');
    expect(active()).toHaveTextContent('Charlie three.');
  });

  it('clamps a Position past the end to the last paragraph with no error', async () => {
    const store = createOnboardedStore();
    await seed(store, { chapterIndex: 9, paragraphIndex: 99, progress: 80 });
    show(store);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    await screen.findByTestId('active-paragraph');
    expect(active()).toHaveTextContent('Echo five.');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/could not be restored/i)).toBeNull();
  });

  it('keeps the reader on the chunk and shows the message when a position save fails; the earlier Position is kept', async () => {
    const { store, flags } = failableStore(createOnboardedStore());
    await seed(store, { chapterIndex: 0, paragraphIndex: 1, progress: 20 });
    show(store);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    await screen.findByTestId('active-paragraph');
    flags.failSave = true;
    fireEvent.click(active());
    await new Promise((r) => setTimeout(r, 300));
    expect(active()).toHaveTextContent('Charlie three.');
    expect((await savedModel(store)).positions[SLUG].paragraphIndex).toBe(1);
    // The message is held by the library; it shows when the reader steps back.
    fireEvent.click(screen.getByRole('button', { name: 'Back to library' }));
    expect(await screen.findByText(LIBRARY_MESSAGES.positionSaveFailed)).toBeTruthy();
  });

  it('shows a dismissible banner in the reader when a position save fails, and clears it after a later successful save', async () => {
    const { store, flags } = failableStore(createOnboardedStore());
    await seed(store, { chapterIndex: 0, paragraphIndex: 0, progress: 0 });
    show(store);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    await screen.findByTestId('active-paragraph');
    expect(screen.queryByText(LIBRARY_MESSAGES.positionSaveFailed)).toBeNull();

    flags.failSave = true;
    fireEvent.click(active());
    const banner = await screen.findByText(LIBRARY_MESSAGES.positionSaveFailed, undefined, { timeout: 2000 });
    expect(banner.closest('[role="status"]')).toBeTruthy();
    // Reading stays usable while the banner is up.
    fireEvent.click(active());
    expect(active()).toHaveTextContent('Charlie three.');

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(LIBRARY_MESSAGES.positionSaveFailed)).toBeNull();

    // Fail again, then let a save succeed: the banner clears by itself.
    fireEvent.click(active());
    expect(active()).toHaveTextContent('Delta four.');
    expect(await screen.findByText(LIBRARY_MESSAGES.positionSaveFailed, undefined, { timeout: 2000 })).toBeTruthy();
    flags.failSave = false;
    fireEvent.click(active());
    expect(active()).toHaveTextContent('Echo five.');
    await waitFor(async () => expect((await savedModel(store)).positions[SLUG].paragraphIndex).toBe(4), { timeout: 2000 });
    await waitFor(() => expect(screen.queryByText(LIBRARY_MESSAGES.positionSaveFailed)).toBeNull());
  });
});
