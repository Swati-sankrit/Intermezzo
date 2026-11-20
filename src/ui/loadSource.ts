// Reads a book from a picked file or from the app's own origin, then parses it.
// Returns the Book plus the text to keep in IndexedDB. Never throws.
import { readAsArrayBuffer, readAsText } from '../reader/fileIO';
import { stripGutenbergBoilerplate } from '../reader/gutenberg';
import type { LibraryEntry } from '../reader/library';
import { buildEpubBook, buildTxtBook } from '../reader/parser';
import { chaptersToStoredText } from '../reader/bookCodec';
import { stripHtml } from '../reader/stripHtml';
import type { Book } from '../reader/types';

export type Loaded = { ok: true; book: Book; storedText: string } | { ok: false; error: string };

const UNSUPPORTED = 'Unsupported file type. Please choose a .txt or .epub file.';
const FETCH_FAILED = 'Could not open this book from the library. Please try again.';

function message(err: unknown): string {
  return (err instanceof Error ? err.message : 'Could not read the file.').slice(0, 200);
}

async function fromText(fileName: string, raw: string): Promise<Loaded> {
  const text = stripGutenbergBoilerplate(raw);
  const r = buildTxtBook(fileName, text);
  return r.ok ? { ok: true, book: r.book, storedText: text } : r;
}

async function fromBuffer(fileName: string, buffer: ArrayBuffer): Promise<Loaded> {
  const r = await buildEpubBook(fileName, buffer, stripHtml);
  return r.ok ? { ok: true, book: r.book, storedText: chaptersToStoredText(r.book) } : r;
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
      ? await fromBuffer(fileName, await res.arrayBuffer())
      : await fromText(fileName, await res.text());
  } catch {
    return { ok: false, error: FETCH_FAILED };
  }
}
