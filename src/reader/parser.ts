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
 * - Chapters whose title is non-empty are always included even if body is empty.
 * - Chapters whose title is empty AND whose body is whitespace-only are skipped.
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
    .filter((ch) => {
      // Always keep chapters that have a title (chapter heading was present).
      if (ch.title !== '') return true;
      // For the pre-heading accumulation (empty title), only keep it when
      // it contains at least one non-whitespace character.
      return ch.text.trim().length > 0;
    });

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
 * Stub for EPUB parsing — will be replaced in task 4.1.
 */
export async function buildEpubBook(
  _fileName: string,
  _buffer: ArrayBuffer,
  _stripHtml: (html: string) => string
): Promise<LoadResult> {
  return { ok: false, error: 'EPUB parsing not yet implemented.' };
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
      return buildTxtBook(file.name, text);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Could not read the file.';
      return { ok: false, error: msg.slice(0, 200) };
    }
  }

  if (name.endsWith('.epub')) {
    try {
      const buffer = await readAsArrayBuffer(file);
      return buildEpubBook(file.name, buffer, stripHtml);
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
