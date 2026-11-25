# Requirements Document

## Introduction

Library-v2 turns the start screen of "Read or Dread" into a library that looks like a finished product, and makes reading start where the story starts. It has two halves.

The visible half is a candle-lit study at night. The reader sees a welcome header with their name, a "Continue reading" hero card for their current book, and a grid of about 16 public-domain classics shown as covers. Hovering over or focusing a cover shows a short, spoiler-free card. Books sit on three shelves (Reading, Want to read, Finished), each book remembers its own place, and a first visit offers a short onboarding and a local profile (display name and candle colour, no account). When a book opens, front matter such as the title page, contents, and copyright is skipped so reading begins at the story, and very short paragraphs are merged into reading chunks of about 40 words or more.

The stored half replaces the scattered saved data with one versioned local data model: the reader's profile, shelves, per-book reading positions, and reading stats. Today this data lives in separate places: `rod_state` (one book's position and pace) and `rod_pace_guide` in localStorage, and a single `current` record in the `rod_books` IndexedDB database. That supports one book at a time. Library-v2 keeps everything on the device, behind one small storage interface (the Data_Store). Screens and logic talk only to the Data_Store. A later spec can add an optional "Sign in to sync" by supplying a second implementation of the same interface, without changing any screen.

The catalogue is bundled with the app. Each book ships as an EPUB file and a cover image taken from Standard Ebooks (CC0). A one-off script downloads them politely and extracts the covers, so the library never contacts another server while in use. The Standard Ebooks copy of Pride and Prejudice replaces the current Internet Archive copy. Reader-facing catalogue data (title, author, description, reading time, mood tags, cover path, EPUB path) lives in bundled data, and every bundled asset is listed in the README with its source and licence.

Data model, validation, migration, front-matter detection, chunk merging, and shelf and stats calculations are pure functions in `src/reader/` (and a new `src/library/` folder for the model and catalogue), with no DOM access, so they can be property-tested with fast-check. Browser storage access is limited to one adapter file. Visual design follows the steering files `design.md` and `haunt-safety.md` (colours only through CSS custom properties, WCAG AA contrast, bundled fonts, no UI component library, visible focus rings, buttons that say what they do).

Out of scope: sign-in, accounts, sync, any server piece, points and the penance skip (not part of this spec), haunt settings (`haunt-feature`), and the camera choice (`attention-signal`). Haunt settings and the camera choice keep their current storage. Book text stays in IndexedDB, as today, and is not part of the sync-capable data model. No sign-in is built.

Suggested build order (informational only, not a requirement): cover grid with hover cards, the Continue reading card, and per-book progress end to end first; then shelves, profile, and onboarding; then front-matter skipping and chunk merging; then the design polish pass.

## Glossary

- **Library_App**: The "Read or Dread" browser application.
- **Library_Screen**: The start screen of the Library_App. It contains the Welcome_Header, the Continue_Card, the Catalogue grid, and the Shelf_View.
- **Welcome_Header**: The top section of the Library_Screen that greets the reader and shows the Avatar when a Profile exists.
- **Catalogue**: The bundled list of about 16 public-domain classics, each with an EPUB file and a Cover. A Catalogue_Entry is one item in it.
- **Catalogue_Data**: The bundled data file holding, for each Catalogue_Entry, the slug, title, author, description, reading time in minutes, one or two Mood_Tags, cover path, and EPUB path.
- **Catalogue_Script**: The one-off script in `scripts/` that downloads the Catalogue EPUB files from Standard Ebooks and extracts each Cover. The Library_App does not run it.
- **Cover**: The cover image of a book, shown as a card in the Catalogue grid. For an uploaded book without a cover image, the Library_App draws a Placeholder_Cover.
- **Placeholder_Cover**: A cover drawn from the book's title and author, used when no cover image exists or an image fails to load.
- **Hover_Card**: The short card shown beside or below a Cover, with a two-sentence description, the reading time, and Mood_Tags.
- **Mood_Tag**: A short lowercase word describing the mood of a book, for example gothic, romance, or adventure.
- **Continue_Card**: The hero card on the Library_Screen for the reader's current book. It shows the Cover, the title, the progress, and a "Continue" button.
- **Current_Book**: The Book_Entry on the `reading` Shelf whose Position has the latest saved-at time.
- **Profile**: The reader's local settings: display name (optional), Candle_Colour, onboarding-completed flag, Pace_Guide setting, and Average_Pace. There is no account.
- **Candle_Colour**: One of a fixed set of named candle flame colours the reader picks as an Avatar. Each is a CSS custom property.
- **Avatar**: A small candle drawing in the reader's Candle_Colour.
- **Onboarding**: The first-visit introduction of at most three short steps.
- **First_Visit_State**: The state in which the Profile holds no display name, the default Candle_Colour, and an onboarding-completed flag of false.
- **Skeleton**: A grey-warm placeholder shape that holds the layout of content while it loads. It is not a spinner.
- **Front_Matter**: The parts of an EPUB that come before the story: title page, half title, contents, epigraph, dedication, and copyright page.
- **Front_Matter_Detector**: The pure function that, given an EPUB's landmarks and `epub:type` markers and its ordered chapters, returns the Story_Start.
- **Story_Start**: The Position (chapter index, paragraph index) of the first paragraph of the story.
- **Reading_Chunk**: One or more consecutive paragraphs of the same chapter, joined in order, that the reader opens with one click.
- **Chunk_Merger**: The pure function that groups paragraphs of one book into Reading_Chunks.
- **Data_Model**: The single versioned record that holds the Profile, Shelves, Book_Entries, Positions, per-book Stats, and Daily_Stats. It contains no book text.
- **Schema_Version**: A positive whole number stored in the Data_Model that identifies its shape. The first Library-v2 version is 2. Version 1 is the legacy, unversioned data.
- **Book_Entry**: The record for one book the reader has opened: a stable Book_Id, title, author (may be empty), file name, source (`catalogue` or `upload`), format (`txt` or `epub`), the catalogue slug for catalogue books, and the time it was added.
- **Book_Id**: A stable string that identifies a book across sessions. For an upload it is the SHA-256 hash of the file bytes, computed with `crypto.subtle` and written as lowercase hexadecimal. For a catalogue book it is the catalogue slug.
- **Shelf**: A named list of Book_Ids. The three built-in Shelves are `reading`, `want-to-read`, and `finished`.
- **Position**: The chapter index, the index of the first paragraph of the current Reading_Chunk, a saved-at time, and a progress whole number from 0 to 100, stored per Book_Id.
- **Stats**: Reading counts recorded per book and per calendar day, and summed for an overall view: paragraphs read, chapters finished, active reading seconds, away seconds, look-away count, and session count. Away seconds are the whole seconds the attention signal is `away` while a book is open, excluding any break the reader started.
- **Local_Date**: A calendar date written `YYYY-MM-DD` from the device's local time zone, not UTC.
- **Daily_Stats**: The Stats counts recorded for one Local_Date across all books, kept in the Data_Model under that date.
- **Data_Store**: The small storage interface (`load`, `save`, `clear`, and per-book text `getText`, `putText`, `deleteText`) that all screens and logic use to read and write the Data_Model.
- **Local_Store**: The only Data_Store implementation in this spec. It keeps the Data_Model in localStorage and book text in IndexedDB.
- **Migrator**: The pure function that converts a Data_Model of an older Schema_Version, or legacy version-1 data, into the current Schema_Version.
- **Validator**: The pure function that checks unknown data against the current Data_Model shape and returns a valid Data_Model or a list of problems.
- **Serializer**: The pure function that converts a Data_Model to text, and its inverse, the parser, that converts text back to a Data_Model.
- **Legacy_Data**: Data written by earlier versions: `rod_state`, `rod_pace_guide`, and the `current` record in the `rod_books` database.
- **Shelf_View**: The section of the Library_Screen that shows the three Shelves and their books.
- **Reduced_Motion**: The state in which the browser reports `prefers-reduced-motion: reduce`.

