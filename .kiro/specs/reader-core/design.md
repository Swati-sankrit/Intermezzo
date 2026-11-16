# Design Document

## Overview

Reader-core is the foundational reading module for "Read or Dread". It covers the full lifecycle of a book from file pick to saved reading position: loading `.txt` and `.epub` files in the browser, splitting text into paragraphs, tracking and persisting progress, and calculating a suggested reading pace per paragraph.

The module lives in `src/reader/` and is built as a set of pure TypeScript functions. All business logic is separated from the DOM and from React so every function can be property-tested with fast-check and called from any UI layer. The React components in `src/ui/` import from `src/reader/` and handle rendering and user events.

No bytes of book content leave the device at any point.

## Architecture

The module follows a strict layered architecture:

```
┌──────────────────────────────────────────────────────────────────────┐
│                         src/ui/ (React)                               │
│   ReaderView   LibraryScreen   ParagraphList   ProgressBar            │
│   PaceTimer    ErrorBanner     useReader (hook)                       │
└────────────────────────────┬─────────────────────────────────────────┘
                             │ calls pure functions / hook
┌────────────────────────────▼─────────────────────────────────────────┐
│                       src/reader/ (pure TS)                           │
│   fileIO.ts    parser.ts    splitter.ts    progress.ts                │
│   paceCalc.ts  storage.ts   bookStore.ts   library.ts   types.ts     │
└────────────────────────────┬─────────────────────────────────────────┘
                             │ uses
┌────────────────────────────▼─────────────────────────────────────────┐
│                   Browser APIs / Third-party                           │
│   FileReader API    epub.js (FreeBSD)    localStorage    IndexedDB    │
└──────────────────────────────────────────────────────────────────────┘
```

**Key design decisions:**

- **Pure functions only in `src/reader/`**: every exported function accepts plain data and returns plain data, with no DOM imports, no React imports, and no side effects beyond explicit parameters. `useReader` is a React hook and therefore lives in `src/ui/`; nothing in `src/reader/` imports React. This makes all business logic unit-testable and property-testable without mocking the DOM.
- **epub.js for EPUB parsing**: epub.js (BSD-3-Clause license) accepts an `ArrayBuffer` from the File API, exposes the spine in reading order, and provides async document access per chapter. HTML stripping is done with a browser `DOMParser`, but it is injected as a parameter so the pure functions remain testable in a jsdom environment with a simple regex stub.
- **Single storage module**: all `localStorage` reads and writes are funnelled through `storage.ts`. Nothing else in the module touches `window.localStorage` directly, making error boundaries easier to reason about.
- **Paragraphs derived on demand**: paragraphs are not stored in memory or on disk. `splitIntoParagraphs(chapter.text)` is called whenever a chapter is opened. This avoids storing two copies of the book text in memory and keeps the data model small.

## Dependencies and Licenses

Every package installed by the scaffold task is listed below with its license.

| Package | License | Purpose |
|---|---|---|
| vite | MIT | Build tool and dev server |
| react, react-dom | MIT | UI framework |
| typescript | Apache-2.0 | Type system |
| vitest | MIT | Test runner |
| @vitest/coverage-v8 | MIT | Coverage reporter |
| jsdom | MIT | Browser-like DOM environment for Vitest |
| @testing-library/react | MIT | React component test utilities |
| @testing-library/jest-dom | MIT | DOM assertion matchers |
| fast-check | MIT | Property-based testing |
| fake-indexeddb | Apache-2.0 | In-memory IndexedDB for tests |
| epubjs | FreeBSD | EPUB file parsing in the browser |

## Components and Interfaces

### `src/reader/types.ts`

Shared data types used across all reader modules.

```typescript
export interface Book {
  fileName: string;
  chapters: Chapter[];
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
```

### `src/reader/fileIO.ts`

Handles all browser `FileReader` I/O so that `parser.ts` functions remain purely synchronous / buffer-only.

```typescript
// Reads a File as plain text (UTF-8 or UTF-16 auto-detected by the browser).
// Rejects with a descriptive error message on failure.
export function readAsText(file: File): Promise<string>

// Reads a File as an ArrayBuffer (for EPUB processing).
// Rejects with a descriptive error message on failure.
export function readAsArrayBuffer(file: File): Promise<ArrayBuffer>
```

### `src/reader/parser.ts`

