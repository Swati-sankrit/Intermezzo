# Implementation Plan: Ghost Dread

## Overview

Implement ghost-dread in TypeScript, as an extension of the haunt feature in `src/haunts/engine/`. The design is already in TypeScript, so no language question applies. No new dependency is added (Vite, React, Vitest, fast-check and jsdom are already in `package.json`).

Delivery order, as the user required:

1. **Phase A (tasks 1 to 7): one flow end to end.** The Ghost while away, the Return_Moment and one Jumpscare, wired into the reading view and covered by an integration test. Checkpoint A closes it.
2. **Phase B (tasks 8 to 13): Glitch, Evidence_Message, Spoiler_Threat and the three Haunt_Modes in the UI.** Checkpoint B closes it.
3. **Phase C (task 14): Taunts (requirement 12).** Optional, built last.

Notes on ordering:

- The `HauntMode` type, the settings migration and the `mode` parameter of Level_Logic are small prerequisites of every Ghost rule (Gentle must show no Ghost). They are built in task 1, inside phase A. The mode choice in the Safety_Notice and Haunt_Control is built in phase B (task 11). Until then, `HauntControl` keeps one toggle that maps to Gentle or Classic.
- `planReturn` is written once in task 4 with the Ghost, False_Calm and Jumpscare, and extended in tasks 8.5, 9.3 and 10.6. Each extension updates its property tests.
- The fixed Evidence_Message list lives in `ghost/fixedMessages.ts`, built in phase B, so evidence works without the optional Taunt_Builder. `taunts.ts` re-exports it, as the design lists `FIXED_MESSAGES` there.
- The haunt-feature amendment (requirement 13) is task 1.1. It also removes the unbuilt shadow task from the haunt-feature task list.

Testing rules that apply to every task (workspace testing rule): no fake tests, no weakened assertions, no mocking the function under test. If a test fails and the cause is unclear, stop and report it. Property tests are required tasks (not optional), run at least 100 cases (500 for Properties 12, 23 and 28), and carry the comment `// Feature: ghost-dread, Property N: <title>`. Pure-logic tests live in `src/haunts/engine/ghost/__tests__/` as `<area>.gdNN.prop.test.ts`. Gate and engine tests live in `src/haunts/engine/__tests__/` with the same suffix. Before using any Web Audio or other API, confirm it in current documentation (Context7 or MDN). After each group, report the properties added, the cases run and any counterexample in `docs/BUILD_LOG.md`.

## Tasks

- [x] 1. Foundation: spec amendment, modes, settings migration, types, registry
  - [x] 1.1 Amend the haunt-feature spec
    - Edit `.kiro/specs/haunt-feature/requirements.md`, `design.md` and `tasks.md` as in the design table "Amendments to the haunt-feature spec": ambient fade within 800 ms and the Ghost may stay for the Return_Moment (13.1); the Ghost replaces the shadow haunt, remove task 9 and every `shadow.ts` mention (13.2); Return_Moment effects may cover the column and the column is identical within 100 ms after (13.3); `Gentle_Mode` becomes the Gentle value of a three-valued Haunt_Mode (13.4); the Safety_Notice describes ghosts and glitching, not a shadow (13.5)
    - Run `validate_spec_format` on each edited document
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 1.2 Create the mode and contract types
    - `src/haunts/engine/ghost/mode.ts`: `HauntMode`, `HAUNT_MODES`, `DEFAULT_MODE`, `resolveMode`
    - `engine/types.ts`: add `StartInfo`, optional `role`, `modes`, `minLevel` on `Haunt`, `AudioOut.onTick`, `VisualLayer.setLabel`, and the optional fourth `start` argument; `Gate` gains `beginReturnMoment`, `endReturnMoment`, `openReturn`
    - `engine/returnTypes.ts`: `ReturnPlan`, `ReturnEffect`, `ReturnPort`, `ReturnVisualOut`, `OverlayKind`, `GlitchSpec`, `ReadingContext`, `EvidenceHost`, `SpoilerHost`
    - Types only, no DOM, audio, timer or camera access; each file under 200 lines
    - _Requirements: 8.1, 8.2, 8.12, 11.1, 13.6_

  - [x] 1.3 Implement the settings migration in `engine/settings.ts`
    - Replace `gentle` with `mode: HauntMode`; add `headphonesTipSeen`; new keys `rod_haunt_mode` and `rod_headphones_tip_seen`; `rod_haunt_gentle` is read only
    - `parseSettings` uses `resolveMode` (valid mode wins, invalid string gives Classic, missing mode migrates from the legacy flag `'true'` to Gentle and `'false'` to Classic, anything else Classic); `serializeSettings` writes the new keys; `set()` returns `false` when any write failed
    - _Requirements: 8.2, 8.5, 8.6, 8.7, 8.8, 8.9, 10.5_

  - [x] 1.4 Write property test for mode resolution and settings round trip
    - File: `src/haunts/engine/__tests__/settings.gd01.prop.test.ts` (replaces the `gentle` assertions of `settings.p16`)
    - **Property 1: Haunt mode resolution and settings round trip**
    - **Validates: Requirements 8.2, 8.7, 8.8, 8.9, 10.5**

  - [x] 1.5 Change Level_Logic from `gentle` to `mode`
    - `engine/levelLogic.ts`: `LevelInput.gentle` becomes `mode: HauntMode`; Gentle gives level at most 1 and no companion; Classic and Nightmare give the previous output
    - _Requirements: 8.12_

  - [x] 1.6 Write property test for Level_Logic with modes and update existing level tests
    - File: `src/haunts/engine/__tests__/levelLogic.gd02.prop.test.ts`
    - Move `levelLogic.p01` to `p08` and `plan`-independent tests to the `mode` input with the same assertions
    - **Property 2: Level_Logic with modes**
    - **Validates: Requirements 8.12**

  - [x] 1.7 Migrate every consumer of `gentle`
    - `engine.ts`, `HauntLayer.tsx`, `HauntControl.tsx` (one toggle mapped to Gentle or Classic until task 11), `useHauntSettings`, the fakes in `engine/__tests__/fakes.ts` (add `reading`, `evidence`, `spoiler` fakes) and `engine.p20`, `reducedMotion.p15`, `gateCap.p14` and `colorRule` tests
    - Run the TypeScript compiler; the removed `gentle` field makes every use a compile error
    - _Requirements: 8.4, 8.5, 8.12_

  - [x] 1.8 Extend the registry for roles, modes and return effects
    - `engine/registry.ts`: classify Haunt, ReturnEffect or both; validate optional `role`, `modes`, `minLevel`, `jumpSound`; add `loadRegistry(warn)` returning `{ haunts, effects }`; keep `loadHaunts` and the glob unchanged
    - _Requirements: 1.14, 13.6_

  - [x] 1.9 Write property test for the registry and extend the static scan
    - File: `src/haunts/engine/__tests__/registry.gd22.prop.test.ts`
    - Extend `staticScan.unit.test.ts`: allow the import prefix `./engine/ghost/`, scan every file in `engine/ghost/` with the pure-logic rules (no `document`, `window`, `Date`, `performance`, `setTimeout`, `Math.random`, `fetch`, `XMLHttpRequest`), and keep `.destination` limited to `audioAdapter.ts` and `audioGraph.ts`
    - **Property 22: The registry accepts the extended contract and still rejects bad files**
    - **Validates: Requirements 1.14**

  - [x] 1.10 Create the ghost generators
    - `src/haunts/engine/ghost/__tests__/arbitraries.ts`: unit fractions built from `fc.integer({ min: 0, max: 999_999 })`, `ReturnRolls`, `ReturnInput` per mode (with `awayMs` at 0, 9999, 10000, 20000, 20001, 59999, 60000 and very large), paragraphs of 0 to 40 words with irregular whitespace, message pools including messages longer than the paragraph, chapter sentence lists, look-away and chapter scripts
    - _Requirements: 11.1_

