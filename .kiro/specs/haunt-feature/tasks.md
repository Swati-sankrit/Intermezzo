# Implementation Plan: Haunt Feature

## Overview

Implement the haunt feature in TypeScript. Engine, Level_Logic, Safety_Gate, registry and shared types live in `src/haunts/engine/`. Haunt files (`candle.ts`, `whispers.ts`, `shadow.ts`) live directly in `src/haunts/`. React components live in `src/ui/`. Tasks follow the delivery order in the design: pure core first, then the gate and engine, then the candle haunt wired into the reading view end to end, then whispers, then shadow.

Whispers and shadow are each one new file plus its tests. They must not require any edit in `src/haunts/engine/`. Every shared helper they need (`noise.ts`, the gate primitives, the registry and the glob) is built before the candle checkpoint. Tests that cover "every real haunt" iterate the discovered registry, so they cover whispers and shadow automatically once the files exist.

All level, gate-planning, registry, settings, region and dialog-order logic is pure and property-tested with fast-check. Adapters and the engine receive side-effecting dependencies as injected ports and are tested with fakes. No video frame or camera data is touched, stored, or sent. The engine receives the attention signal only through `subscribeSignal`. No new dependency is added.

Testing rules that apply to every task (from the testing steering file): no fake tests, no weakened assertions, no mocking the function under test. If a test fails and the cause is unclear, stop and report it. Each property test runs at least 100 cases and carries the comment `// Feature: haunt-feature, Property N: <title>`. After each task group, report which properties were added, how many cases ran, and any counterexample, and record counterexamples in `docs/BUILD_LOG.md`.

## Tasks

