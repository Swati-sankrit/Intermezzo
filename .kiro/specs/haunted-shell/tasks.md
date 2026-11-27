# Implementation Plan: Haunted Shell

## Overview

The plan puts the demo-critical visuals first. The theme contrast fixes come first because every later layer uses those colours. The tabbed Shell frame follows, since the visual layers render inside it. The four visual tasks come next (darkness, candle pool and fog; cover tilt and glow; opening transition; lurking ghost), then a checkpoint. After that come the data and insight parts: the `wordsRead` field and Schema_Version 3, the pure Ledger_Calculator, the Ledger tab, and the Séance tab (which removes the gear dialog). The README citation is independent and the plan ends with a final checkpoint. All code is TypeScript (Vite + React + Vitest + fast-check), as in the design.

Task 11 (visual revision) was added after a browser check of the finished tasks 1 to 4. It is numbered last but runs before tasks 5 to 7, so the reader sees the revised look first. It adds the effect options file and the new default looks (flame cursor, smoke, burn on open, darker room, bigger ghost with a `?demo=1` switch) while keeping the earlier looks working.

Tasks 13 to 17 were added after tasks 1 to 12 were finished and do not change them. Task 13 widens the Shell tabs to a desktop width. Task 14 rebuilds the Ledger as a card dashboard over the same calculations. Task 15 caps the away seconds recorded per look-away at 120 s, with one extra property test. Task 16 gives the reading haunts the bundled ghost images, removes the drawn ghost and shrinks the lurking ghost to about 22% of the viewport height. Task 17 is the final checkpoint.

Testing follows the design: property tests only for the Ledger calculations (Properties 1-5) and the `wordsRead` recording and v2→v3 migration (Properties 6-8); example tests for tabs, Séance, Ledger tab, contrast, and the `rod_daily_goal` and `rod_shell_tab` save-and-reload round trips; no tests for pure visuals (Requirement 12.6). No new dependencies.

## Tasks

- [x] 1. Fix theme colours and add the Darkness colour
  - [x] 1.1 Update `src/ui/theme.css` and `docs/BUILD_LOG.md`
    - `--text-dim` `#8a7f6e` → `#9a8f7e`; `--danger` `#c0564b` → `#d9766b`; add `--darkness: #0d0b0a`
    - Add a BUILD_LOG entry per changed colour: name, old value, new value, new ratio (5.91 / 5.49 / 6.18 for `--text-dim` against `--bg` / `--surface` / `--darkness`; 6.05 / 5.61 / 6.32 for `--danger`)
    - Re-measure with the `check-candle-contrast.mjs` formula before recording, and note that the old values already failed 4.5:1 against `--surface`
    - _Requirements: 3.7, 3.8, 3.15, 3.16_

  - [x] 1.2 Write example test for text contrast
    - Lift the luminance and ratio functions from `scripts/check-candle-contrast.mjs` into a small shared module used by both the script and a Vitest test
    - Assert `--text`, `--text-dim`, `--accent`, `--danger` and the six Candle_Colours (as text) are at least 4.5:1 against `--bg`, `--surface` and `--darkness`, plus the amber pool composite from the design
    - _Requirements: 3.7, 3.8, 3.9, 12.5_

- [x] 2. Build the Shell frame and Tab_Bar
  - [x] 2.1 Create `src/ui/shell/TabBar.tsx`, `ShellFrame.tsx` and a guarded tab-storage helper
    - ARIA `tablist`/`tab`/`tabpanel`, `aria-selected`, `aria-controls`/`aria-labelledby`, roving `tabindex`, Left/Right/Home/End with wrap-around, `--accent` focus ring, fits 360 px
    - `ShellFrame` owns tab state and reads/writes `rod_shell_tab` with try/catch; a missing or invalid value falls back silently to `library`; a write failure is silent
    - Modify `LibraryShell.tsx` to render `ShellFrame` when no book is open (Library tab shows the existing `LibraryScreen` unchanged); hide the Tab_Bar while a book is open and restore the same tab on return
    - Ledger and Séance panels are placeholders here and filled in by tasks 7 and 8
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14, 10.8, 10.9_

  - [x] 2.2 Write example tests for the Tab_Bar
    - ARIA roles and attributes, arrow/Home/End movement with wrap-around, single tab stop, tab remembered across a reload, fallback to Library for an invalid saved tab
    - _Requirements: 12.3_