- [x] 2. Ghost pure helpers (Ghost_Distance, art, spatial specs, pulses)
  - [x] 2.1 Implement `ghost/ghostDistance.ts` and `engine/awayCounter.ts`
    - `ghostDistance(count)` returns an integer 0 to 4, `min(count, 4)` for counts of 0 or more, 0 for `NaN` and negatives; `startLookAway(counter, chapterKey)` resets on a new chapter key, and `onChapterChange(counter, chapterKey)` resets on any change of key
    - _Requirements: 2.3, 2.4, 2.5, 11.15_

  - [x] 2.2 Write property tests for Ghost_Distance and the away counter
    - Files: `ghost/__tests__/ghostDistance.gd03.prop.test.ts`, `awayCounter.gd04.prop.test.ts`
    - **Property 3: Ghost_Distance is bounded and non-decreasing**
    - **Property 4: Look-away counter follows the chapter**
    - **Validates: Requirements 2.3, 2.4, 2.5, 11.15**

  - [x] 2.3 Implement `ghost/ghostArt.ts`
    - `ghostArt(step)` returns SVG markup, `heightUnits` and `detailCount`, both strictly increasing with the step; faint eyes at constant opacity; colours only `var(--...)`; no `<image>`, no `href`, no animation. `ghostBox(step, region)` keeps the aspect ratio inside the region and returns `null` under 48 px wide
    - _Requirements: 2.1, 2.2, 2.6, 2.7, 2.8, 5.9_

  - [x] 2.4 Write property test for Ghost art
    - File: `ghost/__tests__/ghostArt.gd05.prop.test.ts`
    - **Property 5: Ghost art grows with the step and stays safe and inside its region**
    - **Validates: Requirements 2.2, 2.6, 2.7, 2.8, 5.9**

  - [x] 2.5 Implement `ghost/spatial.ts` and `ghost/pulses.ts`
    - `footstepSpec`, `breathingSpec`, `azimuthToPosition`, `buildPulseTrain` (linear attack of at least 20 ms, peak at most 1, seeded, no `Math.random`)
    - _Requirements: 1.1, 1.2, 1.9, 5.10_

  - [x] 2.6 Write property tests for spatial specs and pulses
    - Files: `ghost/__tests__/spatial.gd06.prop.test.ts`, `pulses.gd07.prop.test.ts`
    - **Property 6: Footstep and breathing specs**
    - **Property 7: Pulses have a slow enough attack and never exceed 1**
    - **Validates: Requirements 1.1, 1.2, 1.9, 5.10**

  - [x] 2.7 Report results in `docs/BUILD_LOG.md`
    - Append a section for tasks 1 and 2: properties 1 to 7 and 22, cases run per property, any counterexample with seed and shrunk input. If a property fails, stop and report it; never weaken the assertion
    - _Requirements: none (testing rule)_

