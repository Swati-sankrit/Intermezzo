# Implementation Plan: Library-v2

## Overview

Language: TypeScript (Vite + React, Vitest, fast-check), as in the design. Work is ordered in four phases, as mandated:

1. Cover grid with hover cards, Continue reading card, and per-book progress end to end. This includes the catalogue script, bundled data, and the model and storage slice that per-book progress needs (Tasks 1 to 6).
2. Shelves, profile, onboarding, and stats (Tasks 7 to 10), then migration, "Clear my data", and legacy-storage removal (Task 11), so no reader's old place is lost before the polish pass.
3. Front-matter skipping and chunk merging (Tasks 13 and 14).
4. Design polish pass and final README check (Task 16).

The Yellow Wallpaper placeholder, its library entry, and its test are already removed. No task re-adds them. Task 3.5 only asserts that they stay absent.

Pure logic goes in `src/library/` and `src/reader/` with no DOM access. Only `src/library/localStore.ts` touches localStorage or IndexedDB. Components stay under 200 lines. Colours only through CSS custom properties in `src/ui/theme.css`.

## Tasks

- [x] 1. Data model, validation, serialization, and shelf operations
  - [x] 1.1 Create `src/library/model.ts`, `validator.ts`, and `serializer.ts`
    - Define `DataModel`, `Profile`, `BookEntry`, `Position`, `Stats`, `CandleColour`, `EMPTY_DATA_MODEL` (First_Visit_State, schema version 2).
    - `validate(unknown)` returns an accepted model or a list of problems that name the offending Book_Id, record type, or field. Cover all checks of Requirement 16.
    - `serialize` (stable key order) and `parse` (returns `undefined` on bad JSON, never throws).
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8, 16.10, 18.5_

  - [x]* 1.2 Write property test for the Serializer round trip
    - **Property 8: Serialization round trip**
    - Generate valid `DataModel` values with fast-check, then check `validate(parse(serialize(m)))` equals `m`.
    - **Validates: Requirements 18.5**
    - Report properties added, cases run, and any counterexample (record it in `docs/BUILD_LOG.md` before changing code or test).

  - [x]* 1.3 Write example tests for the Validator
    - A few cases per rejection rule (dangling Book_Id in shelves, positions, or stats; duplicate shelf entry; bad position; negative stats; bad candle colour; 41-character name) plus one accepted model. Assert the problem names the offending field or Book_Id.
    - This stands in for design Property 7, which the testing rule does not list as a property test.
    - _Requirements: 16.4, 16.5, 16.6, 16.7, 16.8, 16.10, 7.5_

  - [x] 1.4 Create `src/library/shelfOps.ts` (pure model updates)
    - `addBookEntry`, `savePosition`, `moveToShelf`, `removeBook`, `currentBook`.
    - Each returns a new model, does not mutate its input, and returns the model unchanged for an unknown Book_Id.
    - `moveToShelf` removes and adds in one returned value. `removeBook` also drops the Book_Id's position and stats.
    - `addBookEntry` places a new Book_Id on `reading` and reuses an existing entry without creating a second one.
    - _Requirements: 5.1, 5.4, 6.1, 6.2, 6.3, 6.4, 6.5, 4.6, 21.2, 21.6_

  - [x]* 1.5 Write property test for the Position round trip
    - **Property 1: Position save/restore round trip**
    - **Validates: Requirements 5.3**
    - Report properties added, cases run, and any counterexample.

  - [x]* 1.6 Write property test for the shelf invariant
    - **Property 4: Shelf invariant holds across any sequence of operations**
    - Fold random sequences of add, finish, move, and remove over the empty model. After every step each Book_Id is on at most one shelf, and a removed Book_Id is on none.
    - **Validates: Requirements 6.11**
    - Report properties added, cases run, and any counterexample.

  - [x]* 1.7 Write example tests for shelf operations
    - Saving one Position leaves others unchanged (design Property 2), one move leaves the Book_Id on exactly the target shelf (design Property 3), unknown Book_Id returns the model unchanged, inputs are not mutated, `currentBook` picks the latest `savedAt` and falls back to the latest `addedAt`.
    - _Requirements: 5.4, 6.4, 4.6, 21.2, 21.6_

- [x] 2. Data_Store interface and Local_Store
  - [x] 2.1 Create `src/library/localStore.ts`
    - Export `Result`, `FailureKind`, `DataStore`, and `createLocalStore()` (the single creation point).
    - `load` reads localStorage, parses, and validates. With no record it returns `EMPTY_DATA_MODEL` as success. With an invalid record it returns an `invalid` failure and leaves the stored record unchanged. With a newer schema version it returns `newer_version` and refuses `save` for the session.
    - `save` validates first and writes the whole model as one record. A rejected model is never written.
    - `getText`, `putText`, `deleteText` use an IndexedDB store keyed by Book_Id. A missing text returns `not_found`. `deleteText` and `clear` on absent data succeed.
    - Every operation catches errors and returns a failure value identifying `unavailable` or `quota`. None throws or rejects. Failures leave stored data unchanged.
    - Catalogue EPUBs are never copied into IndexedDB.
    - _Requirements: 16.9, 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.8, 17.9, 17.10, 18.1, 18.2, 18.3, 18.4, 18.6, 18.7, 18.8, 18.10, 19.10_

  - [x] 2.2 Create `src/library/bookId.ts`, an in-memory `DataStore`, and the store context
    - `hashBytes(ArrayBuffer)` returns lowercase SHA-256 hex via `crypto.subtle`, or `null` on failure.
    - `src/library/memoryStore.ts` is an in-memory `DataStore` implementation used by tests and as a fallback.
    - `src/ui/dataStoreContext.ts` provides the store through one React context and hook. No screen imports storage code.
    - _Requirements: 15.1, 15.2, 15.5, 15.6, 17.8, 21.1, 21.3_

  - [x]* 2.3 Write example tests for the Local_Store
    - Use a fake localStorage and a fake IndexedDB. Cover write failure, unavailable storage, quota exceeded, newer schema version, corrupt record, missing text, and first-run default.
    - Assert that previously saved data is unchanged and that the failure is reported to the caller instead of returning a default value. For the newer version, assert the stored data is not overwritten or migrated and the failure is reported as unsupported.
    - _Requirements: 17.2, 17.3, 17.4, 17.5, 17.6, 18.3, 18.4, 18.8, 19.10, 23.5, 23.6, 23.7_

  - [x]* 2.4 Write example tests for Book_Id
    - Two files with equal name and size but different bytes get different Book_Ids. Identical bytes reuse one entry. Hash failure adds no book and leaves the model unchanged.
    - _Requirements: 15.1, 15.3, 15.4, 15.5_

