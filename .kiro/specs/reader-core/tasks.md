# Implementation Plan: Reader-Core

## Overview

Implement the foundational reading module for "Read or Dread" in TypeScript. The module lives in `src/reader/` and exposes pure functions for parsing, splitting, progress, pace, and storage. Small React components in `src/ui/`, driven by a `useReader` hook, wire these together. All business logic is DOM-free and property-tested with fast-check.

## Tasks

- [x] 0. Scaffold the project
  - [x] 0.1 Create the Vite + React + TypeScript app in the repo root
    - Run `npm create vite@latest . -- --template react-ts` to scaffold into the workspace root
    - The folder is not empty. If asked, choose "Ignore files and continue". NEVER choose "Remove existing files": `.kiro/`, `LICENSE`, `PLAN.md`, and `docs/` must survive
    - Confirm that `index.html`, `vite.config.ts`, `src/main.tsx`, and `tsconfig.json` are created, and that `.kiro/`, `LICENSE`, `PLAN.md`, and `docs/` still exist
    - Confirm `.kiro` is not listed in `.gitignore`
    - Fetch current Vite docs before running any commands; do not rely on remembered CLI flags
    - _Requirements: none — project infrastructure_
  - [x] 0.2 Install dependencies
    - Install production deps: `epubjs`
    - Install dev deps: `vitest`, `@vitest/coverage-v8`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `fast-check`, `fake-indexeddb`
    - Check each package's license in its own package.json after install and list them in `README.md`
    - _Requirements: none — project infrastructure_
  - [x] 0.3 Configure Vitest with the jsdom environment
    - In `vite.config.ts`, add a `test` block with `environment: 'jsdom'`, `globals: true`, and a `setupFiles` pointing to a `src/test/setup.ts` that imports `@testing-library/jest-dom`
    - Fetch current Vitest configuration docs before writing the config
    - _Requirements: none — project infrastructure_
  - [x] 0.4 Add "test" and "build" scripts and confirm both succeed
    - Ensure `package.json` has `"test": "vitest --run"` and `"build": "vite build"`
    - Run `npm run build` and confirm it exits 0
    - Run `npm test` with the placeholder `src/test/setup.ts` and confirm it exits 0
    - _Requirements: none — project infrastructure_

- [ ] 1. Create shared types and project structure
  - Create `src/reader/types.ts` with `Book`, `Chapter`, `Paragraph`, `Position`, `StoredState`, `LoadResult`, and `ParseErrorCode` types exactly as defined in the design
  - Create empty barrel files (`src/reader/index.ts`) to establish the module boundary
  - Set up `src/reader/__tests__/` and `src/ui/__tests__/` directories
  - _Requirements: 1.1, 2.1, 3.1, 5.1, 6.1, 7.1_

- [ ] 2. Implement the paragraph splitter
  - [ ] 2.1 Implement `splitIntoParagraphs` and `joinParagraphs` in `src/reader/splitter.ts`
    - Split on one or more consecutive blank lines (lines containing only whitespace)
    - Trim each segment; exclude any segment that is all whitespace
    - `joinParagraphs` rejoins with blank-line separators for round-trip tests
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ] 2.2 Write property tests for the splitter (`src/reader/__tests__/splitter.prop.test.ts`)
    - **Property 1: Round-trip completeness** — joining all paragraphs loses no non-whitespace characters (`fc.string()`)
    - **Property 2: No whitespace-only paragraphs** — every paragraph in output has ≥1 non-whitespace character (`fc.string()`)
    - **Property 3: Non-empty input produces ≥1 paragraph** — filtered to strings with ≥1 non-whitespace char
    - _Requirements: 3.2, 3.3, 3.5_

  - [ ]* 2.3 Write unit tests for the splitter (`src/reader/__tests__/splitter.unit.test.ts`)
    - Empty string returns empty list
    - Whitespace-only string returns empty list
    - Single block with no blank lines returns one paragraph
    - Two blocks separated by one blank line return two paragraphs
    - Multiple consecutive blank lines between blocks still produce exactly two paragraphs
    - _Requirements: 3.1, 3.3, 3.5_