- [x] 3. Safety_Gate extensions (panner, jump channel, port tick, Return_Moment state, overlays)
  - [x] 3.1 Confirm the audio APIs in current documentation
    - Use Context7 or MDN for `PannerNode` (`panningModel`, position `AudioParam`s, `setPosition` fallback), `AudioListener` (`positionX`, `forwardX`, `setPosition`, `setOrientation`) and default listener values, which the design marks as unconfirmed
    - Record findings and anything unconfirmed in `docs/BUILD_LOG.md`; do not use a method that cannot be confirmed
    - _Requirements: 1.5, 13.6_

  - [x] 3.2 Implement `gate/returnRules.ts`
    - `RETURN_MAX_MS`, `JUMP_ATTACK_MIN_MS`, `JUMP_ATTACK_REDUCED_MS`, `planJumpAttack`, `jumpHeadroom`, `FadeKind`, `planOverlayFade`; pure, non-finite input handled
    - _Requirements: 2.9, 5.10, 5.12, 9.7, 9.10_

  - [x] 3.3 Write property test for fade floors
    - File: `src/haunts/engine/__tests__/returnRules.gd26.prop.test.ts`
    - **Property 26: Fade floors under reduced motion**
    - **Validates: Requirements 2.9, 3.10, 5.12, 7.17, 9.10**

  - [x] 3.4 Add the spatial panner wrapper and the listener
    - `hauntAudio.ts`: `HauntSpatialPanner`, `createSpatialPanner`; `restrictedAudio.ts`: wrapper fixing HRTF, inverse distance, `refDistance` 0.5, omnidirectional cone, exposing only the three position params, with the `setPosition` shim when `positionX` is missing; `audioGraph.ts`: set the listener once; extend the fake `AudioContext` in `fakes.ts` to record panners and listener calls
    - _Requirements: 1.5, 1.6, 1.15, 13.6, 13.7_

  - [x] 3.5 Add the jump channel to the gain plan and audio adapter
    - `gainPlan.ts` rule 5: a jump channel rises with `planJumpAttack`, its target is `min(scaled target, jumpHeadroom)`, and other rises are held in that pass; `audioAdapter.ts` marks channels opened with `jumpSound`
    - _Requirements: 5.10, 9.4, 9.7_

  - [x] 3.6 Add `onTick` and `setLabel`
    - `gate.ts` and `audioAdapter.ts`: gate-owned `onTick(cb, periodMs)` on the injected scheduler (period at least 100 ms), cancelled on port close, fade-out and dispose; a throwing callback goes to `warn`. `visualAdapter.ts`: `setLabel` sets `role="img"` and `aria-label`; layers get `aria-hidden` unless labelled
    - _Requirements: 1.1, 2.12_

  - [x] 3.7 Implement the Return_Moment state, ReturnPort and overlays
    - `gate/gateReturn.ts`, `gate/returnVisual.ts` and `gate.ts` wiring: `beginReturnMoment` (3000 ms guard timer), `endReturnMoment(fadeMs)` (closes ports, removes overlays and jump channels within 100 ms, safe twice), `openReturn` returning `null` outside a Return_Moment, `createOverlay` for `'ghost'`, `'jumpscare'` and `'card-hand'`; keep every file under 200 lines
    - _Requirements: 3.2, 3.4, 5.11, 5.13, 9.7, 9.8_

  - [x] 3.8 Write property test for the cap with spatial layers and a jump channel
    - File: `src/haunts/engine/__tests__/gateCap.gd23.prop.test.ts` (500 cases)
    - Real gate and audio adapter against the fake `AudioContext`
    - **Property 23: Combined gain stays at or below the cap with spatial layers and a jump channel**
    - **Validates: Requirements 1.7, 1.8, 1.12, 1.16, 5.10, 9.4, 9.5, 9.6, 9.7, 13.7**

  - [x] 3.9 Write property test for return-only features
    - File: `src/haunts/engine/__tests__/gateReturn.gd24.prop.test.ts`
    - **Property 24: Return-only features exist only inside a Return_Moment**
    - **Validates: Requirements 5.11, 6.9, 9.7, 9.8**

  - [x] 3.10 Write unit tests for the gate extensions
    - File: `src/haunts/engine/__tests__/gateReturn.unit.test.ts`
    - Overlays are gone within 100 ms of `endReturnMoment`; the 3000 ms guard ends the state; a throwing `onTick` callback is reported and does not stop others; `setLabel` sets the label and unlabelled layers are `aria-hidden`; ticks stop at port close
    - _Requirements: 2.12, 3.2, 5.13, 9.8_

- [x] 4. Return_Planner for the Ghost and one Jumpscare
  - [x] 4.1 Implement `ghost/jumpscarePolicy.ts`
    - `allowed(mode, history)` (limit 1 in Classic, 2 in Nightmare over the last two outcomes) and `probability(mode)` (0.35 Classic, 0.6 Nightmare)
    - _Requirements: 5.5, 5.6, 5.7_

  - [x] 4.2 Implement `ghost/returnPlanner.ts` (Ghost, False_Calm, Jumpscare)
    - `planReturn`: Gentle gives `EMPTY_PLAN`; qualifying at 10 s; Jumpscare when qualifying, allowed and the roll is below the probability; False_Calm of 300 to 800 ms with roll below 0.75; Jumpscare of 700 to 1200 ms, `render: 'fade'` of 1000 to 1400 ms under reduced motion; ambient fade 300 ms with a Jumpscare and 600 ms without; `durationMs = min(3000, max(2000, end + 300))`; reduced-motion `fade` of at least 500 ms; inputs and rolls sanitised; glitch, evidence and spoiler are `null` for now (the Glitch added in 8.5 must start after the Jumpscare ends, so keep the Jumpscare end time (`startMs + durationMs`) available to the planner)
    - _Requirements: 3.2, 3.3, 3.10, 5.1, 5.2, 5.4, 5.7, 5.8, 5.12, 11.2, 11.3, 11.4, 11.5, 11.6, 11.9_

  - [x] 4.3 Write property test for plan bounds and determinism
    - File: `ghost/__tests__/planner.gd08.prop.test.ts`
    - **Property 8: Return plan bounds and determinism**
    - **Validates: Requirements 3.2, 3.3, 5.8, 11.2, 11.4, 11.9, 11.16**

  - [x] 4.4 Write property test for empty Gentle plans
    - File: `ghost/__tests__/planner.gd09.prop.test.ts`
    - **Property 9: Gentle plans are empty**
    - **Validates: Requirements 5.2, 11.5**

  - [x] 4.5 Write property test for reduced motion plans
    - File: `ghost/__tests__/planner.gd10.prop.test.ts`
    - **Property 10: Reduced motion plans have no Glitch and no close-up**
    - **Validates: Requirements 3.10, 5.12, 11.16**

  - [x] 4.6 Write property test that a Jumpscare needs a Qualifying_Return
    - File: `ghost/__tests__/planner.gd11.prop.test.ts`
    - **Property 11: A Jumpscare needs a Qualifying_Return**
    - **Validates: Requirements 5.1, 11.6**

  - [x] 4.7 Write property test for Jumpscare frequency
    - File: `ghost/__tests__/planner.gd12.prop.test.ts` (500 cases; feeds each outcome into the next history)
    - **Property 12: Jumpscare frequency over any three Qualifying_Returns**
    - **Validates: Requirements 5.4, 5.5, 5.6, 11.7, 11.8, 11.9**

  - [x] 4.8 Write property test that Nightmare scares at least as often as Classic
    - File: `ghost/__tests__/planner.gd13.prop.test.ts`
    - **Property 13: Nightmare is more likely to scare than Classic**
    - **Validates: Requirements 5.7**

