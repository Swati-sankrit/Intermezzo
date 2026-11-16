# Requirements Document

## Introduction

Reader-core is the foundational reading module for "Read or Dread", a browser-based reading companion. It handles everything the reader interacts with before attention detection or haunting begins: loading a book (the reader's own file or one from the built-in library), splitting it into paragraphs, presenting one paragraph at a time, tracking pace, and persisting progress. No book data leaves the device at any point.

The module lives in `src/reader/` and exposes pure functions for parsing, splitting, pace calculation, and progress calculation. These functions are testable with fast-check property tests and have no dependency on the DOM, camera, or any network resource.

## Glossary

- **Book**: A `.txt` or `.epub` file, either provided by the reader or chosen from the Library, loaded entirely in the browser.
- **Library**: A small set of public-domain books bundled with the app as static files, so a reader can start without uploading anything.
- **Chapter**: A top-level division of a Book. A `.txt` file is divided at chapter heading lines when it has them, and is otherwise a single Chapter. An `.epub` file exposes its native chapter structure.
- **Paragraph**: A contiguous block of non-empty text within a Chapter, used as the unit of reading and progress.
- **Parser**: The pure function (or set of functions) in `src/reader/` responsible for reading a file and producing a structured Book object.
- **Splitter**: The pure function in `src/reader/` that divides Chapter text into an ordered list of Paragraphs.
- **Progress**: A whole number between 0 and 100 (inclusive) representing how far through the Book the reader has advanced.
- **Progress_Calculator**: The pure function in `src/reader/` that computes Progress from a Position and a Book.
- **Position**: A pair of (chapter index, paragraph index) that identifies the reader's location in a Book.
- **Pace_Calculator**: The pure function in `src/reader/` that estimates the suggested reading time for a Paragraph.
- **Average_Pace**: The reader's rolling words-per-minute rate, derived from observed reading times.
- **Pace_Guide**: The optional UI element (a small timer icon) that displays the suggested time for the current Paragraph.
- **Storage**: On-device browser storage. localStorage holds the Position, Average_Pace, the Pace_Guide setting, and the Book's file name. IndexedDB holds the text of the most recently opened Book so it can be restored. Nothing in Storage is sent to any server.
- **Reader_UI**: The React component layer in `src/ui/` that renders Paragraphs and calls pure functions from `src/reader/`.

## Requirements

### Requirement 1: Load a Plain-Text Book

**User Story:** As a reader, I want to load a `.txt` file from my device so that I can read it here without sending it anywhere.

#### Acceptance Criteria

1. WHEN the user selects a `.txt` file, THE Parser SHALL read the file entirely in the browser using the File API without transmitting any bytes to a server.
2. WHEN the user selects a `.txt` file up to 50 MB in size encoded as UTF-8 or UTF-16, THE Parser SHALL produce a Book containing the complete decoded text from the file.
3. WHEN the decoded text contains chapter heading lines (a line that begins with the word "Chapter" in any letter case, followed by a number, a Roman numeral, or a number word), THE Parser SHALL start a new Chapter at each heading line and use that line as the Chapter title; any text before the first heading SHALL form its own Chapter.
4. WHEN the decoded text contains no chapter heading lines, THE Parser SHALL produce a Book with a single Chapter.
5. IF the selected `.txt` file exceeds 50 MB, THEN THE Reader_UI SHALL display an error message stating that the file is too large to load.
6. IF the selected `.txt` file cannot be read due to an unreadable encoding, empty content, or access denial, THEN THE Reader_UI SHALL display an error message identifying which of those conditions prevented loading.
7. IF the selected `.txt` file cannot be read and a Book was already loaded, THEN THE Reader_UI SHALL retain that Book unchanged; IF no Book was previously loaded, THE Reader_UI SHALL remain in the empty state with no Book displayed.

**Property tests (fast-check):**
- For any text input, joining the text of all Chapters in order contains every non-whitespace character of the input in its original order (chapter splitting loses nothing).
- For any text input with no chapter heading lines, the Book has exactly one Chapter.

---

### Requirement 2: Load an EPUB Book

**User Story:** As a reader, I want to load an `.epub` file so that the app extracts chapters and presents them in reading order.

#### Acceptance Criteria

1. WHEN the user selects an `.epub` file, THE Parser SHALL extract chapters in the reading order defined by the EPUB spine, producing for each chapter an ordered pair of chapter title and plain text body.
2. WHEN the user selects an `.epub` file, THE Parser SHALL load and parse the file using only browser-local APIs, performing no network requests during parsing.
3. WHEN the user selects an `.epub` file, THE Parser SHALL strip all HTML tags, inline styles, and image elements from chapter text, preserving only plain text characters and paragraph boundaries as blank-line separators; chapters whose text body is empty after stripping SHALL be silently excluded from the extracted chapter list.
4. IF the selected `.epub` file cannot be parsed (corrupt file or missing spine), THEN THE Reader_UI SHALL display an error message that is human-readable, contains no stack trace or file-system path, and is no longer than 200 characters.
5. IF the selected `.epub` file cannot be parsed AND a Book was previously loaded, THEN THE Reader_UI SHALL retain that previously loaded Book unchanged.
6. IF the selected `.epub` file cannot be parsed AND no Book was previously loaded, THEN THE Reader_UI SHALL return to the initial empty state with no chapter content displayed.

---

### Requirement 3: Split a Chapter into Paragraphs

**User Story:** As a reader, I want the chapter text split into paragraphs so that the app can present one at a time without losing any content.

#### Acceptance Criteria

1. THE Splitter SHALL divide each Chapter into an ordered list of Paragraphs by splitting on one or more consecutive lines that contain only whitespace characters (spaces, tabs, or carriage returns).
2. THE Splitter SHALL produce Paragraphs such that every non-whitespace character present in the Chapter appears, in its original relative order, within exactly one Paragraph in the output list.
3. THE Splitter SHALL exclude from the output any Paragraph whose content consists entirely of whitespace characters (spaces, tabs, newlines, or carriage returns).
4. THE Splitter SHALL preserve the original order of Paragraphs as they appear in the Chapter source.
5. IF the Chapter contains no non-whitespace characters, THEN THE Splitter SHALL return an empty list.

**Property tests (fast-check):**
- For any non-empty string input, splitting into Paragraphs and joining them back loses no non-whitespace text (round-trip completeness).
- For any input, no Paragraph in the output contains only whitespace.
- For any input, the Paragraph list is non-empty when the input contains at least one non-whitespace character.

---

### Requirement 4: Present One Paragraph at a Time

**User Story:** As a reader, I want to see one paragraph at a time so that I stay focused on what I am reading now.

#### Acceptance Criteria

1. WHEN a Chapter opens, THE Reader_UI SHALL display only the first Paragraph and render all subsequent Paragraphs as hidden.
2. WHEN the reader clicks the active Paragraph or presses Space or Enter, THE Reader_UI SHALL reveal the next Paragraph and render all previously read Paragraphs in a visually distinct reduced-opacity state compared to the active Paragraph.
3. WHEN the reader presses Space while reading, THE Reader_UI SHALL prevent the browser's default page-scroll behavior.
4. WHEN the last Paragraph in a Chapter is active and the reader advances, THE Reader_UI SHALL display a chapter-completion indicator and suppress any further advance action within that Chapter.
5. WHEN the chapter-completion indicator is displayed and a later Chapter exists, THE Reader_UI SHALL offer a control, usable by click and by keyboard, that opens the next Chapter.
6. THE Reader_UI SHALL allow the reader to scroll upward to review any earlier Paragraph in the same Chapter.
7. WHILE the reader is scrolled up reviewing an earlier Paragraph, THE Reader_UI SHALL provide a persistent affordance that scrolls the view back to the active Paragraph without reloading the page.

---

### Requirement 5: Track and Display Progress

**User Story:** As a reader, I want to see my progress through the whole book so that I know how far I have come.

#### Acceptance Criteria

1. THE Reader_UI SHALL display Progress as a whole number (integer) percentage between 0 and 100 inclusive.
2. THE Progress_Calculator SHALL calculate Progress as `floor((P_current / P_total) × 100)`, where `P_current` is the zero-based index of the current Paragraph in reading order across all Chapters and `P_total` is the total number of Paragraphs in the Book, capped at 100 when the reader is past the last Paragraph.
3. WHEN the reader advances to the next Paragraph, THE Progress_Calculator SHALL produce a value greater than or equal to the previous value.
4. WHEN the reader is on the first Paragraph of the first Chapter, THE Progress_Calculator SHALL report Progress as 0.
5. WHEN the reader advances past the last Paragraph of the last Chapter, THE Progress_Calculator SHALL report Progress as 100.
6. IF the Book contains zero Paragraphs, THEN THE Progress_Calculator SHALL report Progress as 0.

**Property tests (fast-check):**
- Progress is always within [0, 100] for any (chapter index, paragraph index) pair in a valid Book.
- Progress never decreases when the reader moves forward through Paragraphs in reading order.

---

### Requirement 6: Persist and Restore Reading Position

**User Story:** As a reader, I want to return to exactly where I stopped so that I do not lose my place between sessions.

#### Acceptance Criteria

1. WHEN a Book is loaded successfully, THE Storage SHALL save that Book's text and file name on the device (text in IndexedDB), replacing any previously saved Book.
2. WHEN the reader advances to a new Paragraph, THE Storage SHALL write the current Position (chapter index, paragraph index) to localStorage.
3. WHEN the reader opens the app and a saved Book and Position exist, THE Reader_UI SHALL restore that Book and render the saved Paragraph as the active, visible paragraph without requiring any additional user action.
4. IF Storage is unavailable or the saved Position contains a value that is not a non-negative integer for chapter index or paragraph index, THEN THE Reader_UI SHALL start from the beginning of the Book without crashing.
5. IF the saved Position refers to a chapter index or paragraph index that does not exist in the saved Book, THEN THE Reader_UI SHALL start from the beginning of the Book without crashing.
6. IF a saved Position exists but the saved Book cannot be read, THEN THE Reader_UI SHALL show the empty state and invite the reader to choose a book, without crashing.
7. WHEN the reader loads a different Book, THE Storage SHALL reset the Position to the first Paragraph of the first Chapter.
8. THE Storage SHALL NOT transmit book text, Position, or Average_Pace to any server.

**Property tests (fast-check):**
- For any valid Position, saving it to Storage and then reading it back returns a Position equal to the original (round-trip identity).
- For any stored value that is not a valid Position for the Book (malformed or out of bounds), restoring returns the first Paragraph of the first Chapter.

---

### Requirement 7: Pace Guide

**User Story:** As a reader, I want a gentle suggested reading time for each paragraph so that I can pace myself without being penalized.

#### Acceptance Criteria

1. WHERE the Pace_Guide is enabled, THE Reader_UI SHALL display a timer icon alongside the active Paragraph showing the suggested time as a whole number of seconds, with a minimum displayed value of 1 second.
2. THE Pace_Calculator SHALL derive the suggested time for a Paragraph in seconds by dividing the Paragraph's word count by the reader's Average_Pace in words per minute, multiplying by 60, and rounding up to the nearest whole second.
3. WHEN the reader has no recorded Average_Pace, THE Pace_Calculator SHALL use a default of 200 words per minute.
4. IF a Paragraph contains zero words, THEN THE Pace_Calculator SHALL return a suggested time of 1 second for that Paragraph.
5. WHEN the suggested time for the current Paragraph expires, THE Reader_UI SHALL NOT block the reader from continuing or apply any penalty.
6. WHEN the reader advances past a Paragraph, THE Storage SHALL update Average_Pace using the formula: new_average = (0.8 × previous_average) + (0.2 × actual_pace_for_paragraph), where actual_pace_for_paragraph is the word count of that Paragraph divided by the time the reader spent on it in minutes.
7. IF the time spent on a Paragraph is less than 1 second or more than 10 minutes, or the Paragraph contains zero words, THEN THE Storage SHALL leave Average_Pace unchanged for that Paragraph.
8. THE Storage SHALL keep Average_Pace within the range 50 to 1000 words per minute.
9. WHERE the Pace_Guide is disabled, THE Reader_UI SHALL hide the timer icon.
10. WHERE the Pace_Guide is disabled, THE Storage SHALL continue to update Average_Pace when the reader advances past a Paragraph, using the same update rules as when enabled.

**Property tests (fast-check):**
- For any two Paragraphs where Paragraph A has more words than Paragraph B, THE Pace_Calculator SHALL return a suggested time for A that is greater than or equal to the suggested time for B, given the same Average_Pace.
- The suggested time is always a positive whole number of seconds for any Paragraph and any positive Average_Pace.
- For any sequence of paragraph reading times, Average_Pace stays within 50 to 1000 words per minute.

---

### Requirement 8: Built-in Library

**User Story:** As a reader, I want to pick a book that is already in the app so that I can start reading without uploading a file.

#### Acceptance Criteria

1. WHEN no Book is loaded, THE Reader_UI SHALL show both a Library of built-in books and a control to load the reader's own file.
2. THE Library SHALL contain only public-domain books, bundled with the app as static files, each listed with its title and author.
3. WHEN the reader chooses a Library book, THE Parser SHALL load it through the same parsing, chapter, and paragraph rules that apply to a reader's own file.
4. WHEN the reader chooses a Library book, THE Reader_UI SHALL fetch it only from the app's own origin and SHALL NOT contact any third-party server.
5. IF a Library book fails to load, THEN THE Reader_UI SHALL display a plain error message and keep any Book already loaded.
6. WHILE a Book is loaded, THE Reader_UI SHALL provide a control to return to the Library and file-loading screen.