- [x] 3. Catalogue script, bundled data, and README listing
  - [x] 3.1 Add `sharp` and create `scripts/fetch-catalogue.mjs`
    - Add `sharp` to `devDependencies` only. Licence: Apache-2.0. Confirm the licence from `node_modules/sharp/package.json` and its documentation before stating it.
    - Wait at least 1000 ms before every request and send a descriptive User-Agent. Use the `?source=download` download URL and check that the content type is `application/epub+zip` before writing.
    - Stop on HTTP 403 or 429, name the status and the book, and leave saved files unchanged. Report other failures and continue.
    - Save EPUBs under `public/books/`. Extract the `cover-image` item from `content.opf` with the existing `jszip`, resize to at most 400 px wide, write WebP under `public/covers/` aiming at about 100 KB or less (lower the quality in steps to a floor of 40), and report any book whose cover could not be extracted or fitted.
    - Before using `sharp` or `jszip` APIs, fetch their current documentation. Do not rely on remembered APIs.
    - _Requirements: 1.5, 1.6, 1.7_

  - [x] 3.2 Create `src/library/catalogueData.ts`
    - Export `CatalogueEntry` and `CATALOGUE` with exactly the 16 entries and slugs listed in Requirement 1.11. Each holds title, author, readingMinutes, one or two mood tags, and cover and EPUB paths derived from the slug.
    - Write each description yourself: exactly two sentences, spoiler-free, not copied from Standard Ebooks or any other source.
    - Pride and Prejudice uses `jane-austen/pride-and-prejudice` from Standard Ebooks. The Vampyre uses `john-william-polidori/the-vampire`.
    - _Requirements: 1.1, 1.2, 1.3, 1.9, 1.11, 1.12_

  - [x] 3.3 Run the Catalogue_Script and replace the old bundled books
    - Run the script from the shell to download the 16 EPUBs and covers. If the network is blocked or Standard Ebooks answers 403 or 429, stop and ask the user. Do not retry in a loop.
    - Remove the superseded `public/books/Dracula.epub` and the Internet Archive `public/books/prideprejudice.epub` once the Standard Ebooks copies exist.
    - Update any reference to those old files and to the hard-coded list in `src/reader/library.ts` so the app builds. Leave `library.ts` itself until Task 5.4 swaps the screen over.
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7, 1.12_

  - [x] 3.4 List every bundled asset in the README and state dependency licences
    - List each bundled EPUB and cover with its source address and licence (Standard Ebooks, CC0). Add `sharp` (Apache-2.0, dev-only, Node script) to the dependency table.
    - _Requirements: 1.8_

  - [x]* 3.5 Write example tests for catalogue data and README
    - Exactly 16 entries with unique slugs. Every description is exactly two sentences. Every entry has one or two mood tags. Every cover and EPUB path exists under `public/`. No Internet Archive copy, no `the-yellow-wallpaper` entry or file. Extend the existing `readmeAssets.unit.test.ts` pattern so every bundled EPUB and cover appears in the README with source and licence.
    - _Requirements: 1.1, 1.2, 1.3, 1.8, 1.12, 23.5_

- [x] 4. Cover grid and hover cards
  - [x] 4.1 Create `src/library/readingTime.ts`
    - `formatReadingTime(minutes)`: under 90 minutes rounds to the nearest 5 minutes, 90 or more rounds to whole hours.
    - _Requirements: 3.3_

  - [x]* 4.2 Write example tests for the reading-time formatter
    - Boundary cases around 89, 90, and 134 minutes, and exact multiples.
    - _Requirements: 3.3, 23.5_

  - [x] 4.3 Create `Skeleton`, `PlaceholderCover`, `CoverCard`, and `CatalogueGrid` in `src/ui/`
    - The grid shows one `CoverCard` per catalogue entry with title and author (author blank without error when empty). A cover is a button with an accessible name containing title and author, a visible `--accent` focus ring, and it opens the book on click, Enter, or Space.
    - Reserve each cover's width and height while loading, with a Skeleton and no spinner. Fall back to `PlaceholderCover` on image error.
    - Two columns at 360 px, with each cover 120 to 220 px wide at wider sizes. No horizontal scroll. Every cover and button at least 44 by 44 px.
    - Show a per-book progress bar and percentage on the card when stored progress is above 0.
    - Place styles in a CSS module or one stylesheet per component, with colours from `theme.css` only.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 5.7, 13.2, 13.3, 14.2, 14.3, 14.6, 11.7_

  - [x] 4.4 Create `HoverCard` and its placement logic
    - Show after the pointer rests 200 ms or on keyboard focus. Show only one at a time. Hide on pointer leave, blur, or Escape (focus stays on the cover).
    - Content: two-sentence description, reading time via `formatReadingTime`, and mood tags. Link it to the cover with `aria-describedby`. Never cover the cover's own title or author.
    - Place it beside the cover when 280 px or more of free width exists, otherwise below. Keep it fully inside the viewport. Fade in over 150 to 250 ms.
    - On devices without hover, show an "About this book" button on each cover that opens the card.
    - Wire it into `CoverCard`.
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 12.9, 14.7_

  - [x]* 4.5 Write example tests for grid and hover card
    - Cards show title and author. Selection by click, Enter, and Space. Accessible name has title and author. Hover card shows on hover (after 200 ms) and on focus, hides on Escape with focus kept, only one at a time, and "About this book" appears without hover. Placeholder cover appears on image error.
    - _Requirements: 2.2, 2.3, 2.6, 3.1, 3.5, 3.8, 3.10, 23.5_