- [x] 5. Haunt files, Return controller and engine wiring
  - [x] 5.1 Implement `src/haunts/footsteps.ts`
    - Layer, Classic and Nightmare, `minLevel` 1; looped footstep buffer from `buildPulseTrain`, filter, spatial panner (`createSpatialPanner()` may return `null`; on `null` fall back to stereo panner, then none); `onTick` every 500 ms schedules position ramps 1500 ms ahead; `setLevel` re-reads `footstepSpec`; `stop` disconnects every node. Imports only types, `noise` and `./engine/ghost/`
    - _Requirements: 1.1, 1.4, 1.5, 1.8, 1.13, 1.14, 1.15_

  - [x] 5.2 Implement `src/haunts/breathing.ts`
    - Layer, Classic and Nightmare, `minLevel` 1; alternates side each look-away, fixed position from `breathingSpec` on the spatial panner (`createSpatialPanner()` may return `null`; on `null` fall back to stereo panner, then none), slow breath pulses through a band-pass filter; no movement
    - _Requirements: 1.2, 1.4, 1.5, 1.13, 1.14, 1.15_

  - [x] 5.3 Implement `src/haunts/knock.ts`
    - Layer, Classic and Nightmare, `minLevel` 3; one knock buffer scheduled 0.35 s after `whenReady`, so it starts within 500 ms and after the 300 ms fade-in; plays once per `start`
    - _Requirements: 1.3, 1.9, 1.14_

  - [x] 5.4 Implement `src/haunts/ghostFigure.ts`
    - As a layer: draws `ghostArt(info.ghostStep)` in a side region inside `ghostBox`, calls `setLabel('A ghost stands nearby')`, draws nothing in Gentle or when `ghostBox` is `null`. As a return effect: `span(plan)`, `begin` draws a `'ghost'` overlay for `ghostLingerMs`, `end` removes it
    - _Requirements: 2.1, 2.2, 2.7, 2.9, 2.10, 2.11, 2.12, 2.13, 3.4, 3.5_

  - [x] 5.5 Implement `src/haunts/jumpscare.ts`
    - Return effect with `jumpSound: true`: `span(plan)` from `plan.jumpscare`; `begin` draws a `'jumpscare'` overlay using `ghostArt(4)` with no saturated red, builds a jump buffer with `buildPulseTrain` (`kind: 'jump'`), plays it once through the jump channel; plays no sound when sound is off or locked; `end` stops, disconnects and closes the channel
    - _Requirements: 5.9, 5.10, 5.12, 5.13, 5.14_

  - [x] 5.6 Write unit tests for the new haunt files
    - File: `src/haunts/__tests__/ghostHaunts.unit.test.ts`
    - Each file satisfies the `Haunt` or `ReturnEffect` type; every created node is disconnected and every layer removed on `stop` or `end`; every panner is HRTF and the wrapper exposes no `destination`; a throwing `createPanner` (`createSpatialPanner` returns `null`, the haunt falls back to the stereo panner, then none) or `createAudioContext` leaves the Ghost layer drawn and raises no error; Gentle adds no element; the knock starts one source at under 0.5 s; sound off gives the close-up without sound
    - _Requirements: 1.3, 1.5, 1.6, 1.11, 1.13, 1.15, 2.10, 2.11, 5.13, 5.14_

  - [x] 5.7 Implement `engine/returnMoment.ts` (Return controller)
    - `begin(args, retireAmbient)`: build the pool and input, `planReturn`, record history, call `retireAmbient(plan.ambientFadeMs)`, then `gate.beginReturnMoment()`, then schedule each effect whose `modes` allow the mode at its `span`, then schedule the end at `durationMs`; each effect call wrapped, throws sent to `warn`; `abort('away' | 'gentle' | 'stop')` runs synchronously (80 ms fade for `away`, 100 ms for `gentle`, within the 800 ms of Req 8.10); returns `null` in Gentle or when one is running
    - Evidence and spoiler calls are wired in tasks 9 and 10; the controller already accepts the hosts
    - _Requirements: 3.1, 3.3, 3.5, 3.6, 3.7, 3.9, 3.11, 5.3, 5.13, 8.10, 9.8_

  - [x] 5.8 Wire the engine
    - `engine/engineSelect.ts` (`selectByMode`, `layersToRun`); `engineRoster.ts` (`StartInfo` as fourth `start` argument, `retireAll(ms)`, `retireWhere`, a started layer is not restarted within a look-away); `engine.ts` (new deps `reading`, `evidence`, `spoiler`, `reducedMotion`; `startLookAway` on `away`, and `onChapterChange(counter, key)` whenever `reading.chapterKey()` changes, so a return to an earlier chapter resets Ghost_Distance; `begin` on `present` after a look-away with `recompute()` fallback; `abort('away')` on a new `away`; mode change handling; `stop` aborts everything). Keep each file under 200 lines
    - _Requirements: 1.3, 1.12, 1.14, 2.3, 2.4, 2.13, 3.1, 3.6, 3.7, 3.9, 3.11, 8.10, 9.9, 9.13, 9.15_

  - [x] 5.9 Write property test for engine behaviour over any script
    - File: `src/haunts/engine/__tests__/engine.gd28.prop.test.ts` (500 cases)
    - Real engine with fake lead haunts, fake layers (some `minLevel` 3, some limited to Classic and Nightmare), fake return effects, fake gate and fake scheduler; scripts of signals, clock steps, timer firings, mode changes, chapter changes, reduced-motion toggles and arming
    - **Property 28: The engine runs ghosts and returns inside their rules**
    - **Validates: Requirements 1.3, 1.14, 2.4, 2.13, 3.1, 3.5, 3.6, 3.7, 3.9, 3.11, 4.7, 5.3, 8.10, 9.8, 9.9, 9.13**

