# Implementation Plan: Haunted Shell

## Overview

The plan is ordered so each step builds on the last. The data layer (`wordsRead`, Schema_Version 3) comes first because the Ledger depends on it. The pure Ledger_Calculator follows, then the theme contrast fixes, then the tabbed Shell, the Séance tab (which removes the gear dialog), and the Ledger tab. The visual layers (candlelight, fog, cover effect, opening transition, lurking ghost) are grouped into four tasks at the end. All code is TypeScript (Vite + React + Vitest + fast-check), as in the design.

Testing follows the design: property tests only for the Ledger calculations (Properties 1-5) and the `wordsRead` recording and v2→v3 migration (Properties 6-8); example tests for tabs, Séance, Ledger tab and contrast; no tests for pure visuals (Requirement 12.6). No new dependencies.

## Tasks

- [ ] 1. Add `wordsRead` and Schema_Version 3 to the data model
  - [ ] 1.1 Extend model, stats ops, validator, migrator and store
    - `src/library/model.ts`: `SCHEMA_VERSION = 3`, add `wordsRead` to `Stats` and `STATS_FIELDS`
    - `src/library/statsOps.ts`: `ZERO_STATS.wordsRead = 0`, add `recordWordsRead`, add `words` to the `'paragraphs'` `StatEvent`, and have `applyEvent` update both fields in one change; `overallStats` includes `wordsRead`
    - New `src/library/schemaV3.ts` with `addWordsRead` and `migrateV2ToV3` (total, idempotent, leaves non-stats fields untouched)
    - `src/library/localStore.ts`: run `migrateV2ToV3` on a version-2 model before `validate()`; write a migrated model only after the Validator accepts it; versions above 3 keep today's behaviour
    - `src/library/migrator.ts` / `legacyMigration.ts`: the Stats record built from legacy v1 data gets `wordsRead: 0`
    - `src/library/validator.ts`: rely on `STATS_FIELDS` so `wordsRead` is checked as a non-negative whole number, naming the offending record and field
    - Fix any existing fixtures or call sites the type change breaks
    - _Requirements: 11.1, 11.4, 11.6, 11.7, 11.8, 11.9, 11.10, 11.11, 11.12, 11.13_

  - [ ] 1.2 Record words when a paragraph is recorded
    - `src/ui/useStatsRecorder.ts`: add paragraph text to `StatsInput`, send `{ kind: 'paragraphs', count: 1, words: countWords(text) }` once per unique paragraph key
    - `src/ui/ReaderView.tsx`: pass the active paragraph text into `StatsInput`
    - Only the number reaches `statsOps`; no paragraph text enters the Data_Model
    - _Requirements: 11.2, 11.3, 11.4, 11.5_

  - [ ] 1.3 Write property test for v2→v3 migration
    - File `src/library/__tests__/schemaV3.migrate.property.test.ts`; 100+ runs; shared DataModel arbitraries in `src/library/__tests__/arbitraries.ts`
    - **Property 7: Migrating a Schema_Version 2 Data_Model produces Schema_Version 3 with wordsRead 0 and nothing else changed**
    - **Validates: Requirements 11.6**

  - [ ] 1.4 Write property test for migration idempotence
    - File `src/library/__tests__/schemaV3.idempotent.property.test.ts`
    - **Property 8: Migration is idempotent and preserves an existing wordsRead**
    - **Validates: Requirements 11.7**

  - [ ] 1.5 Write property test for recording a paragraph
    - File `src/library/__tests__/statsOps.words.property.test.ts`; arbitrary text including empty and whitespace-only
    - **Property 6: Recording a paragraph adds exactly its word count to wordsRead and one to paragraphs read, for the book and the day**
    - **Validates: Requirements 11.2, 11.3, 11.4**

  - [ ] 1.6 Write example tests for load and validation
    - A literal Schema_Version 2 fixture loads through `localStore.ts` without rejection, keeps books, shelves, positions, profile and stats, and gains `wordsRead: 0`
    - Validator accepts a good v3 model and rejects missing, negative, fractional and non-numeric `wordsRead`, naming the record and field
    - Extend `useStatsRecorder.unit.test.ts`: a recorded paragraph adds `countWords(text)` once per paragraph key
    - _Requirements: 11.3, 11.9, 11.10, 12.8_

