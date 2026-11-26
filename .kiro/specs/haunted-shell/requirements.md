# Requirements Document

## Introduction

Haunted-shell turns the app shell of "Read or Dread" into a haunted reading room. The drama lives in the library and its tabs. The reading page stays calm, and it is haunted only when the reader looks away, as the `ghost-dread` spec already defines.

The shell gets three header tabs: Library, The Ledger (reading insights) and The Séance (settings). The Séance replaces the gear-icon settings dialog. The library and the tabs sit in near-darkness. Outside the light, cover images and the background are dimmed and desaturated and a vignette darkens the edges. A small flickering flame follows the pointer and its red-amber glow lights what is under it. Smoke wisps rise slowly from the bottom of the screen. Covers tilt and glow. A chosen book's cover burns away before the book opens, and a large lurking ghost peeks from a screen edge now and then.

Every visual choice lives in one file, `src/ui/shellEffects.ts`, with named options: `cursorLight` ('flame' or 'pool'), `ambient` ('smoke' or 'fog') and `bookOpen` ('burn' or 'fade'), plus named strengths. The defaults are the new looks ('flame', 'smoke', 'burn'). The earlier looks ('pool', 'fog', 'fade') stay working, and one changed value switches back to them with no other edit.

The Ledger is built from the per-day and per-book Stats and the shelves in the library-v2 Data_Model. The Ledger shows the reader's measured reading pace, which needs one deliberate addition to the data model: a `wordsRead` count in every Stats record, raised by the word count of each paragraph when it is recorded as read. Old saved data without `wordsRead` is kept and read as 0. This addition raises the Schema_Version from 2 to 3 and supersedes the six-count wording of library-v2 Requirement 16 and the version-2 wording of its Migrator requirement. `wordsRead` is the only new tracking; it is a number and holds no book text. The one new stored setting is the daily reading goal, kept under its own key like the haunt settings are. The Séance reuses the existing settings logic: `useProfileActions` and `ProfileSettings` content for name, candle colour, pace guide, delete profile and clear data; the haunt settings store for Haunt_Mode; the saved camera choice in `src/attention/storage.ts`; and the `rod_volume_cap` key that the Safety_Gate already reads. The lurking ghost reuses the bundled images in `public/ghosts/` listed in `GHOST_ASSETS`.

Out of scope: any change to the reading page's look or behaviour, the haunt engine, the Safety_Gate, or the catalogue (the only changes that touch the reading flow are that the existing stats recorder also passes a word count, see Requirement 11, that it caps the away seconds it records, see Requirement 21, and that the reading haunts draw the bundled ghost images instead of the drawn ghost, see Requirement 22, which changes no haunt-safety limit); any data model change other than `wordsRead`; new dependencies; new tracking other than `wordsRead`; the camera recalibration control named in the attention-signal spec (no recalibration exists in the app yet); word-level eye tracking; sound in the library shell (the lurking ghost is silent); a points system.

A later revision (Requirements 19 to 22) makes the Shell tabs use a proper desktop width, turns the Ledger into a card dashboard with the same data and calculations, stops one long look-away from ruining the Focus_Score, and gives the app one ghost: the bundled images in `public/ghosts/`, smaller in the library and used by the reading haunts. Requirement 21 supersedes the library-v2 wording of away seconds for newly recorded time. Requirement 22 supersedes, for how the ghost figure and the jumpscare close-up are drawn, the ghost-dread wording that the Ghost is a drawn SVG or canvas silhouette with no image file (ghost-dread Requirement 9 criteria 1 and 7, Requirement 11 criterion 9 and the Ghost glossary entry); ghost-dread Requirements 14 and 15 already name the bundled images, and the ghost-dread spec files are not edited.

Visual rules follow the steering files `design.md` and `haunt-safety.md`: colours only through CSS custom properties, WCAG AA contrast, bundled fonts, no UI component library, visible focus rings, components under 200 lines, and a reading room at night in tone.

## Glossary