Reads a `File` object and produces a `Book`. All file I/O stays in the browser. `loadBook` calls `fileIO.readAsText` / `fileIO.readAsArrayBuffer` for I/O; `buildTxtBook` and `buildEpubBook` are purely synchronous / buffer-only respectively, with no `FileReader` dependency.

```typescript
// Coordinates file I/O via fileIO.ts and dispatches to buildTxtBook or
// buildEpubBook based on file extension. Enforces the 50 MB size cap for
// .txt files. Resolves with a LoadResult.
export async function loadBook(
  file: File,
  stripHtml: (html: string) => string
): Promise<LoadResult>

// Pure: given raw UTF-8/UTF-16 text, build a Book.
// Splits on chapter heading lines (case-insensitive "Chapter" + number/Roman/word).
// Text before the first heading forms its own chapter.
export function buildTxtBook(fileName: string, text: string): LoadResult

// Pure: given an ArrayBuffer from an .epub file, extract chapters.
// Accepts stripHtml as a dependency to stay testable without a live DOM.
export async function buildEpubBook(
  fileName: string,
  buffer: ArrayBuffer,
  stripHtml: (html: string) => string
): Promise<LoadResult>

// Pure: returns true when a text line is a chapter heading.
// Exported for testing.
// Allows optional leading whitespace.
// Number word list covers one–ninety-nine to avoid matching ordinary sentences.
// Pattern (case-insensitive):
//   /^\s*chapter\s+(\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|
//     eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|
//     twenty-one|...|ninety-nine)[.\s:-]?(\s|$)/i
// Matches: "Chapter I.", "CHAPTER 1.", "Chapter One:", "  Chapter 12 -"
// Rejects: "Chapter" (no number), "chaptered", "Chapter of the story"
export function isChapterHeading(line: string): boolean
```

### `src/reader/splitter.ts`

Splits chapter text into paragraphs.

```typescript
// Splits on one or more consecutive blank lines (lines containing only
// whitespace). Trims each segment. Excludes whitespace-only segments.
export function splitIntoParagraphs(text: string): Paragraph[]

// Joins an array of paragraphs back to a single string with blank-line
// separators. Used by round-trip tests.
export function joinParagraphs(paragraphs: Paragraph[]): string
```

### `src/reader/progress.ts`

Computes reading progress as an integer in `[0, 100]`.

```typescript
// Returns floor((absoluteIdx / totalParagraphs) * 100), clamped to [0, 100].
// Returns 0 when totalParagraphs is 0.
export function calculateProgress(
  absoluteIdx: number,
  totalParagraphs: number
): number

// Returns the zero-based absolute paragraph index across all chapters.
// Splits each chapter with the provided splitFn to count paragraphs.
export function absoluteIndex(
  book: Book,
  position: Pick<Position, 'chapterIndex' | 'paragraphIndex'>,
  splitFn: (text: string) => Paragraph[]
): number

// Counts total paragraphs across all chapters.
export function countTotalParagraphs(
  book: Book,
  splitFn: (text: string) => Paragraph[]
): number
```

### `src/reader/paceCalc.ts`

Estimates the suggested reading time for a paragraph and maintains the rolling average pace.

```typescript
export const DEFAULT_WPM = 200;
export const MIN_WPM = 50;
export const MAX_WPM = 1000;
export const MIN_TIME_SECONDS = 1;
export const MAX_TIME_SECONDS = 600; // 10 minutes

// Returns ceil((wordCount / averagePaceWpm) * 60), minimum 1.
// Falls back to DEFAULT_WPM when averagePaceWpm is not provided or is 0.
export function suggestedSeconds(
  wordCount: number,
  averagePaceWpm?: number
): number

// Counts words by splitting on whitespace runs.
export function countWords(text: string): number

// Returns 0.8 * previousWpm + 0.2 * actualWpm.
// Does NOT clamp; clamping is the caller's responsibility.
export function ewmaUpdate(previousWpm: number, actualWpm: number): number

// Returns the new pace after a paragraph reading event.
// Leaves pace unchanged when timeSeconds < 1, timeSeconds > 600, or wordCount === 0.
// Clamps result to [MIN_WPM, MAX_WPM].
export function updateAveragePace(
  previousWpm: number,
  wordCount: number,
  timeSeconds: number
): number
```

### `src/reader/storage.ts`

All `localStorage` access, funnelled through one module.