- [x] 1. Implement the pure core (types, Level_Logic, gate planning, settings, registry, regions, dialog order)
  - [x] 1.1 Create the folder structure and `src/haunts/engine/types.ts`
    - Create `src/haunts/engine/`, `src/haunts/engine/gate/`, `src/haunts/engine/__tests__/` and `src/haunts/__tests__/`
    - `types.ts`: `HauntLevel`, `Unsubscribe`, `Haunt`, `AudioOut`, `GlowControl`, `VisualLayer`, `VisualOut`, `Gate`, `GatePort`, `EngineDeps`, `EngineState`, `HauntEngine` exactly as in the design
    - No DOM, audio, timer or camera access in this file. No import from `src/attention/`
    - _Requirements: 4.1, 4.4, 10.3, 11.2_

  - [x] 1.2 Implement `src/haunts/engine/levelLogic.ts`
    - `LevelInput`, `AttentionSignalLike`, `LevelOutput`, `THRESHOLDS_MS` (5000 and 12000), `evaluate`, `nextChangeDelay`
    - Level from the trailing run of `away` events; lead chosen from `hauntIds` minus `previousLeadId` (all ids when that leaves none or the previous lead is absent) using `rolls.lead`, index clamped to the last element; companion only at level 3 with two or more ids, from the ids minus the lead, using `rolls.companion`; gentle caps the level at 1 and removes the companion
    - Empty haunt list gives level 0. No `Date`, `performance`, timer, `Math.random`, DOM or audio
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 7.1, 7.3, 7.4, 10.1, 10.2, 10.3_

  - [x] 1.3 Create shared generators in `src/haunts/engine/__tests__/arbitraries.ts`
    - Event histories (non-decreasing timestamps, duplicates allowed, trailing run of either value), haunt id lists (0 to 5 distinct ids), rolls in [0, 1), gain and flash-rate request lists (including negative, `NaN` and infinite values), Volume_Cap raw values (valid numbers as text, empty, non-numeric, out of range, non-strings), `HauntSettings` values and arbitrary storage maps, viewport and column rectangle pairs, module records (valid haunts, missing fields, wrong types, duplicate ids, helper-like objects)
    - _Requirements: 10.1, 6.15_

  - [x] 1.4 Write property test for bounded levels and gentle mode
    - File: `src/haunts/engine/__tests__/levelLogic.p01.prop.test.ts`
    - **Property 1: Level is bounded and gentle mode caps it**
    - **Validates: Requirements 1.4, 7.1, 7.4, 10.4, 10.5**

  - [x] 1.5 Write property test for escalation thresholds
    - File: `src/haunts/engine/__tests__/levelLogic.p02.prop.test.ts`
    - **Property 2: Escalation follows the thresholds**
    - **Validates: Requirements 1.1, 1.2, 1.3, 2.5**

  - [x] 1.6 Write property test for present means level 0
    - File: `src/haunts/engine/__tests__/levelLogic.p03.prop.test.ts`
    - **Property 3: Present means level 0**
    - **Validates: Requirements 1.5, 2.1, 10.6, 10.7**

  - [x] 1.7 Write property test for level monotonicity and stable lead
    - File: `src/haunts/engine/__tests__/levelLogic.p04.prop.test.ts`
    - **Property 4: Level never falls while away, and the lead stays the same**
    - **Validates: Requirements 1.6, 3.4, 7.3, 10.11**

  - [x] 1.8 Write property test for lead variety
    - File: `src/haunts/engine/__tests__/levelLogic.p05.prop.test.ts`
    - **Property 5: Consecutive look-aways use different leads**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.7, 10.8, 10.10**

  - [x] 1.9 Write property test for companion rules
    - File: `src/haunts/engine/__tests__/levelLogic.p06.prop.test.ts`
    - **Property 6: Companion rules**
    - **Validates: Requirements 3.5, 3.6, 10.9**

  - [x] 1.10 Write property test for determinism and no input mutation
    - File: `src/haunts/engine/__tests__/levelLogic.p07.prop.test.ts`
    - **Property 7: Level_Logic is deterministic and does not mutate its input**
    - **Validates: Requirements 10.1, 10.2**

  - [x] 1.11 Write property test for `nextChangeDelay`
    - File: `src/haunts/engine/__tests__/levelLogic.p08.prop.test.ts`
    - **Property 8: nextChangeDelay lands on the next level change**
    - **Validates: Requirements 1.2, 1.3, 11.5**

  - [x] 1.12 Implement `src/haunts/engine/gate/plan.ts`
    - Constants `DEFAULT_VOLUME_CAP` (0.4), `MIN_FADE_IN_MS` (300), `MIN_FADE_IN_REDUCED_MS` (1000), `MAX_FADE_OUT_MS` (800), `MAX_FLASHES_PER_SEC` (3)
    - `parseVolumeCap`, `scaleGains`, `allocateFlashRates`, `planFadeIn`, `planFadeOut`, `effectiveRequests`, `sweepRate` (period floored at 2000 ms), `GainRequest`, `RateRequest`
    - Non-finite and negative values are handled as 0 (gain, rate) or the default (durations). No DOM, audio, clock or storage access
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.14, 6.15, 6.17, 8.5, 8.7, 9.2_

  - [x] 1.13 Write property test for the Volume_Cap on combined gain
    - File: `src/haunts/engine/__tests__/plan.p09.prop.test.ts`
    - **Property 9: Combined gain never exceeds the Volume_Cap**
    - **Validates: Requirements 6.2, 6.6, 6.17**

  - [x] 1.14 Write property test for silence when sound is off or locked
    - File: `src/haunts/engine/__tests__/plan.p10.prop.test.ts`
    - **Property 10: Sound is silent when off or locked**
    - **Validates: Requirements 8.5, 8.7, 9.2**

  - [x] 1.15 Write property test for fade durations
    - File: `src/haunts/engine/__tests__/plan.p11.prop.test.ts`
    - **Property 11: Fade durations respect their bounds**
    - **Validates: Requirements 2.2, 6.3, 6.4, 6.8, 6.9, 7.2, 13.5, 13.6, 14.9, 15.6**

  - [x] 1.16 Write property test for the flash budget
    - File: `src/haunts/engine/__tests__/plan.p12.prop.test.ts`
    - **Property 12: Combined flash rate is at most 3 per second, and zero under reduced motion**
    - **Validates: Requirements 6.5, 6.7, 6.10, 6.17**

  - [x] 1.17 Write property test for Volume_Cap parsing
    - File: `src/haunts/engine/__tests__/plan.p13.prop.test.ts`
    - **Property 13: Volume_Cap parsing falls back to 0.4**
    - **Validates: Requirements 6.14, 6.15**

  - [x] 1.18 Implement `src/haunts/engine/settings.ts`
    - `HauntSettings`, `DEFAULT_SETTINGS` (sound on, gentle off, notice not seen), `KEYS` (`rod_haunt_sound`, `rod_haunt_gentle`, `rod_safety_notice_seen`, `rod_volume_cap`), `parseSettings`, `serializeSettings`, `SettingsStore`, `createSettingsStore(storage | null)`
    - Reads and writes in try/catch, best-effort; value stays in memory when a write fails; `get()` returns the same object until a value changes; no function writes `rod_volume_cap`
    - _Requirements: 9.4, 9.5, 9.6, 6.16, 8.3_

  - [x] 1.19 Write property test for settings round trip and defaults
    - File: `src/haunts/engine/__tests__/settings.p16.prop.test.ts`
    - **Property 16: Settings round trip and safe defaults**
    - **Validates: Requirements 9.4, 9.5, 9.6**

  - [x] 1.20 Implement `registry.ts` and `discover.ts` in `src/haunts/engine/`
    - `discover.ts`: the only `import.meta.glob` call, with the literal patterns `['../*.ts', '!../*.test.ts', '!../*.d.ts']` and `{ eager: true }`, as in the design (Vite glob behaviour already confirmed in the design's research findings; do not change the call shape without re-checking the docs)
    - `registry.ts`: `buildRegistry` (sorted code-unit path order, contract validation, first-path-wins duplicate handling, warnings naming the files, copies of the module fields) and `loadHaunts(warn?)`
    - _Requirements: 4.2, 4.7, 4.8, 5.1, 5.2, 5.3, 5.4_

  - [x] 1.21 Write property test for the registry
    - File: `src/haunts/engine/__tests__/registry.p17.prop.test.ts`
    - **Property 17: Registry excludes invalid and duplicate files, and the first path wins**
    - **Validates: Requirements 4.2, 4.7, 4.8, 5.2, 5.3**

  - [x] 1.22 Implement `src/haunts/engine/regions.ts`
    - `Rect`, `Regions`, `computeRegions(viewportWidth, viewportHeight, column)`; left region from x 0 to column left, right region from column right to viewport width, widths never below 0
    - _Requirements: 6.11, 12.2, 15.2_

  - [x] 1.23 Write property test for effect regions
    - File: `src/haunts/engine/__tests__/regions.p18.prop.test.ts`
    - **Property 18: Effects stay outside the Reading_Column**
    - **Validates: Requirements 6.11, 12.2, 15.2**

  - [x] 1.24 Implement `src/haunts/engine/dialogOrder.ts`
    - `visibleDialogs(noticeSeen, cameraChoice)` returns `{ notice: !noticeSeen, consent: noticeSeen && cameraChoice === 'unanswered' }`
    - _Requirements: 8.9, 8.10, 8.11, 8.12_

  - [x] 1.25 Write property test for dialog order
    - File: `src/haunts/engine/__tests__/dialogOrder.p19.prop.test.ts`
    - **Property 19: The Safety_Notice and the Camera_Consent_Dialog are never visible together**
    - **Validates: Requirements 8.9, 8.10, 8.11**

  - [x] 1.26 Report results in `docs/BUILD_LOG.md`
    - Append a section for tasks 1.4 to 1.25: properties added (1 to 13, 16 to 19), cases run per property, and any counterexample with seed and shrunk input. If a property fails, stop and report it; never weaken the assertion
    - _Requirements: none (testing rule)_

- [x] 2. Checkpoint - Pure core
  - Run `npx vitest --run src/haunts/`. Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Implement the Safety_Gate adapters
  - [ ] 3.1 Fetch current documentation before writing adapter code
    - Use Context7 (`tool::context7::resolve-library-id`, then `tool::context7::query-docs`) where a library applies, and fetch MDN pages otherwise, for: Web Audio `AudioContext`, `GainNode`, `AudioParam` (`linearRampToValueAtTime`, `cancelScheduledValues`, `setValueAtTime`), `DynamicsCompressorNode`, `resume()` and autoplay behaviour; `window.matchMedia('(prefers-reduced-motion: reduce)')` and its `change` event; `ResizeObserver`; the `storage` event
    - Do not rely on remembered APIs. If a method or option cannot be confirmed in the docs, say so in `docs/BUILD_LOG.md` and do not use it
    - _Requirements: 6.3, 6.4, 6.13, 8.5, 8.6_

  - [ ] 3.2 Implement `gate/reducedMotion.ts` and `engine/noise.ts`
    - `reducedMotion.ts`: `matchMedia` adapter with `get()` and `subscribe(cb)`; returns false when `matchMedia` is unavailable
    - `noise.ts`: `createNoiseBuffer(ctx, seconds)` helper that fills an `AudioBuffer` with noise. This is built now so that adding the whispers haunt later needs no edit in `src/haunts/engine/`
    - _Requirements: 6.8, 6.18, 14.2_

  - [ ] 3.3 Create fakes in `src/haunts/engine/__tests__/fakes.ts`
    - Fake clock and scheduler; fake haunt that records calls and can throw; fake gate; fake `AudioContext` that records node creation, `connect`, `disconnect` and every `AudioParam` automation call; fake storage; fake `matchMedia`
    - _Requirements: 6.2, 6.3, 6.4, 6.13_

  - [ ] 3.4 Implement `gate/audioAdapter.ts`
    - One channel `GainNode` per port feeding a master `GainNode`, a `DynamicsCompressorNode`, then `destination`. This is the only file in the project that touches `ctx.destination`
    - Gain changes use ramps from the current value with the durations from `plan.ts`; cap change ramps in 50 ms, sound off in 150 ms
    - Audio_Unlock listener (`pointerdown` and `keydown` on `window`, once, capture) creates and resumes the context; `whenReady` callbacks fire after unlock; if the context cannot be created, callbacks never fire and no message is shown
    - _Requirements: 6.1, 6.3, 6.4, 6.13, 6.18, 8.5, 8.6, 8.7, 9.2_

  - [ ] 3.5 Implement `gate/visualAdapter.ts`
    - Writes only inside the stage host elements. Glow dim and gutter set CSS custom properties and classes on the stage root (`--glow-dim`, `--glow-fade`, `--gutter-depth`, `--gutter-period`, `is-guttering`); a layer is a `div` in a side region with `setMarkup`, `setOpacity`, `setSweep`, `remove`
    - Under reduced motion never add `is-sweeping` or `is-guttering`; fades use `planFadeIn` and `planFadeOut`. No Web Animations API
    - _Requirements: 6.5, 6.8, 6.10, 6.11, 6.12, 13.5, 15.6_

  - [ ] 3.6 Implement `gate/gate.ts` (`createGate`)
    - `open`, `fadeOutAll`, `setSoundEnabled`, `setReducedMotion`, `refreshVolumeCap` (also on the `storage` event), `unlockAudio`, `dispose`; `GatePort` with `audio`, `visual`, `close()` (safe to call twice)
    - Recompute the whole plan (scaled gains, flash allocation, glow dim as the maximum over ports) on any change; the Volume_Cap is read from storage when the gate is created
    - _Requirements: 6.1, 6.2, 6.5, 6.6, 6.7, 6.13, 6.14, 6.15, 6.16, 6.17, 4.4_

  - [ ]* 3.7 Write unit tests for the gate adapters
    - File: `src/haunts/engine/__tests__/gate.unit.test.ts`, using the fake `AudioContext`
    - New cap applied within 100 ms; sound off ramps to zero within 300 ms; ramps start from the current value; rising ramps last at least 300 ms; no sound before unlock and the first `pointerdown` or `keydown` unlocks; reduced motion adds no movement classes; gate output nodes disconnect on `close()`
    - _Requirements: 6.3, 6.4, 6.13, 8.5, 8.6, 9.2_

- [ ] 4. Implement the engine
  - [ ] 4.1 Implement `src/haunts/engine/engine.ts` (`createHauntEngine`)
    - `start`, `stop`, `getState`. Subscribe through `subscribeSignal` and to the settings store; treat the value delivered at subscribe time as the first event; ignore consecutive duplicate values; draw `rolls` once per look-away and freeze `previousLeadId`
    - `recompute()` calls `evaluate` and reconciles: start lead and companion through `gate.open`, `setLevel` on level change, on level 0 call `gate.fadeOutAll(600)` and then stop each haunt in its own try/catch; failing haunts are stopped, closed and reported through `warn`
    - Timer from `nextChangeDelay`, recompute from the clock when it fires; flush retiring haunts (ramp at most 50 ms) when a new look-away starts; gentle on lowers the lead and fades out the companion within 800 ms; gentle off restores the level from elapsed time with the same lead
    - Not armed (notice not seen): remember events, act on none, level 0. On arming while `away`, record a synthetic `away` stamped now
    - `stop()` clears timers, unsubscribes, stops and closes every port. No import of camera, detector, video or `src/attention/` code. Split into `engineTimer.ts` if the file approaches 200 lines
    - _Requirements: 1.5, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5, 3.4, 3.5, 7.2, 7.3, 8.4, 11.1, 11.2, 11.3, 11.4, 16.1, 16.2_

  - [ ] 4.2 Create the public surface `src/haunts/engine/index.ts`
    - Export `createHauntEngine`, `createGate`, `createSettingsStore`, `loadHaunts`, `visibleDialogs`, `computeRegions`, `DEFAULT_SETTINGS`, and the types needed by `src/ui/`
    - _Requirements: 16.1_

  - [ ] 4.3 Write property test for engine behaviour over any script
    - File: `src/haunts/engine/__tests__/engine.p20.prop.test.ts`
    - Real engine with fake haunts, fake gate, fake clock and fake scheduler; scripts of signal events, clock advances, timer firings, gentle toggles, sound toggles and arming; some fake `stop` calls throw
    - **Property 20: Engine keeps haunts within its rules for any script**
    - **Validates: Requirements 1.5, 1.7, 2.2, 2.3, 2.4, 3.4, 7.2, 8.4, 11.3, 16.2**

  - [ ]* 4.4 Write unit tests for the engine
    - File: `src/haunts/engine/__tests__/engine.unit.test.ts`
    - Signal delivered at subscribe time is the first event; away, 5 s, 12 s gives start, `setLevel(2)`, companion start; present stops everything within 800 ms; gentle on at level 3 lowers the lead and stops the companion; gentle off restores the level with the same lead; present then away restarts timing with a new lead; arming while away starts at level 1; no haunt available leaves level 0 without an error
    - _Requirements: 2.5, 3.7, 7.2, 7.3, 8.4, 11.4_

  - [ ] 4.5 Report results in `docs/BUILD_LOG.md`
    - Append a section for tasks 3 and 4: Property 20 added, cases run, any counterexample with seed and shrunk input, and the Web Audio and other API findings from 3.1
    - _Requirements: none (testing rule)_

- [ ] 5. Implement the candle haunt and the registry checks
  - [ ] 5.1 Implement `src/haunts/candle.ts`
    - Exports `id` (`candle`), `name`, `start`, `setLevel`, `stop`; state at module level, none created at import time
    - Uses only `visual.glow.setDim` and `visual.glow.setGutter`: dim increases at each level; gutter starts at level 2 and is larger at level 3; no sound; `stop` restores level 0 appearance and clears its reference
    - Imports only types from `./engine/types`
    - _Requirements: 4.1, 4.3, 4.5, 4.6, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_

  - [ ] 5.2 Write property test for reduced motion over every real haunt
    - File: `src/haunts/engine/__tests__/reducedMotion.p15.prop.test.ts`
    - Iterates the discovered registry (`loadHaunts()`), so whispers and shadow are covered automatically when they are added. Uses the real gate and visual adapter with a jsdom stage host
    - **Property 15: Reduced motion emits no flashing from any haunt**
    - **Validates: Requirements 6.8, 6.10, 13.5, 15.6, 15.4**

  - [ ]* 5.3 Write unit tests for the candle haunt
    - File: `src/haunts/__tests__/candle.unit.test.ts`
    - Type assertion `const h: Haunt = candle`; dim and gutter observables are non-decreasing across levels 1 to 3 with at least one strict rise; `stop()` resets dim and gutter to 0; no audio calls
    - _Requirements: 4.3, 4.5, 4.6, 13.1, 13.2, 13.3, 13.4, 13.6, 13.7_

  - [ ] 5.4 Write the static source scan test
    - File: `src/haunts/__tests__/staticScan.unit.test.ts`; reads the source files at test time
    - Files `src/haunts/*.ts` must not contain `document`, `window`, `AudioContext(`, `.destination`, `fetch`, `Audio(`, `speechSynthesis`, `@keyframes`, `animation`, `setInterval`, `setTimeout`, `localStorage`, or an import from outside `./engine/types` and `./engine/noise`
    - `levelLogic.ts` and `plan.ts` must not mention `document`, `window`, `Date`, `performance`, `setTimeout` or `Math.random`; nothing under `src/haunts/` imports from `src/attention`, `src/ui`, or camera or video code; `.destination` appears only in `audioAdapter.ts`; no `.mp3`, `.wav`, `.ogg` or `.m4a` string appears under `src/haunts/`
    - The test iterates the files found on disk, so later haunts are covered without edits
    - _Requirements: 4.4, 6.1, 6.18, 6.19, 10.3, 11.2_

  - [ ] 5.5 Write the discovery smoke test
    - File: `src/haunts/engine/__tests__/discover.unit.test.ts`
    - The keys of `discovered` equal the `.ts` files present directly in `src/haunts/` (found with Node `fs`), contain no test file and nothing under `engine/`; `loadHaunts()` returns a haunt for each valid file; a synthetic extra valid module passed to `buildRegistry` appears without any engine change
    - _Requirements: 5.1, 5.2, 5.3_

- [ ] 6. Wire the haunts into the reading view
  - [ ] 6.1 Implement `src/ui/HauntStage.tsx` and `HauntStage.css`
    - Fixed full-viewport overlay (`pointer-events: none`, `aria-hidden`, z-index below the top bar) holding the Candle_Glow and left and right side regions
    - Measure `[data-reading-column]` with `ResizeObserver` and the window `resize` event, size regions with `computeRegions`, fall back to a centred 65ch estimate when the element or `ResizeObserver` is missing; expose the host elements through a ref callback
    - Candle_Glow drawn outside the column with `color-mix(in srgb, var(--accent) 20%, transparent)` (or a `--glow` variable in `theme.css`); drift of at most 3 percent over a 16 s cycle; `animation: none` under `prefers-reduced-motion: reduce`. All `@keyframes` live in this stylesheet. No hard-coded colours. Component under 200 lines
    - Removes the glow from the document when unmounted
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 6.11, 6.12_

  - [ ] 6.2 Implement `src/ui/useHauntSettings.ts` and `src/ui/HauntControl.tsx` with its CSS
    - `useHauntSettings`: `useSyncExternalStore` over the settings store
    - `HauntControl`: two buttons with `aria-pressed` and text labels ("Haunt sound: on/off", "Gentle mode: on/off"), keyboard operable, visible focus ring in `--accent`, uses the existing `reader__button` styling; saves through the store
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.7, 9.8_

  - [ ] 6.3 Implement `src/ui/SafetyNotice.tsx` and its CSS
    - Modal (`role="dialog"`, `aria-modal`, `useFocusTrap`), one button "Begin reading". Text states that haunts include dimming light and moving shadow, that haunts include quiet sound, and that the reader can turn sound off or use Gentle mode. Dismiss writes `noticeSeen` to the settings store. Keyboard only operation works. Gothic, calm wording per the design steering
    - _Requirements: 8.1, 8.2, 8.3, 8.8_

  - [ ] 6.4 Implement `src/ui/HauntLayer.tsx`
    - Creates the gate and engine once per mounted reading view in `useEffect` with cleanup (`engine.stop()`, `gate.dispose()`); takes `subscribeSignal` as a prop; renders `HauntStage` and, when `visibleDialogs(...).notice` is true, `SafetyNotice`; passes sound, gentle and reduced-motion values to the gate; wiring only, no logic
    - _Requirements: 8.1, 8.4, 11.1, 12.6, 16.1, 16.2_

  - [ ] 6.5 Wire `HauntLayer` and the dialog hold-back into `src/ui/AttentionLayer.tsx`
    - Render `ConsentDialog` only when `visibleDialogs(noticeSeen, status.choice).consent` is true; render `<HauntLayer subscribeSignal={subscribeSignal} />` in place of `<TempAttentionLabel />`
    - Do not change the attention module, its status, or its camera logic. The haunt code does not call `useAttention()`
    - _Requirements: 8.9, 8.10, 8.11, 8.12, 16.1, 16.3_

  - [ ] 6.6 Add `HauntControl` to the top bar and mark the reading column
    - `ReaderView`: place `<HauntControl />` next to the Pace Guide button
    - `ParagraphList`: add `data-reading-column` to `.paragraph-list`. Nothing else in the reading flow changes
    - _Requirements: 9.1, 16.4_

  - [ ] 6.7 Remove `TempAttentionLabel` and its test
    - Delete `src/ui/TempAttentionLabel.tsx`, `TempAttentionLabel.css`, and `src/ui/__tests__/TempAttentionLabel.unit.test.tsx` (path as in the repo). Update `AttentionLayer` tests that relied on the label to use `HauntLayer`. Search for any remaining reference and remove it
    - _Requirements: 16.3_

  - [ ] 6.8 Write the colour and column-isolation test
    - File: `src/haunts/engine/__tests__/colorRule.unit.test.ts`
    - Render `HauntStage` beside a column element with known inline `color` and `background-color`. For every real haunt in `loadHaunts()` at levels 1 to 3, with the real gate, record `getComputedStyle` of the column and a text element before and after, and install a `MutationObserver` on `document.documentElement`. Assert the computed colours are unchanged and every mutation target lies inside the stage overlay root
    - _Requirements: 6.11, 6.12, 12.5, 16.4_

  - [ ]* 6.9 Write component tests
    - Files in `src/ui/__tests__/`: `SafetyNotice` shows on the first session, dismisses with the keyboard, and is not shown again; `ConsentDialog` is not in the document while the notice shows and appears after dismissal when the choice is unanswered, and with a saved notice only under the attention-signal conditions; `HauntControl` has labels, `aria-pressed`, keyboard operation, and saves and restores values; the reading view has no temporary attention label; reading with Enter and Space still works while a haunt runs; the stage contains the Candle_Glow while the view is open and removes it on close
    - _Requirements: 8.1, 8.3, 8.8, 8.9, 8.10, 8.11, 9.2, 9.3, 9.4, 9.5, 9.7, 9.8, 12.1, 12.6, 16.3, 16.5_

  - [ ]* 6.10 Write a stylesheet test for the Candle_Glow
    - File: `src/ui/__tests__/HauntStage.css.unit.test.ts`; reads `HauntStage.css` as text
    - Asserts the drift amplitude is at most 3 percent, the cycle is at least 8 s (16 s as designed), and `animation: none` appears under `prefers-reduced-motion: reduce`
    - _Requirements: 12.3, 12.4_

  - [ ] 6.11 Report results in `docs/BUILD_LOG.md`
    - Append a section for tasks 5 and 6: Property 15 added (candle only so far), cases run, any counterexample with seed and shrunk input
    - _Requirements: none (testing rule)_

- [ ] 7. Checkpoint - Engine, candle haunt and wiring work end to end
  - Run `npx vitest --run`. Ensure all tests pass, ask the user if questions arise. With only the candle present, the lead is always the candle and no companion appears. Remind the user of the manual check: run `npm run dev`, look away from the screen (or switch tabs with the camera off), and watch the glow dim, gutter and recover when looking back. Whispers must not start until this is green.

- [ ] 8. Add the whispers haunt (one file, no engine edits)
  - [ ] 8.1 Fetch current documentation for the audio nodes used by whispers
    - Use Context7 or MDN for `AudioBufferSourceNode` (looping), `BiquadFilterNode` (bandpass or lowpass), `StereoPannerNode`, and node `disconnect()`. Do not rely on remembered APIs; if something cannot be confirmed, say so in `docs/BUILD_LOG.md` and do not use it
    - _Requirements: 14.2, 14.7_

  - [ ] 8.2 Implement `src/haunts/whispers.ts`
    - Exports `id` (`whispers`), `name`, `start`, `setLevel`, `stop`. Uses `audio.whenReady` and `createNoiseBuffer` from `./engine/noise`, a filter, and a stereo pan to one side; gain requested through `audio.setGain` only (starting values 0.04, 0.10, 0.18, tuned by ear, increasing by level)
    - Without sound (setting off or no unlock) shows an edge vignette on the whisper side through `visual.createLayer`, stronger at higher levels; fade rules come from the gate. `stop` disconnects every node, cancels `whenReady`, and removes the layer. No speech, no lyrics, no audio file
    - Do not edit any file in `src/haunts/engine/`. If an edit seems needed, stop and report it
    - _Requirements: 4.1, 4.3, 4.5, 4.6, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8, 14.9, 14.10, 5.2_

  - [ ] 8.3 Write property test for the cap over real haunts and the real adapter
    - File: `src/haunts/engine/__tests__/gateCap.p14.prop.test.ts`
    - Iterates ordered pairs of distinct haunts from `loadHaunts()`, so shadow is covered when it is added. Real gate and audio adapter against the fake `AudioContext`; any interleaving of `setGain`, `setLevel`, cap changes and sound toggles
    - **Property 14: Real adapter and real haunts stay under the cap**
    - **Validates: Requirements 4.3, 6.2, 6.3, 6.4, 6.13, 14.5**

  - [ ]* 8.4 Write unit tests for the whispers haunt
    - File: `src/haunts/__tests__/whispers.unit.test.ts`
    - Contract type assertion; gain and vignette strength non-decreasing across levels with a strict rise; after `stop()` nodes created equal nodes disconnected and layers created equal layers removed; no sound before `whenReady` fires
    - _Requirements: 4.6, 14.3, 14.4, 14.5, 14.7, 14.8_

  - [ ] 8.5 Report results in `docs/BUILD_LOG.md`
    - Append a section for task 8: Properties 14 and 15 over candle and whispers, cases run, any counterexample with seed and shrunk input, and a confirmation that no file under `src/haunts/engine/` changed (`git diff --stat src/haunts/engine`)
    - _Requirements: none (testing rule)_

- [ ] 9. Add the shadow haunt (one file, no engine edits)
  - [ ] 9.1 Implement `src/haunts/shadow.ts`
    - Exports `id` (`shadow`), `name`, `start`, `setLevel`, `stop`. Uses `visual.createLayer` with an inline SVG string of an abstract soft shape (no face, no figure), `setOpacity` and `setSweep` (starting periods 14 s, 10 s, 6 s; darker, larger and more frequent with level, within the flash budget)
    - Reduced motion handling is done by the gate (fade in place, no crossing). No sound. `stop` removes the layer
    - Do not edit any file in `src/haunts/engine/`. If an edit seems needed, stop and report it
    - Run the existing suites (Property 14, Property 15, colour rule, static scan, discovery smoke) and confirm they now cover three haunts and all pairs
    - _Requirements: 4.1, 4.3, 4.5, 4.6, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 5.2_

  - [ ]* 9.2 Write unit tests for the shadow haunt
    - File: `src/haunts/__tests__/shadow.unit.test.ts`
    - Contract type assertion; opacity and size non-decreasing across levels with a strict rise; sweep period shrinks with level; `stop()` removes every layer; no audio calls
    - _Requirements: 4.6, 15.2, 15.3, 15.4, 15.7, 15.8_

  - [ ] 9.3 Report results in `docs/BUILD_LOG.md`
    - Append a section for task 9: Properties 14 and 15 over all three haunts and all ordered pairs, cases run, any counterexample with seed and shrunk input, and a confirmation that no file under `src/haunts/engine/` changed
    - _Requirements: none (testing rule)_

- [ ] 10. Final integration checks
  - [ ] 10.1 Write the network and storage spy test
    - File: `src/haunts/engine/__tests__/network.unit.test.ts`
    - Run a session with the real engine, gate and all discovered haunts; assert `fetch`, `XMLHttpRequest` and `navigator.sendBeacon` are never called, and `localStorage.setItem` is called only with the four documented keys
    - _Requirements: 16.6, 16.7_

  - [ ] 10.2 Write the final entry in `docs/BUILD_LOG.md`
    - List all properties (1 to 20), total cases run, any counterexamples found and how they were resolved, and the manual checks still to do: listen to each haunt at each level with the cap at its default and at 1; check flash rate and feel by eye with and without reduced motion; keyboard-only pass through notice, consent, reading and the top bar
    - _Requirements: none (testing rule)_

- [ ] 11. Final checkpoint - Ensure all tests pass
  - Run `npx vitest --run`, `npm run lint` and `npm run build`. Ensure all tests and lint pass, ask the user if questions arise. Remind the user of the manual checks that cannot be automated (listening pass at default and maximum cap, visual flash and reduced-motion pass, keyboard-only pass).

## Notes

- Tasks marked with `*` are optional (example and unit tests). Property tests are required, as in the attention-signal and reader-core specs, together with the static scan, discovery smoke, colour rule and network spy tests, which guard safety rules.
- Each task references specific requirements for traceability. Checkpoints ensure incremental validation.
- Property tests validate universal correctness properties; unit tests validate specific examples and edge cases.
- Properties 14 and 15 iterate the discovered registry. They are introduced when the first haunt that needs them exists (15 with candle, 14 with whispers) and then cover shadow without edits.
- No new dependency is added. Vite, React, Vitest, fast-check and jsdom are already in `package.json`.
- Design correspondence: the design places the colour-rule test in "Unit and example tests"; here it sits in task 6 because it needs `HauntStage`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.12", "1.18", "1.20", "1.22", "1.24", "3.1"] },
    { "id": 2, "tasks": ["1.4", "1.5", "1.6", "1.7", "1.8", "1.9", "1.10", "1.11", "1.13", "1.14", "1.15", "1.16", "1.17", "1.19", "1.21", "1.23", "1.25", "3.2", "3.3", "3.4", "3.5"] },
    { "id": 3, "tasks": ["1.26", "3.6", "4.1"] },
    { "id": 4, "tasks": ["3.7", "4.2", "4.3", "4.4", "5.1", "6.1", "6.2", "6.3"] },
    { "id": 5, "tasks": ["4.5", "5.2", "5.3", "5.4", "5.5", "6.4", "6.6", "6.8", "6.10"] },
    { "id": 6, "tasks": ["6.5"] },
    { "id": 7, "tasks": ["6.7"] },
    { "id": 8, "tasks": ["6.9", "8.1"] },
    { "id": 9, "tasks": ["6.11", "8.2"] },
    { "id": 10, "tasks": ["8.3", "8.4"] },
    { "id": 11, "tasks": ["8.5", "9.1"] },
    { "id": 12, "tasks": ["9.2", "9.3", "10.1"] },
    { "id": 13, "tasks": ["10.2"] }
  ]
}
```