- **Library_App**: The "Read or Dread" browser application.
- **Shell**: The screen frame shown when no book is open. It holds the Tab_Bar and the active Tab_Panel. It is not shown while a book is open.
- **Tab_Bar**: The header control with three tabs: Library, The Ledger and The Séance.
- **Tab_Panel**: The content area that belongs to one tab.
- **Library_Tab**: The tab that holds the existing Library_Screen (welcome header, Continue_Card, shelves, catalogue, open-your-own-book control).
- **Ledger_Tab**: The tab "The Ledger", which shows reading insights.
- **Seance_Tab**: The tab "The Séance", which holds the settings.
- **Saved_Tab**: The name of the last active tab, kept in localStorage under the key `rod_shell_tab`.
- **Darkness**: The dark treatment of the Shell that makes it look nearly unlit. It has three parts: a dark layer over the Shell background, the dimming and desaturation of cover images outside the Cursor_Light, and the Vignette. It never changes text and sits behind all text and controls.
- **Vignette**: A dark gradient that deepens toward the screen edges, part of the Darkness.
- **Effect_Options**: The single file `src/ui/shellEffects.ts` that holds the named options `cursorLight`, `ambient` and `bookOpen` and the named strengths (image brightness, image saturation, background brightness, vignette, light radius, flame glow radius and peak alpha, smoke peak alpha, smoke rise time, burn duration, burn spark count, ghost height, ghost visible fraction, peek delay ranges).
- **Cursor_Light**: The light drawn at the Light_Anchor: the Flame_Cursor with its Flame_Glow when `cursorLight` is 'flame', or the Candle_Pool when it is 'pool'.
- **Flame_Cursor**: A small flickering reddish-orange flame drawn at the pointer position with CSS or canvas.
- **Flame_Glow**: The local, low-alpha, warm red-amber glow around the Flame_Cursor that flickers with the flame and lights what is under it.
- **Ambient_Layer**: The layer along the bottom of the screen that is the Smoke_Layer when `ambient` is 'smoke', or the Fog_Layer when it is 'fog'.
- **Smoke_Layer**: Visible smoke wisps that rise slowly from the bottom of the screen, drawn with CSS or canvas.
- **Burn**: The first part of the Opening_Transition when `bookOpen` is 'burn': the chosen cover catches fire from its edges and burns away with a glowing ember edge and a few rising sparks.
- **Demo_Mode**: The state in which the page URL query contains `demo=1`. It only changes the Peek delays, for filming.
- **Peek_Delay_Range**: The delay before each Peek. Normally it is a random 45 to 90 seconds for every Peek. In Demo_Mode it is exactly 3 seconds before the first Peek after the page loads, and a random 4 to 6 seconds before every later Peek.
- **Candle_Pool**: The warm radial pool of light, about 280 px across, that lights what is under it. Its colour comes from the Profile's Candle_Colour.
- **Candle_Colour**: One of the six named colours in the Profile, each a CSS custom property (`--candle-amber`, `--candle-rose`, `--candle-violet`, `--candle-teal`, `--candle-ash`, `--candle-moss`).
- **Light_Anchor**: The point on which the Candle_Pool is centred. It is the pointer position while the pointer was the last input, and the centre of the focused element while the keyboard or touch was the last input.
- **Fog_Layer**: The slow drifting fog along the bottom of the screen, drawn with CSS or canvas. It is shown only when `ambient` is 'fog'.
- **Cover_Card**: A cover in the catalogue grid, the shelves or the Continue_Card.
- **Cover_Effect**: The set of tilt toward the pointer, warm edge glow and flickering shadow on a Cover_Card.
- **Opening_Transition**: The sequence shown when a book opens: the Burn first when `bookOpen` is 'burn', then the candle gutters, the screen dims to dark for about 600 ms, and the reader fades up. The part after the Burn is the existing sequence.
- **Lurking_Ghost**: The existing ghost image from `public/ghosts/` that peeks from a screen edge on the Library_Tab, drawn at about 22 percent of the viewport height (20 to 24 percent).
- **Peek**: One appearance of the Lurking_Ghost, about 1.5 seconds long.
- **Control**: Any button, link, input, select, slider, tab or other interactive element, including the Continue_Card button.
- **Haunt_Mode**: One of Gentle, Classic or Nightmare, kept in the haunt settings store. Classic is the default.
- **Reduced_Motion**: The state in which the browser reports `prefers-reduced-motion: reduce`.
- **Stats**: The reading counts kept per book and per day: paragraphs read, chapters finished, active reading seconds, look-away count, session count, away seconds (capped per Look_Away by the Away_Cap, for time recorded after Requirement 21 is built) and, added by this spec, words read.
- **Words_Read**: The `wordsRead` count in a Stats record: the sum of the word counts of the paragraphs recorded as read. The word count of a paragraph is the one computed by `countWords` in `src/reader/paceCalc.ts`.
- **Schema_Version**: The version number stored in the Data_Model. Version 2 is the library-v2 shape without Words_Read. Version 3 is the version 2 shape plus Words_Read in every Stats record.
- **Paragraph_Recorded**: The existing moment at which the stats recorder (`src/ui/useStatsRecorder.ts`) adds one to paragraphs read, which is the first time a paragraph opens in a page load.
- **Local_Date**: A calendar date `YYYY-MM-DD` from the device's local time zone.
- **Today**: The Local_Date of the current moment, passed in to the Ledger calculations so they stay pure.
- **Focus_Score**: A whole number from 0 to 100 equal to the active reading seconds divided by the sum of active reading seconds and away seconds, times 100, rounded to the nearest whole number. It is undefined when that sum is 0. The away seconds in it are the recorded away seconds, which Requirement 21 caps per look-away.
- **Away_Cap**: 120 seconds. The most away time the stats recorder records for one Look_Away.
- **Look_Away**: One continuous period in which the Attention_Signal is `away`, from the change to `away` to the next change to `present` (or to the book closing).
- **Break_Period**: A Look_Away longer than the Away_Cap. Its first 120 seconds are recorded as away seconds and the rest is not recorded, so it counts as a break and not as distraction.
- **Shell_Max_Width**: 75rem (1200 px), the widest the Shell tab content and the Tab_Bar grow, centred, with side padding of `clamp(1rem, 4vw, 2.5rem)`.
- **Dashboard_Card**: A panel on the Ledger_Tab with a `--surface` background, a rounded corner, the same padding and the same gap to its neighbours, and a Cormorant Garamond heading.
- **Pace_Bar**: The horizontal bar on the Pace card that shows the Measured_Pace on a scale from 0 to 400 wpm, with markers at 238 and 260 wpm.
- **Progress_Ring**: The circular progress drawing of the Goal_Progress on the Daily goal card.
- **Stat_Tile**: One of the four tiles on the "Your reading" card: books finished, books in progress, paragraphs read, chapters read.
- **Ghost_Image**: One of the bundled files `public/ghosts/ghost-standing.png` and `public/ghosts/ghost-face.png`, listed in `GHOST_ASSETS` and loaded only through `assetUrl` as a same-origin URL beginning with `/ghosts/`.
- **Image_Layer**: The gate's visual layer that shows one Ghost_Image at a given opacity, scale and position, as defined in ghost-dread. It is the only way a reading haunt shows a ghost.
- **Reading_Haunts**: The haunts that draw a ghost during reading: `ghostFigure` (the figure while the reader is away) and `jumpscare` (the close-up on return).
- **Reading_Day**: A Local_Date on which the active reading seconds in the Daily_Stats are above 0.
- **Daily_Goal**: The number of minutes, a whole number from 1 to 240, that the reader sets as a daily reading target. The default is 15. It is kept under the key `rod_daily_goal`.
- **Goal_Progress**: A whole number from 0 to 100 equal to Today's active reading seconds divided by the Daily_Goal in seconds, times 100, rounded and capped at 100.
- **Moon_Phase**: One of five phases for a Reading_Day's progress toward the Daily_Goal: new moon (no reading), crescent, half moon, gibbous and full moon (goal met).
- **Pace_Days**: The days in the per-day Stats (Daily_Stats) whose Words_Read is above 0. Days saved before Words_Read existed have Words_Read 0 and are not Pace_Days.
- **Measured_Pace**: The reader's own reading pace in words per minute, equal to the summed Words_Read of the Pace_Days divided by the quantity (summed active reading seconds of the same Pace_Days divided by 60), rounded to the nearest whole number. It does not use the Profile's average pace and does not use the active reading seconds of days that are not Pace_Days.
- **Pace_Threshold**: 120 active reading seconds (2 minutes). The Measured_Pace is shown only when the summed active reading seconds of the Pace_Days are at least the Pace_Threshold.
- **Typical_Speeds**: 238 words per minute for non-fiction and 260 words per minute for fiction, the typical adult silent reading speeds.
- **Pace_Source**: The citation Brysbaert, M. (2019). How many words do we read per minute? A review and meta-analysis of reading rate. Journal of Memory and Language, 109, 104047.
- **Candle_Gauge**: The drawing of a candle whose remaining height shows a Focus_Score.
- **Tally_Marks**: Ghostly strokes grouped in fives that show the number of look-aways on one day.
- **Ledger_Calculator**: The pure functions, with no DOM access, that compute the Focus_Score, Moon_Phase, Goal_Progress, Measured_Pace and book counts from the Data_Model and Today.
- **Safety_Gate**: The existing code that is the only place applying the volume cap, fade-in, flash-rate and Reduced_Motion rules for haunt effects.
- **Volume_Cap**: The reader's maximum haunt output volume, a number from 0 to 1, stored under `rod_volume_cap` and read by the Safety_Gate. The default is 0.4.
- **Data_Store**: The existing storage interface for the Data_Model.

## Requirements

### Requirement 1: Tabbed navigation

**User Story:** As a reader, I want tabs for the library, my reading insights and my settings, so that I can move between them with a mouse or the keyboard alone.

#### Acceptance Criteria

1. WHEN no book is open, THE Shell SHALL show a Tab_Bar with exactly three tabs, labelled "Library", "The Ledger" and "The Séance", in that order.
2. THE Tab_Bar SHALL use the ARIA roles `tablist`, `tab` and `tabpanel`, SHALL set `aria-selected` on the active tab, and SHALL link each tab to its Tab_Panel with `aria-controls` and `aria-labelledby`.
3. WHEN the reader presses the Right Arrow key while a tab has focus, THE Tab_Bar SHALL move focus and selection to the next tab, and from the last tab to the first.
4. WHEN the reader presses the Left Arrow key while a tab has focus, THE Tab_Bar SHALL move focus and selection to the previous tab, and from the first tab to the last.
5. WHEN the reader presses the Home key or the End key while a tab has focus, THE Tab_Bar SHALL move focus and selection to the first tab or the last tab respectively.
6. THE Tab_Bar SHALL give only the active tab a tab stop (`tabindex` 0) and every other tab `tabindex` -1.
7. WHEN the reader activates a tab by click, Enter or Space, THE Shell SHALL show that tab's Tab_Panel and hide the other Tab_Panels.
8. WHEN the active tab changes, THE Shell SHALL write the tab name to the Saved_Tab.
9. WHEN the Shell opens, THE Shell SHALL show the tab named by the Saved_Tab.
10. IF the Saved_Tab is missing, unreadable or not one of the three tab names, THEN THE Shell SHALL show the Library_Tab without an error message.
11. IF writing the Saved_Tab fails, THEN THE Shell SHALL keep the current tab shown and continue without an error message.
12. WHILE a tab has keyboard focus, THE Tab_Bar SHALL show a focus ring in `--accent`.
13. WHEN a book opens, THE Shell SHALL hide the Tab_Bar, and WHEN the reader returns to the library, THE Shell SHALL show the Tab_Bar with the tab that was active when the book opened.
14. THE Tab_Bar SHALL fit within a 360 px wide screen without horizontal scrolling.

### Requirement 2: Settings move to The Séance

**User Story:** As a reader, I want my settings in a tab instead of a pop-up dialog, so that I can find and change them in one place.

#### Acceptance Criteria