- [x] 6. Wire into the reading view and prove the flow end to end
  - [x] 6.1 Implement `src/ui/readingContext.ts`
    - `ReadingContext` from reader state: `chapterKey()`, `activeParagraph()`, `readSoFar()`, `spoilerSource()` returning `null` for now; a no-op `EvidenceHost` and `SpoilerHost` until tasks 9 and 10. Read-only over reader state
    - _Requirements: 2.4, 4.8, 7.16_

  - [x] 6.2 Wire `HauntLayer` and `HauntStage`
    - `HauntLayer`: use `loadRegistry`, pass `effects`, `reading`, `evidence`, `spoiler`, `reducedMotion` to the engine; `HauntStage.css`: ghost step styles, overlay layer styles, reduced-motion rules; `HauntStage` drops `aria-hidden` on its root and keeps it on glow elements. Components under 200 lines
    - _Requirements: 2.12, 9.2, 9.12_

  - [x] 6.3 Write the end-to-end integration test
    - File: `src/ui/__tests__/ghostFlow.integration.test.tsx` (jsdom, real engine, real gate, real haunts, fake signal source, fake clock)
    - Away: Ghost layer in a side region and outside the column box. Present after 12 s with Classic and a low jump roll: Return_Moment starts, Jumpscare overlay appears, and at 3000 ms no overlay, no Ghost element and no jump channel remain and the column text is unchanged. Gentle shows no Ghost. A new `away` during the Return_Moment ends it at once
    - _Requirements: 2.1, 2.2, 2.13, 3.1, 3.5, 3.7, 5.1, 5.13, 9.9_

  - [x] 6.4 Extend the existing property suites over the new haunts
    - `gateCap.p14` and `reducedMotion.p15` iterate the registry: confirm they now cover the layers and effects, and that with reduced motion no `is-guttering`, `is-sweeping` or `is-glitching` class is ever added and the Ghost and Jumpscare fade in at least 1000 ms
    - _Requirements: 1.7, 2.9, 5.12, 9.4, 9.10_

  - [x] 6.5 Report results in `docs/BUILD_LOG.md`
    - Append a section for tasks 3 to 6: properties 8 to 13, 23, 24, 26 and 28, cases run, any counterexample with seed and shrunk input, the API findings from 3.1, and a confirmation that adding the five new haunt files needed no further edit in the engine beyond the one-time contract reading
    - _Requirements: none (testing rule)_

- [-] 7. Checkpoint A - Ghost, Return_Moment and Jumpscare work end to end
  - Run `npx vitest --run`, `npm run lint` and `npm run build`. Ensure all tests pass, ask the user if questions arise. Remind the user of the manual check: run `npm run dev`, look away with the camera off (switch tabs) and listen with headphones for footsteps, breathing and the knock; return after 12 s and check the Return_Moment and a Jumpscare (raise the roll through a temporary debug seed only in the local run, not in code).

- [ ] 8. Glitch at the return
  - [ ] 8.1 Add flash accounting
    - `gate/flashLedger.ts` (`countInWindow` over the last 1000 ms); `returnRules.ts`: `grantFlickers(wanted, continuousRate, recent, reduced)`
    - _Requirements: 6.3, 6.4, 6.5, 9.3_

  - [ ] 8.2 Write property test for flicker grants
    - File: `src/haunts/engine/__tests__/flicker.gd25.prop.test.ts`
    - **Property 25: Flicker grants keep the flash rate at or below 3 per second**
    - **Validates: Requirements 6.4, 6.5, 9.3**

  - [ ] 8.3 Implement `runGlitch` in the gate and its styles
    - `returnVisual.ts`: tear bands and colour shift over the page, text content never changed, flickers limited by `grantFlickers` and the ledger, removed within 100 ms of the end; `HauntStage.css`: `is-glitching` keyframes using theme variables, no saturated red, `animation: none` under reduced motion
    - _Requirements: 6.1, 6.4, 6.5, 6.6, 6.8, 6.9, 6.11, 9.12_

  - [ ] 8.4 Implement `src/haunts/glitch.ts`
    - Return effect: `span(plan)` from `plan.glitch` or `plan.fade`; `begin` calls `runGlitch` with the granted flickers; under reduced motion one `'glitch'` overlay opacity fade; `end` removes what it made
    - _Requirements: 6.1, 6.7, 6.10, 9.10_

  - [ ] 8.5 Extend `planReturn` with the Glitch
    - Length 300 to 800 ms, flickers 1 to 3; starts at 0 when no Jumpscare is planned, and starts after the Jumpscare ends (`jumpscare.startMs + jumpscare.durationMs`) when one is planned, so it never overlaps the False_Calm or the Jumpscare; dropped if it would not end within the 3000 ms Return_Moment; none under reduced motion (a `fade` of 600 ms instead, at the same start) and none in Gentle
    - _Requirements: 3.10, 6.1, 6.2, 6.3, 6.7, 6.10, 9.10, 11.16_

  - [ ] 8.6 Extend the property tests and write Glitch unit tests
    - Extend `planner.gd08` and `planner.gd10` with the Glitch clauses, including: with a Jumpscare the Glitch starts at or after the Jumpscare's end and never overlaps the False_Calm or the Jumpscare; without a Jumpscare it starts at 0; a Glitch that would not end by `durationMs` is absent; add `src/haunts/__tests__/glitch.unit.test.ts`: page text identical before and during, elements removed within 100 ms, no Glitch outside a Return_Moment, reduced motion adds no movement classes and grants 0 flickers
    - **Property 8: Return plan bounds and determinism (Glitch clauses)**
    - **Property 10: Reduced motion plans have no Glitch and no close-up (Glitch clauses)**
    - **Validates: Requirements 5.8, 6.1, 6.2, 6.3, 6.7, 6.8, 6.9, 6.10, 6.11, 11.16**