- [x] 5. Continue reading card and per-book progress, end to end
  - [x] 5.1 Create `src/ui/useLibrary.ts`
    - Load the model once through the `DataStore` from context. On failure, keep an empty in-memory model and expose the plain-words message. Keep working in memory when saves fail.
    - Expose catalogue state (with retry on load failure), `currentBook`, and `openCatalogueBook(slug)` and `openUpload(file)`. An upload is hashed with `hashBytes`. Catalogue Book_Id is the slug. First open adds one `BookEntry` through `addBookEntry`. Reopening reuses it. A hash failure adds nothing and shows the "could not be added" message.
    - Store uploaded book text through `putText`. Never store catalogue text.
    - Debounced model writes complete within 1000 ms. Position saves complete within 500 ms of a chunk opening. Show the failure messages from the design's error handling section.
    - _Requirements: 5.1, 5.10, 6.1, 6.2, 15.1, 15.2, 15.4, 15.5, 17.7, 18.1, 18.6, 18.9, 21.4, 21.5, 13.6_

  - [x] 5.2 Adapt `src/ui/useReader.ts` to take a Book_Id and the `DataStore`
    - Load a catalogue book from its own-origin EPUB path, or an upload from `getText`. Use the existing parser and splitter unchanged.
    - Restore the saved Position per Book_Id. With no Position, open at the first paragraph (Story_Start arrives in Task 13). Clamp a position past the end to the last paragraph with no error. A malformed Position opens at the start with a "saved place could not be restored" message and leaves other Positions unchanged.
    - On each next-paragraph, compute progress with the reader-core `calculateProgress` and save `{chapterIndex, paragraphIndex, savedAt, progress}` through `savePosition`.
    - Missing EPUB shows the "could not be opened" message with "Back to library". Missing uploaded text shows the "Reopen the file" and "Choose the book again" actions and leaves entry, shelf, and position unchanged.
    - Finishing the last paragraph moves the book to `finished` through `moveToShelf`.
    - Show Skeleton content while a book loads.
    - _Requirements: 1.10, 5.1, 5.2, 5.5, 5.6, 5.8, 5.9, 5.10, 6.3, 6.12, 12.6, 18.10_

  - [x] 5.3 Create `WelcomeHeader` and `ContinueCard`
    - `WelcomeHeader` shows a plain greeting (name and avatar arrive with Task 8).
    - `ContinueCard` shows cover, title, author, progress bar with whole percentage, and a "Continue" button at least 44 by 44 px that opens the book at its saved Position. Cover stacks above the text under 600 px and sits beside it at 600 px or wider.
    - With nothing on the `reading` shelf, show a warm empty state with "Choose a book", which moves focus to the catalogue grid.
    - If the book's text is missing, show it as needing its file opened again, with the actions from Requirement 6.12.
    - _Requirements: 4.2, 4.4, 4.5, 4.7, 4.8, 4.9, 14.4, 14.5, 6.12_

  - [x] 5.4 Compose the new `LibraryScreen` and wire `App.tsx`
    - Compose `WelcomeHeader`, `ContinueCard`, `CatalogueGrid`, and the "Open your own book" control with the existing file-input wiring. Show Skeletons while the model or catalogue loads, replaced without layout shift.
    - If the catalogue fails to load, show the message and a "Try again" button, and still show "Open your own book".
    - Provide the `DataStore` context in `App.tsx` from `createLocalStore()`. Remove `src/reader/library.ts` and its references.
    - _Requirements: 2.1, 6.9, 13.1, 13.5, 13.6, 17.8, 21.1_

  - [x]* 5.5 Write example tests for the Continue card and progress flow
    - Use the in-memory store through context. Opening a catalogue book creates one entry on `reading`. Reopening reuses it and restores the position. Continue opens the saved Position. Position past the end is clamped. Empty state shows "Choose a book". A failed save keeps the reader on the chunk and shows the message. Progress bar and percentage appear on the card.
    - _Requirements: 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.5, 5.7, 5.10, 6.1, 6.2, 21.3, 23.5_

