// Reads a book from a picked file or from the app's own origin, then parses it.
// Returns the Book plus the text to keep in IndexedDB. Never throws.
import { readAsArrayBuffer, readAsText } from '../reader/fileIO';
import { stripGutenbergBoilerplate } from '../reader/gutenberg';
import type { LibraryEntry } from '../reader/library';
import { buildEpubBook, buildTxtBook } from '../reader/parser';
import { chaptersToStoredText } from '../reader/bookCodec';
import { stripHtml } from '../reader/stripHtml';
import { resolveTitle } from '../reader/title';
import type { Book } from '../reader/types';

export type Loaded = { ok: true; book: Book; storedText: string } | { ok: false; error: string };

const UNSUPPORTED = 'Unsupported file type. Please choose a .txt or .epub file.';
const FETCH_FAILED = 'Could not open this book from the library. Please try again.';

function message(err: unknown): string {
  return (err instanceof Error ? err.message : 'Could not read the file.').slice(0, 200);
}

async function fromText(fileName: string, raw: string, title?: string): Promise<Loaded> {
  const text = stripGutenbergBoilerplate(raw);
  const r = buildTxtBook(fileName, text, title);
  return r.ok ? { ok: true, book: r.book, storedText: text } : r;
}

async function fromBuffer(fileName: string, buffer: ArrayBuffer, title?: string): Promise<Loaded> {
  const r = await buildEpubBook(fileName, buffer, stripHtml);
  if (!r.ok) return r;
  // A library entry's title wins over the EPUB's own metadata.
  const book = title ? { ...r.book, title: resolveTitle(title, fileName) } : r.book;
  return { ok: true, book, storedText: chaptersToStoredText(book) };
}

export async function loadFromFile(file: File): Promise<Loaded> {
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith('.txt')) return await fromText(file.name, await readAsText(file));
    if (name.endsWith('.epub')) return await fromBuffer(file.name, await readAsArrayBuffer(file));
    return { ok: false, error: UNSUPPORTED };
  } catch (err) {
    return { ok: false, error: message(err) };
  }
}

export async function loadFromLibrary(entry: LibraryEntry): Promise<Loaded> {
  const fileName = entry.filePath.split('/').pop() ?? entry.title;
  try {
    // Relative to our own origin only (library paths start with "/books/").
    const res = await fetch(entry.filePath);
    if (!res.ok) return { ok: false, error: FETCH_FAILED };
    return entry.format === 'epub'
      ? await fromBuffer(fileName, await res.arrayBuffer(), entry.title)
      : await fromText(fileName, await res.text(), entry.title);
  } catch {
    return { ok: false, error: FETCH_FAILED };
  }
}