- [ ] 9. Evidence_Message
  - [ ] 9.1 Implement `ghost/evidence.ts` and `ghost/fixedMessages.ts`
    - `tokenize`, `wordCount`, `makePatch`, `applyPatch`, `revertPatch`; `FIXED_MESSAGES` of original messages of at most 6 words; a word is a maximal run of non-whitespace
    - _Requirements: 4.1, 4.2, 4.4, 4.5_

  - [ ] 9.2 Write property test for the evidence patch round trip
    - File: `ghost/__tests__/evidence.gd14.prop.test.ts`
    - **Property 14: Evidence patch round trip and preservation**
    - **Validates: Requirements 4.4, 4.5, 11.10**

  - [ ] 9.3 Extend `planReturn` with the Evidence_Message
    - With roll below 0.6, keep pool messages that fit the paragraph, choose one, choose the run start, start at 300 ms, last `min(1500, durationMs − 300)`; none when nothing fits or in Gentle; pool defaults to `FIXED_MESSAGES`
    - _Requirements: 4.1, 4.2, 4.3, 4.6, 4.12, 8.12_

  - [ ] 9.4 Write property test for evidence choice
    - File: `ghost/__tests__/evidence.gd15.prop.test.ts`; also extend `planner.gd08` with the 1500 ms and end-before-`durationMs` clauses
    - **Property 15: Evidence choice is valid**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.6, 12.8**

  - [ ] 9.5 Implement the evidence display
    - `readingContext.ts`: `EvidenceHost` backed by display-only state; `ParagraphList.tsx`: render the shown copy in an `aria-hidden` span plus a visually hidden span holding the original; no colour change; a fade, not movement, under reduced motion; nothing written to reader state, stored text or progress; keep the component under 200 lines
    - _Requirements: 4.4, 4.8, 4.9, 4.10, 4.11_

  - [ ] 9.6 Write unit tests for the evidence display and controller
    - File: `src/ui/__tests__/evidence.unit.test.tsx`
    - Shown text replaces the run and screen readers keep the original; computed `color` unchanged; restored text equals the original at `durationMs` and at an early abort; reader-state spies never called; no Evidence_Message in Gentle
    - _Requirements: 4.5, 4.7, 4.8, 4.9, 4.11, 4.12_

- [ ] 10. Spoiler_Threat
  - [ ] 10.1 Implement `ghost/sentences.ts` and `ghost/legibility.ts`
    - `splitSentences`, `wordCount`; `legibility(mode, awayMs)` (Classic `0.69 * t`, Nightmare `t`, Gentle 0, with `t` clamped from 20 s to 60 s) and `blurPx`
    - _Requirements: 7.5, 7.6, 7.7, 7.8_

  - [ ] 10.2 Write property test for legibility
    - File: `ghost/__tests__/legibility.gd16.prop.test.ts`
    - **Property 16: Legibility is bounded and non-decreasing, and Classic never reveals**
    - **Validates: Requirements 7.5, 7.6, 7.7, 11.13, 11.14**

  - [ ] 10.3 Write property test for blur
    - File: `ghost/__tests__/legibility.gd17.prop.test.ts`
    - **Property 17: Blur never shrinks as legibility drops**
    - **Validates: Requirements 7.8**

  - [ ] 10.4 Implement `ghost/spoiler.ts`
    - `chooseSentence(final, others, roll)`: sentences of 5 to 25 words found in the final chapter and no other, or `null`
    - _Requirements: 7.2, 7.4, 11.11, 11.12_

  - [ ] 10.5 Extend `planReturn` with the Spoiler_Threat and test it
    - Only when not Gentle, `awayMs > 20000`, a source exists and a sentence passes; fields `sentence`, `legibility`, `blurPx`, `holdMs` (the Return_Moment) and `stayMs` 10000. File: `ghost/__tests__/spoiler.gd18.prop.test.ts`; extend `planner.gd08` so a plan without a spoiler is still valid
    - **Property 18: Spoiler sentence comes from the final chapter only**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 11.11, 11.12**

  - [ ] 10.6 Implement `engine/spoilerController.ts` and `ghost/cardPlacement.ts`
    - `placeCard(viewport, column)`: `{ kind: 'beside', rect }` (right region first, then left, from `computeRegions`, no overlap with the column) when a free side region is at least 160 px wide, otherwise `{ kind: 'overlay' }`
    - `cardHiddenAt({ placement, returnMs, dismissAtMs })`: overlay hides at the earlier of dismissal and the end of the Return_Moment; beside hides at the earlier of dismissal and 10 000 ms after the Return_Moment ends
    - Controller: `show` (computes placement), `returnEnded` (beside: ghost leaves and the 10 s timer starts; overlay: hide now), `dismiss` (hide within 300 ms in both placements, also while the Ghost holds the card, cancel timer), `hide`
    - _Requirements: 7.10, 7.11, 7.12, 7.18_

  - [ ] 10.7 Write property test for card timeline and placement
    - File: `src/haunts/engine/__tests__/spoilerCard.gd27.prop.test.ts`
    - Cover both placements: `placeCard` returns `beside` (no overlap with the column) exactly when a free side region is at least 160 px wide, else `overlay`; `cardHiddenAt` follows the beside and overlay rules; dismissal at any time while shown, including during the Return_Moment, hides the card
    - **Property 27: Spoiler card timeline and placement**
    - **Validates: Requirements 7.1, 7.11, 7.12, 7.18**

  - [ ] 10.8 Implement `SpoilerCard` and the host
    - `src/ui/SpoilerCard.tsx` and CSS: renders from `placement`: `beside` sits beside the column and stays after the Return_Moment (up to 10 s); `overlay` (free space under 160 px) is drawn in the Return_Moment overlay layer, may cover the text, and is removed when the Return_Moment ends; dismiss button and Escape work in both; blurred sentence in `aria-hidden` and `user-select: none` while `legibility < 1`; `role="img"` with the label "A ghost holds a blurred sentence"; labelled Dismiss button with focus ring; Escape listener attached only while shown; never takes focus; 150 ms fade, 300 ms under reduced motion. `readingContext.ts`: `spoilerSource()` from the book's chapters (`null` for no structure, one chapter or the final chapter) and a `SpoilerHost`. Wire into `returnMoment.ts`. Local only, no network
    - _Requirements: 7.3, 7.9, 7.11, 7.12, 7.13, 7.14, 7.16, 7.17, 7.18_

  - [ ] 10.9 Add the Ghost holding the card
    - `ghostFigure.ts`: with a planned Spoiler_Threat draw a `'card-hand'` overlay beside the card for the Return_Moment, removed in `end()`
    - _Requirements: 7.10_

  - [ ] 10.10 Write unit tests for the card
    - File: `src/ui/__tests__/SpoilerCard.unit.test.tsx`
    - Dismiss with click, Enter, Space and Escape, in both placements and also while the Ghost holds the card; sentence absent from the accessibility tree while blurred; beside placement: card stays after the Return_Moment for 10 s then goes; overlay placement (free space under 160 px): card is shown only during the Return_Moment and is hidden when it ends; no card in a Gentle session, a one-chapter book or the final chapter; reading position, progress and pace spies never called
    - _Requirements: 7.3, 7.9, 7.11, 7.12, 7.13, 7.15, 7.16, 7.18_