1. THE Library_App SHALL remove the gear-icon Settings button and the settings dialog from the Library_Screen.
2. THE Seance_Tab SHALL show a field for the reader's name, with the same limit of 40 characters and the same validation message as the existing name field.
3. THE Seance_Tab SHALL show the six Candle_Colours as a radio group, each with its colour name.
4. THE Seance_Tab SHALL show a checkbox for the pace guide, labelled "Show the pace guide while reading", that reads and writes the Profile's pace guide setting.
5. THE Seance_Tab SHALL show the three Haunt_Modes, Gentle, Classic and Nightmare, as a radio group with a description of at most 120 characters for each.
6. WHEN the reader chooses a Haunt_Mode, THE Seance_Tab SHALL write it through the existing haunt settings store, so the reading view uses it without a reload.
7. THE Seance_Tab SHALL show the camera choice as two options, "Camera on" and "Camera off", with a privacy note that states that the camera feed is processed on the device and that no frame is stored or sent anywhere.
8. WHEN the reader chooses "Camera on" or "Camera off", THE Seance_Tab SHALL save the choice through `saveChoice` in `src/attention/storage.ts`.
9. WHEN the reader chooses "Camera on", THE Seance_Tab SHALL state in plain words that the browser asks for permission when the next book opens, and THE Seance_Tab SHALL NOT request camera access itself.
10. THE Seance_Tab SHALL show a Volume_Cap slider from 0 to 100 percent in steps of 5, with a text label and the current value shown as text, and WHEN the reader changes it, THE Seance_Tab SHALL write the value as a number from 0 to 1 under `rod_volume_cap`.
11. IF `rod_volume_cap` is missing or unreadable, THEN THE Seance_Tab SHALL show the slider at 40 percent, the default that the Safety_Gate uses.
12. THE Seance_Tab SHALL NOT apply the Volume_Cap to any sound itself, so the Safety_Gate stays the only code that applies it.
13. THE Seance_Tab SHALL show a "Delete my profile" button and a "Clear my data" button, each asking for confirmation with the same wording and the same effects as the existing confirmations.
14. WHEN the reader confirms "Clear my data" and the Data_Store clears successfully, THE Library_App SHALL also remove the Daily_Goal, the Saved_Tab and the Volume_Cap from localStorage, and the Seance_Tab SHALL show the defaults.
15. IF a Profile save fails, THEN THE Seance_Tab SHALL show the existing message "Your changes couldn't be saved. Try again." with `role="alert"`.
16. WHILE the Data_Store is loading, THE Seance_Tab SHALL disable the Profile controls.
17. THE Seance_Tab SHALL give every control a text label readable by screen readers and a visible focus ring, and SHALL work with the keyboard alone.
18. WHEN a confirmation is open, THE Seance_Tab SHALL move focus to its first control, and WHEN the reader presses Escape, THE Seance_Tab SHALL cancel the confirmation and return focus to the button that opened it.
19. THE Seance_Tab SHALL write `rod_volume_cap` from its own code in the shell, and SHALL NOT add a write to `src/haunts/engine/settings.ts` or any other Haunt_Engine file, so that the Haunt_Engine keeps no control for changing the Volume_Cap.
20. WHEN the reader changes the Volume_Cap in the Seance_Tab, THE Seance_Tab SHALL state that the new value is used from the next time a book opens.
21. IF the saved camera choice is unanswered or cannot be read, THEN THE Seance_Tab SHALL show neither camera option selected and SHALL state that the browser's camera question is asked when the next book opens.
22. THE Seance_Tab SHALL start no camera, request no camera permission and import no camera, detector or video code, so that the attention module stays the only code that touches the camera.
23. WHEN the reader chooses a Haunt_Mode or a camera choice in the Seance_Tab and later opens the top-bar Haunt_Control or the camera consent flow, THE Library_App SHALL show the same saved value, because each is read from the same store.

### Requirement 3: Candlelight cursor

**User Story:** As a reader, I want the library to sit in near-darkness lit by my own candle, so that the room feels haunted without making anything hard to read.

#### Acceptance Criteria

1. WHILE the Shell is shown, THE Shell SHALL draw the Darkness behind all text and Controls.
2. WHERE `cursorLight` is 'pool', THE Shell SHALL draw a Candle_Pool about 280 px across in the colour of the Profile's Candle_Colour, centred on the Light_Anchor, while the Shell is shown.
3. WHEN the pointer moves, THE Shell SHALL move the Light_Anchor to the pointer position within one animation frame.
4. WHEN an element receives keyboard focus, THE Shell SHALL move the Light_Anchor to the centre of the focused element.
5. WHEN the reader touches the screen, THE Shell SHALL move the Light_Anchor to the touch position and keep it there until the next pointer, touch or focus event.
6. WHILE no pointer, touch or focus event has happened since the Shell opened, THE Shell SHALL place the Light_Anchor at the centre of the Tab_Panel.
7. THE Shell SHALL keep every text colour, including `--text`, `--text-dim` and `--accent`, at a contrast ratio of at least 4.5:1 against the Darkness, with the Candle_Pool absent.
8. THE Shell SHALL keep every text colour at a contrast ratio of at least 4.5:1 against the brightest Candle_Pool colour composited over the Darkness, for each of the six Candle_Colours.
9. THE Shell SHALL use a Candle_Colour for text only where its measured contrast ratio against the Darkness is at least 4.5:1, and otherwise only for non-text drawing (glow, border, ring, mark) where library-v2 requires at least 3:1 against `--surface`.
10. THE Shell SHALL draw the Darkness and the Candle_Pool without changing the colour or opacity of any text.
11. THE Shell SHALL NOT let the Candle_Pool or the Darkness capture pointer events or take keyboard focus.
12. WHILE Reduced_Motion is active, THE Shell SHALL move the Candle_Pool without easing animation, following the Light_Anchor directly.
13. THE Shell SHALL NOT draw the Darkness or the Candle_Pool on the reading page.
14. IF the Profile's Candle_Colour is missing or not one of the six names, THEN THE Shell SHALL use `--candle-amber`.
15. WHEN the design for the Shell is written, THE Library_App design document SHALL record a measured contrast ratio for every Shell text colour (`--text`, `--text-dim`, `--accent`, `--danger` and every Candle_Colour used for text) against `--bg` and against `--surface`.
16. IF a measured text colour pair is below 4.5:1, THEN THE Library_App SHALL adjust that colour in `src/ui/theme.css` until the pair reaches at least 4.5:1, and SHALL record the colour name, the old value, the new value and the new ratio in `docs/BUILD_LOG.md`.

### Requirement 4: Fog along the bottom

**User Story:** As a reader, I want slow fog drifting along the bottom of the screen, so that the room feels alive without getting in my way.

#### Acceptance Criteria

1. WHERE `ambient` is 'fog', THE Shell SHALL draw a Fog_Layer along the bottom of the screen with CSS or a canvas, and without a new dependency, while the Shell is shown.
2. THE Fog_Layer SHALL sit behind all content, SHALL NOT capture pointer events, and SHALL NOT take keyboard focus.
3. THE Fog_Layer SHALL stay under all text, so that no text is drawn beneath a fog pixel.
4. WHILE Reduced_Motion is not active, THE Fog_Layer SHALL drift at a rate that takes at least 30 seconds to cross the screen once.
5. WHILE Reduced_Motion is active, THE Fog_Layer SHALL show a still image with no movement.
6. WHEN the document is hidden, THE Fog_Layer SHALL pause its animation.
7. THE Fog_Layer SHALL NOT change in brightness more than 3 times per second.
8. THE Fog_Layer SHALL NOT appear on the reading page.

### Requirement 5: Cover hover, tilt and glow

**User Story:** As a reader, I want covers that lean toward my pointer and glow like candlelight, so that choosing a book feels like handling something old and strange.

#### Acceptance Criteria

1. WHILE the pointer is over a Cover_Card and Reduced_Motion is not active, THE Cover_Card SHALL tilt toward the pointer by at most 8 degrees on each axis.
2. WHEN the pointer leaves a Cover_Card, THE Cover_Card SHALL return to its flat position within 400 ms.
3. WHILE the pointer is over a Cover_Card, THE Cover_Card SHALL show a warm edge glow in the Candle_Colour.
4. WHILE a Cover_Card has keyboard focus, THE Cover_Card SHALL show the same edge glow, SHALL NOT tilt, and SHALL keep a visible focus ring in `--accent`.
5. WHILE the pointer is over a Cover_Card and Reduced_Motion is not active, THE Cover_Card SHALL flicker its shadow slowly, with no more than 2 brightness changes per second.
6. WHILE Reduced_Motion is active, THE Cover_Card SHALL show the edge glow as a still style with no tilt and no flicker.
7. THE Cover_Effect SHALL NOT change the hover card from library-v2 or move the Cover_Card out of its grid cell, so that neighbouring Cover_Cards are not overlapped by more than 8 px.
8. THE Cover_Effect SHALL keep the Cover_Card's title and author text at a contrast ratio of at least 4.5:1.
9. WHILE the device has no hover (`hover: none`), THE Cover_Card SHALL show the edge glow only on keyboard focus or press, and SHALL NOT tilt.