- [x] 6. Checkpoint - Phase 1 complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Shelves
  - [x] 7.1 Extend `useLibrary` with shelf actions
    - `moveBook(bookId, shelf)`, `removeBook(bookId)`, and shelf selectors. Removal deletes the book text first. Only after that succeeds does it write the model with the entry, position, and stats gone. Daily stats records stay. On any failure, leave all four unchanged and show "This book could not be removed. You can try again."
    - _Requirements: 6.4, 6.5, 6.6, 6.11_

  - [x] 7.2 Create `ShelfView` and wire it into `LibraryScreen`
    - Three shelves (Reading, Want to read, Finished) listing cover, title, author (blank if empty), and progress. Each book has a "Move to ..." button that omits its own shelf, and a remove control with a confirmation.
    - An empty shelf shows "Nothing on this shelf yet" and a button that moves focus to the catalogue grid. No horizontal scroll from 360 px.
    - _Requirements: 6.7, 6.8, 6.13, 5.7, 6.10, 13.4_

  - [x]* 7.3 Write example tests for the Shelf view
    - Move buttons omit the current shelf. A move updates both shelves in one render. Removal confirmed removes the book. Removal failure leaves everything unchanged and shows the message. Empty-shelf message and focus button.
    - _Requirements: 6.5, 6.6, 6.8, 13.4, 23.5_

- [x] 8. Profile and onboarding
  - [x] 8.1 Create `src/library/profileOps.ts` (pure)
    - `updateProfile` (trim the name, reject over 40 characters and keep the previous name), `resetProfile` (First_Visit_State, keeps books, shelves, positions, stats), `recordPace` (clamp Average_Pace to 50 to 1000), `setPaceGuide`.
    - _Requirements: 7.1, 7.4, 7.5, 7.8, 7.10, 7.11, 7.12, 21.2_

  - [x] 8.2 Add the six candle colours, `Avatar`, and the personalised `WelcomeHeader`
    - Add `--candle-amber`, `--candle-rose`, `--candle-violet`, `--candle-teal`, `--candle-ash`, `--candle-moss` to `src/ui/theme.css`. Verify each is at least 3:1 against `--surface` with a small script or test, and tune hues if not.
    - `Avatar` draws a small candle in the chosen colour. The header greets by name, or without a name or placeholder when none is set.
    - _Requirements: 4.1, 4.2, 4.3, 7.2, 7.14, 11.2_

  - [x] 8.3 Create `Onboarding` and wire first-visit flow
    - At most three steps, each at most 40 words. Step 1 takes an optional name and a candle colour. A later step explains click-to-open and the room growing haunted. The last step offers a catalogue book or "Open your own book". "Skip introduction" is on every step. Focus moves to the first control of each new step.
    - Show it when the Profile is in the First_Visit_State. Finishing or skipping sets the completed flag and saves. If saving fails, show the Library_Screen, keep choices in memory, and show the "will not be saved after the tab closes" message.
    - Leave the photosensitivity notice before the first session untouched. Works with camera off and no account.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 8.12, 22.3_

  - [x] 8.4 Create `ProfileSettings` and profile actions in `useLibrary`
    - Change display name, candle colour, and the pace guide setting. Saves complete within 1 second. On failure, keep the previous saved values and in-session values and show the retry message. Show the name-too-long message at over 40 characters.
    - "Delete my profile" opens a confirmation stating the name and colour will be removed and that books, shelves, positions, and stats are kept, with "Cancel" and a confirm button. Escape cancels. Confirming resets to First_Visit_State, so the onboarding shows again.
    - _Requirements: 7.3, 7.5, 7.6, 7.7, 7.8, 7.9, 7.12, 7.13, 8.8_

  - [x]* 8.5 Write example tests for profile and onboarding
    - Name length rule and message. Onboarding has at most three steps. "Skip introduction" completes it and the flag persists. "Delete my profile" keeps books, shelves, positions, stats, and cancel or Escape keeps the profile. Pace clamped to 50 and 1000. Candle colour options show text names.
    - _Requirements: 7.5, 7.7, 7.8, 7.9, 7.11, 7.14, 8.2, 8.6, 23.5_