## Requirements

### Requirement 1: Bundled Catalogue

**User Story:** As a reader, I want a ready shelf of classic books that open instantly, so that I can start reading without finding or uploading a file.

#### Acceptance Criteria

1. THE Library_App SHALL bundle exactly 16 Catalogue_Entries, each with one EPUB file and one Cover image served from the app's own origin.
2. THE Catalogue_Data SHALL hold for each Catalogue_Entry a unique slug, a title, an author, a description, a reading time in whole minutes, one or two Mood_Tags, a cover path, and an EPUB path.
3. THE Catalogue SHALL include the Standard Ebooks copy of Pride and Prejudice and SHALL NOT include the Internet Archive copy.
4. WHILE the Library_App is in use, THE Library_App SHALL load every Catalogue EPUB and Cover from the app's own origin and SHALL send no request to any other server for them.
5. WHEN the maintainer runs the Catalogue_Script, THE Catalogue_Script SHALL wait at least 1000 ms between consecutive requests to Standard Ebooks, send a descriptive User-Agent header, and save each EPUB under `public/books/`.
6. WHEN the Catalogue_Script has downloaded an EPUB, THE Catalogue_Script SHALL extract its cover image, save it as a WebP file of at most 400 pixels wide and at most about 100 KB under `public/covers/`, and report any book whose cover could not be extracted.
7. IF Standard Ebooks answers a request with HTTP status 403 or 429, THEN THE Catalogue_Script SHALL stop, report the status and the book being fetched, and leave files already saved unchanged.
8. THE README SHALL list every bundled EPUB and Cover with its source address and licence.
9. THE Library_App SHALL contain a description for every Catalogue_Entry that was written for this app and is not copied from Standard Ebooks or any other source.
10. IF a Catalogue EPUB or Cover file is missing or fails to load, THEN THE Library_App SHALL show the Placeholder_Cover for a missing Cover, and THE Library_App SHALL show a message stating that the book could not be opened and offering "Back to library" for a missing EPUB.
11. THE Catalogue SHALL consist of exactly these 16 Catalogue_Entries, each verified to exist on Standard Ebooks, where each path below follows `https://standardebooks.org/ebooks/`:
    - Dracula (`bram-stoker/dracula`)
    - Frankenstein (`mary-shelley/frankenstein`)
    - The Strange Case of Dr Jekyll and Mr Hyde (`robert-louis-stevenson/the-strange-case-of-dr-jekyll-and-mr-hyde`)
    - The Picture of Dorian Gray (`oscar-wilde/the-picture-of-dorian-gray`)
    - The Vampire by John Polidori (`john-william-polidori/the-vampire`, shown in the Library_App with the title "The Vampire" to match the title printed on its cover), which replaces Carmilla because Standard Ebooks does not publish Carmilla as a standalone book
    - The Turn of the Screw (`henry-james/the-turn-of-the-screw`)
    - The Hound of the Baskervilles (`arthur-conan-doyle/the-hound-of-the-baskervilles`)
    - Short Fiction by Edgar Allan Poe (`edgar-allan-poe/short-fiction`, shown in the Library_App with the title "Short Fiction" to match the title printed on its cover, and the author "Edgar Allan Poe")
    - Pride and Prejudice (`jane-austen/pride-and-prejudice`)
    - Jane Eyre (`charlotte-bronte/jane-eyre`)
    - Wuthering Heights (`emily-bronte/wuthering-heights`)
    - A Christmas Carol (`charles-dickens/a-christmas-carol`)
    - Treasure Island (`robert-louis-stevenson/treasure-island`)
    - The Time Machine (`h-g-wells/the-time-machine`)
    - The Invisible Man by H. G. Wells (`h-g-wells/the-invisible-man`)
    - The Adventures of Sherlock Holmes (`arthur-conan-doyle/the-adventures-of-sherlock-holmes`)
12. THE Library_App SHALL contain no bundled `the-yellow-wallpaper.txt` placeholder file and no library entry for it, and THE Catalogue SHALL NOT include it.
13. THE Library_App SHALL bundle the Dracula EPUB as exactly `public/books/dracula.epub`, matching the epubPath of its Catalogue_Entry in exact letter case, and SHALL contain no file or reference named `Dracula.epub`.

### Requirement 2: Catalogue Grid

**User Story:** As a reader, I want to browse the books as covers, so that choosing a book feels like walking along a shelf.

#### Acceptance Criteria

1. THE Library_Screen SHALL show the Catalogue as a grid of Covers, each followed by the title and the author.
2. WHEN the reader activates a Cover by mouse click, by Enter, or by Space, THE Library_App SHALL open that book.
3. THE Library_App SHALL give every Cover an accessible name that contains the title and the author.
4. THE Library_App SHALL make every Cover reachable in reading order with the Tab key and SHALL show a focus ring in `--accent` on the focused Cover.
5. IF a Catalogue_Entry has an empty author, THEN THE Library_Screen SHALL show the title and leave the author blank without an error.
6. WHEN a Cover image fails to load, THE Library_Screen SHALL show the Placeholder_Cover for that entry and keep the title and author visible.
7. WHILE a Cover image is loading, THE Library_Screen SHALL reserve the Cover's final width and height so that the grid does not shift when the image appears.

### Requirement 3: Hover Cards

**User Story:** As a reader, I want a short preview of a book without opening it, so that I can pick something I will enjoy.

#### Acceptance Criteria