### Requirement 6: Book-opening transition

**User Story:** As a reader, I want a short, theatrical moment when I open a book, so that stepping into the book feels like an event, without making me wait.

#### Acceptance Criteria

1. WHEN a book is opened from the Library_Tab, THE Opening_Transition SHALL show the candle guttering, then dim the screen to dark for about 600 ms, then fade the reader up. WHERE `bookOpen` is 'burn', the Burn of Requirement 17 plays before this sequence, and this sequence is otherwise unchanged.
2. THE Opening_Transition SHALL last at most 2700 ms from the moment the reader opens the book to the moment the reader is fully visible, made of the Burn at about 1200 ms plus the existing sequence at most 1500 ms. WHERE `bookOpen` is 'fade' or Reduced_Motion is active, THE Opening_Transition SHALL last at most 1500 ms. The limits apply when the book text is ready by the end of the dim, and Criterion 5 applies when it is not.
3. WHEN the reader presses any key, clicks, or touches the screen during the Opening_Transition, THE Opening_Transition SHALL end at once and show the reader fully visible.
4. THE Opening_Transition SHALL NOT block pointer or keyboard input, so that a click or key press during the transition reaches the page beneath.
5. WHILE the book text is still loading when the dim ends, THE Opening_Transition SHALL stay on the dark screen until the reader is ready, and SHALL show the existing loading state beneath the fade. The Burn never waits for loading: it ends after its own duration, the book text loads in parallel, and the extra wait is the load time only.
6. IF the book fails to open, THEN THE Opening_Transition SHALL end at once and the existing error and "Back to library" button SHALL show.
7. WHILE Reduced_Motion is active, THE Opening_Transition SHALL replace the guttering and dimming with a single fade of at most 300 ms.
8. THE Opening_Transition SHALL NOT flash or change brightness more than 3 times per second, and SHALL NOT show saturated red over the full screen.
9. THE Opening_Transition SHALL use no sound.
10. THE Opening_Transition SHALL NOT run when the reader returns to the library.

### Requirement 7: Lurking ghost

**User Story:** As a reader browsing the library, I want a ghost to peek in now and then, so that the library feels haunted.

#### Acceptance Criteria

1. WHILE the Library_Tab is active, the document is visible, the Haunt_Mode is Classic or Nightmare, and Reduced_Motion is not active, THE Lurking_Ghost SHALL start a Peek after the delay that the Peek_Delay_Range gives for that Peek, and SHALL then schedule the next Peek the same way.
2. WHEN a Peek starts, THE Lurking_Ghost SHALL appear from a screen edge using one of the images listed in `GHOST_ASSETS`, loaded from the app's own origin through a relative URL.
3. WHEN a Peek has been visible for about 1.5 seconds, THE Lurking_Ghost SHALL withdraw to the screen edge.
4. WHEN the pointer reaches the Lurking_Ghost during a Peek, THE Lurking_Ghost SHALL vanish at once.
5. THE Lurking_Ghost SHALL choose an edge position where the part of its bounding box inside the viewport does not overlap the bounding box of the Continue_Card button or of any other Control. The part of the ghost behind the screen edge is not counted.
6. IF no edge position is free of every Control, THEN THE Lurking_Ghost SHALL skip that Peek and schedule the next one.
7. THE Lurking_Ghost SHALL NOT capture pointer events other than the pointer reaching it, and SHALL NOT take keyboard focus.
8. WHEN the Haunt_Mode changes to Gentle during a Peek, THE Lurking_Ghost SHALL vanish at once and SHALL cancel the scheduled Peek.
9. WHILE the Haunt_Mode is Gentle, THE Lurking_Ghost SHALL NOT appear.
10. WHILE Reduced_Motion is active, THE Lurking_Ghost SHALL NOT appear.
11. WHEN the reader changes to the Ledger_Tab or the Seance_Tab, or a book opens, THE Lurking_Ghost SHALL cancel any Peek and scheduled Peek.
12. WHEN the reader returns to the Library_Tab, THE Lurking_Ghost SHALL schedule a new Peek with the delay that the Peek_Delay_Range gives for a Peek after the first.
13. THE Lurking_Ghost SHALL use no sound.
14. THE Lurking_Ghost SHALL NOT flash or change brightness more than 3 times per second.
15. THE Lurking_Ghost SHALL be hidden from screen readers with `aria-hidden="true"`.
16. THE Lurking_Ghost SHALL NOT appear on the reading page.

### Requirement 8: Ledger calculations

**User Story:** As a reader, I want the Ledger's numbers to be correct and sensible, so that I can trust what the candle tells me.

#### Acceptance Criteria

1. THE Ledger_Calculator SHALL compute the Focus_Score for one set of Stats from its active reading seconds and away seconds.
2. FOR ALL non-negative whole numbers of active reading seconds and away seconds whose sum is above 0, THE Ledger_Calculator SHALL return a Focus_Score between 0 and 100 inclusive.
3. IF the sum of active reading seconds and away seconds is 0, THEN THE Ledger_Calculator SHALL return no Focus_Score, and THE Ledger_Tab SHALL show that day as unlit rather than as 0.
4. THE Ledger_Calculator SHALL compute the Focus_Score for the last 7 days as the sum of active reading seconds over those days divided by the sum of active and away seconds over those days, not as the average of the daily scores.
5. THE Ledger_Calculator SHALL return the Reading_Days among the last 30 Local_Dates ending at Today, oldest first, with exactly 30 entries, using the existing `statsForLastDays` selector.
6. THE Ledger_Calculator SHALL map a day's active reading seconds and the Daily_Goal to a Moon_Phase: new moon for 0 seconds, crescent for above 0 and below 50 percent of the goal, half moon for 50 percent up to below 75 percent, gibbous for 75 percent up to below 100 percent, and full moon for 100 percent or more.
7. FOR ALL non-negative active reading seconds and every Daily_Goal from 1 to 240 minutes, THE Ledger_Calculator SHALL return exactly one of the five Moon_Phases, and the phase SHALL NOT move to an earlier phase when the active reading seconds increase and the Daily_Goal stays the same.
8. THE Ledger_Calculator SHALL compute the Goal_Progress from Today's active reading seconds and the Daily_Goal.
9. FOR ALL non-negative active reading seconds and every Daily_Goal from 1 to 240 minutes, THE Ledger_Calculator SHALL return a Goal_Progress between 0 and 100 inclusive.
10. WHEN the summed active reading seconds of the Pace_Days are at least the Pace_Threshold and the Measured_Pace rounds to 1 or more, THE Ledger_Calculator SHALL return the Measured_Pace computed from the summed Words_Read and the summed active reading seconds of the Pace_Days only.
11. IF there are no Pace_Days, or the summed active reading seconds of the Pace_Days are below the Pace_Threshold, or the Measured_Pace rounds to 0, THEN THE Ledger_Calculator SHALL return no Measured_Pace.
12. THE Ledger_Calculator SHALL NOT read the Profile's average pace, and SHALL NOT keep or add a second counter of reading time for the days saved before Words_Read existed.
13. FOR ALL lists of per-day Stats with non-negative whole numbers of Words_Read and active reading seconds, THE Ledger_Calculator SHALL return either no Measured_Pace or a whole number greater than 0, SHALL return no Measured_Pace whenever the summed active reading seconds of the Pace_Days are below the Pace_Threshold, and SHALL return the same Measured_Pace whether or not days with Words_Read 0 are added to the list.
14. THE Ledger_Calculator SHALL compute the number of books finished as the number of Book_Ids on the `finished` shelf that have a Book_Entry, and the number of books in progress as the number of Book_Ids on the `reading` shelf that have a Book_Entry.
15. THE Ledger_Calculator SHALL compute paragraphs read and chapters read as the sums of those fields in the overall Stats, using the existing `overallStats` selector.
16. THE Ledger_Calculator SHALL read the clock only through a `today` value passed in as input.
17. THE Ledger_Calculator SHALL contain no DOM access, so that it can be property-tested.
18. IF a Stats field is not a non-negative finite number, THEN THE Ledger_Calculator SHALL treat it as 0.
19. WHEN the reader sets a Daily_Goal, THE Ledger_Calculator SHALL clamp a value below 1 to 1 and a value above 240 to 240, and SHALL round a non-whole value to the nearest whole minute.

