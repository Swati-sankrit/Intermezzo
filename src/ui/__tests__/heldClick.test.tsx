// Example test for library-v2 task 18.13: a cover click made while the library is still
// loading is held, then opens the book once loading finishes. Real shell and hooks; only
// `load` is delayed and `fetch` serves a small generated EPUB.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import JSZip from 'jszip';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DataStore } from '../../library/localStore';
import { DataStoreProvider } from '../dataStoreContext';
import { LibraryShell } from '../LibraryShell';
import { createOnboardedStore } from './onboardedStore';

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
  zip.file(
    'OEBPS/c1.xhtml',
    `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title></head><body><p>Alpha one.</p><p>Bravo two.</p></body></html>`,
  );
  return zip.generateAsync({ type: 'arraybuffer' });
}

beforeEach(async () => {
  const buf = await makeEpub();
  vi.stubGlobal('fetch', async () => ({ ok: true, arrayBuffer: async () => buf }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('holds a cover click made during loading and opens the book when the load finishes', async () => {
  const inner = createOnboardedStore();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const store: DataStore = {
    ...inner,
    async load() {
      await gate;
      return inner.load();
    },
  };
  render(
    <DataStoreProvider store={store}>
      <LibraryShell />
    </DataStoreProvider>,
  );

  const grid = await screen.findByRole('region', { name: 'Choose a book' });
  fireEvent.click(within(grid).getByRole('button', { name: /Dracula/ }));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
  expect(screen.queryByTestId('active-paragraph')).toBeNull();

  await act(async () => release());
  const paragraph = await screen.findByTestId('active-paragraph');
  expect(paragraph).toHaveTextContent('Alpha one.');
});