- [x] 9. Reading stats
  - [x] 9.1 Extend the model, validator, and serializer with daily stats
    - In `src/library/model.ts`, add `awaySeconds` to `Stats` and `daily: Record<string, Stats>` (keyed by Local_Date `YYYY-MM-DD`) to `DataModel` and `EMPTY_DATA_MODEL`. Schema_Version stays 2 and no migration is added, because the model is not released yet.
    - In `validator.ts`, accept `daily`. Reject a key that is not a real `YYYY-MM-DD` calendar date, and reject any negative, fractional, or non-finite count in `stats` or `daily`, naming the offending date or count. Daily keys need no matching Book_Entry.
    - In `serializer.ts`, include `daily` in the stable key order. Extend the existing Property 8 generator so generated models include `daily` and `awaySeconds`, without weakening any assertion.
    - In `shelfOps.ts`, make `removeBook` leave `daily` unchanged. Update existing fixtures, `localStore.ts`, and `memoryStore.ts` so everything compiles.
    - Extend `src/library/__tests__/validator.unit.test.ts` with examples: an accepted model with a `daily` record, a malformed date key (for example `2025-13-40` and `25-1-1`), a negative count, and a fractional count. Add an example to `shelfOps.unit.test.ts` that removing a book leaves `daily` unchanged.
    - _Requirements: 16.1, 16.11, 16.12, 20.10, 20.12_

  - [x] 9.2 Create `src/library/statsOps.ts` (pure)
    - Per-book operations: `recordParagraphsRead`, `recordChapterFinished`, `addActiveSeconds`, `addAwaySeconds`, `recordLookAway`, `recordSession`, and `overallStats` (sum of all six fields).
    - Per-day recording: `recordEvent(model, bookId, event, today)` updates `stats[bookId]` and `daily[today]` in one returned model, with `today` an injected Local_Date string. The functions never read the clock. An unknown Book_Id returns the model unchanged.
    - `pruneDaily(daily, today)` drops only records more than 90 days before `today` and keeps every record within 90 days. `recordEvent` calls it.
    - All operations are additive and integer-only. Away seconds exclude reader-started breaks, which the caller handles by sending no away event during a break.
    - Add example tests in `src/library/__tests__/statsOps.unit.test.ts`: a per-day record for an injected date, away seconds, a 90-day-old record kept and a 91-day-old record dropped, and counts that never decrease across a short fixed event sequence.
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.8, 20.13, 20.14, 20.15, 20.16, 20.17_

  - [x]* 9.3 Write property test for daily totals
    - **Property 11: Daily totals sum to per-book totals**
    - Generate sequences of stat events over several books and dates, with no removal and no pruning, and check that for each of the six fields the sum of the daily totals equals the sum of the per-book totals.
    - **Validates: Requirements 20.18**
    - Report properties added, cases run, and any counterexample.

  - [x] 9.4 Add the local-date helper and stats selectors
    - A small UI-layer helper returns today's Local_Date from the device's local time zone (not UTC). Selectors return per-book, per-day, and overall Stats, with zero for every value (including away seconds) when nothing is recorded.
    - _Requirements: 20.6, 20.12, 20.15_

  - [x] 9.5 Wire stats into the reader
    - Count paragraphs the first time a chunk opens per session, chapters finished once, session once per page load, and active seconds while the attention signal is `present` (update at least every 5 seconds). Record each event for the book and for the reader's local date through `recordEvent`.
    - Record away seconds while the signal is `away` and a book is open, updating at least every 5 seconds, and record a look-away on each `present` to `away` change. Record neither during a break the reader started. Use the existing attention signal only, including the camera-off tab-switch and idle signal. Do not touch the camera and store no frames, face data, or text.
    - On a stats save failure, keep session stats in memory, keep reading, and show "progress stats were not saved".
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.8, 20.9, 20.11, 20.13, 20.14, 20.15, 20.16_

  - [x]* 9.6 Write example tests for stats
    - A short fixed event sequence where no count decreases. Overall equals the per-book sum. Removing a book drops its contribution to overall but leaves the daily records unchanged. Empty stats show zero for every value. Events on two local dates land in two daily records. Away seconds are counted while `away` and not during a break.
    - _Requirements: 20.6, 20.7, 20.10, 20.12, 20.13, 20.14, 23.4_

- [x] 10. Checkpoint - Phase 2 shelves, profile, onboarding, stats
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Migration, clear my data, and legacy cleanup
  - [ ] 11.1 Create `src/library/migrator.ts` (pure)
    - `migrate(legacy, current)` as in the design. Validate `rod_state` (parseable, file name 1 to 255 characters, integer position within paragraph count, finite pace above 0) and `rod_pace_guide` independently. Ignore an invalid record and keep going. Create one entry, a Position with progress 0, Average_Pace, and the book on `reading`. With no legacy text, use the `legacy-<fileName>` Book_Id. Profile stays in First_Visit_State apart from pace values. A version 2 model is returned deeply equal.
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.8, 19.9, 19.13_

  - [ ]* 11.2 Write property test for migration
    - **Property 9: Migration preserves legacy position, pace, and book identity**
    - **Validates: Requirements 19.2, 19.3**
    - Report properties added, cases run, and any counterexample.

  - [ ]* 11.3 Write property test for migration idempotence
    - **Property 10: Migration is idempotent on current-version data**
    - **Validates: Requirements 19.8**
    - Report properties added, cases run, and any counterexample.

  - [ ] 11.4 Add migration orchestration to `localStore.ts` and startup messages
    - When no v2 model exists and legacy data does, read the legacy keys, hash the `current` text for the Book_Id, call `migrate`, write the v2 model, and read it back as valid. Then copy the text to the Book_Id key, confirm it reads back identical, and only then remove the legacy keys. Leave all legacy keys untouched on any failure and retry next start, with "data could not be carried over" shown.
    - Newer schema version: no writes in the session and the "newer version" message. Invalid stored data: start empty, show "saved data could not be read", and do not overwrite until the reader makes a first change.
    - _Requirements: 19.1, 19.5, 19.6, 19.7, 19.10, 19.11, 19.12_

  - [ ] 11.5 Add "Clear my data" and remove superseded legacy modules
    - In `ProfileSettings`, "Clear my data" confirms what will be deleted (profile, shelves, positions, stats, uploaded book text, and legacy data) with "Cancel" and a confirm button. Escape cancels. Confirming deletes the model, all text, and legacy keys through the `DataStore`, then shows the onboarding and an empty shelf view. A failure shows an error with retry and does not report the data as cleared.
    - Remove `src/reader/storage.ts` and `src/reader/bookStore.ts` (and their tests) once nothing but the migration reads those keys, and move that legacy reading into `localStore.ts`.
    - Confirm no sign-in, account, or sync control exists, and that no screen imports storage code.
    - _Requirements: 17.10, 21.1, 22.2, 22.6, 22.7, 22.8, 22.9_

  - [ ]* 11.6 Write example tests for migration orchestration and clear my data
    - Legacy keys stay until the v2 write and text copy both read back valid. A failed copy keeps legacy keys. Invalid legacy record is ignored and its key kept. Missing legacy text uses the `legacy-` Book_Id. Clear my data confirm, cancel, Escape, and failure cases.
    - _Requirements: 19.6, 19.7, 19.9, 19.12, 19.13, 22.6, 22.7, 22.8, 22.9, 23.5_

