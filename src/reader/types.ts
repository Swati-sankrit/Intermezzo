export interface Book {
  fileName: string;
  title: string;      // never empty; metadata or library title, else file name without extension
  chapters: Chapter[];
  /**
   * Inclusive chapter indices of the story, set only for EPUBs where front or
   * back matter was found. Absent means the whole book is the story.
   * Chapter indices always count from the first chapter of the EPUB.
   */
  story?: { start: number; end: number };
}

export interface Chapter {
  title: string;      // empty string when no heading was found
  text: string;       // plain text; paragraph boundaries are blank lines
}

export interface Paragraph {
  text: string;       // trimmed, guaranteed non-empty
}

export interface Position {
  chapterIndex: number;    // 0-based
  paragraphIndex: number;  // 0-based within the chapter
  savedAt: number;         // Date.now() timestamp
}

export interface StoredState {
  fileName: string;
  position: Position;
  averagePace: number;     // words per minute; always in [50, 1000]
  paceGuideEnabled: boolean;
}

export type LoadResult =
  | { ok: true; book: Book }
  | { ok: false; error: string };   // ≤200 chars, no stack trace, no file path

export type ParseErrorCode =
  | 'too_large'
  | 'bad_encoding'
  | 'empty_content'
  | 'access_denied'
  | 'corrupt_epub'
  | 'missing_spine';

export interface SavedBook {
  fileName: string;
  text: string;
  title?: string;     // absent in books saved by older versions
}
