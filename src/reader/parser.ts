/**
 * parser.ts — Book parsing: .txt chapter splitting and .epub dispatch.
 *
 * Rules:
 * - This file must NOT import FileReader directly.
 * - All file I/O is received as a plain string (for .txt) or ArrayBuffer
 *   (for .epub) from fileIO.ts.
 * - All error messages are ≤200 chars, contain no stack traces or file paths.
 */

import { readAsArrayBuffer, readAsText } from './fileIO';
import { stripGutenbergBoilerplate } from './gutenberg';
import type { Book, LoadResult } from './types';

// ---------------------------------------------------------------------------
// Number-word list covering one through ninety-nine (explicit, not \w+).
// ---------------------------------------------------------------------------
const NUMBER_WORDS =
  'one|two|three|four|five|six|seven|eight|nine|ten|' +
  'eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|' +
  'twenty-one|twenty-two|twenty-three|twenty-four|twenty-five|twenty-six|twenty-seven|twenty-eight|twenty-nine|' +
  'thirty|thirty-one|thirty-two|thirty-three|thirty-four|thirty-five|thirty-six|thirty-seven|thirty-eight|thirty-nine|' +
  'forty|forty-one|forty-two|forty-three|forty-four|forty-five|forty-six|forty-seven|forty-eight|forty-nine|' +
  'fifty|fifty-one|fifty-two|fifty-three|fifty-four|fifty-five|fifty-six|fifty-seven|fifty-eight|fifty-nine|' +
  'sixty|sixty-one|sixty-two|sixty-three|sixty-four|sixty-five|sixty-six|sixty-seven|sixty-eight|sixty-nine|' +
  'seventy|seventy-one|seventy-two|seventy-three|seventy-four|seventy-five|seventy-six|seventy-seven|seventy-eight|seventy-nine|' +
  'eighty|eighty-one|eighty-two|eighty-three|eighty-four|eighty-five|eighty-six|eighty-seven|eighty-eight|eighty-nine|' +
  'ninety|ninety-one|ninety-two|ninety-three|ninety-four|ninety-five|ninety-six|ninety-seven|ninety-eight|ninety-nine';

/**
 * Matches lines like:
 *   "Chapter 1", "CHAPTER IV", "Chapter I.", "CHAPTER 1.", "Chapter One:", "  Chapter 12 -"
 *
 * Does NOT match:
 *   "Chapter" (no number), "chaptered", "Chapter of the story", "Chapter house was cold"
 */
const CHAPTER_HEADING_RE = new RegExp(
  `^\\s*chapter\\s+(\\d+|[ivxlcdm]+|${NUMBER_WORDS})\\s*[.:-]?(\\s|$)`,
  'i'
);

/**
 * Returns true when the given line is a chapter heading.
 */
export function isChapterHeading(line: string): boolean {
  return CHAPTER_HEADING_RE.test(line);
}

/**
 * Builds a Book from raw UTF-8/UTF-16 text. Pure function — no FileReader.
 *
 * - Returns `{ ok: false }` when the text has no non-whitespace characters.
 * - Splits on chapter heading lines. Text before the first heading forms a
 *   chapter with an empty title (omitted when it has no non-whitespace chars).
 * - Heading line becomes the chapter title (trimmed); subsequent lines until
 *   the next heading are the chapter text (joined with '\n').
 * - Chapters whose body is whitespace-only are dropped, even if titled.
 */