- [ ] 3. Implement the `.txt` parser
  - [ ] 3.0 Implement `src/reader/fileIO.ts`
    - Implement `readAsText(file: File): Promise<string>` using `FileReader.readAsText`; enforce the 50 MB size cap; reject with a descriptive message on failure
    - Implement `readAsArrayBuffer(file: File): Promise<ArrayBuffer>` using `FileReader.readAsArrayBuffer`; reject with a descriptive message on failure
    - `buildTxtBook` and `buildEpubBook` must NOT import FileReader; they receive plain `string` / `ArrayBuffer` inputs
    - Add a small unit test file `src/reader/__tests__/fileIO.unit.test.ts` to verify the 50 MB rejection and the error message format
    - _Requirements: 1.1, 1.5, 2.2_

  - [ ] 3.1 Implement `isChapterHeading`, `buildTxtBook`, and the `loadBook` dispatcher in `src/reader/parser.ts`
    - `isChapterHeading`: allows optional leading whitespace and optional trailing punctuation (`.`, `:`, `-`). Number words are an explicit list (one to ninety-nine), not `\w+`, so ordinary sentences do not match. Pattern: `/^\s*chapter\s+(\d+|[ivxlcdm]+|one|two|...|ninety-nine)\s*[.:-]?(\s|$)/i`
    - `buildTxtBook`: split on heading lines; text before first heading forms its own chapter; return `{ ok: false }` on empty content
    - `loadBook`: read via `fileIO.readAsArrayBuffer` for `.epub`, `fileIO.readAsText` for `.txt`; dispatch to `buildTxtBook` or `buildEpubBook`; map errors to human-readable messages ≤200 chars with no stack traces or file paths
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [ ] 3.2 Write property tests for the `.txt` parser (`src/reader/__tests__/parser.prop.test.ts`)
    - **Property 4: Chapter splitting completeness** — every non-whitespace char in input appears in exactly one chapter (`fc.string()`)
    - **Property 5: No headings → exactly one chapter** — filtered to strings with no chapter heading lines
    - _Requirements: 1.2, 1.3, 1.4_

  - [ ]* 3.3 Write unit tests for the `.txt` parser (`src/reader/__tests__/parser.unit.test.ts`)
    - `buildTxtBook` with empty string returns `{ ok: false }`
    - `buildTxtBook` with no headings returns one chapter containing full text
    - `buildTxtBook` with multiple headings returns correct chapter count and titles
    - Text before first heading forms its own chapter with empty title
    - `isChapterHeading` matches `"Chapter 1"`, `"CHAPTER IV"`, `"Chapter I."`, `"CHAPTER 1."`, `"Chapter One:"`, `"  Chapter 12 -"`
    - `isChapterHeading` rejects `"Chapter"` (no number), `"chaptered"`, `"Chapter of the story"`, `"Chapter house was cold"`
    - `loadBook` returns `too_large` error for `.txt` > 50 MB
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6_

- [ ] 4. Implement the EPUB parser
  - [ ] 4.1 Implement `buildEpubBook` in `src/reader/parser.ts`
    - Accept `ArrayBuffer` and `stripHtml` function parameter; use epub.js to open the buffer
    - Fetch current epub.js docs first; confirm the spine and section-loading methods exist before using them
    - Traverse the spine in order; per item, load the document, call `stripHtml` on its body HTML, then unload
    - Silently exclude chapters whose text is empty after stripping
    - Return `{ ok: false }` with a ≤200-char message for corrupt file or missing spine
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ] 4.2 Write property tests for HTML stripping (`src/reader/__tests__/parser.prop.test.ts`)
    - **Property 6: HTML stripping removes all tag markup** — for any HTML string, output contains no substrings matching `<[a-zA-Z][^>]*>` (use `fc.string()` with injected HTML templates)
    - _Requirements: 2.3_

  - [ ]* 4.3 Write unit tests for the EPUB parser (`src/reader/__tests__/parser.unit.test.ts`)
    - Load a minimal valid `.epub` fixture; verify chapter titles and text are non-empty strings
    - Corrupt buffer returns `{ ok: false }` with message ≤200 chars containing no stack trace
    - Empty-text chapters are excluded from output
    - _Requirements: 2.1, 2.3, 2.4_