### Requirement 9: The Ledger tab

**User Story:** As a reader, I want a Ledger that shows how my reading is going, so that I am drawn back to the page tomorrow.

#### Acceptance Criteria

1. THE Ledger_Tab SHALL show the Focus_Score for Today and the Focus_Score for the last 7 days, each drawn as a Candle_Gauge that burns down as the score falls, with the score also written as text, for example "82% focus".
2. THE Ledger_Tab SHALL give each Candle_Gauge a text alternative that states what it shows and the score.
3. THE Ledger_Tab SHALL show the look-away count for each of the last 7 days as Tally_Marks, grouped in fives, with the count also written as text, laid out as Requirement 20 criterion 5 describes.
4. IF a day has more than 20 look-aways, THEN THE Ledger_Tab SHALL draw 20 Tally_Marks and write the full number beside them.
5. THE Ledger_Tab SHALL show the last 30 days as Moon_Phases, one per day, oldest first, with the date and the phase name available to screen readers for each.
6. THE Ledger_Tab SHALL explain in one line that a full moon means the Daily_Goal was met.
7. THE Ledger_Tab SHALL show the number of books finished, the number of books in progress, the number of paragraphs read and the number of chapters read.
8. WHEN the Ledger_Calculator returns a Measured_Pace, THE Ledger_Tab SHALL show it in words per minute next to the text "Typical adult: 238 wpm (non-fiction), 260 wpm (fiction)", with a plain sentence that states whether the Measured_Pace is below, near or above the Typical_Speeds, where below means under 214 wpm (10 percent under 238), above means over 286 wpm (10 percent over 260), and near means every value in between.
9. IF the Ledger_Calculator returns no Measured_Pace, THEN THE Ledger_Tab SHALL show the text "Read a little longer to see your pace." in place of the Measured_Pace and the comparison.
10. THE Ledger_Tab SHALL phrase the pace sentence as a plain description and SHALL NOT tell the reader to read faster.
11. THE Ledger_Tab SHALL show a small "Source" note carrying the Pace_Source citation in full, next to the Typical_Speeds.
12. THE Ledger_Tab SHALL state that the goal of the Library_App is finishing with focus and that it does not claim to make anyone read faster.
13. THE Ledger_Tab SHALL show a field for the Daily_Goal in minutes with a text label, and WHEN the reader changes it, THE Ledger_Tab SHALL save the clamped whole number under `rod_daily_goal`.
14. THE Ledger_Tab SHALL show the Goal_Progress as a progress bar with `role="progressbar"`, `aria-valuemin` 0, `aria-valuemax` 100 and `aria-valuenow`, and as text such as "9 of 15 minutes".
15. IF `rod_daily_goal` is missing, unreadable or not a whole number from 1 to 240, THEN THE Ledger_Tab SHALL use 15 minutes without an error message.
16. IF saving the Daily_Goal fails, THEN THE Ledger_Tab SHALL keep the new goal for the session and show a short message that the goal may not be remembered after a reload.
17. WHILE the overall Stats show 0 active reading seconds, 0 paragraphs read, and no finished or in-progress book (Words_Read is not part of this test), THE Ledger_Tab SHALL show only the empty state with the text "The ledger is blank. Read a page and the candle will remember." and the Daily_Goal field.
18. WHILE the Data_Store is loading, THE Ledger_Tab SHALL show skeleton placeholders and no numbers.
19. THE Ledger_Tab SHALL show every number as text, so that no meaning depends on colour or shape alone.
20. THE Ledger_Tab SHALL read only the Data_Model Stats (including Words_Read), the shelves and the Daily_Goal, and SHALL add no tracking beyond Words_Read.
21. WHILE Reduced_Motion is active, THE Ledger_Tab SHALL draw the Candle_Gauge, Tally_Marks and Moon_Phases as still images with no animation and no flicker.
22. THE Ledger_Tab SHALL fit within a 360 px wide screen without horizontal scrolling, with the 30 Moon_Phases wrapping onto more rows.
23. THE Ledger_Tab SHALL arrange the sections listed in criteria 1 to 14 as the Dashboard_Cards of Requirement 20, with the same data, the same calculations and the same text, and where criteria 1 to 22 and Requirement 20 describe the same layout, Requirement 20 applies.

### Requirement 10: Safety, accessibility and constraints

**User Story:** As a reader, I want the haunted shell to follow the same safety and accessibility rules as the rest of the app, so that the drama never makes the app unsafe or unusable.

#### Acceptance Criteria

1. THE Library_App SHALL keep the reading page unchanged: no Darkness, Cursor_Light, Ambient_Layer, Cover_Effect, Burn or Lurking_Ghost on it, no change to its width or layout, and haunts there only for looking away. The only change to what a reading haunt draws is the ghost image of Requirement 22.
2. WHILE Reduced_Motion is active, THE Shell SHALL show no Ambient_Layer movement, no tilt, no flicker, no Burn and no Lurking_Ghost, a still flame with a steady glow, and SHALL use still images and simple fades.
3. THE Shell SHALL NOT flash faster than 3 times per second and SHALL NOT flash the full screen in saturated red.
4. THE Shell SHALL give every effect in this spec `pointer-events: none`, except the Lurking_Ghost's pointer-reach detection and the Cover_Effect on its own Cover_Card.
5. THE Library_App SHALL use no new dependency for this spec.
6. THE Library_App SHALL keep every new component under 200 lines.
7. THE Library_App SHALL use only colours from CSS custom properties in `src/ui/theme.css` for the Shell, and SHALL add any new colour there.
8. THE Library_App SHALL keep every Control in the Shell reachable and usable with the keyboard alone, with a visible focus ring in `--accent`.
9. THE Library_App SHALL work from 360 px wide upward with no horizontal scroll in every tab.
10. IF a Shell effect throws an error, THEN THE Shell SHALL keep the Tab_Bar and the Tab_Panel working without the effect.
11. THE Library_App SHALL send no data to any server for any feature in this spec.
12. WHERE the device has a touch screen only, THE Shell SHALL keep every feature usable without hover.

### Requirement 11: Words read in the data model

**User Story:** As a reader, I want my real reading pace measured from what I actually read, so that the Ledger shows my pace and not a guess, and so that my saved reading history is never lost when the app updates.

#### Acceptance Criteria

1. THE Data_Model SHALL hold a `wordsRead` count, a non-negative whole number, in every per-book Stats record and every per-day Stats record, as Schema_Version 3.
2. WHEN a Paragraph_Recorded event happens, THE stats recorder SHALL add the word count of that paragraph, computed by `countWords`, to `wordsRead` of the book's Stats and of the Stats of the Local_Date of that moment, in the same change that adds one to paragraphs read.
3. THE stats recorder SHALL count a paragraph's words at most once for each time it counts that paragraph in paragraphs read.
4. IF a paragraph has no words, THEN THE stats recorder SHALL add 0 to `wordsRead` and still add one to paragraphs read.
5. THE stats recorder SHALL send only the word count, a number, to the pure stats operations, and SHALL pass no paragraph text into the Data_Model.
6. WHEN the Data_Store loads a Schema_Version 2 Data_Model, THE Migrator SHALL return a Schema_Version 3 Data_Model in which every per-book and per-day Stats record has `wordsRead` set to 0 and every other value is deeply equal to its input.
7. FOR ALL Schema_Version 3 Data_Models, THE Migrator SHALL return a value deeply equal to its input (idempotence), and a Stats record that already has `wordsRead` SHALL keep its value.
8. WHEN the Migrator creates a Data_Model from legacy version-1 data, THE Migrator SHALL set `wordsRead` to 0 in the Stats record it creates.
9. THE Validator SHALL accept a Schema_Version 3 Data_Model only when every Stats record has `wordsRead` as a non-negative whole number, and SHALL report the offending record and field otherwise.
10. IF a Stats record in a Schema_Version 2 Data_Model lacks `wordsRead`, THEN THE Data_Store SHALL read it as 0 through the Migrator and SHALL NOT reject the Data_Model as invalid.
11. WHEN the Data_Store writes a migrated Data_Model, THE Data_Store SHALL write it only after the Validator accepts it, and SHALL keep the previously saved Data_Model unchanged if it does not.
12. THE overall Stats selector (`overallStats`) and the zero Stats value SHALL include `wordsRead`.
13. IF the Data_Store holds a Data_Model with a Schema_Version above 3, THEN THE Data_Store SHALL keep the existing behaviour for newer versions and leave the data unchanged.
14. THE README SHALL carry the Pace_Source citation in a "Sources" section.