1. WHEN the pointer rests on a Cover for 200 ms, or the Cover receives keyboard focus, THE Library_Screen SHALL show the Hover_Card for that Cover without opening the book.
2. THE Hover_Card SHALL show a description of exactly two sentences that contains no plot spoiler, the approximate reading time, and one or two Mood_Tags.
3. THE Library_App SHALL format a reading time under 90 minutes as minutes rounded to the nearest 5, and a reading time of 90 minutes or more as whole hours rounded to the nearest hour.
4. WHEN the pointer leaves the Cover and the Hover_Card, or the Cover loses keyboard focus, THE Library_Screen SHALL hide the Hover_Card.
5. WHEN the reader presses the Escape key while a Hover_Card is shown, THE Library_Screen SHALL hide the Hover_Card and keep focus on its Cover.
6. WHEN the Hover_Card is shown, THE Library_Screen SHALL fade it in beside the Cover where at least 280 px of free width exists beside the Cover, and SHALL place it below the Cover otherwise.
7. THE Hover_Card SHALL NOT cover the title or the author of its own Cover.
8. WHERE the device has no hover input, THE Library_Screen SHALL show a button labelled "About this book" on each Cover that shows the Hover_Card when activated.
9. WHILE a Hover_Card is shown, THE Library_Screen SHALL make its text readable by screen readers through a description linked to its Cover.
10. THE Library_Screen SHALL show only one Hover_Card at a time.

### Requirement 4: Welcome Header and Continue Reading Card

**User Story:** As a returning reader, I want to see my name and jump straight back into my current book, so that I start reading within one click.

#### Acceptance Criteria

1. WHERE the Profile holds a display name, THE Welcome_Header SHALL greet the reader by that name.
2. WHERE the Profile holds no display name, THE Welcome_Header SHALL show a greeting without a name and without a placeholder name.
3. WHERE a Profile exists, THE Welcome_Header SHALL show the Avatar in the Candle_Colour of the Profile.
4. WHILE a Current_Book exists, THE Library_Screen SHALL show the Continue_Card above the Catalogue grid with the Cover, the title, the author, the progress as a whole percentage with a progress bar, and a button labelled "Continue".
5. WHEN the reader activates the "Continue" button, THE Library_App SHALL open the Current_Book at its saved Position.
6. THE Library_App SHALL choose as Current_Book the Book_Entry on the `reading` Shelf whose Position has the latest saved-at time, and SHALL choose the Book_Entry with the latest added time when no Position exists for any `reading` Book_Entry.
7. WHILE no Book_Entry is on the `reading` Shelf, THE Library_Screen SHALL show a warm empty state in place of the Continue_Card, with text inviting the reader to choose a book and a button labelled "Choose a book" that moves focus to the Catalogue grid.
8. IF the Current_Book is a Book_Entry whose text is missing, THEN THE Continue_Card SHALL show the book as needing its file to be opened again and SHALL offer the actions described in Requirement 6.
9. THE Continue_Card button SHALL have a minimum size of 44 by 44 CSS pixels.

### Requirement 5: Positions and Per-Book Progress

**User Story:** As a reader, I want each book to remember its own place and show how far I am, so that switching books never loses my spot.

#### Acceptance Criteria

1. WHEN the reader opens the next Reading_Chunk, THE Library_App SHALL save the Position for the current Book_Id within 500 ms of the Reading_Chunk opening.
2. WHEN the reader opens a Book_Entry, THE Library_App SHALL restore the Position saved for its Book_Id and show the Reading_Chunk that contains the saved paragraph as the active Reading_Chunk.
3. FOR ALL valid Positions, saving then restoring SHALL return a Position equal to the saved one in chapter index and paragraph index (round-trip property).
4. THE Library_App SHALL keep a separate Position for each Book_Id, and saving one Position SHALL leave every other Position unchanged.
5. IF a restored Position lies beyond the end of the loaded book, THEN THE Library_App SHALL clamp it to the last paragraph of the last chapter and open the book at that paragraph without showing an error.
6. THE Library_App SHALL compute progress for each Book_Entry as a whole number from 0 to 100 using the reader-core progress calculator, counting only the story paragraphs that start at the Story_Start, and SHALL store that number in the Position when the Position is saved.
7. WHEN a Book_Entry has a stored progress greater than 0, THE Library_Screen SHALL show a progress bar and the whole percentage on the Cover card and in the Shelf_View.
8. IF no Position is saved for a Book_Id, THEN THE Library_App SHALL open the Book_Entry at the Story_Start, with progress 0.
9. IF the saved Position for a Book_Id cannot be read or is malformed, THEN THE Library_App SHALL open the Book_Entry at the Story_Start, show a message saying the saved place could not be restored, and leave Positions for all other Book_Ids unchanged.
10. IF saving a Position fails, THEN THE Library_App SHALL keep the reader on the current Reading_Chunk, show a message saying the place could not be saved, and retain the previously saved Position for that Book_Id.
11. IF saving a Position fails, THEN THE Library_App SHALL show a small banner in the reader view, in addition to the message on the Library_Screen, that does not block reading, can be dismissed by the reader, and does not cover the active Reading_Chunk.
12. WHEN a later Position save succeeds, THE Library_App SHALL remove the banner from the reader view.

### Requirement 6: Books and Shelves

**User Story:** As a reader, I want to keep several books and sort them into shelves, so that I can see what I am reading, what is next, and what I finished.

#### Acceptance Criteria

1. WHEN the reader opens a Catalogue book or an uploaded book for the first time, THE Library_App SHALL create exactly one Book_Entry for it, with a unique Book_Id, and place that Book_Id on the `reading` Shelf.
2. WHEN the reader opens a book that already has a Book_Entry, THE Library_App SHALL reuse that Book_Entry without creating a second one, SHALL restore its saved Position, and SHALL leave the Book_Id on its current Shelf.
3. WHEN the reader finishes the last paragraph of the last chapter of a book, THE Library_App SHALL move its Book_Id to the `finished` Shelf in the same change that removes it from its previous Shelf.
4. WHEN the reader moves a book to a Shelf, THE Library_App SHALL add the Book_Id to the target Shelf and remove it from its previous Shelf in the same change, so that no observable state shows the Book_Id on both Shelves or on neither.
5. WHEN the reader confirms removal of a book from the library, THE Library_App SHALL delete its Book_Entry, Position, and Stats from the Data_Model and its text from IndexedDB as one operation, and SHALL remove the Book_Id from every Shelf.
6. IF any part of the removal in criterion 5 fails, THEN THE Library_App SHALL leave the Book_Entry, Position, Stats, and book text unchanged, and SHALL show an error message stating that the book was not removed and that the reader can try again.
7. THE Shelf_View SHALL list the Book_Entries of each Shelf, showing the Cover, the title, and the author of each, and SHALL show the Catalogue books in the Catalogue grid regardless of which Shelf holds their Book_Id.
8. THE Shelf_View SHALL offer a button on each shelved book labelled "Move to Reading", "Move to Want to read", or "Move to Finished", omitting the label of the Shelf that already holds the book.
9. THE Library_Screen SHALL show the control labelled "Open your own book".
10. WHILE the viewport is 360px wide or more, THE Shelf_View SHALL show no horizontal scroll.
11. FOR ALL sequences of shelf operations (open, finish, move, remove), every Book_Id SHALL appear on at most one Shelf, and a removed Book_Id SHALL appear on none (invariant property).
12. IF the book text for a Book_Entry is missing from IndexedDB when the reader opens it, THEN THE Library_App SHALL show a message stating that the text is missing, SHALL offer two actions, "Reopen the file" and "Choose the book again", and SHALL keep the Book_Entry, its Shelf, and its Position unchanged.
13. IF a Book_Entry has no author, THEN THE Shelf_View SHALL show the title and leave the author blank without an error.