- [ ] 12. Checkpoint - Storage, migration, and privacy complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Front-matter skipping
  - [ ] 13.1 Create `src/library/frontMatter.ts` (pure)
    - `findStoryStart(landmarks, chapters)`: use the `bodymatter` landmark if it matches a chapter. Otherwise treat chapters typed `titlepage`, `halftitle`, `frontmatter`, `toc`, `epigraph`, `dedication`, `copyright-page`, or `imprint` as front matter and start at the first chapter that is not. Otherwise return chapter 0.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.9_

  - [ ]* 13.2 Write property test for the Front_Matter_Detector
    - **Property 5: Front-matter detection never skips the story and is conservative without markers**
    - Check that Story_Start is never after the designated story chapter, every chapter before it is marked front matter, and inputs with no landmark or markers return chapter 0.
    - **Validates: Requirements 9.3, 9.4, 9.9, 23.2**
    - Report properties added, cases run, and any counterexample.

  - [ ] 13.3 Extract landmark data and wire the Story_Start
    - Read `landmarksByType.bodymatter` from epub.js `book.navigation` and spine `epub:type` properties into plain `LandmarkData`. Before relying on the epub.js API, fetch its current documentation.
    - Keep front matter in the loaded book as earlier chapters, with chapter indices counted from the first chapter. A book with no saved Position opens at the Story_Start. A saved Position is restored without it. Plain text books skip detection.
    - Progress counts story paragraphs from the Story_Start, and finishing uses the same start.
    - _Requirements: 9.5, 9.6, 9.7, 9.8, 9.10, 5.6, 5.8_

- [ ] 14. Reading chunks
  - [ ] 14.1 Create `src/library/chunkMerger.ts` (pure)
    - `mergeIntoChunks(chapters)` using the existing paragraph types and word counter. Chunks reach at least 40 words, never split a paragraph, never span chapters. A paragraph of 40 words or more is its own chunk. A short tail joins the chapter's last chunk. A whole chapter under 40 words is one chunk.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.9_

  - [ ]* 14.2 Write property test for the Chunk_Merger
    - **Property 6: Reading-chunk merging preserves text and respects chapter and size rules**
    - Check that joining chunks returns the original paragraphs in order, no chunk spans two chapters, no paragraph is split, and every chunk has at least 40 words except a whole short chapter.
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 23.3**
    - Report properties added, cases run, and any counterexample.

  - [ ] 14.3 Use Reading_Chunks in the reader
    - One click opens one chunk. Merged paragraphs show with paragraph breaks between them. Positions store the first paragraph index of the active chunk, and a position saved before this spec opens the chunk that contains that paragraph. Stats count the chunk's paragraphs.
    - _Requirements: 10.7, 10.8, 10.10, 5.1, 5.2, 20.1_

  - [ ]* 14.4 Write example tests for chunk wiring
    - A legacy single-paragraph Position opens the containing chunk. Merged paragraphs render as separate paragraphs. A chunk opening saves the first paragraph index.
    - _Requirements: 10.8, 10.10, 23.5_

- [ ] 15. Checkpoint - Phase 3 front matter and chunks
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 16. Design polish pass
  - [ ] 16.1 Candle-lit study visuals
    - Dark warm wood tones, soft vignette, covers lit by candlelight, a subtle cover shadow with a spine edge on the left. Add any new colour only as a custom property in `theme.css`. Bundle Cormorant Garamond (headings), Literata (descriptions), and the system UI font (labels) through `@fontsource` packages (OFL), and load nothing from a third-party server. State any new font package and its licence in the README.
    - _Requirements: 11.1, 11.2, 11.4, 11.5, 11.6, 11.10_

  - [ ] 16.2 Motion and transitions
    - Cover lift of at most 8 px and tilt of at most 4 degrees over 150 to 300 ms on hover and focus, returning over the same time. The open-book transition fades the library down and the reading room up within 600 ms, with Skeletons until the book is ready. Candle glow changes slowly with no flashing faster than 3 times per second.
    - Under `prefers-reduced-motion`: no lift or tilt, fades of at most 200 ms or none, static glow, and static Skeletons with no shimmer.
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 13.3_

  - [ ] 16.3 Responsive and accessibility pass
    - Check 360 px to 3840 px with no horizontal scroll, 200 percent text size without overlap, controls at least 44 by 44 px, visible `--accent` focus rings, accessible labels, and keyboard-only use of the whole library flow. Split any component file at or over 200 lines. Check that error messages say what happened and what to do next.
    - _Requirements: 14.1, 14.6, 14.8, 11.7, 11.8, 11.9, 11.10_

  - [ ]* 16.4 Write example tests for polish rules
    - Reduced-motion styles remove lift and tilt. Library text colours meet 4.5:1 against their backgrounds, and candle colours 3:1 against `--surface`, by computing the ratios from `theme.css`. Every component file is under 200 lines. No library source file imports localStorage or IndexedDB code outside `localStore.ts`. No library or reader code requests another origin.
    - _Requirements: 7.2, 11.3, 11.9, 12.3, 17.10, 21.1, 22.4, 23.5_

  - [ ] 16.5 Final README and asset check
    - Confirm the README lists every bundled EPUB, cover, font package, and dependency with source and licence (including `sharp`, Apache-2.0), and that the existing README asset test passes.
    - _Requirements: 1.8_