### Requirement 12: Test coverage

**User Story:** As a developer, I want tests proportionate to the risk, so that the Ledger numbers are trustworthy and the tabs stay accessible without testing pure visuals.

#### Acceptance Criteria

1. THE Library_App SHALL include fast-check property tests for the Ledger_Calculator covering: the Focus_Score is between 0 and 100 for every non-negative input with a sum above 0; the Measured_Pace is computed only from Pace_Days, is either absent or a whole number greater than 0, is absent whenever the summed active reading seconds of the Pace_Days are below the Pace_Threshold, and is unchanged when days with Words_Read 0 are added; the Goal_Progress is between 0 and 100; and the Moon_Phase mapping returns one of five phases and does not move to an earlier phase as active seconds rise.
2. THE Library_App SHALL include a property test that the 7-day Focus_Score uses summed seconds, and SHALL cover the `rod_daily_goal` and `rod_shell_tab` save-and-reload round trips with example tests, not property tests: a valid value written and then read returns the same value, and a missing or invalid value falls back to the default.
3. THE Library_App SHALL include example tests for the Tab_Bar covering the ARIA roles and attributes, Right Arrow, Left Arrow, Home and End movement with wrap-around, the single tab stop, remembering the tab across a reload, and the fall back to the Library_Tab for an invalid Saved_Tab.
4. THE Library_App SHALL include example tests for the Ledger_Tab empty state text and the progressbar attributes, and for the Seance_Tab controls, the Haunt_Mode write, the camera choice write and the Volume_Cap write.
5. THE Library_App SHALL include an example test that checks the text colours of the Shell against the Darkness for a contrast ratio of at least 4.5:1, reusing the luminance and ratio calculation of `scripts/check-candle-contrast.mjs`, which on its own checks only each Candle_Colour against `--surface` at 3:1 and is extended or complemented for the 4.5:1 text checks of Requirement 3, and that the test covers every text colour against `--bg`, `--surface` and the Darkness, and against the peak-alpha composites of the Flame_Glow and the Smoke_Layer over the Darkness, `--bg` and `--surface`.
6. THE Library_App SHALL NOT include tests for pure visuals: the Candle_Pool shape, the Flame_Cursor drawing, the Flame_Glow, the Fog_Layer and Smoke_Layer drawing, the Cover_Effect, the dimming and Vignette look, the Burn look, the Opening_Transition look and the Lurking_Ghost animation. The behaviours listed in Criteria 10 to 12 are not pure visuals and are tested.
7. THE Library_App SHALL include property tests that: recording a paragraph adds exactly its `countWords` result to `wordsRead` and one to paragraphs read, for the book and the day; migrating a Schema_Version 2 Data_Model gives Schema_Version 3 with `wordsRead` 0 and all other values unchanged; migrating a Schema_Version 3 Data_Model returns it unchanged; and serializing then parsing a Schema_Version 3 Data_Model returns an equal Data_Model.
8. THE Library_App SHALL include an example test that a Schema_Version 2 Data_Model saved before this spec loads without being rejected and keeps its books, shelves, positions, profile and stats.
9. WHEN a property test finds a counterexample, THE Library_App SHALL record it in `docs/BUILD_LOG.md`.
10. THE Library_App SHALL include example tests for the Effect_Options covering: the defaults are 'flame', 'smoke' and 'burn'; each of 'pool', 'fog' and 'fade' selects the earlier implementation when set alone; and an unlisted value falls back to the default.
11. THE Library_App SHALL include example tests that a click and a key press each end the Burn at once, that Reduced_Motion skips the Burn and plays the single fade, and that `bookOpen` 'fade' plays no Burn.
12. THE Library_App SHALL include an example test that Demo_Mode gives a first Peek delay of 3 seconds and later Peek delays between 4 and 6 seconds, that its absence gives 45 to 90 seconds for every Peek, and example tests that the Lurking_Ghost schedules no Peek in Gentle mode or under Reduced_Motion, in Demo_Mode as well.
13. THE Library_App SHALL include one fast-check property test, beyond the Ledger and migration tests above, that for every look-away the away seconds recorded never exceed 120, that a look-away of 120 seconds or less is recorded exactly (whole seconds), and that a look-away of more than 120 seconds records exactly 120, however its time is split across ticks and signal changes.
14. THE Library_App SHALL include example tests that the Ledger dashboard keeps the same values and text as before (existing Ledger_Tab tests change only where they depend on the DOM structure), that the Look-aways card has 7 columns with today marked, and that the moon row marks today and keeps a text alternative per day.
15. THE Library_App SHALL include example tests that `ghostFigure` and `jumpscare` show a Ghost_Image through the Image_Layer (`ghost-standing.png` for the figure, `ghost-face.png` for the Nightmare close-up), that no drawn SVG ghost markup is produced, and that a failed image load shows no cartoon ghost.
16. THE Library_App SHALL NOT include tests for the pure look of the responsive layout, the card styling, the Pace_Bar or the Progress_Ring drawing.

### Requirement 13: Effect options file

**User Story:** As a developer, I want every visual choice in one file, so that I can switch between the new looks and the earlier looks by changing one value.

#### Acceptance Criteria

1. THE Library_App SHALL keep every visual choice for the Shell effects in the single file `src/ui/shellEffects.ts`.
2. THE Effect_Options SHALL export the option `cursorLight` with the values 'flame' and 'pool', the option `ambient` with the values 'smoke' and 'fog', and the option `bookOpen` with the values 'burn' and 'fade'.
3. THE Effect_Options SHALL default to `cursorLight` 'flame', `ambient` 'smoke' and `bookOpen` 'burn'.
4. THE Effect_Options SHALL export named strengths for the image brightness, image saturation, background brightness, Vignette, light radius, Flame_Glow radius and peak alpha, Smoke_Layer peak alpha and rise time, Burn duration and spark count, ghost height, ghost visible fraction, and both Peek_Delay_Ranges.
5. WHEN one option value in the Effect_Options is changed to 'pool', 'fog' or 'fade', THE Shell SHALL switch to that earlier look with no other source edit.
6. THE Library_App SHALL keep the Candle_Pool, the Fog_Layer and the plain Opening_Transition fade working as before.
7. IF an option value is not one of its listed names, THEN THE Effect_Options SHALL resolve it to the default for that option.
8. THE Library_App SHALL read each option and strength only from the Effect_Options, and SHALL NOT repeat those values as constants in any other file.

### Requirement 14: Darkness outside the light

**User Story:** As a reader, I want the library to be properly dark except where my light falls, so that the room feels haunted and the light feels earned.

#### Acceptance Criteria

1. WHILE the Shell is shown, THE Shell SHALL dim and desaturate every cover image and the Shell background, outside the Cursor_Light, to a brightness between 35 and 45 percent of its normal brightness.
2. WHILE the Shell is shown, THE Shell SHALL draw the Vignette so that the screen edges are darker than the centre.
3. WHEN a cover image is under the Cursor_Light, THE Shell SHALL show that part of the cover in full colour and full brightness.
4. THE Shell SHALL apply the dimming and desaturation to images and backgrounds only, and SHALL NOT change the colour or opacity of any text.
5. THE Shell SHALL keep every text colour at a contrast ratio of at least 4.5:1 against the dimmed and vignetted background it sits on.
6. THE Shell SHALL NOT apply the dimming, desaturation or Vignette on the reading page.
7. WHILE Reduced_Motion is active, THE Shell SHALL move the lit area with the Light_Anchor without easing animation.