```typescript
export const STORAGE_KEY = 'rod_state';

// Serialises and writes state. Silently swallows errors when localStorage
// is unavailable or quota is exceeded.
export function saveState(state: StoredState): void

// Reads and validates state. Returns null when:
// - localStorage is unavailable or the key is absent
// - JSON is malformed
// - chapterIndex or paragraphIndex is not a non-negative integer
// - averagePace is outside [50, 1000]
export function loadState(): StoredState | null

// Removes the stored state entry.
export function clearState(): void
```

### `src/reader/bookStore.ts`

Handles IndexedDB persistence of the most recently loaded book's raw text and file name. Replaces the previous note that "IndexedDB is outside this module's scope."

```typescript
// DB name and store name constants
export const BOOK_DB_NAME = 'rod_books';
export const BOOK_STORE_NAME = 'books';

// Saves the most recently loaded book to IndexedDB.
// Replaces any earlier entry (only one book is kept at a time).
// Never throws: returns false on any error.
export async function saveBook(fileName: string, text: string): Promise<boolean>

// Loads the saved book from IndexedDB.
// Returns null on any error or when no book has been saved.
export async function loadSavedBook(): Promise<{ fileName: string; text: string } | null>

// Removes all stored book entries.
// Never throws: returns false on any error.
export async function clearSavedBook(): Promise<boolean>
```

**Testing:** `bookStore.ts` tests use `fake-indexeddb` (Apache-2.0 license) to provide an in-memory IndexedDB in Vitest. Tests include a round-trip property test: for any string `fileName` and `text`, `saveBook` then `loadSavedBook` returns the same values.

### `src/reader/library.ts`

Static manifest of bundled public-domain books. The `public/books/` directory holds static text files served by Vite as-is; they are fetched via `fetch(entry.filePath)` on library selection. Because Vite strips the `public/` prefix at build time, `filePath` values start with `/books/` (not `public/books/`) so the runtime fetch resolves correctly.

```typescript
export interface LibraryEntry {
  title: string;
  author: string;
  filePath: string;   // relative path from site root, e.g. "/books/sample.txt"
  format: 'txt' | 'epub';
}

// Static manifest of bundled public-domain books.
// Ships with one placeholder entry. The `public/books/` folder must contain
// the actual text file; the app will not write or generate it.
export const LIBRARY: LibraryEntry[] = [
  {
    title: "The Yellow Wallpaper",
    author: "Charlotte Perkins Gilman",
    filePath: "/books/the-yellow-wallpaper.txt",
    format: "txt"
  }
];
```

### `src/ui/LibraryScreen.tsx`

Renders when no book is loaded. Shows the file-picker input and the list of bundled library books. On selection it calls `loadBook` and passes the result up.

### `src/ui/ParagraphList.tsx`

Receives a `Paragraph[]`, the current active index, and an `onAdvance` callback. Renders paragraphs: the first up to `activeIndex` are dimmed; the paragraph at `activeIndex` is active and responds to click and Space/Enter; paragraphs after `activeIndex` are hidden. Provides a scroll-back affordance when the reader is scrolled above the active paragraph.

### `src/ui/ProgressBar.tsx`

Receives a `progress: number` and renders the integer percentage.

### `src/ui/PaceTimer.tsx`

Receives `enabled: boolean`, `suggestedSeconds: number`, and renders the timer icon and countdown when enabled.

### `src/ui/ErrorBanner.tsx`

Receives `error: string | null` and renders the banner when non-null.

### `src/ui/useReader.ts`

A React hook that holds all state (current book, chapter index, paragraph index, active paragraph index, progress, averagePace, paceGuideEnabled, error) and exposes callbacks (`loadBook`, `advance`, `setChapter`, `closeBook`, `togglePaceGuide`). Calls only pure functions from `src/reader/`. Returns derived values (`paragraphs`, `progress`, `suggestedSecs`). The hook is the only place state mutates; components are stateless.

### `src/ui/ReaderView.tsx`

Composes `LibraryScreen`, `ParagraphList`, `ProgressBar`, `PaceTimer`, and `ErrorBanner`. Calls `useReader` for state and callbacks. Contains no logic beyond wiring; stays under 200 lines.

**Next-chapter control:** when the chapter-completion indicator is showing and a later chapter exists, `ReaderView` renders a next-chapter button; clicking it calls `setChapter(currentChapterIndex + 1)` on the `useReader` hook. When the last chapter is finished, no next-chapter button appears.

**Back-to-Library control:** while a book is open, `ReaderView` renders a persistent "Back to Library" control. Activating it clears the current book from state (without erasing the saved position) so `LibraryScreen` renders again. The `useReader` hook exposes a `closeBook()` callback for this.