- [x] 18. Phase 1 follow-ups
  - [x] 18.1 Swap Alice's Adventures in Wonderland for The Invisible Man
    - In `scripts/catalogue-slugs.mjs`, replace `lewis-carroll/alices-adventures-in-wonderland/john-tenniel` with `h-g-wells/the-invisible-man` (file stem `the-invisible-man`) and update its comments.
    - In `src/library/catalogueData.ts`, replace the Alice entry with The Invisible Man by H. G. Wells: write a new two-sentence, spoiler-free description, a reading time, and one or two mood tags. The catalogue stays at exactly 16 entries.
    - Delete `public/books/alices-adventures-in-wonderland.epub` and `public/covers/alices-adventures-in-wonderland.webp`.
    - Run the Catalogue_Script for the new book only (add a slug argument to the script if it has none), keeping the polite delay. On HTTP 403 or 429, stop and ask the user. The cover must be WebP at most 400 px wide and about 100 KB or less.
    - In `README.md`, remove the Alice rows and add the EPUB and cover rows for The Invisible Man with source and licence (Standard Ebooks, CC0).
    - Update `src/library/__tests__/catalogueData.unit.test.ts` (and the README asset test if it names Alice) so that it expects The Invisible Man and no Alice entry or file.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.8, 1.11_

  - [x] 18.2 Retitle Poe and match the Dracula file name exactly
    - In `src/library/catalogueData.ts`, set the Poe entry title to "Short Stories" with author "Edgar Allan Poe". The slug `edgar-allan-poe/short-fiction` and the file stem stay the same.
    - Make the Dracula `epubPath` exactly `/books/dracula.epub`, matching the file `public/books/dracula.epub` in letter case. Confirm that no reference to `Dracula.epub` remains in `src/`, `scripts/`, `README.md`, or `public/`.
    - Update the catalogue unit test so the Poe title and the case-sensitive file checks pass (every `coverPath` and `epubPath` exists at exactly that path).
    - _Requirements: 1.11, 1.13, 23.5_

  - [x] 18.3 Reader banner for a failed position save
    - Add `src/ui/ReaderBanner.tsx` (under 200 lines) and show it in the reader view when a Position save fails, in addition to the Library_Screen message. It is small, dismissible, does not block reading, does not cover the active paragraph, and clears on the next successful save. Colours come from `theme.css`, and it has a visible focus ring and an accessible label.
    - Add a small example test: a failed save shows the banner, dismiss hides it, the reading controls stay usable, and a later successful save clears it.
    - _Requirements: 5.10, 5.11, 5.12_

  - [x] 18.4 Fix catalogue grid covers never rendering
    - In the manual check every grid card stays on the placeholder, no `<img>` is rendered, and the grid never requests any cover (only `ContinueCard` requests `frankenstein.webp`). Find the root cause in `src/ui/CoverCard.tsx` and `src/ui/CatalogueGrid.tsx` (a lazy-loading gate, an IntersectionObserver, or a loading state that never ends). Check whether the `<img>` is gated on an `onLoad` that never fires because the `<img>` is not rendered.
    - Fix it so the `<img>` is rendered with the cover path, a Skeleton shows until it loads, and the placeholder shows only on image error.
    - Add an example test (jsdom): fire no load event and assert the grid card renders an `<img>` with the cover `src`; then fire `error` and assert the placeholder appears. The test must fail on the code before the fix.
    - _Requirements: 2.1, 2.6, 2.7, 13.2_

  - [x] 18.5 Centre the library content column
    - Give the library content a centred column with a sensible max width (about `min(100% - gutters, 1200px)`) and side padding, from 360 px up to large desktop, with no horizontal scroll. Colours and spacing come from `theme.css` custom properties where they exist.
    - _Requirements: 11.1, 14.1_

  - [x] 18.6 Make the catalogue grid denser
    - Show 2 covers per row at 360 px and about 5 to 6 per row at 1440 px, keeping the 2:3 cover shape. Keep covers at about 120 to 220 px wide if that fits. Otherwise relax to about 140 to 200 px and keep the grid centred.
    - Update Requirements 14.2 and 14.3 in `requirements.md` and the matching wording in `design.md` (two columns on a 360 px window, about 5 to 6 per row at 1440 px). Update any test that asserts column sizing.
    - _Requirements: 14.2, 14.3_

  - [x] 18.7 Fix flaky continueFlow test
    - `src/ui/__tests__/continueFlow.test.tsx` times out (1 s `findByTestId('active-paragraph')`) about 1 in 10 runs under suite load.
    - If it opens a real EPUB in jsdom, use a small fake book for that test. Otherwise raise the wait to 5 s with a comment (test-environment timing limit under full-suite load). Do not weaken any assertion.
    - Run the file 20 times alone and confirm 0 failures. Log the cause, fix, and run results in `docs/BUILD_LOG.md`.
    - _Requirements: 5.1, 5.2, 23.5_

  - [x] 18.8 Fix flaky coverage floor in the ghost planner property test
    - In `src/haunts/engine/ghost/__tests__/planner.gd11.prop.test.ts`, the "qualifying:blocked-by-history" floor was once seen at 36 < 37. Reshape the generator inputs so the floor has a comfortable margin, without lowering the floor.
    - Test-only change: do not change the planner. Run the file many times to confirm no failures, and log the cause, fix, and run count in `docs/BUILD_LOG.md`.
    - _Requirements: 23.2, 23.5_

  - [x] 18.9 Centre the library column on wide windows
    - User report: at 1840 px wide there is about 70 px of space on the left and 280 px on the right. Find what makes the column sit left (for example grid justification, a fixed-width child, or margins that do not auto-centre) and centre it, with equal space on both sides, from 360 px up to large desktop and no horizontal scroll.
    - Add a layout-agnostic example test only if it is meaningful in jsdom (for example, the content container has no fixed-width child wider than its parent and uses auto side margins). Otherwise skip the test and say why.
    - _Requirements: 11.1, 14.1, 14.3_

  - [x] 18.10 Show Poe as Short Fiction and Polidori as The Vampire
    - In `src/library/catalogueData.ts`, set the Poe entry title to "Short Fiction" (author "Edgar Allan Poe") and the Polidori entry title to "The Vampire". Slugs and file stems stay the same.
    - Update the tests that assert these titles, for example `src/library/__tests__/catalogueData.unit.test.ts`, and the README titles if present.
    - _Requirements: 1.11_

  - [x] 18.11 Fix slow first book open in continueFlow test
    - Find why the first book open in `src/ui/__tests__/continueFlow.test.tsx` is slow under full-suite load. Fix it without raising the timeout. If the cause is the one-time import of `epubjs` (or `jszip`), warm it in a `beforeAll` that imports the module before the first test.
    - Run the file alone 20 times and the full suite 3 times, and confirm 0 failures.
    - Log the cause, fix, and run results in `docs/BUILD_LOG.md`.
    - _Requirements: 5.1, 5.2, 23.5_

  - [x] 18.12 Fix flaky coverage floors in planner.gd08 property test
    - In `src/haunts/engine/ghost/__tests__/planner.gd08.prop.test.ts` ("Property 8 coverage"), a floor was seen failing with `history:full: expected 165 to be >= 168`. Reshape the generator inputs the same way as `planner.gd11` (task 18.8), without lowering any floor.
    - Test-only change: do not change the planner.
    - Run the file alone 40 times and confirm 0 failures. Log the cause, fix, and run count in `docs/BUILD_LOG.md`.
    - _Requirements: 23.2, 23.5_