### Requirement 7: Reader Profile

**User Story:** As a reader, I want a local profile with my name and a candle colour, so that the library feels like mine without an account.

#### Acceptance Criteria

1. THE Profile SHALL hold an optional display name of 1 to 40 characters after leading and trailing spaces are removed, one Candle_Colour from a fixed set of six named colours, an onboarding-completed flag, the Pace_Guide setting, and the Average_Pace.
2. THE Library_App SHALL define each Candle_Colour as a CSS custom property in `src/ui/theme.css`, with a contrast ratio of at least 3:1 against `--surface`.
3. WHEN the reader saves a display name and a Candle_Colour, THE Library_App SHALL save them to the Profile through the Data_Store within 1 second and show them on the next app open.
4. WHERE no display name is set, THE Library_App SHALL show no name, show no placeholder name, and require none to save the Profile or use any feature.
5. IF a display name is longer than 40 characters after leading and trailing spaces are removed, THEN THE Validator SHALL reject the Profile, THE Library_App SHALL keep the previous name, and THE Library_App SHALL show a message stating that the name must be 40 characters or fewer.
6. WHEN the reader opens settings, THE Library_App SHALL let the reader change the display name, change the Candle_Colour, and choose "Delete my profile".
7. WHEN the reader chooses "Delete my profile", THE Library_App SHALL show a confirmation prompt that states the name and colour will be removed and that books, shelves, positions, and stats will be kept, with a "Cancel" choice and a confirm choice.
8. WHEN the reader confirms "Delete my profile", THE Library_App SHALL reset the Profile to the First_Visit_State and keep every Book_Entry, Shelf, Position, and Stats record unchanged.
9. WHEN the reader cancels the "Delete my profile" confirmation, or dismisses it with the Escape key, THE Library_App SHALL keep the Profile unchanged.
10. WHEN a reading session records a new pace, THE Library_App SHALL update Average_Pace and keep it within 50 to 1000 words per minute inclusive.
11. IF a recorded pace is below 50 or above 1000 words per minute, THEN THE Library_App SHALL set Average_Pace to the nearest bound and keep the Profile otherwise unchanged.
12. WHEN the reader changes the Pace_Guide setting, THE Library_App SHALL save the new value to the Profile through the Data_Store within 1 second and show the saved value on the next app open.
13. IF the Data_Store fails to save the Profile, THEN THE Library_App SHALL keep the previous saved values, keep the reader's current in-session values, and show a message stating that the save failed and the reader can try again.
14. THE Library_App SHALL show each Candle_Colour option with a text name in addition to its colour.

### Requirement 8: First-Visit Onboarding

**User Story:** As a first-time reader, I want a short, friendly introduction, so that I know how the app works without reading a manual.

#### Acceptance Criteria

1. WHEN the Library_App opens and the Profile is in the First_Visit_State, THE Library_App SHALL show the Onboarding before the Library_Screen content.
2. THE Onboarding SHALL consist of at most three steps, each with at most 40 words of text.
3. THE Onboarding SHALL let the reader enter an optional display name and choose a Candle_Colour in the first step.
4. THE Onboarding SHALL explain in plain words, in one of its steps, how reading works: click to open the next paragraph, and the room grows haunted when the reader looks away.
5. THE Onboarding SHALL offer, in its last step, a choice between opening a Catalogue book and "Open your own book".
6. THE Onboarding SHALL show a button labelled "Skip introduction" on every step.
7. WHEN the reader finishes or skips the Onboarding, THE Library_App SHALL set the onboarding-completed flag to true, save the Profile, and show the Library_Screen.
8. WHEN the onboarding-completed flag is true, THE Library_App SHALL NOT show the Onboarding again unless the reader chooses "Delete my profile".
9. THE Onboarding SHALL be fully operable with the keyboard, with visible focus rings and focus moving to the first control of each new step.
10. THE Onboarding SHALL NOT replace or remove the photosensitivity notice required by `haunt-safety.md`, and THE Library_App SHALL show that notice before the first reading session.
11. THE Library_App SHALL let the reader complete the Onboarding with the camera off and without any account.
12. IF the Profile cannot be saved when the Onboarding ends, THEN THE Library_App SHALL show the Library_Screen, keep the reader's choices in memory for the session, and show a message that the profile will not be saved after the tab closes.

### Requirement 9: Front-Matter Skipping

**User Story:** As a reader, I want a book to open where the story begins, so that I do not click through a title page, contents, and copyright notice.

#### Acceptance Criteria

1. WHEN a book opens for the first time, THE Front_Matter_Detector SHALL return the Story_Start from the EPUB's landmarks, using the `bodymatter` landmark where present.
2. WHERE the EPUB has no usable `bodymatter` landmark, THE Front_Matter_Detector SHALL use `epub:type` markers: a chapter marked `titlepage`, `halftitle`, `frontmatter`, `toc`, `epigraph`, `dedication`, `copyright-page`, or `imprint` SHALL be Front_Matter, and the first chapter not marked as Front_Matter SHALL start the story.
3. IF the EPUB has neither a usable landmark nor `epub:type` markers, or the Front_Matter_Detector cannot find a Story_Start, THEN THE Library_App SHALL start at the first paragraph of the first chapter, as it does today.
4. THE Front_Matter_Detector SHALL return only chapters that precede the Story_Start as Front_Matter, so that no paragraph of the story is skipped when landmarks exist (invariant property).
5. WHEN the Library_App opens a book with no saved Position, THE Library_App SHALL set the active Reading_Chunk to the first Reading_Chunk at the Story_Start.
6. WHEN a Position is saved for a book, THE Library_App SHALL restore the Position without applying the Story_Start.
7. THE Library_App SHALL keep Front_Matter in the loaded book as earlier chapters, so that the reader can scroll back to it above the first story paragraph, and SHALL keep chapter indices counted from the first chapter of the EPUB.
8. WHERE a book is a plain text file, THE Library_App SHALL apply no Front_Matter detection and SHALL start at the first paragraph, as it does today.
9. THE Front_Matter_Detector SHALL be a pure function with no DOM access that takes the parsed landmark and marker data and the ordered chapters and returns the Story_Start.
10. WHEN the Library_App finishes a book, THE Library_App SHALL treat the first story paragraph, not the first Front_Matter paragraph, as the start for progress, as described in Requirement 5.