- [x] 3. Add the visual layers (no tests, per Requirement 12.6)
  - [x] 3.1 Darkness, Candle_Pool and Fog_Layer
    - New `Darkness.tsx`, `CandlePool.tsx` and `FogLayer.tsx` in `src/ui/shell/`, rendered by `ShellFrame` behind all content, only on the Shell and never on the reading page
    - Candle_Pool about 280 px in the Profile's Candle_Colour (`--candle-amber` fallback), following the pointer within one frame, the focused element's centre for keyboard, the touch point for touch, and the Tab_Panel centre until the first event; direct follow under Reduced_Motion
    - Fog drifts slowly (at least 30 s to cross), is still under Reduced_Motion, pauses when the document is hidden, stays under all text, and changes no more than 3 times per second
    - All effects `pointer-events: none`, no focus, colours from `theme.css`, and each effect inside a small local error boundary so a throw never breaks the tabs
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.10, 3.11, 3.12, 3.13, 3.14, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 10.1, 10.2, 10.3, 10.4, 10.7, 10.10_

  - [x] 3.2 Cover_Effect on cover cards
    - Tilt toward the pointer up to 8° per axis and return within 400 ms, warm Candle_Colour edge glow on hover and focus, slow shadow flicker (at most 2 changes per second), no tilt on keyboard focus or `hover: none`, still glow under Reduced_Motion
    - Keep the library-v2 hover card, keep neighbours overlapped by at most 8 px, and keep title and author at 4.5:1
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 10.12_

  - [x] 3.3 Opening_Transition
    - New `OpeningTransition.tsx` used by `LibraryShell.tsx` when a book opens from the Library tab: candle gutter, dim to dark about 600 ms, fade up, at most 1500 ms in total
    - Any key, click or touch ends it at once; it never blocks input; it holds on dark until the book is ready; it ends at once on open failure; a single fade of at most 300 ms under Reduced_Motion; no sound, no flashing, no saturated red; not run when returning to the library
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10_

  - [x] 3.4 Lurking_Ghost
    - New `LurkingGhost.tsx` rendered by `ShellFrame` on the Library tab only, using `GHOST_ASSETS` through relative same-origin URLs
    - Peek about every 45-90 s (random), about 1.5 s long, from a screen edge position that overlaps no Control, skipped when none is free; vanishes at once when the pointer reaches it or Haunt_Mode becomes Gentle
    - Not shown in Gentle or under Reduced_Motion; cancelled on a tab change or when a book opens; rescheduled on return to Library; paused when the document is hidden; silent, `aria-hidden="true"`, `pointer-events: none` apart from the reach check, no focus, no flashing
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 7.12, 7.13, 7.14, 7.15, 7.16, 10.1, 10.2_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Add `wordsRead` and Schema_Version 3 to the data model
  - [x] 5.1 Extend model, stats ops, validator, migrator and store
    - `src/library/model.ts`: `SCHEMA_VERSION = 3`, add `wordsRead` to `Stats` and `STATS_FIELDS`
    - `src/library/statsOps.ts`: `ZERO_STATS.wordsRead = 0`, add `recordWordsRead`, add `words` to the `'paragraphs'` `StatEvent`, and have `applyEvent` update both fields in one change; `overallStats` includes `wordsRead`
    - New `src/library/schemaV3.ts` with `addWordsRead` and `migrateV2ToV3` (total, idempotent, leaves non-stats fields untouched)
    - `src/library/localStore.ts`: run `migrateV2ToV3` on a version-2 model before `validate()`; write a migrated model only after the Validator accepts it; versions above 3 keep today's behaviour
    - `src/library/migrator.ts` / `legacyMigration.ts`: the Stats record built from legacy v1 data gets `wordsRead: 0`
    - `src/library/validator.ts`: rely on `STATS_FIELDS` so `wordsRead` is checked as a non-negative whole number, naming the offending record and field
    - Fix any existing fixtures or call sites the type change breaks
    - _Requirements: 11.1, 11.4, 11.6, 11.7, 11.8, 11.9, 11.10, 11.11, 11.12, 11.13_

  - [x] 5.2 Record words when a paragraph is recorded
    - `src/ui/useStatsRecorder.ts`: add paragraph text to `StatsInput`, send `{ kind: 'paragraphs', count: 1, words: countWords(text) }` once per unique paragraph key
    - `src/ui/ReaderView.tsx`: pass the active paragraph text into `StatsInput`
    - Only the number reaches `statsOps`; no paragraph text enters the Data_Model
    - _Requirements: 11.2, 11.3, 11.4, 11.5_

  - [x] 5.3 Write property test for v2→v3 migration
    - File `src/library/__tests__/schemaV3.migrate.property.test.ts`; 100+ runs; shared DataModel arbitraries in `src/library/__tests__/arbitraries.ts`
    - **Property 7: Migrating a Schema_Version 2 Data_Model produces Schema_Version 3 with wordsRead 0 and nothing else changed**
    - **Validates: Requirements 11.6**

  - [x] 5.4 Write property test for migration idempotence
    - File `src/library/__tests__/schemaV3.idempotent.property.test.ts`
    - **Property 8: Migration is idempotent and preserves an existing wordsRead**
    - **Validates: Requirements 11.7**

  - [x] 5.5 Write property test for recording a paragraph
    - File `src/library/__tests__/statsOps.words.property.test.ts`; arbitrary text including empty and whitespace-only
    - **Property 6: Recording a paragraph adds exactly its word count to wordsRead and one to paragraphs read, for the book and the day**
    - **Validates: Requirements 11.2, 11.3, 11.4**

  - [x] 5.6 Write example tests for load and validation
    - A literal Schema_Version 2 fixture loads through `localStore.ts` without rejection, keeps books, shelves, positions, profile and stats, and gains `wordsRead: 0`
    - Validator accepts a good v3 model and rejects missing, negative, fractional and non-numeric `wordsRead`, naming the record and field
    - Extend `useStatsRecorder.unit.test.ts`: a recorded paragraph adds `countWords(text)` once per paragraph key
    - _Requirements: 11.3, 11.9, 11.10, 12.8_