- [ ] 19. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP.
- Property tests exist only for the six named areas: serializer round trip (P8), position round trip (P1), shelf invariant (P4), migrator (P9, P10), front-matter detector (P5), and chunk merger (P6). The one optional addition is Property 11, daily totals sum to per-book totals (task 9.3). Design Properties 2, 3, and 7 are covered by example tests in tasks 1.3 and 1.7, per the testing rule.
- After each test task, report which properties were added, how many cases ran, and any counterexample. Record counterexamples (failing property, shrunk input, seed) in `docs/BUILD_LOG.md` before changing the test or the code under test.
- Spend about 30 minutes at most per test file. If one needs more, stop and ask the user.
- Never weaken, delete, or mock the function under test to make a test pass.
- Before using any library API (epub.js, sharp, jszip, fast-check), fetch its current documentation. Do not rely on remembered APIs.
- Task 3.3 needs network access to Standard Ebooks. If it is blocked, ask the user.

## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": 0,
      "tasks": [
        "1.1",
        "3.1",
        "4.1",
        "9.1",
        "18.1",
        "18.3",
        "18.4"
      ]
    },
    {
      "id": 1,
      "tasks": [
        "1.2",
        "1.3",
        "1.4",
        "2.1",
        "3.2",
        "4.2",
        "9.2",
        "18.2",
        "18.5"
      ]
    },
    {
      "id": 2,
      "tasks": [
        "1.5",
        "1.6",
        "1.7",
        "2.2",
        "2.3",
        "3.3",
        "4.3",
        "9.3",
        "18.6"
      ]
    },
    {
      "id": 3,
      "tasks": [
        "2.4",
        "3.4",
        "4.4",
        "5.1",
        "18.7"
      ]
    },
    {
      "id": 4,
      "tasks": [
        "3.5",
        "4.5",
        "5.2",
        "5.3",
        "18.8"
      ]
    },
    {
      "id": 5,
      "tasks": [
        "5.4"
      ]
    },
    {
      "id": 6,
      "tasks": [
        "5.5",
        "7.1"
      ]
    },
    {
      "id": 7,
      "tasks": [
        "7.2",
        "8.1"
      ]
    },
    {
      "id": 8,
      "tasks": [
        "7.3",
        "8.2",
        "9.4"
      ]
    },
    {
      "id": 9,
      "tasks": [
        "8.3",
        "9.5"
      ]
    },
    {
      "id": 10,
      "tasks": [
        "8.4",
        "9.6"
      ]
    },
    {
      "id": 11,
      "tasks": [
        "8.5",
        "11.1"
      ]
    },
    {
      "id": 12,
      "tasks": [
        "11.2",
        "11.3",
        "11.4"
      ]
    },
    {
      "id": 13,
      "tasks": [
        "11.5"
      ]
    },
    {
      "id": 14,
      "tasks": [
        "11.6"
      ]
    },
    {
      "id": 15,
      "tasks": [
        "13.1",
        "14.1"
      ]
    },
    {
      "id": 16,
      "tasks": [
        "13.2",
        "13.3",
        "14.2"
      ]
    },
    {
      "id": 17,
      "tasks": [
        "14.3"
      ]
    },
    {
      "id": 18,
      "tasks": [
        "14.4"
      ]
    },
    {
      "id": 19,
      "tasks": [
        "16.1"
      ]
    },
    {
      "id": 20,
      "tasks": [
        "16.2"
      ]
    },
    {
      "id": 21,
      "tasks": [
        "16.3"
      ]
    },
    {
      "id": 22,
      "tasks": [
        "16.4",
        "16.5"
      ]
    },
    {
      "id": 23,
      "tasks": [
        "18.9"
      ]
    },
    {
      "id": 24,
      "tasks": [
        "18.10"
      ]
    },
    {
      "id": 25,
      "tasks": [
        "18.11"
      ]
    },
    {
      "id": 26,
      "tasks": [
        "18.12"
      ]
    }
  ]
}
```