- [ ] 2. Build the pure Ledger_Calculator
  - [ ] 2.1 Implement `src/library/ledgerCalculator.ts`
    - `focusScore`, `sevenDayFocusScore`, `moonPhase`, `goalProgress`, `measuredPace`, `clampDailyGoalMinutes`, constants (`PACE_THRESHOLD_SECONDS` = 120, default 15, range 1-240), and a `bookCounts` helper for finished and in-progress books
    - Take `today` as input, never read the clock; no DOM access; non-finite or negative inputs count as 0
    - _Requirements: 8.1, 8.3, 8.4, 8.6, 8.8, 8.10, 8.11, 8.12, 8.14, 8.15, 8.16, 8.17, 8.18, 8.19_

  - [ ] 2.2 Write property test for Focus_Score bounds
    - File `src/library/__tests__/ledger.focus.property.test.ts`
    - **Property 1: Focus_Score is bounded, and undefined exactly when there is no data**
    - **Validates: Requirements 8.2, 8.3**

  - [ ] 2.3 Write property test for the 7-day Focus_Score
    - File `src/library/__tests__/ledger.sevenDay.property.test.ts`
    - **Property 2: Seven-day Focus_Score uses summed seconds, not an average of daily scores**
    - **Validates: Requirements 8.4**

  - [ ] 2.4 Write property test for Moon_Phase
    - File `src/library/__tests__/ledger.moon.property.test.ts`
    - **Property 3: Moon_Phase is always one of five phases and never regresses as reading time rises**
    - **Validates: Requirements 8.6, 8.7**

  - [ ] 2.5 Write property test for Goal_Progress
    - File `src/library/__tests__/ledger.goal.property.test.ts`
    - **Property 4: Goal_Progress is bounded**
    - **Validates: Requirements 8.9**

  - [ ] 2.6 Write property test for Measured_Pace
    - File `src/library/__tests__/ledger.pace.property.test.ts`
    - **Property 5: Measured_Pace comes only from Pace_Days, is a positive whole number or absent, and ignores zero-wordsRead days**
    - **Validates: Requirements 8.10, 8.11, 8.13**

- [ ] 3. Fix theme colours and add the Darkness colour
  - [ ] 3.1 Update `src/ui/theme.css` and `docs/BUILD_LOG.md`
    - `--text-dim` `#8a7f6e` → `#9a8f7e`; `--danger` `#c0564b` → `#d9766b`; add `--darkness: #0d0b0a`
    - Add a BUILD_LOG entry per changed colour: name, old value, new value, new ratio (5.91 / 5.49 / 6.18 for `--text-dim` against `--bg` / `--surface` / `--darkness`; 6.05 / 5.61 / 6.32 for `--danger`)
    - Re-measure with the `check-candle-contrast.mjs` formula before recording, and note that the old values already failed 4.5:1 against `--surface`
    - _Requirements: 3.7, 3.8, 3.15, 3.16_

  - [ ] 3.2 Write example test for text contrast
    - Lift the luminance and ratio functions from `scripts/check-candle-contrast.mjs` into a small shared module used by both the script and a Vitest test
    - Assert `--text`, `--text-dim`, `--accent`, `--danger` and the six Candle_Colours (as text) are at least 4.5:1 against `--bg`, `--surface` and `--darkness`, plus the amber pool composite from the design
    - _Requirements: 3.7, 3.8, 3.9, 12.5_

- [ ] 4. Build the Shell frame and Tab_Bar
  - [ ] 4.1 Create `src/ui/shell/TabBar.tsx`, `ShellFrame.tsx` and a guarded tab-storage helper
    - ARIA `tablist`/`tab`/`tabpanel`, `aria-selected`, `aria-controls`/`aria-labelledby`, roving `tabindex`, Left/Right/Home/End with wrap-around, `--accent` focus ring, fits 360 px
    - `ShellFrame` owns tab state and reads/writes `rod_shell_tab` with try/catch; a missing or invalid value falls back silently to `library`; a write failure is silent
    - Modify `LibraryShell.tsx` to render `ShellFrame` when no book is open (Library tab shows the existing `LibraryScreen` unchanged); hide the Tab_Bar while a book is open and restore the same tab on return
    - Ledger and Séance panels are placeholders here and filled in by tasks 5 and 7
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14, 10.8, 10.9_

  - [ ] 4.2 Write example tests for the Tab_Bar
    - ARIA roles and attributes, arrow/Home/End movement with wrap-around, single tab stop, tab remembered across a reload, fallback to Library for an invalid saved tab
    - _Requirements: 12.3_