- [x] 6. Build the pure Ledger_Calculator
  - [x] 6.1 Implement `src/library/ledgerCalculator.ts`
    - `focusScore`, `sevenDayFocusScore`, `moonPhase`, `goalProgress`, `measuredPace`, `clampDailyGoalMinutes`, constants (`PACE_THRESHOLD_SECONDS` = 120, default 15, range 1-240), and a `bookCounts` helper for finished and in-progress books
    - Take `today` as input, never read the clock; no DOM access; non-finite or negative inputs count as 0
    - _Requirements: 8.1, 8.3, 8.4, 8.6, 8.8, 8.10, 8.11, 8.12, 8.14, 8.15, 8.16, 8.17, 8.18, 8.19_

  - [x] 6.2 Write property test for Focus_Score bounds
    - File `src/library/__tests__/ledger.focus.property.test.ts`
    - **Property 1: Focus_Score is bounded, and undefined exactly when there is no data**
    - **Validates: Requirements 8.2, 8.3**

  - [x] 6.3 Write property test for the 7-day Focus_Score
    - File `src/library/__tests__/ledger.sevenDay.property.test.ts`
    - **Property 2: Seven-day Focus_Score uses summed seconds, not an average of daily scores**
    - **Validates: Requirements 8.4**

  - [x] 6.4 Write property test for Moon_Phase
    - File `src/library/__tests__/ledger.moon.property.test.ts`
    - **Property 3: Moon_Phase is always one of five phases and never regresses as reading time rises**
    - **Validates: Requirements 8.6, 8.7**

  - [x] 6.5 Write property test for Goal_Progress
    - File `src/library/__tests__/ledger.goal.property.test.ts`
    - **Property 4: Goal_Progress is bounded**
    - **Validates: Requirements 8.9**

  - [x] 6.6 Write property test for Measured_Pace
    - File `src/library/__tests__/ledger.pace.property.test.ts`
    - **Property 5: Measured_Pace comes only from Pace_Days, is a positive whole number or absent, and ignores zero-wordsRead days**
    - **Validates: Requirements 8.10, 8.11, 8.13**

- [x] 7. Build The Ledger tab
  - [x] 7.1 Create `src/ui/shell/LedgerTab.tsx` (plus small parts under 200 lines each) and wire it into `ShellFrame`
    - Candle_Gauge for today and 7-day Focus_Score with text and text alternative; Tally_Marks for the last 7 days in fives, capped at 20 with the full number beside them; 30 Moon_Phases oldest first via `statsForLastDays` with date and phase name for screen readers, plus the full-moon explanation
    - Books finished and in progress, paragraphs and chapters read
    - Measured_Pace beside the Typical_Speeds text, with the below/near/above sentence (214 / 286 wpm), the "Read a little longer to see your pace." fallback, the Source note with the full Pace_Source citation, and the "finishing with focus, not reading faster" statement
    - Daily_Goal field saved clamped to `rod_daily_goal` (default 15 on a missing or invalid value; a short message when the write fails) and a `role="progressbar"` for Goal_Progress with "9 of 15 minutes" text
    - Empty state text, loading skeletons, still drawings under Reduced_Motion, 360 px layout, every number as text
    - `ShellFrame` passes `today` into the calculator
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11, 9.12, 9.13, 9.14, 9.15, 9.16, 9.17, 9.18, 9.19, 9.20, 9.21, 9.22_

  - [x] 7.2 Write example tests for the Ledger tab
    - Empty-state text and condition, progressbar attributes, Measured_Pace and fallback branches, below/near/above boundaries, 20-mark cap, book and paragraph counts, `clampDailyGoalMinutes` boundaries, and `rod_daily_goal` write then read
    - _Requirements: 12.4, 8.19_