### Requirement 10: Reading Chunks

**User Story:** As a reader, I want very short paragraphs grouped together, so that I do not click through a line at a time.

#### Acceptance Criteria

1. WHEN a book is loaded, THE Chunk_Merger SHALL group the paragraphs of each chapter, in order, into Reading_Chunks that each hold at least 40 words.
2. THE Chunk_Merger SHALL keep every paragraph whole and SHALL NOT split a paragraph across two Reading_Chunks.
3. THE Chunk_Merger SHALL keep a paragraph of 40 words or more as its own Reading_Chunk.
4. THE Chunk_Merger SHALL NOT merge paragraphs of different chapters into one Reading_Chunk.
5. IF the final paragraphs of a chapter hold fewer than 40 words in total and the chapter has an earlier Reading_Chunk, THEN THE Chunk_Merger SHALL append them to the last Reading_Chunk of that chapter.
6. IF a whole chapter holds fewer than 40 words, THEN THE Chunk_Merger SHALL return that chapter as one Reading_Chunk.
7. FOR ALL books, joining all Reading_Chunks back into paragraphs SHALL return the original paragraphs, with no text lost, added, or reordered (round-trip property).
8. THE Chunk_Merger SHALL separate merged paragraphs inside a Reading_Chunk with a paragraph break, so that the reader sees them as separate paragraphs.
9. THE Chunk_Merger SHALL be a pure function with no DOM access.
10. THE Library_App SHALL save and restore Positions by the index of the first paragraph of the active Reading_Chunk, so that Positions saved before this spec remain valid.

### Requirement 11: Visual Design

**User Story:** As a reader, I want the library to feel like a candle-lit study at night, so that I want to sit down and read.

#### Acceptance Criteria

1. THE Library_Screen SHALL present a candle-lit study at night: dark warm wood tones, a soft vignette, and Covers lit as if by candlelight.
2. THE Library_App SHALL set every colour on the Library_Screen through CSS custom properties defined in `src/ui/theme.css`, and SHALL add any new colour for this screen to that file.
3. THE Library_Screen SHALL show text at a contrast ratio of at least 4.5:1 against its background, including text on cards, on the Hover_Card, on the Continue_Card, and dimmed secondary text.
4. THE Library_Screen SHALL use Cormorant Garamond for headings and titles, Literata for descriptions, and the system UI font for interface labels, all bundled with `@fontsource` packages and none loaded from a third-party server.
5. THE Library_App SHALL draw each Cover with a subtle shadow and a spine edge on its left side.
6. THE Library_App SHALL build the Library_Screen from small hand-written components with plain CSS and SHALL NOT use a UI component library.
7. THE Library_Screen SHALL give every interactive element a visible focus ring in `--accent`, a label readable by screen readers, and keyboard operation.
8. THE Library_Screen SHALL label every button with what it does, such as "Continue", "Open your own book", "Choose a book", and "Skip introduction".
9. THE Library_Screen SHALL keep each component source file under 200 lines.
10. THE Library_Screen SHALL use warm, short, slightly gothic wording and SHALL state in plain words what happened and what to do next in every error message.

### Requirement 12: Motion and Transitions

**User Story:** As a reader, I want gentle motion that makes the library feel alive without distracting me, so that the screen is pleasant and safe.

#### Acceptance Criteria

1. WHEN the pointer rests on a Cover or the Cover receives keyboard focus, THE Library_Screen SHALL lift the Cover by at most 8 px and tilt it by at most 4 degrees over 150 to 300 ms.
2. WHEN the pointer leaves the Cover or the Cover loses focus, THE Library_Screen SHALL return the Cover to rest over 150 to 300 ms.
3. WHILE Reduced_Motion is on, THE Library_Screen SHALL apply no lift and no tilt, and SHALL show hover and focus changes as a fade of at most 200 ms or as no animation.
4. WHEN the reader opens a book, THE Library_App SHALL fade the Library_Screen down and fade the reading room up, within a total of 600 ms.
5. WHILE Reduced_Motion is on, THE Library_App SHALL replace the open-book transition with a fade of at most 200 ms or an instant change.
6. IF the book has not finished loading when the transition ends, THEN THE Library_App SHALL show Skeleton content in the reading room until the book is ready.
7. WHERE the Library_Screen shows a candle glow animation, THE Library_Screen SHALL change its brightness slowly and subtly, with no flashing faster than 3 times per second.
8. WHILE Reduced_Motion is on, THE Library_Screen SHALL show the candle glow as a static light.
9. THE Library_Screen SHALL fade the Hover_Card in over 150 to 250 ms.

### Requirement 13: Empty States and Skeletons

**User Story:** As a reader, I want the library to look finished even when it is empty or still loading, so that I never face a blank screen or a spinner.

#### Acceptance Criteria

1. WHILE the Data_Model or the Catalogue_Data is loading, THE Library_Screen SHALL show Skeletons for the Welcome_Header, the Continue_Card, and the Catalogue grid, and SHALL show no spinner.
2. WHILE a Cover image is loading, THE Library_Screen SHALL show a Skeleton of the same size in its place.
3. WHILE Reduced_Motion is on, THE Library_Screen SHALL show Skeletons as static shapes without a shimmer.
4. WHEN a Shelf holds no books, THE Shelf_View SHALL show a short warm message for that Shelf, such as "Nothing on this shelf yet", and a button that moves focus to the Catalogue grid.
5. WHEN loading finishes, THE Library_Screen SHALL replace the Skeletons with the real content without moving other content on the screen.
6. IF loading the Catalogue_Data fails, THEN THE Library_Screen SHALL show a message stating that the catalogue could not be loaded and a button labelled "Try again", and SHALL still show the Shelf_View and "Open your own book".

### Requirement 14: Responsive Layout

**User Story:** As a reader on any device, I want the library to work from a phone to a large desktop, so that I can pick up my book anywhere.

#### Acceptance Criteria