- [ ] 5. Checkpoint — Ensure all tests pass
  - Run `vitest --run src/reader/__tests__/splitter.*` and `src/reader/__tests__/parser.*`; ask the user if any failures arise before continuing.

- [ ] 6. Implement progress calculation
  - [ ] 6.1 Implement `calculateProgress`, `absoluteIndex`, and `countTotalParagraphs` in `src/reader/progress.ts`
    - `calculateProgress(absoluteIdx, totalParagraphs)`: `floor((absoluteIdx / totalParagraphs) * 100)` clamped to `[0, 100]`; return `0` when `totalParagraphs === 0`
    - `absoluteIndex`: sum paragraph counts of all chapters before `chapterIndex`, then add `paragraphIndex`
    - `countTotalParagraphs`: sum paragraph counts across all chapters
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ] 6.2 Write property tests for progress (`src/reader/__tests__/progress.prop.test.ts`)
    - **Property 8: Progress formula correctness and bounds** — for any `fc.nat()` pair `(absoluteIdx, totalParagraphs)`, result equals `floor(absoluteIdx/totalParagraphs*100)` clamped to `[0,100]`
    - **Property 9: Progress never decreases moving forward** — generate a Book and two ordered positions A < B, assert `calculateProgress(A) ≤ calculateProgress(B)`
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ]* 6.3 Write unit tests for progress (`src/reader/__tests__/progress.unit.test.ts`)
    - Returns `0` when `totalParagraphs === 0`
    - Returns `0` when `absoluteIdx === 0`
    - Returns `100` when `absoluteIdx >= totalParagraphs`
    - Midpoint example returns expected floor value
    - _Requirements: 5.4, 5.5, 5.6_

- [ ] 7. Implement pace calculation
  - [ ] 7.1 Implement `suggestedSeconds`, `countWords`, `ewmaUpdate`, and `updateAveragePace` in `src/reader/paceCalc.ts`
    - `suggestedSeconds(wordCount, averagePaceWpm?)`: `ceil((wordCount / (averagePaceWpm ?? DEFAULT_WPM)) * 60)`, minimum 1; return 1 when `wordCount === 0`
    - `countWords(text)`: split on whitespace runs
    - `ewmaUpdate(previousWpm, actualWpm)`: `0.8 * previousWpm + 0.2 * actualWpm` (no clamping)
    - `updateAveragePace(previousWpm, wordCount, timeSeconds)`: skip update when `timeSeconds < 1`, `timeSeconds > 600`, or `wordCount === 0`; clamp result to `[MIN_WPM, MAX_WPM]`
    - Export constants `DEFAULT_WPM = 200`, `MIN_WPM = 50`, `MAX_WPM = 1000`, `MIN_TIME_SECONDS = 1`, `MAX_TIME_SECONDS = 600`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [ ] 7.2 Write property tests for pace (`src/reader/__tests__/paceCalc.prop.test.ts`)
    - **Property 12: Suggested time is a positive integer** — `fc.nat()` for wordCount, `fc.integer({ min: 1, max: 2000 })` for pace
    - **Property 13: Suggested time grows with word count** — `fc.tuple(fc.nat(...), fc.nat(...))` with W1 > W2 ≥ 1
    - **Property 14: EWMA formula correctness** — `fc.float({ min: 1, max: 2000 })` for both inputs; result within floating-point tolerance of `0.8*prev + 0.2*actual`
    - **Property 15: Average pace stays within bounds** — `fc.array(fc.record({ wordCount, timeSeconds }))` for event sequences starting from pace in `[50, 1000]`
    - _Requirements: 7.2, 7.6, 7.8_

  - [ ]* 7.3 Write unit tests for pace (`src/reader/__tests__/paceCalc.unit.test.ts`)
    - `suggestedSeconds(0)` returns 1
    - `suggestedSeconds` uses `DEFAULT_WPM` when no pace provided
    - `updateAveragePace` unchanged when `timeSeconds < 1`
    - `updateAveragePace` unchanged when `timeSeconds > 600`
    - `updateAveragePace` unchanged when `wordCount === 0`
    - `ewmaUpdate` returns correct value for a known input pair
    - _Requirements: 7.3, 7.4, 7.7_