- [x] 8. Build The Séance tab and remove the gear dialog
  - [x] 8.1 Create `src/ui/shell/SeanceTab.tsx` and `volumeCap.ts`
    - Move the `ProfileSettings.tsx` content into the tab (name with 40-char limit, six-colour radio group, pace-guide checkbox, delete profile, clear data with `ClearDataConfirm`), using `useProfileActions` and `lib.clearAllData`; keep focus-to-first-control and Escape-to-cancel on confirmations; disable Profile controls while loading; keep the `role="alert"` save-failure message
    - Haunt_Mode radio group through `useHauntSettings()` (descriptions of at most 120 characters)
    - Camera choice through `loadChoice`/`saveChoice` only, with the on-device privacy note and the "browser asks when the next book opens" wording; neither option selected when unanswered; import no camera, detector or video code
    - `volumeCap.ts` reuses `parseVolumeCap` and `DEFAULT_VOLUME_CAP` from `src/haunts/engine/gate/plan.ts`; slider 0-100 in steps of 5 writes 0-1 to `rod_volume_cap`; default 40%; shows "used from the next time a book opens"; no change to any file under `src/haunts/engine/`
    - After a successful clear, `ShellFrame` also removes `rod_daily_goal`, `rod_shell_tab` and `rod_volume_cap` and the tab shows defaults
    - Delete `ProfileSettings.tsx` and its gear button and dialog in `LibraryScreen.tsx`; update imports and tests that referenced them
    - Wire `SeanceTab` into `ShellFrame`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14, 2.15, 2.16, 2.17, 2.18, 2.19, 2.20, 2.21, 2.22, 2.23_

  - [x] 8.2 Write example tests for the Séance tab
    - Haunt_Mode write through the store, camera choice write through `saveChoice`, Volume_Cap writes 0-1 and falls back to 40%, privacy note text, delete and clear confirmations, clear also removes the three shell keys, gear button and dialog gone from `LibraryScreen`
    - _Requirements: 12.4_

- [x] 9. Add the pace citation to the README
  - [x] 9.1 Add a "Sources" section to `README.md` with the Pace_Source citation
    - Add the citation verbatim: Brysbaert, M. (2019). How many words do we read per minute? A review and meta-analysis of reading rate. Journal of Memory and Language, 109, 104047.
    - Add one example assertion to `src/__tests__/readmeAssets.unit.test.ts` that the README contains it
    - _Requirements: 11.14_

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Visual revision (run before tasks 5–7)
  - [x] 11.1 Create `src/ui/shellEffects.ts` and wire the existing effects to it
    - Export the options `cursorLight` ('flame' | 'pool'), `ambient` ('smoke' | 'fog'), `bookOpen` ('burn' | 'fade'), the named strengths, `DEFAULT_EFFECTS` ('flame', 'smoke', 'burn'), `shellEffects` and a pure `resolveEffects` that maps unlisted values to the default
    - Make `ShellFrame`, `CandlePool`, `FogLayer`, `OpeningTransition` and `LurkingGhost` read options and strengths from it through an optional `effects` prop, remove duplicated constants from those files, and keep 'pool', 'fog' and 'fade' working exactly as built in tasks 3.1, 3.3 and 3.4
    - Write example tests: defaults; each of 'pool', 'fog' and 'fade' selects the earlier implementation; an unlisted value falls back to the default
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 12.10_

  - [x] 11.2 Strengthen the Darkness and Vignette, and dim covers outside the light
    - Add the Vignette and background brightness strength to `Darkness.tsx`; add a `LitCover` wrapper used by Cover_Card with a dimmed, desaturated base image (about 40% brightness) and a full-colour lit copy masked by a radial gradient at the Light_Anchor, updated once per animation frame for covers in the viewport
    - Leave text untouched; extend the contrast example test to the darker backgrounds; no dimming on the reading page; no test for the look
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 10.1, 12.5_

  - [x] 11.3 Flame cursor and glow, with the 'pool' fallback
    - New `FlameCursor.tsx` (canvas or CSS, no dependency) with a reddish-orange flame at the pointer and a local red-amber Flame_Glow of peak alpha at most 0.16 that flickers at most 2.5 times per second; system pointer stays visible; glow on the focused element for keyboard; flame and glow at the touch point for touch; still flame and steady glow under Reduced_Motion
    - Select it when `cursorLight` is 'flame' and keep `CandlePool` for 'pool'; add the Flame_Glow composites to the contrast example test (the values measured in the design)
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9, 15.10, 12.5_

  - [x] 11.4 Smoke layer, with the 'fog' fallback
    - New `SmokeLayer.tsx` with wisps rising slowly from the bottom (at least 15 s each, peak alpha at most 0.10), behind content and never over text, `pointer-events: none`, paused when the document is hidden, a still haze under Reduced_Motion, no more than 3 brightness changes per second
    - Select it when `ambient` is 'smoke' and keep `FogLayer` for 'fog'; add the Smoke composites to the contrast example test
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8, 16.9, 12.5_

  - [x] 11.5 Burn on open, with the 'fade' fallback
    - New `BurnOverlay.tsx` used by `OpeningTransition` before the existing sequence: the chosen cover burns from its edges with a noise mask, a glowing ember rim and at most 12 sparks, about 1200 ms; book loading starts in parallel; click, key or touch ends it and the whole transition at once; skipped under Reduced_Motion, for 'fade', on a failed open and on a draw error; no sound, no flashing above 3 per second
    - Pass the clicked cover's rectangle and image from the Library tab to `OpeningTransition`
    - Write example tests: a click and a key press each end the burn at once; Reduced_Motion skips the burn and plays the single fade; 'fade' plays no burn
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 6.7, 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8, 17.9, 17.10, 12.11_

  - [x] 11.6 Bigger lurking ghost and the `?demo=1` switch
    - New `src/ui/shell/ghostPlacement.ts` with `isDemoMode`, `nextPeekDelayMs`, `slotRect`, `visiblePart` and `pickSlot`; draw the ghost at about 32% of the viewport height, partly behind the screen edge, testing only its inside-viewport part against every Control and skipping the Peek when no slot is free
    - Make `LurkingGhost` use a 3 to 6 second delay when the URL has `demo=1` and 45 to 90 seconds otherwise, with every other rule unchanged; store nothing
    - Write example tests: the demo and normal delay ranges; no Peek in Gentle mode or under Reduced_Motion, in demo mode as well; `pickSlot` avoids Controls and returns nothing when every slot overlaps one
    - _Requirements: 7.1, 7.5, 7.6, 7.12, 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 12.12_

  - [x] 11.7 Checkpoint - Run `tsc` and the full test suite
    - Run the type check and the full suite, confirm the earlier looks still work by setting each option to 'pool', 'fog' and 'fade' in the example tests, and ask the user if questions arise
    - _Requirements: 13.5, 13.6, 12.6_