1. WHILE the viewport is between 360 px and 3840 px wide, THE Library_Screen SHALL show no horizontal scroll.
2. WHILE the viewport is 360 px wide, THE Catalogue grid SHALL show two Covers per row.
3. WHEN the viewport width grows, THE Catalogue grid SHALL add Covers per row so that each Cover is between about 130 px and 200 px wide, SHALL show about 5 to 6 Covers per row at 1440 px, and SHALL keep the grid centred.
4. WHILE the viewport is narrower than 600 px, THE Continue_Card SHALL stack the Cover above the title, progress, and "Continue" button.
5. WHILE the viewport is 600 px wide or more, THE Continue_Card SHALL show the Cover beside the title, progress, and "Continue" button.
6. THE Library_Screen SHALL make every button and Cover at least 44 by 44 CSS pixels.
7. THE Library_Screen SHALL keep the Hover_Card fully inside the viewport.
8. WHILE the text size is set to 200 percent in the browser, THE Library_Screen SHALL keep all text and controls reachable without overlap.

### Requirement 15: Book Identity

**User Story:** As a reader, I want a book to keep its identity across sessions, so that two different files never share one saved place.

#### Acceptance Criteria

1. WHEN the reader uploads a book, THE Library_App SHALL compute the SHA-256 hash of the file bytes with `crypto.subtle` and use its lowercase hexadecimal form as the Book_Id.
2. THE Library_App SHALL use the catalogue slug as the Book_Id of a Catalogue book.
3. WHEN the reader uploads two files with different bytes, THE Library_App SHALL give them different Book_Ids even when the file names and sizes are equal.
4. WHEN the reader uploads a file whose bytes equal those of an existing upload, THE Library_App SHALL reuse the existing Book_Entry and SHALL NOT create a second one.
5. IF the hash cannot be computed, THEN THE Library_App SHALL NOT add the book, SHALL keep the Data_Model unchanged, and SHALL show a message stating that the book could not be added and what the reader can do next.
6. THE Library_App SHALL compute the hash on the device and SHALL NOT transmit the file or the hash.

### Requirement 16: Single Versioned Data Model

**User Story:** As a reader, I want my profile, shelves, positions, and stats kept in one consistent record, so that nothing I saved gets out of step.

#### Acceptance Criteria

1. THE Data_Model SHALL contain exactly one Schema_Version (a positive whole number), one Profile, the three built-in Shelves, zero or more Book_Entries, at most one Position per Book_Id, and one Stats record.
2. THE Data_Model SHALL exclude book text, including paragraph text, chapter text, and EPUB file contents.
3. THE Data_Model SHALL hold Average_Pace as a finite number within 50 to 1000 words per minute inclusive.
4. IF a Shelf, a Position, or a Stats record lists a Book_Id that has no matching Book_Entry, THEN THE Validator SHALL reject the Data_Model and report the offending Book_Id and the record type that lists it.
5. IF a Book_Id appears in more than one of the three built-in Shelves, or appears more than once in the same Shelf, THEN THE Validator SHALL reject the Data_Model and report the offending Book_Id.
6. IF a Position holds an index that is negative, fractional, or not a finite number, a saved-at time that is not a finite number, or a progress that is not a whole number from 0 to 100, THEN THE Validator SHALL reject the Data_Model and report the offending Book_Id.
7. IF any Stats count is negative, fractional, or not a finite number, THEN THE Validator SHALL reject the Data_Model and report the name of the offending count.
8. IF the Profile holds a Candle_Colour outside the fixed set, or a display name longer than 40 characters, THEN THE Validator SHALL reject the Data_Model and report the offending field.
9. IF the Validator rejects a Data_Model, THEN THE Data_Store SHALL keep the previously saved Data_Model unchanged and SHALL NOT write the rejected Data_Model.
10. WHEN every check in criteria 1 to 8, 11, and 12 passes, THE Validator SHALL accept the Data_Model.
11. THE Data_Model SHALL hold Daily_Stats records keyed by Local_Date, each with the six Stats counts.
12. IF a Daily_Stats key is not a valid `YYYY-MM-DD` calendar date, or any Daily_Stats count is negative, fractional, or not a finite number, THEN THE Validator SHALL reject the Data_Model and report the offending date or count name.

### Requirement 17: Storage Interface

**User Story:** As a developer, I want every screen to use one small storage interface, so that a sync option can be added later without changing the screens.

#### Acceptance Criteria

1. THE Data_Store SHALL expose exactly six operations: `load`, `save`, and `clear` for the Data_Model, and `getText`, `putText`, and `deleteText` for book text keyed by Book_Id.
2. THE Data_Store SHALL return every operation's result as either a success value or a failure value, and SHALL NOT throw an exception or return a rejected promise to the caller.
3. IF a Data_Store operation fails (for example storage is unavailable, storage quota is exceeded, or stored data cannot be parsed), THEN THE Data_Store SHALL return a failure value that identifies the failure category and SHALL leave previously stored data unchanged.
4. WHEN `getText` is called with a Book_Id that has no stored text, THE Data_Store SHALL return a failure value identifying "not found" and SHALL NOT return an empty string as a success value.
5. WHEN `load` is called and no Data_Model has been saved, THE Data_Store SHALL return a success value containing the default empty Data_Model in the First_Visit_State.
6. WHEN `deleteText` or `clear` is called for data that does not exist, THE Data_Store SHALL return a success value.
7. THE Library_App SHALL read and write the Data_Model and book text only through the Data_Store.
8. THE Library_App SHALL obtain the Data_Store from a single creation point, so that replacing the Local_Store requires no change to any screen.
9. THE Data_Store interface SHALL NOT include any type, parameter, or operation that references the network, an account, or a user identity.
10. THE Local_Store SHALL be the only code in the Library_App that reads or writes localStorage or IndexedDB for Data_Model data and book text.

### Requirement 18: Local Persistence

**User Story:** As a reader, I want my library to be there when I come back, so that I can continue where I stopped.

#### Acceptance Criteria

1. WHEN the Library_App changes the Data_Model, THE Local_Store SHALL write the whole Data_Model to localStorage as one record within 1000 ms of the change.
2. WHEN the Library_App starts, THE Local_Store SHALL read the Data_Model from localStorage and return it only if the Validator accepts it.
3. IF no Data_Model record exists in localStorage at start, THEN THE Local_Store SHALL return an empty Data_Model containing zero Book_Entry items and SHALL NOT report a failure.
4. IF the stored Data_Model record is not parseable or the Validator rejects it, THEN THE Local_Store SHALL return a failure value that identifies the record as invalid, SHALL leave the stored record unchanged, and THE Library_App SHALL start with an empty Data_Model held in memory.
5. FOR ALL valid Data_Model values, parsing the output of the Serializer SHALL produce a Data_Model equal to the original (round-trip property).
6. WHEN the Library_App adds a Book_Entry, THE Local_Store SHALL write the book text to IndexedDB under the Book_Id of that Book_Entry.
7. WHEN the Library_App removes a Book_Entry, THE Local_Store SHALL delete the book text stored in IndexedDB under the Book_Id of that Book_Entry.
8. IF localStorage or IndexedDB is unavailable, or a write is rejected because storage is full, THEN THE Local_Store SHALL return a failure value that identifies which store failed, SHALL leave previously stored data unchanged, and THE Library_App SHALL continue to work for the current session with the Data_Model held in memory.
9. IF the Data_Model write fails, THEN THE Library_App SHALL show a message of at most 120 characters saying that progress will not be saved after the tab closes, and SHALL keep the message visible until the reader dismisses it or a later Data_Model write succeeds.
10. WHERE a Catalogue book is opened, THE Local_Store SHALL NOT copy its EPUB into IndexedDB, and THE Library_App SHALL load the bundled EPUB from the app's own origin each time.