- [ ] 11. Haunt modes in the UI
  - [ ] 11.1 Update `SafetyNotice`
    - Fieldset with three radios (Gentle, Classic, Nightmare), Classic preselected, descriptions of at most 120 characters as in the design; text names dimming light, ghosts, glitching of the page and quiet or sudden sound, no "shadow"; headphones tip only while `headphonesTipSeen` is false; "Begin reading" saves mode, `noticeSeen` and the tip flag and closes even if saving fails; `HauntLayer` shows a `NoticeBanner` when `set` returns `false`
    - _Requirements: 8.3, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_

  - [ ] 11.2 Update `HauntControl`
    - Replace the temporary toggle with a "Haunt mode" fieldset of three radios plus the sound toggle; keyboard only, visible focus ring, current choice exposed to screen readers; applies within 200 ms through the store
    - _Requirements: 8.4, 8.5, 8.11_

  - [ ] 11.3 Write component tests for the notice and the control
    - Files in `src/ui/__tests__/`: notice lists three modes with Classic preselected; every description is at most 120 characters; wording checks; tip shown and hidden by the flag; dismissal with a throwing `setItem` keeps the session and shows the banner; keyboard-only operation; control applies a change in the same tick and restores the saved mode on reload
    - _Requirements: 8.3, 8.4, 8.5, 8.6, 8.11, 10.1, 10.2, 10.3, 10.5, 10.6, 10.7_

  - [ ] 11.4 Extend Property 28 over evidence, spoiler and mode switches
    - Add evidence and spoiler hosts and mid-return mode changes to `engine.gd28` scripts; assert evidence is cleared, the card is hidden on a switch to Gentle, and a switch to Classic or Nightmare does not end a running Return_Moment early
    - **Property 28: The engine runs ghosts and returns inside their rules (with hosts)**
    - **Validates: Requirements 3.11, 4.7, 8.10**

- [ ] 12. Hardening checks and report for phase B
  - [ ] 12.1 Write the network and storage spy test
    - File: `src/haunts/engine/__tests__/networkGhost.unit.test.ts`
    - A full session with a Return_Moment, Jumpscare, Glitch, Evidence_Message and Spoiler_Threat never calls `fetch`, `XMLHttpRequest` or `navigator.sendBeacon`, and `localStorage.setItem` uses only documented keys
    - _Requirements: 7.14, 9.14, 12.12_

  - [ ] 12.2 Write the CSS and colour scan test
    - File: `src/ui/__tests__/HauntStage.ghost.css.unit.test.ts`
    - Glitch and overlay colours use `var(--...)` or `color-mix` over theme variables; no saturated red literal; reduced-motion rules set `animation: none` for glitch and tear
    - _Requirements: 6.6, 9.12_

  - [ ] 12.3 Update the colour-rule test
    - `colorRule.unit.test.ts`: run the new layers outside a Return_Moment and assert the column's computed colours are unchanged and every mutation lies inside the stage root; add a check that within 100 ms after a Return_Moment the column text and layout equal their state before
    - _Requirements: 9.11, 13.3_

  - [ ] 12.4 Report results in `docs/BUILD_LOG.md`
    - Append a section for tasks 8 to 12: properties 14 to 18, 25, 27 and 28 (extended), cases run, any counterexample with seed and shrunk input, and the manual checks still to do: spoiler blur strength at the card's font size with Classic legibility at its maximum of 0.69 (tune `MAX_BLUR_PX` if the sentence can be read), and the same card in the overlay placement on a narrow viewport (shown only during the Return_Moment, hidden when it ends), a watch of Glitch and Jumpscare with and without reduced motion, a keyboard-only pass through notice, reading, a return and the card
    - _Requirements: none (testing rule)_