**Pace Guide toggle:** `ReaderView` renders a toggle to enable or disable the Pace Guide. The toggle state is held in `useReader` as `paceGuideEnabled: boolean` (default `false`; persisted in `localStorage` alongside `StoredState`). `useReader` exposes a `togglePaceGuide()` callback. The toggle's current state is passed to `PaceTimer` as its `enabled` prop.

## Data Models

### Book (in memory)

A `Book` is the in-memory representation produced by the parser. Raw file bytes are not retained after parsing.

```
Book
├── fileName: string        — original file name, used as a storage key
└── chapters: Chapter[]
      ├── title: string     — empty string when no heading was detected
      └── text: string      — plain text with blank-line paragraph separators
```

### Paragraph (derived on demand)

Paragraphs are never stored. `splitIntoParagraphs(chapter.text)` is called whenever the chapter is opened. This avoids storing duplicate content and keeps the in-memory model small.

### StoredState (localStorage)

One JSON blob stored under the key `rod_state`:

```json
{
  "fileName": "moby-dick.epub",
  "position": {
    "chapterIndex": 2,
    "paragraphIndex": 14,
    "savedAt": 1700000000000
  },
  "averagePace": 215
}
```

Raw book text is never written to `localStorage`. The book text is stored in IndexedDB via `bookStore.ts` so it can be restored on next visit.

### Progress (derived)

A whole-number integer in `[0, 100]`, recomputed from `absoluteIndex` and `countTotalParagraphs` whenever the position changes. Not stored separately.

### EPUB Parsing Pipeline

```
File (Blob)
  │  FileReader.readAsArrayBuffer()
  ▼
ArrayBuffer
  │  epubjs Book.open(buffer)
  ▼
epubjs Book (in memory)
  │  book.spine.items  (processing order = spine order)
  │  per item: item.load(book.load.bind(book)) → Document
  │            stripHtml(document.body.innerHTML)
  │            item.unload()
  │            empty chapters silently excluded
  ▼
Chapter[]  →  Book { fileName, chapters }
```

### Chapter Heading Detection (.txt)

A line is treated as a chapter heading when it matches (case-insensitive), with optional leading whitespace and optional trailing punctuation (`.`, `:`, `-`):

```
/^\s*chapter\s+(\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|
  eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|
  twenty-one|...|ninety-nine)[.\s:-]?(\s|$)/i
```

The number-word alternative is an explicit list covering one through ninety-nine, rather than a generic `\w+`, to prevent ordinary sentences from matching.

Examples that match: `Chapter 1`, `CHAPTER IV`, `Chapter One:`, `  Chapter 12 -`, `CHAPTER 1.`  
Examples that do not match: `Chapter` (no number), `chaptered`, `Chapter of the story`  
Text appearing before the first heading forms its own chapter with an empty title.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Paragraph splitting round-trip completeness

*For any* string input, every non-whitespace character present in the original text appears, in its original relative order, in exactly one of the paragraphs produced by `splitIntoParagraphs`. Joining all paragraph texts recovers the complete non-whitespace content of the input.

**Validates: Requirements 3.2, 3.4**

---

### Property 2: No whitespace-only paragraphs

*For any* string input, every paragraph in the output of `splitIntoParagraphs` contains at least one non-whitespace character.

**Validates: Requirements 3.3**

---

### Property 3: Non-empty input produces at least one paragraph

*For any* string containing at least one non-whitespace character, `splitIntoParagraphs` returns a list of length ≥ 1.

**Validates: Requirements 3.5**

---

### Property 4: Chapter splitting completeness

*For any* string passed to `buildTxtBook`, every non-whitespace character present in the original text appears in exactly one of the chapters' text fields in the resulting Book.

**Validates: Requirements 1.2, 1.3, 1.4**

---

### Property 5: No chapter headings means exactly one chapter

*For any* string that contains no chapter heading lines, `buildTxtBook` produces a Book with exactly one Chapter.

**Validates: Requirements 1.4**

---

### Property 6: HTML stripping removes all tag markup

*For any* HTML string, `stripHtml` returns a string that contains no substrings matching `<[a-zA-Z][^>]*>` (opening or closing HTML tags).

**Validates: Requirements 2.3**

---

### Property 7: Book retained on parse error

*For any* valid Book already in memory, when `loadBook` returns a failure result, the previously loaded Book is unchanged.