### Requirement 19: Migration from Legacy Data

**User Story:** As a returning reader, I want my current book and position carried over, so that updating the app does not lose my place.

#### Acceptance Criteria

1. WHEN the Library_App starts, IF no version-2 Data_Model exists and Legacy_Data exists, THEN THE Migrator SHALL produce a version-2 Data_Model from the Legacy_Data within 2 seconds, without altering the Legacy_Data.
2. WHEN the Migrator reads a valid `rod_state` record, THE Migrator SHALL create exactly one Book_Entry for its file name, set that book's Position to the stored value with a progress of 0 until the book is next opened, set Average_Pace to the stored value, and place the Book_Id on the `reading` Shelf. A `rod_state` record is valid IF it parses as JSON, has a non-empty file name of at most 255 characters, has a Position that is a non-negative integer no greater than the book's paragraph count, and has an Average_Pace that is a finite number greater than 0.
3. WHEN the Migrator reads a valid `rod_pace_guide` value, THE Migrator SHALL set the Pace_Guide setting in the Profile to that value. A `rod_pace_guide` value is valid IF it equals one of the Pace_Guide values the Library_App supports.
4. WHEN the Migrator creates the Profile, THE Migrator SHALL set it to the First_Visit_State apart from the Pace_Guide and Average_Pace values, so that the reader sees the Onboarding once.
5. WHEN the Local_Store migrates a legacy book, THE Local_Store SHALL compute the Book_Id as the SHA-256 hash of the stored `current` book text bytes, and the Migrator SHALL receive that Book_Id as an input so that the Migrator remains a pure function.
6. WHEN the Local_Store completes a successful write of the version-2 Data_Model, THE Local_Store SHALL copy the `current` book text to the Book_Id key, confirm the copy reads back identical to the source, and only then remove the Legacy_Data keys.
7. THE Local_Store SHALL keep every Legacy_Data key and value unchanged until the version-2 Data_Model write has succeeded and read back as valid.
8. FOR ALL Data_Model values of Schema_Version 2, THE Migrator SHALL return a value deeply equal to its input (idempotence property).
9. IF a Legacy_Data record fails validation, THEN THE Migrator SHALL ignore that record, keep that record's Legacy_Data key unchanged in storage, and continue with the remaining records.
10. IF the stored Schema_Version is greater than the version the Library_App supports, THEN THE Local_Store SHALL leave the stored data untouched, THE Library_App SHALL start with an empty in-memory Data_Model, THE Library_App SHALL NOT write to the stored data during that session, and THE Library_App SHALL show a message that the saved data comes from a newer version.
11. IF the stored data is not valid JSON or fails validation, THEN THE Library_App SHALL start with an empty Data_Model, SHALL show a message that the saved data could not be read, and SHALL NOT overwrite the stored data until the reader makes their first change.
12. IF the version-2 Data_Model write fails, or the `current` book text copy fails or does not read back identical, THEN THE Local_Store SHALL keep all Legacy_Data keys, THE Library_App SHALL show a message that the data could not be carried over, and THE Migrator SHALL retry on the next start.
13. IF Legacy_Data exists but the `current` book text is missing while a valid `rod_state` record exists, THEN THE Migrator SHALL still create the Book_Entry and Position using a Book_Id derived from the file name with the prefix `legacy-`, and THE Library_App SHALL show that book as needing its file to be opened again.

### Requirement 20: Reading Stats

**User Story:** As a reader, I want simple stats for each book, for each day, and overall, so that I can see that I am making progress and how my days went.

#### Acceptance Criteria

1. WHEN the reader opens a Reading_Chunk for the first time in the current book session, THE Library_App SHALL add the number of paragraphs in that Reading_Chunk to the paragraphs-read count of the current book and of the Daily_Stats record for the current Local_Date.
2. WHEN the reader finishes a chapter for the first time, THE Library_App SHALL add one to the chapters-finished count of the current book and of the Daily_Stats record for the current Local_Date.
3. WHILE the attention signal is `present` and a book is open, THE Library_App SHALL add the elapsed whole seconds to the active reading seconds of the current book and of the Daily_Stats record for the current Local_Date, updating at least once every 5 seconds.
4. WHEN the attention signal changes from `present` to `away`, THE Library_App SHALL add one to the look-away count of the current book and of the Daily_Stats record for the current Local_Date.
5. WHEN the reader opens a book and no book has been opened since the page loaded, THE Library_App SHALL add one to the session count of that book and of the Daily_Stats record for the current Local_Date, once for that page load.
6. THE Stats calculator SHALL compute overall Stats as the sum of the per-book Stats, for each of paragraphs-read, chapters-finished, active reading seconds, away seconds, look-away count, and session count.
7. FOR ALL sequences of stat events, no per-book Stats count, no overall Stats count, and no Daily_Stats count SHALL decrease, except when a book is removed (see criterion 10) and when a Daily_Stats record is pruned (see criterion 16).
8. THE Library_App SHALL record Stats as non-negative integer counts and whole seconds only, and SHALL NOT record camera frames, face data, or book text.
9. WHERE the camera is off, THE Library_App SHALL record look-away counts and away seconds from the tab-switch and idle signal exposed by the attention module, using the same rules as criteria 4 and 13.
10. WHEN the reader removes a book, THE Library_App SHALL recompute overall Stats as the sum of the Stats of the remaining books, so that the removed book's Stats no longer contribute, and SHALL leave every Daily_Stats record unchanged, so that the history of days read is kept.
11. IF Stats cannot be saved or read from device storage, THEN THE Library_App SHALL keep the current session's Stats in memory, continue reading without interruption, and show a message that says progress stats were not saved.
12. WHEN the reader opens the stats view for a book, for a day, or for all books with no recorded events, THE Library_App SHALL show zero for every Stats value, including away seconds.
13. WHILE the attention signal is `away`, a book is open, and no break started by the reader is in progress, THE Library_App SHALL add the elapsed whole seconds to the away seconds of the current book and of the Daily_Stats record for the current Local_Date, updating at least once every 5 seconds.
14. WHILE a break started by the reader is in progress, THE Library_App SHALL add no away seconds and no look-away count, so that a break is never counted as a breach.
15. THE Library_App SHALL key each Daily_Stats record by the Local_Date taken from the device's local time zone at the moment the event is recorded.
16. WHEN the Library_App records an event, THE Library_App SHALL delete Daily_Stats records older than 90 days before the current Local_Date and SHALL keep every record within those 90 days.
17. THE Stats calculator functions SHALL receive the current Local_Date as an input parameter and SHALL NOT read the clock.
18. FOR ALL sequences of stat events with no book removal and no pruning, the sum of the Daily_Stats values SHALL equal the sum of the per-book Stats values, for each of the six Stats fields (invariant property; the equality holds for events before any removal, because removal leaves Daily_Stats unchanged).