export function buildTxtBook(fileName: string, text: string): LoadResult {
  if (text.trim().length === 0) {
    return {
      ok: false,
      error: 'Could not read the file: the file appears to be empty.',
    };
  }

  const lines = text.split('\n');

  // Collect raw chapter segments: each is { title, lines[] }
  type Segment = { title: string; lines: string[] };
  const segments: Segment[] = [];
  let current: Segment = { title: '', lines: [] };

  for (const line of lines) {
    if (isChapterHeading(line)) {
      // Push what we have so far, start a new segment.
      segments.push(current);
      current = { title: line.trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  // Push the final segment.
  segments.push(current);

  // Convert segments to chapters, filtering as specified.
  const chapters = segments
    .map((seg) => ({
      title: seg.title,
      text: seg.lines.join('\n'),
    }))
    // Drop any chapter with no body text, titled or not. This removes
    // table-of-contents lines (e.g. Gutenberg "CHAPTER I.") that would
    // otherwise become empty chapters.
    .filter((ch) => ch.text.trim().length > 0);

  // Build the Book. If filtering left no chapters, treat as empty.
  if (chapters.length === 0) {
    return {
      ok: false,
      error: 'Could not read the file: the file appears to be empty.',
    };
  }

  const book: Book = { fileName, chapters };
  return { ok: true, book };
}

/**
 * Parses an EPUB ArrayBuffer into a Book using epub.js.
 *
 * Pipeline:
 *   ArrayBuffer
 *   → epub.js Book.open(buffer)
 *   → traverse spine.spineItems in order
 *   → per item: load document, stripHtml(body.innerHTML), unload
 *   → silently exclude items whose stripped text is empty
 *   → return Book { fileName, chapters }
 *
 * Returns `{ ok: false }` with a ≤200-char message when:
 *   - the buffer is not a valid EPUB (open rejects)
 *   - the spine is missing or has no items after opening
 *
 * Does NOT import FileReader; receives a plain ArrayBuffer.
 * Does NOT import React.
 */
export async function buildEpubBook(
  fileName: string,
  buffer: ArrayBuffer,
  stripHtml: (html: string) => string
): Promise<LoadResult> {
  const CORRUPT_MSG =
    'Could not open this EPUB: the file appears to be corrupt or its reading order is missing.';

  // Lazy import so the module stays testable in environments without a full
  // DOM; the caller (loadBook) only reaches this branch for .epub files.
  const ePubModule = await import('epubjs');
  // The default export is the Epub factory function.
  const Epub = ePubModule.default;

  let book: ReturnType<typeof Epub> | undefined;

  try {
    book = Epub();
    await book.open(buffer);
  } catch {
    book?.destroy();
    return { ok: false, error: CORRUPT_MSG };
  }

  // spine.spineItems is populated after open() resolves.
  const spineItems = (book.spine as unknown as { spineItems: unknown[] })
    .spineItems;

  if (!Array.isArray(spineItems) || spineItems.length === 0) {
    book.destroy();
    return { ok: false, error: CORRUPT_MSG };
  }

  // Build a href → label map from the navigation TOC so we can assign titles.
  // navigation may not be populated for every EPUB, so we fall back to ''.
  type TocItem = { href?: string; label?: string; subitems?: TocItem[] };
  const tocLabelByHref = new Map<string, string>();
  const addToc = (items: TocItem[]): void => {
    for (const item of items) {
      if (item.href && item.label) {
        // Strip any fragment identifier when looking up by href.
        const hrefWithoutFragment = item.href.split('#')[0];
        // First entry for a file wins (usually the chapter's own title).
        if (!tocLabelByHref.has(hrefWithoutFragment)) {
          tocLabelByHref.set(hrefWithoutFragment, item.label.trim());
        }
      }
      if (Array.isArray(item.subitems)) addToc(item.subitems);
    }
  };
  try {
    // book.navigation is undefined until loaded.navigation resolves.
    const nav = await book.loaded.navigation;
    if (nav && Array.isArray(nav.toc)) addToc(nav.toc as TocItem[]);
  } catch {
    // Navigation is optional; continue without titles.
  }

  const chapters: Array<{ title: string; text: string }> = [];

  for (const rawItem of spineItems) {
    // Each entry in spineItems is a Section.
    const section = rawItem as {
      href?: string;
      // epub.js resolves load() with the root <html> Element (section.contents),
      // not a Document; the parsed Document is stored on section.document.
      load: (req: unknown) => Promise<Element>;
      unload: () => void;
      document?: Document;
    };

    let doc: Document;
    try {
      const root = await section.load(book.load.bind(book));
      doc = section.document ?? root.ownerDocument;
    } catch {
      // A single unloadable section is silently skipped.
      continue;
    }

    let text = '';
    try {
      const body = doc.body ?? doc.documentElement;
      text = stripHtml(body?.innerHTML ?? '').trim();
    } catch {
      // If stripping fails for this item, treat it as empty (skip below).
    }

    section.unload();

    if (text.length === 0) {
      // Silently exclude empty-text chapters as specified.
      continue;
    }

    // Look up a TOC label for this section's href (sans fragment).
    const hrefKey = section.href ? section.href.split('#')[0] : '';
    // Fallback: "Chapter N", N = 1-based position among kept chapters.
    const title = tocLabelByHref.get(hrefKey) || `Chapter ${chapters.length + 1}`;

    chapters.push({ title, text });
  }

  book.destroy();

  if (chapters.length === 0) {
    return { ok: false, error: CORRUPT_MSG };
  }

  return { ok: true, book: { fileName, chapters } };
}

/**
 * Loads a book from a File, dispatching to the appropriate parser.
 *
 * - `.txt`: reads as text, calls `buildTxtBook`.
 * - `.epub`: reads as ArrayBuffer, calls `buildEpubBook`.
 * - Other extensions: returns an unsupported-type error.
 *
 * All rejected-promise messages are already human-readable (from fileIO.ts)
 * and are clamped to 200 chars.
 */
export async function loadBook(
  file: File,
  stripHtml: (html: string) => string
): Promise<LoadResult> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.txt')) {
    try {
      const text = await readAsText(file);
      return buildTxtBook(file.name, stripGutenbergBoilerplate(text));
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Could not read the file.';
      return { ok: false, error: msg.slice(0, 200) };
    }
  }

  if (name.endsWith('.epub')) {
    try {
      const buffer = await readAsArrayBuffer(file);
      return await buildEpubBook(file.name, buffer, stripHtml);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Could not read the file.';
      return { ok: false, error: msg.slice(0, 200) };
    }
  }

  return {
    ok: false,
    error: 'Unsupported file type. Please choose a .txt or .epub file.',
  };
}