- [x] 12. Demo switch for filming (run before tasks 5–7)
  - [x] 12.1 First peek at 3 s and 4–6 s repeats under `?demo=1`
    - In `src/ui/shell/ghostPlacement.ts`, change `nextPeekDelayMs` to take `isFirst`: with `demo=1` return exactly 3 s for the first Peek after the page loads and a random 4 to 6 s for every later Peek; without `demo=1` keep 45 to 90 s for every Peek
    - In `src/ui/shellEffects.ts`, replace the demo range with `demoFirstPeekDelaySeconds` (3) and `demoPeekDelaySeconds` ([4, 6])
    - In `LurkingGhost.tsx`, pass `isFirst` true only for the first Peek after page load; every other rule stays (off in Gentle and under Reduced_Motion, never over Controls, Library tab only); store nothing
    - Write one example test: with `demo=1` the first delay is 3000 ms and later delays are within 4000 to 6000 ms; without `demo=1` the delay is within 45000 to 90000 ms for the first and later Peeks. Replace the demo range assertion in the task 11.6 test with this one
    - _Requirements: 7.1, 7.12, 18.4, 18.5, 18.6, 18.7, 12.12_

- [x] 13. Responsive shell width
  - [x] 13.1 Share one width and padding across the Tab_Bar and every tab
    - In `src/ui/shell/ShellFrame.css` define `--shell-max-width: 75rem` and `--shell-pad: clamp(1rem, 4vw, 2.5rem)` once, with an inner wrapper class (centred, `width: 100%`, `box-sizing: border-box`) used by `TabBar` and by the content of every Tab_Panel in `ShellFrame.tsx`
    - Remove `max-width: 40rem` and the own horizontal padding from `.ledger` in `LedgerTab.css` and from the settings container in `SeanceTab.css`; make `LibraryScreen.css` read `--shell-max-width` instead of its own `75rem`
    - Leave the reading page, its CSS and `ReaderView` untouched
    - _Requirements: 19.1, 19.2, 19.6, 19.7, 10.1_

  - [x] 13.2 Séance two columns on desktop, then check every width
    - In `SeanceTab.css` use one column below 1024 px and two columns from 1024 px, keeping the DOM order so keyboard order does not change; keep controls at least 44 px high and wide
    - Check by hand at 1440, 1024, 768, 390 and 360 px for all three tabs: no horizontal scroll, no overlap, focus rings visible; record the check in `docs/BUILD_LOG.md`. No test for the layout look
    - _Requirements: 19.3, 19.4, 19.5, 10.9, 12.16_