- [ ] 8. Implement storage
  - [ ] 8.1 Implement `saveState`, `loadState`, and `clearState` in `src/reader/storage.ts`
    - `StoredState` holds: file name, chapter index, paragraph index, averagePace, and the pace-guide on/off setting
    - `saveState`: serialize and write to `localStorage` under key `rod_state`; swallow errors silently
    - `loadState`: read and validate; return `null` on unavailable storage, absent key, malformed JSON, non-integer or negative indices, or `averagePace` outside `[50, 1000]`
    - `clearState`: remove `rod_state` from `localStorage`
    - _Requirements: 6.2, 6.4, 6.5, 6.7, 6.8_

  - [ ] 8.2 Write property tests for storage (`src/reader/__tests__/storage.prop.test.ts`)
    - **Property 10: Position storage round-trip** — `fc.record(...)` generating valid `StoredState` shapes; save then load returns structurally equal value
    - **Property 11: Invalid position falls back to null** — `fc.string()` for malformed JSON; `fc.record` with out-of-range indices; `loadState` returns `null`
    - _Requirements: 6.2, 6.4, 6.5_

  - [ ]* 8.3 Write unit tests for storage (`src/reader/__tests__/storage.unit.test.ts`)
    - `loadState` returns `null` when `localStorage` contains invalid JSON
    - `loadState` returns `null` when `chapterIndex` is negative
    - `loadState` returns `null` when `paragraphIndex` is a float
    - `loadState` returns `null` when `averagePace` is out of `[50, 1000]`
    - `clearState` removes the stored entry
    - _Requirements: 6.4, 6.5_