### Requirement 21: Screens Stay Independent of Storage

**User Story:** As a developer, I want screens to depend only on the model and the interface, so that a sync implementation can be added without touching them.

#### Acceptance Criteria

1. THE Library_App SHALL provide the Data_Store to screens through exactly one React context or hook, and no screen source file SHALL import localStorage or IndexedDB code, directly or through a module outside the Data_Store interface.
2. THE Library_App SHALL implement each model update (add book, move shelf, save position, record stats, remove book, update profile) as a pure function that takes a Data_Model and returns a new Data_Model, leaves the input Data_Model unchanged, and returns the same output for the same input.
3. WHERE a test supplies an in-memory Data_Store through the context or hook, THE Library_App screens SHALL complete add book, move shelf, save position, record stats, remove book, and update profile with no change to screen source code.
4. WHEN the Library_App starts, THE Library_App SHALL load the Data_Model exactly once and show the Shelf_View within 500 ms of the load request on a library of 100 Book_Entries.
5. IF loading the Data_Model fails or the stored data cannot be read, THEN THE Library_App SHALL show the Library_Screen with an empty shelf state, show a message stating that saved books could not be loaded and what the reader can do next, and leave the stored data unchanged.
6. IF a model update is applied to a Book_Entry that does not exist (move shelf, save position, record stats, or remove book), THEN THE Library_App SHALL return the Data_Model unchanged.

### Requirement 22: Privacy and No Sign-In

**User Story:** As a reader, I want to be sure my data stays on my device, so that I can trust the app with the books I read.

#### Acceptance Criteria

1. THE Library_App SHALL keep the Data_Model and book text on the device and SHALL NOT transmit either to any server.
2. THE Library_App SHALL display no sign-in, account, or sync control on any screen.
3. WHEN the reader opens the Library_App for the first time with no prior data, THE Library_App SHALL allow the reader to open a Catalogue book or upload a book, read it, and save progress without any account, sign-in, or registration step.
4. WHILE the Library_App is running, THE Library_App SHALL issue zero network requests that carry Data_Model data or book text in the request URL, headers, or body, and SHALL request only files from its own origin.
5. THE Data_Model SHALL contain no field that identifies a person, other than the optional display name the reader typed, which is limited to 40 characters.
6. WHEN the reader chooses "Clear my data" in settings, THE Library_App SHALL display a confirmation prompt that states what will be deleted (profile, shelves, positions, stats, uploaded book text, and Legacy_Data) and offers a "Cancel" choice and a confirm choice.
7. WHEN the reader confirms "Clear my data", THE Library_App SHALL delete the Data_Model, all book text, and all Legacy_Data from the device, and SHALL show the Onboarding, followed by an empty Shelf_View.
8. WHEN the reader cancels the "Clear my data" confirmation, or dismisses it with the Escape key, THE Library_App SHALL keep the Data_Model, book text, and Legacy_Data unchanged.
9. IF deletion of any stored data fails during "Clear my data", THEN THE Library_App SHALL show an error message stating that some data could not be deleted and offering a retry, and SHALL NOT report the data as cleared.

### Requirement 23: Tests

**User Story:** As a developer, I want the risky logic covered by property tests and the rest by a few example tests, so that saved progress and reading text are never lost without spending time on low-risk code.

#### Acceptance Criteria

1. THE Library_App SHALL include fast-check property tests for each of the following: the Serializer round trip, the Position save and restore round trip, the Migrator keeping the saved Position, Average_Pace, and Book_Entry of generated Legacy_Data (including idempotence on migrated data), the shelf invariant, the Front_Matter_Detector, and the Chunk_Merger.
2. THE Front_Matter_Detector property test SHALL check that the Story_Start never lies after the first story paragraph when landmarks exist, that every skipped chapter precedes the Story_Start, and that inputs without landmarks or markers return the first paragraph of the first chapter.
3. THE Chunk_Merger property test SHALL check that joining the Reading_Chunks returns the original paragraphs in the original order, that no Reading_Chunk spans two chapters, that no paragraph is split, and that every Reading_Chunk holds at least 40 words except where Requirement 10 criterion 6 allows fewer.
4. WHERE time allows, THE Library_App MAY include one property test named "Daily totals sum to per-book totals", checking criterion 20.18, and a few example tests for the Stats rule that no count decreases.
5. THE Library_App SHALL use example tests, with a few representative cases each, for the remaining behaviour: Local_Store write failure, unavailable storage, and a newer Schema_Version, using a fake localStorage and a fake IndexedDB; Library_Screen cards showing title and author, the "Open your own book" control, and card selection by mouse click and by keyboard; Hover_Card display on hover and on focus and its dismissal with Escape; the reading-time formatter; the Catalogue_Data check that every entry has a two-sentence description, one or two Mood_Tags, and cover and EPUB files that exist at exactly the case-sensitive path in the entry (including `public/books/dracula.epub`); the README listing of every bundled asset; the display name length rule; Onboarding having at most three steps and a working "Skip introduction"; "Delete my profile" keeping books; two uploads with equal name and size but different bytes receiving different Book_Ids; and reduced-motion styles removing lift and tilt.
6. IF a Local_Store example test covers write failure or unavailable storage, THEN THE test SHALL assert that previously saved data is unchanged and that the Local_Store reports the failure to its caller instead of returning a default value.
7. IF a Local_Store example test covers a newer Schema_Version, THEN THE test SHALL assert that the stored data is not overwritten or migrated and that the Local_Store reports that the version is unsupported.
8. THE Library_App property tests SHALL use the fast-check default number of runs unless a specific property needs more to find bugs.
9. IF a single test file takes more than about 30 minutes to get working, THEN THE developer SHALL stop and ask the user before continuing.
10. WHEN a property test finds a counterexample, THE developer SHALL record the failing property, the shrunk counterexample, and the seed in `docs/BUILD_LOG.md` before changing the test or the code under test.
11. WHEN a test task is completed, THE developer SHALL report which properties were added, how many cases ran, and any counterexample found.
12. THE developer SHALL NOT weaken, delete, or mock the function under test to make a failing test pass.