### Requirement 15: Flame cursor

**User Story:** As a reader, I want a small flame at my pointer, so that I carry my own light through the dark library.

#### Acceptance Criteria

1. WHERE `cursorLight` is 'flame', THE Shell SHALL draw a Flame_Cursor at the pointer position, in reddish-orange, with CSS or canvas and without a new dependency.
2. WHERE `cursorLight` is 'flame', THE Shell SHALL draw a Flame_Glow around the Flame_Cursor that flickers with the flame and lights what is under it as Requirement 14 describes.
3. WHERE `cursorLight` is 'flame', THE Shell SHALL keep the system pointer visible and usable, and SHALL NOT capture pointer events with the Flame_Cursor or the Flame_Glow.
4. WHEN an element receives keyboard focus and `cursorLight` is 'flame', THE Shell SHALL centre the Flame_Glow on the focused element.
5. WHEN the reader touches the screen and `cursorLight` is 'flame', THE Shell SHALL draw the Flame_Cursor and Flame_Glow at the touch position until the next pointer, touch or focus event.
6. WHILE Reduced_Motion is active and `cursorLight` is 'flame', THE Shell SHALL show a still Flame_Cursor and a steady Flame_Glow with no flicker.
7. THE Flame_Cursor and the Flame_Glow SHALL NOT change in brightness more than 3 times per second.
8. THE Flame_Glow SHALL stay local, with a radius no larger than the light radius strength and a peak alpha of at most 0.16, so that no full-screen saturated red flash occurs.
9. THE Shell SHALL keep every text colour at a contrast ratio of at least 4.5:1 against the Flame_Glow at its peak alpha composited over the Darkness, `--bg` and `--surface`.
10. THE Shell SHALL NOT draw the Flame_Cursor or the Flame_Glow on the reading page.

### Requirement 16: Smoke

**User Story:** As a reader, I want smoke rising slowly from the bottom of the screen, so that the room feels alive without getting in my way.

#### Acceptance Criteria

1. WHERE `ambient` is 'smoke', THE Shell SHALL draw a Smoke_Layer of visible wisps that rise from the bottom of the screen, with CSS or canvas and without a new dependency.
2. THE Smoke_Layer SHALL sit behind all content, SHALL NOT capture pointer events, and SHALL NOT take keyboard focus.
3. THE Smoke_Layer SHALL stay under all text, so that no wisp is drawn over any text.
4. WHILE Reduced_Motion is not active, THE Smoke_Layer SHALL move each wisp from the bottom to the top of its path in at least 15 seconds.
5. WHEN the document is hidden, THE Smoke_Layer SHALL pause its animation.
6. WHILE Reduced_Motion is active, THE Smoke_Layer SHALL show a still smoky haze with no movement.
7. THE Smoke_Layer SHALL NOT change in brightness more than 3 times per second.
8. THE Shell SHALL keep every text colour at a contrast ratio of at least 4.5:1 against the Smoke_Layer at its peak alpha, at most 0.10, composited over the Darkness, `--bg` and `--surface`.
9. THE Shell SHALL NOT draw the Smoke_Layer on the reading page.

### Requirement 17: Burn on open

**User Story:** As a reader, I want the cover I choose to burn away before the book opens, so that opening a book feels like a dark little ritual.

#### Acceptance Criteria

1. WHERE `bookOpen` is 'burn' and Reduced_Motion is not active, WHEN a book is chosen from the Library_Tab, THE Opening_Transition SHALL start with the Burn: the chosen cover catches fire from its edges and burns away with a glowing ember edge and rising sparks, for about 1200 ms.
2. WHEN the Burn ends, THE Opening_Transition SHALL play the existing sequence of Requirement 6 unchanged.
3. WHEN the reader presses any key, clicks, or touches the screen during the Burn, THE Opening_Transition SHALL end the Burn at once and end the whole Opening_Transition as Requirement 6 describes.
4. WHILE Reduced_Motion is active, THE Opening_Transition SHALL skip the Burn and play the single fade of Requirement 6.
5. WHERE `bookOpen` is 'fade', THE Opening_Transition SHALL play no Burn.
6. THE Burn SHALL NOT change in brightness more than 3 times per second, SHALL show no more than 12 sparks at once, and SHALL keep the ember edge on the chosen cover, so that no full-screen saturated red flash occurs.
7. THE Burn SHALL use no sound and SHALL NOT block pointer or keyboard input.
8. THE Burn SHALL start the book text loading in parallel, and SHALL NOT delay it.
9. IF the book fails to open during the Burn, THEN THE Opening_Transition SHALL end the Burn at once and show the existing error and "Back to library" button.
10. IF the Burn cannot be drawn, THEN THE Opening_Transition SHALL skip it and play the existing sequence.

### Requirement 18: Larger lurking ghost and demo switch

**User Story:** As a reader browsing the library, I want the ghost to peek half behind the screen edge without crowding the page, and as a developer I want a URL switch for short peek times, so that I can check the ghost without waiting.

#### Acceptance Criteria

1. WHEN a Peek starts, THE Lurking_Ghost SHALL be drawn at a height between 20 and 24 percent of the viewport height (about 22 percent). This supersedes the earlier 30 to 35 percent.
2. WHEN a Peek starts, THE Lurking_Ghost SHALL appear partly behind the screen edge, with at most 70 percent of its bounding box inside the viewport at its fullest.
3. IF the ghost's visible part overlaps a Control at a candidate edge position, THEN THE Lurking_Ghost SHALL try the other edge positions before skipping the Peek as Requirement 7 describes.
4. WHERE the page URL query contains `demo=1`, THE Lurking_Ghost SHALL start the first Peek after the page loads exactly 3 seconds after the Library_Tab is first shown, and SHALL use a random delay between 4 and 6 seconds before every later Peek, in place of 45 to 90 seconds.
5. WHERE the page URL query does not contain `demo=1`, THE Lurking_Ghost SHALL use a random Peek delay between 45 and 90 seconds before every Peek.
6. WHILE Demo_Mode is active, THE Lurking_Ghost SHALL obey every other rule of Requirement 7: no overlap with Controls, none in Gentle mode, none under Reduced_Motion, none on other tabs, none while the document is hidden.
7. THE Demo_Mode switch SHALL change no setting, store no value and affect no other feature.

### Requirement 19: Responsive shell width

**User Story:** As a reader on a wide screen, I want the library, the Ledger and the Séance to use a proper desktop width instead of a narrow phone-width column, so that the app looks made for my screen.

#### Acceptance Criteria

1. THE Shell SHALL give the Tab_Bar and the content of every Tab_Panel (Library_Tab, Ledger_Tab and Seance_Tab) the same width: the full width of the viewport up to the Shell_Max_Width, centred, with side padding of `clamp(1rem, 4vw, 2.5rem)`.
2. THE Ledger_Tab and the Seance_Tab SHALL NOT limit their width to 40rem.
3. WHILE the viewport is at least 1024 px wide, THE Seance_Tab SHALL arrange its sections in two columns, and WHILE the viewport is narrower than 1024 px, THE Seance_Tab SHALL arrange them in one column.
4. THE Shell SHALL show no horizontal scroll at viewport widths of 1440, 1024, 768, 390 and 360 px.
5. THE Shell SHALL keep every Control at least 44 px high or wide at 390 px and 360 px, and SHALL keep every text colour at 4.5:1 against its background.
6. THE Shell SHALL keep one source of the Shell_Max_Width and the side padding, shared by the Tab_Bar and the Tab_Panels.
7. THE Library_App SHALL NOT change the width or layout of the reading page.

### Requirement 20: Ledger dashboard

**User Story:** As a reader, I want the Ledger laid out as a tidy dashboard of cards, so that I can read my focus, pace, goal and history at a glance.

#### Acceptance Criteria