- [ ] 9. Implement book storage (IndexedDB)
  - [ ] 9.1 Implement `saveBook`, `loadSavedBook`, and `clearSavedBook` in `src/reader/bookStore.ts`
    - Use IndexedDB (the browser's native API) to store the most recently loaded book's `fileName` and `text`
    - Only one book is kept at a time: `saveBook` replaces any earlier entry
    - `saveBook`, `loadSavedBook`, and `clearSavedBook` must never throw; return `false` / `null` on any IndexedDB error
    - Fetch current IndexedDB API docs before implementing; do not assume method signatures
    - _Requirements: 6.1, 6.3, 6.6_

  - [ ] 9.2 Write property tests for bookStore (`src/reader/__tests__/bookStore.prop.test.ts`)
    - Use `fake-indexeddb` to provide an in-memory IndexedDB in Vitest
    - **Property 16: Book storage round-trip** — for any `fc.string()` fileName and `fc.string()` text, `saveBook(fileName, text)` then `loadSavedBook()` returns `{ fileName, text }`
    - _Requirements: 6.1_

  - [ ]* 9.3 Write unit tests for bookStore (`src/reader/__tests__/bookStore.unit.test.ts`)
    - `loadSavedBook` returns `null` when no book has been saved
    - `saveBook` replaces the previous entry (only the latest is returned)
    - `clearSavedBook` causes `loadSavedBook` to return `null`
    - All three functions return false/null (never throw) when the database operation fails
    - _Requirements: 6.1, 6.6_

- [ ] 10. Checkpoint — Ensure all pure-function tests pass
  - Run `vitest --run src/reader/__tests__/`; fix any failures before proceeding to the UI layer.

- [ ] 11. Set up the book library
  - [ ] 11.1 Create `public/books/` folder and add a placeholder file
    - Create the `public/books/` directory
    - Create `public/books/the-yellow-wallpaper.txt` as a short placeholder (e.g. a single line: `# Placeholder — replace with the full text from Project Gutenberg`) so the directory and file exist and the library screen can be tested without crashing
    - Do not write the actual book text; the user will download and place the real file manually
    - _Requirements: none — content_
  - [ ] 11.2 Implement `src/reader/library.ts`
    - Implement the `LibraryEntry` interface (title, author, filePath, format) and the `LIBRARY` constant
    - Vite serves `public/` from the site root, so `filePath` values are like `"/books/the-yellow-wallpaper.txt"`, never `"public/books/..."`
    - Ship with one entry: The Yellow Wallpaper by Charlotte Perkins Gilman, with `filePath: "/books/the-yellow-wallpaper.txt"` and `format: "txt"`
    - Add a unit test verifying that every `filePath` in `LIBRARY` starts with `"/books/"` and that `format` is `"txt"` or `"epub"`
    - _Requirements: 8.2, 8.4_

- [ ] 12. Implement the UI layer
  - [ ] 12.1 Implement the `src/ui/useReader.ts` hook
    - Lives in `src/ui/`, not `src/reader/`: `src/reader/` has no React imports
    - Hold all reading state: current book, chapter index, paragraph index (the last revealed), error, averagePace, and the pace-guide setting
    - Expose callbacks: `selectBook(file: File)`, `selectLibraryBook(entry: LibraryEntry)`, `advance()`, `nextChapter()`, `closeBook()`, `togglePaceGuide()`
    - `closeBook()`: clears the current book from state without erasing the saved position — _Requirements: 8.1, 8.2, 8.3_
    - `togglePaceGuide()`: toggles `paceGuideEnabled: boolean`; persists the value in localStorage — _Requirements: 7.9_
    - On `selectBook` / `selectLibraryBook`: read via `fileIO` (or fetch the library file from the app's own origin), then call the pure parser; on success call `saveBook`, reset position to 0,0, and `saveState`; on failure retain the previous book and set the error
    - On `advance`: increment paragraph index; at chapter end set the chapter-completion state; call `updateAveragePace` and `saveState`
    - On mount: call `loadState`; if valid, call `loadSavedBook` to restore the book; if the position is invalid start at 0,0; if the book cannot be read show the empty state
    - Derive and return `paragraphs`, `progress`, `suggestedSecs` from the pure functions
    - _Requirements: 1.7, 2.5, 2.6, 4.4, 5.2, 6.1–6.7, 7.6–7.10, 8.3–8.5_

  - [ ] 12.2 Implement `src/ui/LibraryScreen.tsx`
    - Renders when no book is loaded
    - Shows a file-picker `<input type="file" accept=".txt,.epub">` and the `LIBRARY` list (title and author) from `library.ts`
    - Calls `onSelectFile(file)` or `onSelectLibraryBook(entry)` passed from `useReader`
    - _Requirements: 1.1, 2.1, 8.1, 8.2, 8.3_

  - [ ] 12.3 Implement `src/ui/ParagraphList.tsx`
    - Receives `paragraphs: Paragraph[]`, `activeIndex: number`, `onAdvance: () => void`
    - Paragraphs 0 to activeIndex-1 render at reduced opacity (dimmed); activeIndex renders as active; beyond activeIndex are hidden
    - Clicking the active paragraph or pressing Space/Enter calls `onAdvance`; Space also prevents default scroll
    - Provides a persistent scroll-back affordance (button or indicator) when the viewport is scrolled above the active paragraph
    - _Requirements: 4.1, 4.2, 4.3, 4.6, 4.7_

  - [ ] 12.4 Implement `src/ui/ProgressBar.tsx`, `src/ui/PaceTimer.tsx`, `src/ui/ErrorBanner.tsx`
    - `ProgressBar`: receives `progress: number`; renders integer percentage
    - `PaceTimer`: receives `enabled: boolean`, `suggestedSeconds: number`; renders timer icon when enabled; does not block advance when time expires
    - `ErrorBanner`: receives `error: string | null`; renders banner when non-null; hides when null
    - _Requirements: 5.1, 7.1, 7.5, 7.9, 1.5, 1.6, 2.4, 8.5_

  - [ ] 12.5 Implement `src/ui/ReaderView.tsx` — compose all components
    - Call `useReader()` to get state and callbacks
    - Render `LibraryScreen` when no book is loaded; otherwise render `ParagraphList`, `ProgressBar`, `PaceTimer`, `ErrorBanner`
    - Display the chapter-completion indicator after the last paragraph and suppress further advance in that chapter
    - While a book is open, show a control that returns to the library screen (8.6)
    - Show a toggle that turns the pace guide on or off (7.9)
    - When the chapter-completion indicator is showing and a later chapter exists, render a next-chapter button; clicking it calls `nextChapter()` from `useReader`; when on the last chapter, suppress the button — _Requirements: 4.3, 4.5_
    - Render a persistent "Back to Library" control while a book is open; activating it calls `closeBook()` from `useReader`, which clears the book from state without erasing the saved position, returning to `LibraryScreen` — _Requirements: 8.1, 8.2, 8.3_
    - Render a Pace Guide toggle that calls `togglePaceGuide()` from `useReader`; pass `paceGuideEnabled` to `PaceTimer` as its `enabled` prop — _Requirements: 7.9_
    - Stay under 200 lines
    - _Requirements: 4.4, 4.5, 5.1, 7.9, 8.1, 8.6_

- [ ] 13. Write integration tests
  - [ ]* 13.1 Write end-to-end load tests (`src/reader/__tests__/parser.unit.test.ts` integration section)
    - Load a real small `.txt` fixture (< 1 KB) through `loadBook`; verify chapter count and that all source non-whitespace characters are present in the Book
    - Load a minimal valid `.epub` fixture through `loadBook`; verify chapter titles and text are non-empty strings
    - _Requirements: 1.2, 2.1, 2.3_

  - [ ]* 13.2 Write ReaderView integration tests (`src/ui/__tests__/ReaderView.integration.test.tsx`)
    - Simulate a full advance sequence through a known Book with React Testing Library; verify `calculateProgress` values match the formula at each step
    - Simulate app reload with a saved `StoredState` and saved book; verify `ReaderView` renders the saved paragraph as active without user action
    - _Requirements: 5.2, 5.3, 6.3_

- [ ] 14. Final checkpoint — Ensure all tests pass
  - Run `vitest --run`; confirm all unit, property, and integration tests are green; ask the user if any failures arise.

## Notes

- All property tests are required. Unit and integration tests marked with `*` are optional for an MVP but recommended.
- The design uses TypeScript throughout; all code examples and implementations should use TypeScript
- Property tests use `fc.assert(fc.property(...), { numRuns: 100 })`; each test file carries the comment `// Feature: reader-core, Property N: <text>`
- `src/reader/` must have zero React imports. Browser APIs are confined to `fileIO.ts`, `storage.ts`, and `bookStore.ts`; the parser, splitter, progress, and pace functions are pure, with dependencies such as `stripHtml` injected as parameters
- Fetch current docs for epub.js before use; do not rely on remembered APIs
- Book text must never reach localStorage; it is stored in IndexedDB via `src/reader/bookStore.ts`
- Counterexamples found by fast-check should be recorded in `docs/BUILD_LOG.md`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["0.1", "0.2", "0.3", "0.4"] },
    { "id": 1, "tasks": ["1"] },
    { "id": 2, "tasks": ["2.1", "3.0", "3.1", "6.1", "7.1", "8.1", "9.1", "11.1", "11.2"] },
    { "id": 3, "tasks": ["2.2", "2.3", "3.2", "3.3", "6.2", "6.3", "7.2", "7.3", "8.2", "8.3", "9.2", "9.3"] },
    { "id": 4, "tasks": ["4.1"] },
    { "id": 5, "tasks": ["4.2", "4.3"] },
    { "id": 6, "tasks": ["12.1", "12.2", "12.3", "12.4"] },
    { "id": 7, "tasks": ["12.5"] },
    { "id": 8, "tasks": ["13.1", "13.2"] }
  ]
}
```