**Validates: Requirements 1.7, 2.5**

---

### Property 8: Progress formula correctness and bounds

*For any* non-negative `absoluteIdx` and any non-negative `totalParagraphs`, `calculateProgress` returns `floor((absoluteIdx / totalParagraphs) × 100)` clamped to `[0, 100]`, and always returns a value in `[0, 100]`.

**Validates: Requirements 5.1, 5.2**

---

### Property 9: Progress never decreases moving forward

*For any* valid Book and any two positions A and B where A precedes B in reading order (A has a smaller absolute paragraph index), `calculateProgress(A) ≤ calculateProgress(B)`.

**Validates: Requirements 5.3**

---

### Property 10: Position storage round-trip

*For any* valid `StoredState`, saving it with `saveState` and immediately reading it back with `loadState` returns a value structurally equal to the original.

**Validates: Requirements 6.1, 6.2**

---

### Property 11: Invalid position falls back to origin

*For any* stored value that is not a valid Position (malformed JSON, non-integer indices, negative indices, or indices beyond the book's structure), `loadState` returns `null` and the application starts at chapter 0, paragraph 0.

**Validates: Requirements 6.4, 6.5**

---

### Property 16: Book storage round-trip

*For any* `fileName` string and `text` string, calling `saveBook(fileName, text)` and then `loadSavedBook()` returns an object equal to `{ fileName, text }`.

**Validates: Requirements 6.1, 6.3**

---

### Property 12: Suggested time is a positive integer

*For any* word count ≥ 0 and any positive `averagePaceWpm`, `suggestedSeconds` returns a whole number ≥ 1.

**Validates: Requirements 7.1, 7.4**

---

### Property 13: Suggested time grows with word count

*For any* two word counts W1 > W2 ≥ 1 and any positive `averagePaceWpm`, `suggestedSeconds(W1, averagePaceWpm) ≥ suggestedSeconds(W2, averagePaceWpm)`.

**Validates: Requirements 7.2**

---

### Property 14: EWMA formula correctness

*For any* positive `previousWpm` and positive `actualWpm`, `ewmaUpdate(previousWpm, actualWpm)` returns a value within floating-point tolerance of `0.8 × previousWpm + 0.2 × actualWpm`.

**Validates: Requirements 7.6**

---

### Property 15: Average pace stays within bounds

*For any* starting pace in `[50, 1000]` and any sequence of paragraph reading events (varying word count and time), `updateAveragePace` always returns a value in `[50, 1000]`.

**Validates: Requirements 7.8**

---

## Error Handling

### File loading errors

All errors from `loadBook` surface as a `LoadResult` with `ok: false` and a human-readable `error` string. The UI reads this and displays an error banner. No stack traces or file-system paths appear in the message. Every message is capped at 200 characters.

| Condition | Displayed message |
|---|---|
| `.txt` file > 50 MB | "This file is too large to load (max 50 MB)." |
| Unreadable encoding | "Could not read the file: the encoding is not supported." |
| Empty content | "Could not read the file: the file appears to be empty." |
| Access denied | "Could not read the file: permission was denied." |
| Corrupt EPUB / missing spine | "Could not open this EPUB: the file appears to be corrupt or its reading order is missing." |

When a load error occurs and a Book was already loaded, the UI retains the existing Book unchanged and shows the error banner alongside it.

### localStorage unavailability

`saveState` and `loadState` wrap all `localStorage` access in try/catch. When `localStorage` is unavailable or the stored JSON is malformed, `loadState` returns `null` and the app starts from the beginning of the current Book without crashing.

### Invalid or out-of-range saved position

Before restoring a position, `loadState` validates that both `chapterIndex` and `paragraphIndex` are non-negative integers. If validation fails, or if the indices fall outside the loaded Book's structure, `ReaderView` starts at paragraph 0 of chapter 0.

### Zero-paragraph books

`calculateProgress` returns `0` when `totalParagraphs` is `0` (Requirement 5.6). `ReaderView` shows the chapter-completion indicator immediately if no paragraphs exist in the opened chapter.

### Pace guard conditions

`updateAveragePace` leaves the pace unchanged when the time spent on a paragraph is below 1 second or above 600 seconds (10 minutes), or when the paragraph contains zero words. The pace is never updated with a meaningless reading event.

## Testing Strategy

### Dual approach

Unit tests cover specific examples and boundary conditions. Property tests cover universal invariants across the entire input space. Property tests are required; they catch edge cases that example-based tests miss. Unit and integration tests are complementary and cover scenarios that cannot be expressed as universally quantified statements.

### Unit tests (Vitest)

Unit tests focus on specific scenarios that are difficult to express as universally quantified statements:

- `buildTxtBook` with an empty string returns `{ ok: false }`.
- `buildTxtBook` with valid text returns a Book with the full text in one chapter when there are no headings.
- `calculateProgress` returns `0` when `totalParagraphs` is `0`.
- `calculateProgress` returns `100` when `absoluteIdx ≥ totalParagraphs`.
- `calculateProgress` returns `0` when `absoluteIdx` is `0`.
- `loadState` returns `null` when `localStorage` contains invalid JSON.
- `loadState` returns `null` when `chapterIndex` is negative.
- `suggestedSeconds` returns `1` when `wordCount` is `0`.
- `suggestedSeconds` uses `DEFAULT_WPM` (200) when no pace is provided.
- `updateAveragePace` leaves pace unchanged when `timeSeconds < 1`.
- `updateAveragePace` leaves pace unchanged when `timeSeconds > 600`.
- `updateAveragePace` leaves pace unchanged when `wordCount === 0`.
- `ewmaUpdate` returns the correct value for a known input pair.

### Property-based tests (fast-check, minimum 100 runs each)

Each property test is tagged with a comment in the format:
`// Feature: reader-core, Property N: <property text>`

| Property | Function under test | Generator strategy |
|---|---|---|
| 1 | `splitIntoParagraphs` | `fc.string()` — arbitrary unicode strings |
| 2 | `splitIntoParagraphs` | `fc.string()` — arbitrary unicode strings |
| 3 | `splitIntoParagraphs` | `fc.string()` filtered to contain ≥1 non-whitespace char |
| 4 | `buildTxtBook` | `fc.string()` — arbitrary text |
| 5 | `buildTxtBook` | `fc.string()` filtered to contain no chapter heading lines |
| 6 | `stripHtml` | `fc.string()` with arbitrary HTML injected via templates |
| 7 | `loadBook` / `ReaderView` | Generate a random Book, trigger a known-failure load, assert Book unchanged |
| 8 | `calculateProgress` | `fc.nat()` for both absoluteIdx and totalParagraphs |
| 9 | `calculateProgress` | Generate a Book and two ordered positions A < B |
| 10 | `saveState` / `loadState` | `fc.record({ ... })` generating valid StoredState shapes |
| 11 | `loadState` | `fc.string()` for malformed JSON; `fc.record` with out-of-range indices |
| 10b (16) | `saveBook` / `loadSavedBook` | `fc.string()` for fileName; `fc.string()` for text — uses fake-indexeddb |
| 12 | `suggestedSeconds` | `fc.nat()` for wordCount; `fc.integer({ min: 1, max: 2000 })` for pace |
| 13 | `suggestedSeconds` | `fc.tuple(fc.nat({ max: 1000 }), fc.nat({ max: 1000 }))` with W1 > W2 ≥ 1 |
| 14 | `ewmaUpdate` | `fc.float({ min: 1, max: 2000 })` for both inputs |
| 15 | `updateAveragePace` | `fc.array(fc.record({ wordCount, timeSeconds }))` — sequences of events |

**Library:** fast-check (MIT license), already in the project stack.  
Each property test uses `fc.assert(fc.property(...), { numRuns: 100 })`.

### Integration tests

- Load a real small `.txt` fixture (< 1 KB) end-to-end through `loadBook` and verify the chapter count and that all source characters are present in the Book.
- Load a minimal valid `.epub` fixture end-to-end through `loadBook` and verify chapter titles and text are non-empty strings.
- Simulate a full advance sequence in `ReaderView` with React Testing Library and verify progress values match the formula at each step.
- Simulate app reload with a saved `StoredState` and verify `ReaderView` restores the correct paragraph.

### Test file locations

```
src/reader/__tests__/
  fileIO.unit.test.ts
  parser.unit.test.ts
  parser.prop.test.ts
  splitter.unit.test.ts
  splitter.prop.test.ts
  progress.unit.test.ts
  progress.prop.test.ts
  paceCalc.unit.test.ts
  paceCalc.prop.test.ts
  storage.unit.test.ts
  storage.prop.test.ts
  bookStore.unit.test.ts
  bookStore.prop.test.ts
src/ui/__tests__/
  ReaderView.integration.test.tsx
```