- [ ] 5. Build The Séance tab and remove the gear dialog
  - [ ] 5.1 Create `src/ui/shell/SeanceTab.tsx` and `volumeCap.ts`
    - Move the `ProfileSettings.tsx` content into the tab (name with 40-char limit, six-colour radio group, pace-guide checkbox, delete profile, clear data with `ClearDataConfirm`), using `useProfileActions` and `lib.clearAllData`; keep focus-to-first-control and Escape-to-cancel on confirmations; disable Profile controls while loading; keep the `role="alert"` save-failure message
    - Haunt_Mode radio group through `useHauntSettings()` (descriptions of at most 120 characters)
    - Camera choice through `loadChoice`/`saveChoice` only, with the on-device privacy note and the "browser asks when the next book opens" wording; neither option selected when unanswered; import no camera, detector or video code
    - `volumeCap.ts` reuses `parseVolumeCap` and `DEFAULT_VOLUME_CAP` from `src/haunts/engine/gate/plan.ts`; slider 0-100 in steps of 5 writes 0-1 to `rod_volume_cap`; default 40%; shows "used from the next time a book opens"; no change to any file under `src/haunts/engine/`
    - After a successful clear, `ShellFrame` also removes `rod_daily_goal`, `rod_shell_tab` and `rod_volume_cap` and the tab shows defaults
    - Delete `ProfileSettings.tsx` and its gear button and dialog in `LibraryScreen.tsx`; update imports and tests that referenced them
    - Wire `SeanceTab` into `ShellFrame`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14, 2.15, 2.16, 2.17, 2.18, 2.19, 2.20, 2.21, 2.22, 2.23_

  - [ ] 5.2 Write example tests for the Séance tab
    - Haunt_Mode write through the store, camera choice write through `saveChoice`, Volume_Cap writes 0-1 and falls back to 40%, privacy note text, delete and clear confirmations, clear also removes the three shell keys, gear button and dialog gone from `LibraryScreen`
    - _Requirements: 12.4_

- [ ] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Build The Ledger tab
  - [ ] 7.1 Create `src/ui/shell/LedgerTab.tsx` (plus small parts under 200 lines each) and wire it into `ShellFrame`
    - Candle_Gauge for today and 7-day Focus_Score with text and text alternative; Tally_Marks for the last 7 days in fives, capped at 20 with the full number beside them; 30 Moon_Phases oldest first via `statsForLastDays` with date and phase name for screen readers, plus the full-moon explanation
    - Books finished and in progress, paragraphs and chapters read
    - Measured_Pace beside the Typical_Speeds text, with the below/near/above sentence (214 / 286 wpm), the "Read a little longer to see your pace." fallback, the Source note with the full Pace_Source citation, and the "finishing with focus, not reading faster" statement
    - Daily_Goal field saved clamped to `rod_daily_goal` (default 15 on a missing or invalid value; a short message when the write fails) and a `role="progressbar"` for Goal_Progress with "9 of 15 minutes" text
    - Empty state text, loading skeletons, still drawings under Reduced_Motion, 360 px layout, every number as text
    - `ShellFrame` passes `today` into the calculator
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11, 9.12, 9.13, 9.14, 9.15, 9.16, 9.17, 9.18, 9.19, 9.20, 9.21, 9.22_

  - [ ] 7.2 Write example tests for the Ledger tab
    - Empty-state text and condition, progressbar attributes, Measured_Pace and fallback branches, below/near/above boundaries, 20-mark cap, book and paragraph counts, `clampDailyGoalMinutes` boundaries, and `rod_daily_goal` write then read
    - _Requirements: 12.4, 8.19_