- [x] 14. Ledger dashboard
  - [x] 14.1 Card shell and the top row: Focus, Pace and Daily goal
    - Add the `ledger-card` style (`--surface`, rounded corner, shared padding and gap, Cormorant Garamond headings, `font-variant-numeric: tabular-nums` numbers) and the top-row grid (three columns from 1024 px, two from 640 px, one below) to `LedgerTab.css`
    - Focus card: make `CandleGauge` larger through a size prop, keeping text score and text alternative
    - Pace card in `PaceSection.tsx`: large wpm figure, new `PaceBar.tsx` (0 to 400 wpm, markers at 238 and 260 with text labels, reader marker clamped at the end, `role="img"` text alternative stating the pace and both markers), the "Typical adult: 238 wpm (non-fiction), 260 wpm (fiction)" text and the small Source note below; keep "Read a little longer to see your pace." and the below/near/above sentence
    - Daily goal card in `GoalSection.tsx`: keep the field, label and save message; replace the bar with new `ProgressRing.tsx` whose wrapper keeps `role="progressbar"`, `aria-valuemin` 0, `aria-valuemax` 100, `aria-valuenow`, `aria-valuetext` and the "N of M minutes" text
    - Each file under 200 lines; colours from `theme.css` only; still drawings
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.13, 20.14, 9.1, 9.2, 9.8, 9.9, 9.11, 9.13, 9.14_

  - [x] 14.2 Look-aways card: 7 columns
    - Rework `TallyMarks.tsx` into a 7-column grid (the same last 7 days, oldest first, today last), a short weekday label under each column, tally marks above (grouped in fives, capped at 20 drawn marks), the full count as text, and today highlighted by a border and a text label for assistive technology, with no long vertical list
    - Use the existing `dateLabel`, `drawnTally`, `tallyGroups` and `TALLY_CAP` helpers; keep the counting text ("1 look-away", "N look-aways", "(20 marks shown)")
    - _Requirements: 20.7, 20.8, 9.3, 9.4, 20.13_

  - [x] 14.3 Moon card: one tidy row with today and a legend
    - Rework `MoonStrip.tsx`: 30 moons in one row from 1024 px and two rows of 15 below it, today marked by a ring and a text label, a small legend of the five phases with the full-moon note, and the date and phase name still available as a text alternative for each day
    - _Requirements: 20.9, 9.5, 9.6, 9.22, 20.13_

  - [x] 14.4 Your reading card: four Stat_Tiles
    - New `StatTiles.tsx` (a `dl` of four tiles: books finished, books in progress, paragraphs read, chapters read) in one row from 640 px and two by two below, replacing the `Count` list in `LedgerTab.tsx`
    - _Requirements: 20.10, 9.7_

  - [x] 14.5 Compose the dashboard, check contrast and update existing tests
    - In `LedgerTab.tsx` compose the cards in the order Focus, Pace, Daily goal, Look-aways, Moon, Your reading, then the focus statement; keep the empty state, skeletons and every text; keep the file under 200 lines
    - Measure every new colour pair (ring and bar fills and tracks on `--surface`, today highlight, markers, card text on `--surface` over `--darkness`) with the shared contrast module; add them to `src/ui/__tests__/themeContrast.unit.test.ts`; adjust any colour in `src/ui/theme.css` that falls below 4.5:1 (3:1 for non-text drawing) and record each measurement and change in `docs/BUILD_LOG.md`
    - Update `src/ui/__tests__/ledgerTab.unit.test.tsx` only where it depends on the old DOM structure (for example the progress bar's wrapper or the tally list); do not change any assertion about values or text
    - Add example tests: 7 look-away columns with today marked and the 20-mark cap with the full count as text; the moon row marks today and keeps a text alternative per day; the Pace_Bar text alternative states the pace and both markers; four Stat_Tiles with the same numbers
    - Check by hand at 1440, 1024, 768, 390 and 360 px and record it in `docs/BUILD_LOG.md`
    - _Requirements: 20.11, 20.12, 20.14, 20.15, 12.14, 12.16, 19.4_

- [x] 15. Focus-score away cap
  - [x] 15.1 Cap the away seconds in the pure stats timer
    - In `src/library/statsTimer.ts` add `AWAY_CAP_SECONDS = 120` and `awayCredited` to `TimerState` (and to `IDLE_TIMER`); `tickTimer` credits at most `AWAY_CAP_SECONDS - awayCredited` away seconds and consumes the rest without recording it; `changeTimer` resets `awayCredited` to 0 on a change to `away` from another value and on a change away from `away`, and keeps it for `away` to `away`; `lookAway` is unchanged
    - Leave `useStatsRecorder.ts`, `statsOps.ts`, the Data_Model, the validator and `ledgerCalculator.ts` unchanged; apply the cap to new time only, with no migration
    - Fix any fixture that builds a `TimerState` literal
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7, 21.8, 21.10_

  - [x] 15.2 Write property test for the away cap
    - File `src/library/__tests__/statsTimer.awayCap.property.test.ts`; at least 100 runs; split one away period into random ticks and repeated `away` signals (including 0 ms and very long ticks)
    - **Property 9: Away seconds recorded per look-away never exceed 120**
    - **Validates: Requirements 21.1, 21.2, 21.3, 21.4, 21.5**
    - Report cases run and any counterexample; record counterexamples in `docs/BUILD_LOG.md`

  - [x] 15.3 Record the change in the build log and the requirement notes
    - Add a `docs/BUILD_LOG.md` entry: the 120 s cap, where it applies (`statsTimer.ts`), that saved data is not changed, that a look-away over 120 s still adds one to the look-away count, and the check against haunt-safety (break prompts are suggestions; leaving during a break is never a breach), library-v2 criteria 13 and 14, and the attention-signal pause behaviour (no change to the Attention_Module)
    - Confirm the existing `stats.unit.test.ts` and `useStatsRecorder.unit.test.ts` still pass unchanged
    - _Requirements: 21.6, 21.7, 21.9, 12.9_

- [x] 16. Ghost unification and a smaller lurking ghost
  - [x] 16.1 Add the Image_Layer to the Safety_Gate
    - Add `setImage(name, fit)` to `VisualLayer` in `src/haunts/engine/types.ts` and implement it in the gate's layer and return-overlay code (`visualLayer.ts`, `returnVisual.ts`, `gatePort.ts`): build the picture only from `assetUrl('ghost', name)` (no request for a name outside `GHOST_ASSETS`), same-origin, no query; on an image error remove the picture and show nothing; leave `parseSvgMarkup` and its allowlist unchanged
    - Add pure `src/haunts/engine/ghost/imageFit.ts` (`imageBox(step, visible, region)`: aspect kept, inside the region, strictly larger for a higher step, null under 48 px wide, unsafe sizes count as 0), reusing the `ghostBox` rules; the visible parts are 667 by 649 px for `ghost-standing.png` and 1269 by 768 px for `ghost-face.png`
    - Keep every haunt-safety limit in the gate: Reduced_Motion fade of at least 1000 ms and no scale or position change, jump layers only in the Return_Moment, the Ghost outside the Reading_Column while away, the flash budget, no full-screen saturated red
    - _Requirements: 22.5, 22.6, 22.7, 22.8_

  - [x] 16.2 Use the images in `ghostFigure` and `jumpscare`
    - `src/haunts/ghostFigure.ts`: the figure and the return-moment lingering ghost call `setImage('ghost-standing.png', …)` with `imageBox` sizing; nothing in Gentle; same label and removal on stop/end
    - `src/haunts/jumpscare.ts`: Nightmare uses `ghost-face.png`, Classic uses `ghost-standing.png` at a smaller largest scale, each inside the 3000 ms Return_Moment and with the existing attack, fade and reduced-motion rules
    - No cartoon fallback: a failed load shows no picture
    - Find any other component still drawing the cartoon ghost (a search for `ghostArt` showed only these two haunts and `ghostFigure.ts`) and replace it the same way
    - Write example tests: both haunts call the Image_Layer with the allowlisted names, no SVG ghost markup is produced, a failed load leaves no picture, Gentle draws nothing, `imageBox` stays inside the region and grows with the step; update `src/haunts/__tests__/ghostHaunts*.test.ts` only where they referred to `ghostArt`
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.8, 12.15_

  - [x] 16.3 Remove the drawn ghost and measure the close-up
    - Delete the drawing code in `src/haunts/engine/ghost/ghostArt.ts` (`ghostArt`, `body`, `eyes`, `detail`) and the tests that cover only that drawing; keep `ghostBox`, `MIN_GHOST_BOX_WIDTH` and their tests, moving them if the file name no longer fits; keep `staticScan.unit.test.ts` passing
    - Measure the Red_Coverage of `ghost-face.png` at its largest rendered scale (red-eye pixels over viewport area, at most 15 percent) and record the number in `docs/BUILD_LOG.md`
    - Do not edit any ghost-dread spec file
    - _Requirements: 22.8, 22.10_

  - [x] 16.4 Make the lurking ghost about 22% of the viewport height
    - In `src/ui/shellEffects.ts` set `ghostHeightVh` to 22 and its comment to the allowed 20 to 24; update `src/ui/__tests__/ghostPlacement.unit.test.tsx` only where a test used the old height; every other Requirement 7 and 18 rule stays
    - Check by hand in `?demo=1` that the ghost is smaller and still never covers a Control
    - _Requirements: 22.9, 18.1, 18.2, 18.3, 13.8_

- [x] 17. Final checkpoint - Run `tsc` and the full suite
  - Run the type check and `npx vitest --run`, confirm Property 9 and all earlier property tests pass, and ask the user if questions arise

- [x] 18. Coverage-floor sweep
  - [x] 18.1 Measure and reshape property-test coverage floors
    - Maintenance task outside the haunted-shell requirements; it has no requirement numbers. Reference: the ghost-dread property tests. Time limit: 40 minutes; if it needs more, stop and ask the user
    - Done: every coverage floor was listed and measured over 300 batches (419 floors; 49 were under 4 standard deviations). The measurement is logged in `docs/BUILD_LOG.md`
    - Scope after the measurement (user decision): reshape ONLY the generators for `ghostDistance.gd03`, `gateReturn.gd24`, `planner.gd13` and `planner.gd12`, then re-measure those four over 300 batches with a temporary script and delete the script
    - Fill in the "margin after" column of the `docs/BUILD_LOG.md` table for those four tests, then stop the sweep. All other floors stay as measured: the rest of the 49 are accepted as they are and listed in the log
    - Floors are never lowered, and no assertion is weakened or deleted
    - Run the full suite twice (`npx vitest --run`) and report both results

- [x] 19. Browser-check polish
  - [x] 19.1 Form controls use the accent colour
    - Add one global rule `accent-color: var(--accent)` for radio buttons, checkboxes and range sliders in the shared stylesheet, using theme colours only
    - Keep a 3:1 contrast of each control against its background and keep the visible focus rings
    - _Requirements: 23.1_
  - [x] 19.2 Centre the content and the tab bar on one axis
    - Find what offsets the content at wide windows: a fixed-width or absolutely/fixed positioned effect layer that widens the page (the flame, smoke or darkness layers), a scrollbar-width difference, or the wrapper, and fix it
    - Check by tooling at 1440 and 2000 px, using headless Chrome over DevTools from a temporary script that is deleted afterwards and adds no dependency: the Tab_Bar and the content block of the Library, Ledger and Séance tabs have the same horizontal centre, and the document has no horizontal scroll
    - The Séance heading starts at the content block's left edge, not far left of it
    - Record the measured values in `docs/BUILD_LOG.md`
    - _Requirements: 23.2, 23.3_
  - [x] 19.3 Larger Focus card gauges and the look-aways line
    - Make the two Candle_Gauges larger so they fill the card height, keeping the text score, the text alternative, AA contrast and the 360 px layout
    - Add under them the line "N look-aways today" ("1 look-away today" for one, "0 look-aways today" for none), using the existing look-away count for Today
    - Add one example test for the line covering 0, 1 and N
    - _Requirements: 23.4, 23.5, 23.6, 23.7, 23.8, 12.17_

## Notes

- Task 18 is a maintenance sweep and is not tied to any haunted-shell requirement. Its scope was narrowed after the measurement to four generators; the other floors are accepted as measured.
- Task 19 follows the browser check. Tasks 19.1 and 19.3 can run together; 19.2 runs after them because all three touch the shell CSS. Only 19.3 adds a test (Requirement 12.17); 19.1 and 19.2 are checked by tooling or by hand.
- Tasks 13 to 17 are appended after task 12 and run in order of their waves. Task 13 and task 15 do not depend on each other. Task 14 needs task 13 (the shared width). Task 16 needs only the earlier visual work. Task 15.2 is the one deliberate property test outside the Ledger and migration scope (Requirement 12.13); Property 9 runs at least 100 cases and its cases and any counterexample are reported and recorded in `docs/BUILD_LOG.md`.
- Tests for tasks 13 to 16 are example tests only where behaviour changes (the Ledger values and structure, the haunts using the bundled images). Layout, card styling and drawing are checked by hand and recorded in `docs/BUILD_LOG.md`.
- Task 12 is numbered last but runs before tasks 5 to 7, after task 11. It supersedes the "3 to 6 second" demo delay written in task 11.6, which stays as recorded history.
- Task 11 is numbered last but runs before tasks 5 to 7. It touches only the visual layers from task 3, so it does not conflict with the data work. In the dependency graph below, its waves (6 to 8) are listed after the existing waves only because the existing wave entries are kept unchanged. Task 11 has no dependency on tasks 5 to 8, so run it first.
- Order: demo-critical visuals (tasks 1-3) come first, then the data, calculator, Ledger and Séance work (tasks 5-8). The Ledger tab (task 7) needs the `wordsRead` field (task 5) and the calculator (task 6); the Séance tab (task 8) and the visuals (task 3) need the Shell frame (task 2.1).
- No optional (`*`) tasks: the property tests are the only high-risk tests in the spec and the testing rule asks for them, and the only other tests are small example tests.
- Property tests (Properties 1-8) run at least 100 cases each; report cases run and any counterexample after each task, and record counterexamples in `docs/BUILD_LOG.md`.
- Properties 1-5 cover Ledger_Calculator (task 6) and Properties 6-8 cover `wordsRead` recording and migration (task 5). The shell-local storage round trips (`rod_daily_goal`, `rod_shell_tab`) are covered by example tests in 2.2 and 7.2, not property tests.
- Visual layers (task 3) have no tests by design. Their safety rules (Reduced_Motion, no flashing, `pointer-events: none`, no sound) are requirements to check by hand during implementation.
- Every new component stays under 200 lines and uses only colours from `theme.css`. No new dependency is added.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "5.1", "9.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "3.1", "3.2", "5.2", "5.3", "6.1"] },
    { "id": 2, "tasks": ["3.3", "3.4", "5.4", "5.5", "5.6", "6.2", "6.3", "6.4", "6.5", "6.6"] },
    { "id": 3, "tasks": ["7.1"] },
    { "id": 4, "tasks": ["7.2", "8.1"] },
    { "id": 5, "tasks": ["8.2"] },
    { "id": 6, "tasks": ["11.1"] },
    { "id": 7, "tasks": ["11.2", "11.3", "11.4", "11.5", "11.6"] },
    { "id": 8, "tasks": ["11.7"] },
    { "id": 9, "tasks": ["12.1"] },
    { "id": 10, "tasks": ["13.1", "15.1", "16.1"] },
    { "id": 11, "tasks": ["13.2", "14.1", "14.2", "14.3", "14.4", "15.2", "15.3", "16.2", "16.4"] },
    { "id": 12, "tasks": ["14.5", "16.3"] },
    { "id": 13, "tasks": ["17"] },
    { "id": 14, "tasks": ["18.1"] },
    { "id": 15, "tasks": ["19.1", "19.3"] },
    { "id": 16, "tasks": ["19.2"] }
  ]
}
```