- [ ] 13. Checkpoint B - Glitch, evidence, spoiler and modes complete
  - Run `npx vitest --run`, `npm run lint` and `npm run build`. Ensure all tests pass, ask the user if questions arise. The taunts layer follows and is optional.

- [ ] 14. Taunts (requirement 12, optional, built last)
  - [ ]* 14.1 Implement `ghost/commonWords.ts` and `ghost/taunts.ts`
    - `COMMON_WORDS`, `FIXED_MESSAGES` re-exported from `fixedMessages.ts`, `TAUNT_TEMPLATES` (at most 7 words), `NAME_FREE_TEMPLATES` (at most 8), `nameCandidates`, `fillTaunt` (braces removed from the name), `discardBadCached`, `buildTaunt`, `evidencePool`; no network access
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.9, 12.10, 12.11, 12.12, 12.14, 12.15_

  - [ ]* 14.2 Write property test for name candidates
    - File: `ghost/__tests__/taunts.gd19.prop.test.ts`
    - **Property 19: Name candidates are filtered and ordered**
    - **Validates: Requirements 12.1, 12.3, 12.4**

  - [ ]* 14.3 Write property test for the reading position boundary
    - File: `ghost/__tests__/taunts.gd20.prop.test.ts`
    - **Property 20: Name candidates come only from text before the position**
    - **Validates: Requirements 12.2, 12.13**

  - [ ]* 14.4 Write property test for well-formed taunts
    - File: `ghost/__tests__/taunts.gd21.prop.test.ts`
    - **Property 21: Taunts are well formed**
    - **Validates: Requirements 12.5, 12.6, 12.7, 12.9, 12.10, 12.11, 12.14, 12.15**

  - [ ]* 14.5 Wire taunts into the evidence pool
    - `returnMoment.ts` builds the pool with `evidencePool` from `reading.readSoFar()`, memoised by reading position; if it throws, use `FIXED_MESSAGES` only
    - _Requirements: 12.8_

  - [ ]* 14.6 Write unit tests for the taunt wiring
    - File: `src/haunts/engine/__tests__/taunts.unit.test.ts`
    - A paragraph with a planted name can show a filled taunt; a throwing builder falls back to fixed messages; the network spy from 12.1 still passes with taunts on
    - _Requirements: 12.8, 12.12_

- [ ] 15. Final report
  - [ ] 15.1 Write the final entry in `docs/BUILD_LOG.md`
    - List all properties (1 to 28; 19 to 21 only if task 14 was built), total cases run, counterexamples found and how they were resolved, and the manual checks still to do: spoiler blur strength at the card's font size with Classic legibility 0.69 (`MAX_BLUR_PX`) and the overlay placement on a narrow viewport, listening pass at the default and maximum cap with headphones and speakers, a flash and reduced-motion pass by eye, a keyboard-only pass
    - _Requirements: none (testing rule)_

- [ ] 16. Final checkpoint - Ensure all tests pass
  - Run `npx vitest --run`, `npm run lint` and `npm run build`. Ensure all tests pass, ask the user if questions arise.

## Notes

- Only the taunts sub-tasks (14.1 to 14.6) are optional. Property tests, unit tests and static scans for everything else are required, as the workspace testing rule demands.
- Each task references specific requirements for traceability. Checkpoints 7 and 13 close the phases.
- Properties 14 and 15 of the haunt-feature spec (`reducedMotion.p15`, `gateCap.p14`) iterate the registry, so they cover each new haunt file as it is added.
- A new ghost, layer or return effect after this plan is one new file in `src/haunts/`; the engine is edited once, in task 5.8, to read `role`, `modes`, `minLevel`, `span`, `begin` and `end`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "1.5", "1.8", "1.10", "2.1", "2.3", "2.5", "3.1", "3.2", "4.1"] },
    { "id": 2, "tasks": ["1.4", "1.6", "1.7", "1.9", "2.2", "2.4", "2.6", "3.3", "4.2", "6.1"] },
    { "id": 3, "tasks": ["2.7", "3.4", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8"] },
    { "id": 4, "tasks": ["3.5", "5.1", "5.2", "5.3", "5.4", "5.5"] },
    { "id": 5, "tasks": ["3.6", "5.6"] },
    { "id": 6, "tasks": ["3.7"] },
    { "id": 7, "tasks": ["3.8", "3.9", "3.10", "5.7"] },
    { "id": 8, "tasks": ["5.8"] },
    { "id": 9, "tasks": ["5.9", "6.2"] },
    { "id": 10, "tasks": ["6.3", "6.4"] },
    { "id": 11, "tasks": ["6.5"] },
    { "id": 12, "tasks": ["8.1", "9.1", "10.1"] },
    { "id": 13, "tasks": ["8.2", "8.3", "9.2", "10.2", "10.3", "10.4", "11.1", "11.2"] },
    { "id": 14, "tasks": ["8.4", "8.5", "9.5", "10.6", "11.3"] },
    { "id": 15, "tasks": ["8.6", "9.3", "10.7", "10.8"] },
    { "id": 16, "tasks": ["9.4", "9.6", "10.5", "10.9", "10.10"] },
    { "id": 17, "tasks": ["11.4", "12.1", "12.2", "12.3"] },
    { "id": 18, "tasks": ["12.4"] },
    { "id": 19, "tasks": ["14.1"] },
    { "id": 20, "tasks": ["14.2", "14.3", "14.4", "14.5"] },
    { "id": 21, "tasks": ["14.6"] },
    { "id": 22, "tasks": ["15.1"] }
  ]
}
```