- [ ] 8. Add the visual layers (no tests, per Requirement 12.6)
  - [ ] 8.1 Darkness, Candle_Pool and Fog_Layer
    - New `Darkness.tsx`, `CandlePool.tsx` and `FogLayer.tsx` in `src/ui/shell/`, rendered by `ShellFrame` behind all content, only on the Shell and never on the reading page
    - Candle_Pool about 280 px in the Profile's Candle_Colour (`--candle-amber` fallback), following the pointer within one frame, the focused element's centre for keyboard, the touch point for touch, and the Tab_Panel centre until the first event; direct follow under Reduced_Motion
    - Fog drifts slowly (at least 30 s to cross), is still under Reduced_Motion, pauses when the document is hidden, stays under all text, and changes no more than 3 times per second
    - All effects `pointer-events: none`, no focus, colours from `theme.css`, and each effect inside a small local error boundary so a throw never breaks the tabs
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.10, 3.11, 3.12, 3.13, 3.14, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 10.1, 10.2, 10.3, 10.4, 10.7, 10.10_

  - [ ] 8.2 Cover_Effect on cover cards
    - Tilt toward the pointer up to 8° per axis and return within 400 ms, warm Candle_Colour edge glow on hover and focus, slow shadow flicker (at most 2 changes per second), no tilt on keyboard focus or `hover: none`, still glow under Reduced_Motion
    - Keep the library-v2 hover card, keep neighbours overlapped by at most 8 px, and keep title and author at 4.5:1
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 10.12_

  - [ ] 8.3 Opening_Transition
    - New `OpeningTransition.tsx` used by `LibraryShell.tsx` when a book opens from the Library tab: candle gutter, dim to dark about 600 ms, fade up, at most 1500 ms in total
    - Any key, click or touch ends it at once; it never blocks input; it holds on dark until the book is ready; it ends at once on open failure; a single fade of at most 300 ms under Reduced_Motion; no sound, no flashing, no saturated red; not run when returning to the library
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10_

  - [ ] 8.4 Lurking_Ghost
    - New `LurkingGhost.tsx` rendered by `ShellFrame` on the Library tab only, using `GHOST_ASSETS` through relative same-origin URLs
    - Peek about every 45-90 s (random), about 1.5 s long, from a screen edge position that overlaps no Control, skipped when none is free; vanishes at once when the pointer reaches it or Haunt_Mode becomes Gentle
    - Not shown in Gentle or under Reduced_Motion; cancelled on a tab change or when a book opens; rescheduled on return to Library; paused when the document is hidden; silent, `aria-hidden="true"`, `pointer-events: none` apart from the reach check, no focus, no flashing
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 7.12, 7.13, 7.14, 7.15, 7.16, 10.1, 10.2_

- [ ] 9. Add the pace citation to the README
  - [ ] 9.1 Add a "Sources" section to `README.md` with the Pace_Source citation
    - Add the citation verbatim: Brysbaert, M. (2019). How many words do we read per minute? A review and meta-analysis of reading rate. Journal of Memory and Language, 109, 104047.
    - Add one example assertion to `src/__tests__/readmeAssets.unit.test.ts` that the README contains it
    - _Requirements: 11.14_

- [ ] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- No optional (`*`) tasks: the property tests are the only high-risk tests in the spec and the testing rule asks for them, and the only other tests are small example tests.
- Property tests (Properties 1-8) run at least 100 cases each; report cases run and any counterexample after each task, and record counterexamples in `docs/BUILD_LOG.md`.
- Properties 1-5 cover Ledger_Calculator and Properties 6-8 cover `wordsRead` recording and migration. The shell-local storage round trips (`rod_daily_goal`, `rod_shell_tab`) are covered by example tests in 4.2 and 7.2.
- Visual layers (task 8) have no tests by design. Their safety rules (Reduced_Motion, no flashing, `pointer-events: none`, no sound) are requirements to check by hand during implementation.
- Every new component stays under 200 lines and uses only colours from `theme.css`. No new dependency is added.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "9.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "1.5", "1.6", "2.2", "2.3", "2.4", "2.5", "2.6", "3.2", "4.1"] },
    { "id": 2, "tasks": ["4.2", "5.1"] },
    { "id": 3, "tasks": ["5.2", "7.1", "8.2"] },
    { "id": 4, "tasks": ["7.2", "8.1"] },
    { "id": 5, "tasks": ["8.3", "8.4"] }
  ]
}
```