1. THE Ledger_Tab SHALL show its sections as Dashboard_Cards on `--surface`, with the same padding, the same gap, Cormorant Garamond card headings, and system-UI numbers with tabular figures.
2. WHILE the viewport is at least 1024 px wide, THE Ledger_Tab SHALL show three cards in the top row: Focus, Pace and Daily goal. WHILE the viewport is between 640 and 1023 px wide, THE Ledger_Tab SHALL show them in two columns, and WHILE it is narrower than 640 px, in one column.
3. THE Focus card SHALL show the Focus_Score for Today and for the last 7 days as two Candle_Gauges larger than before, each with its text score and text alternative, as Requirement 9 criteria 1 and 2 describe.
4. THE Pace card SHALL show the Measured_Pace as a large wpm figure with the Pace_Bar beneath it and the "Typical adult: 238 wpm (non-fiction), 260 wpm (fiction)" text and the small Source note below, WHEN the Ledger_Calculator returns a Measured_Pace. IF it returns none, THEN THE Pace card SHALL show "Read a little longer to see your pace." in place of the figure and the Pace_Bar marker.
5. THE Pace_Bar SHALL show a scale from 0 to 400 wpm, markers at 238 and 260 wpm each with a text label, and the reader's pace as a marker at its position, held at the end of the scale for a pace above 400, and SHALL give the bar a text alternative that states the pace and both markers.
6. THE Daily goal card SHALL show the Daily_Goal field with its label and save message, and a Progress_Ring for Today's Goal_Progress with `role="progressbar"`, `aria-valuemin` 0, `aria-valuemax` 100, `aria-valuenow` and `aria-valuetext`, and the text "9 of 15 minutes" (the real numbers) inside or beside the ring.
7. THE Look-aways card SHALL show one column for each of the last 7 days, oldest first with Today last (the same 7 days as Requirement 9 criterion 3), a short weekday label (Mon to Sun) under each column, Tally_Marks or a small bar in each column, and Today's column highlighted by more than colour alone (a label or border), with no long vertical list.
8. THE Look-aways card SHALL keep the cap of 20 drawn marks and SHALL show each day's full count as text, so that a day with more than 20 look-aways shows its full number.
9. THE Moon card ("The last 30 days") SHALL show the 30 Moon_Phases in one tidy row on a wide screen and wrapped onto two rows on a phone, oldest first, SHALL mark Today, SHALL show a small legend of the five phases with the full-moon explanation, and SHALL keep the date and phase name as a text alternative for each day.
10. THE "Your reading" card SHALL show four Stat_Tiles in one row on a wide screen and two by two on a phone: books finished, books in progress, paragraphs read and chapters read, each a number as text with its label.
11. THE Ledger_Tab SHALL keep the empty state text, the loading skeletons, the focus statement and every other value and text of Requirement 9 unchanged.
12. THE Ledger_Tab SHALL keep every text colour at 4.5:1 against `--surface`, `--bg` and `--darkness`, including any new combination in the cards, and the new combinations SHALL be measured and recorded in `docs/BUILD_LOG.md`, adjusting a colour in `src/ui/theme.css` if one falls below 4.5:1.
13. WHILE Reduced_Motion is active, THE Ledger_Tab SHALL draw the Candle_Gauges, the Pace_Bar, the Progress_Ring, the bars and the moons as still drawings.
14. THE Library_App SHALL keep every new Ledger component under 200 lines.
15. THE Ledger_Tab SHALL change no calculation and no stored value; the Ledger_Calculator and the Data_Model stay as they are.

### Requirement 21: Away time cap

**User Story:** As a reader, I want one long absence to count as a break and not as distraction, so that my Focus_Score is not ruined by a phone call or a cup of tea.

#### Acceptance Criteria

1. WHEN the stats recorder records the away seconds of one Look_Away, THE stats recorder SHALL add at most the Away_Cap (120 seconds) in total for that Look_Away to the away seconds of the book and of the day.
2. WHEN a Look_Away lasts the Away_Cap or less, THE stats recorder SHALL record its whole seconds exactly, as before.
3. WHEN a Look_Away lasts more than the Away_Cap (a Break_Period), THE stats recorder SHALL record exactly 120 away seconds for it and SHALL record none of the time after the first 120 seconds.
4. THE stats recorder SHALL apply criteria 1 to 3 however the time of one Look_Away is split across periodic updates and signal changes, so that the total for the Look_Away is the same.
5. WHEN the Attention_Signal changes to `away` again after `present`, THE stats recorder SHALL start a new Look_Away with 0 seconds counted, so that each Look_Away has its own cap.
6. THE stats recorder SHALL continue to add one to the look-away count of a Break_Period, as for any Look_Away, and SHALL continue to add no away seconds and no look-away count during a break the reader started, as library-v2 Requirement 16 criteria 13 and 14 state.
7. THE stats recorder SHALL apply the cap only to time recorded from now on, and THE Library_App SHALL NOT change any saved away seconds, the Data_Model shape or the Schema_Version.
8. THE Ledger_Calculator SHALL keep its Focus_Score formula unchanged; the cap acts only where away seconds are recorded.
9. THE away time rule SHALL stay consistent with haunt-safety, where break prompts are suggestions and leaving the screen during a break is never counted as a breach, and with the Attention_Module, which still emits `away` and `present` as before and is not changed.
10. THE capping function SHALL be pure, with no clock, DOM or camera access, and SHALL be part of `src/library/statsTimer.ts`.

### Requirement 22: One ghost everywhere

**User Story:** As a reader, I want the same ghost in the library and in the reading haunts, so that the haunting looks like one creature and not a cartoon.

#### Acceptance Criteria

1. THE `ghostFigure` haunt SHALL draw the Ghost with the Ghost_Image `ghost-standing.png` through the Image_Layer, beside the Reading_Column, with scale and position set from the Ghost_Distance step, WHILE the Attention_Signal is `away` and the Haunt_Mode is Classic or Nightmare.
2. WHEN the Return_Moment shows the Ghost lingering, THE `ghostFigure` haunt SHALL show `ghost-standing.png` through the Image_Layer.
3. WHEN the Jumpscare starts in Nightmare, THE `jumpscare` haunt SHALL show `ghost-face.png` through the Image_Layer, and WHEN it starts in Classic, THE `jumpscare` haunt SHALL show `ghost-standing.png` through the Image_Layer at a smaller largest scale than the Nightmare Jumpscare uses, each inside the 3000 ms Return_Moment.
4. THE Library_App SHALL produce no drawn SVG ghost (the sheet-and-hood silhouette of `ghostArt`) in any haunt, and IF a Ghost_Image fails to load or decode, THEN THE Reading_Haunts SHALL show no ghost picture, leaving the sound and the other effects to carry the haunt, with no error shown to the reader. This supersedes the ghost-dread fallback to the SVG Ghost for the figure and the close-up.
5. THE Library_App SHALL request a Ghost_Image only through `assetUrl` with an entry of `GHOST_ASSETS`, as a same-origin URL beginning with `/ghosts/`, and SHALL contact no other origin.
6. THE Image_Layer SHALL be an element of the Safety_Gate, not of the haunt files, so that every limit is applied in the one place: volume is unaffected, opacity fades of at least 1000 ms under Reduced_Motion with no change in scale or position, the Ghost kept outside the Reading_Column bounds while the reader is away, the effects around the text and not over it outside the Return_Moment, and at most 3 flashes per second counted with every other effect.
7. THE Image_Layer SHALL fit the Ghost_Image inside its region by the visible (non-transparent) part of the image, SHALL keep its aspect ratio, SHALL never draw outside the region, and SHALL use a strictly larger scale for a higher Ghost_Distance step.
8. THE Library_App SHALL keep every haunt-safety rule: Gentle draws no ghost and no Image_Layer, jump effects happen only in the Return_Moment, the Ghost_Image is removed when the Return_Moment ends so the text is fully readable, the Ghost has a text label for screen readers and takes no keyboard focus, no full-screen saturated red flash occurs, and the Red_Coverage of `ghost-face.png` at its largest scale stays at or below 15 percent of the viewport (ghost-dread Requirement 15 criterion 6), checked once by measurement and recorded in `docs/BUILD_LOG.md`.
9. THE Lurking_Ghost SHALL be drawn at about 22 percent of the viewport height, set by `ghostHeightVh` in `src/ui/shellEffects.ts`, with every other rule of Requirements 7 and 18 unchanged.
10. THE Library_App SHALL remove the drawn-ghost code and its tests that are no longer used, and SHALL keep the pure region-fitting code that still serves the Image_Layer.
