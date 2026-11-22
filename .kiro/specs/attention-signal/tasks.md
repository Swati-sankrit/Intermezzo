# Implementation Plan: Attention Signal

## Overview

Implement the attention module in TypeScript under `src/attention/`, with small React components in `src/ui/`. The module's only output is an `AttentionSignal` (`present` or `away` plus a timestamp). Tasks follow the mandatory ordering from the "Note for the Task List" in requirements.md: the core signal works end to end first (pure decision function and fallback decision function, camera adapter, fallback adapter and controller, consent dialog, camera indicator, wiring into the reading view with a temporary on-screen label). Calibration and the Settings_Screen come after.

All decision logic is pure and property-tested with fast-check. Adapters and the controller receive every side-effecting dependency as an injected port, so they are tested with fakes. No video frame, landmark, or pose value is stored, logged, or sent anywhere.

## Tasks

- [x] 1. Implement the pure decision logic (Decision_Function and fallback decision function)
  - [x] 1.1 Create the module skeleton, `types.ts`, and `config.ts`
    - Create `src/attention/` and `src/attention/__tests__/`
    - `types.ts`: `AttentionValue`, `AttentionSignal`, `PoseSample`, `Thresholds`, `DecisionConfig` exactly as in the design. `PoseSample` has no eye-gaze field
    - `config.ts`: `DEFAULT_THRESHOLDS` (baseline 0/0, limits 25 and 20), `isBeyond` (strict, baseline-relative, either side), `DEFAULT_DEBOUNCE_MS = 1500`, `DEFAULT_RETURN_MS = 1000`, `MIN_IDLE_LIMIT_MS = 60_000`, `clampDebounce` (to 500..5000, non-finite gives default), `clampReturnTime` (greater than 0 and at most 1000; at or below 0 or non-finite gives 1000), `clampIdleLimit(ms, previous)` (non-finite gives previous, else `max(ms, 60000)`)
    - No DOM, clock, camera, or storage access in these files
    - _Requirements: 4.2, 4.10, 4.11, 4.17, 4.18, 6.9, 6.10, 6.11, 6.12_

  - [x] 1.2 Implement `decision.ts`
    - `initialDecisionState(startT, from?)`, `isAwaySample`, `stepDecision`, `decide`
    - Ignore a sample whose `t` is non-finite, earlier than the session start, or earlier than `lastT`; equal `t` is accepted. `lastT` starts at `startT` (or `max(startT, from.timestamp)` when a signal is carried over), and new signals are stamped with `max(sample t, current signal timestamp)`
    - Away sample: `!tabActive`, or `!faceFound`, or non-finite yaw or pitch, or beyond the Thresholds (strict). Away run longer than the debounce time on a `present` signal gives `away` stamped with that sample's `t`
    - First Facing sample after `away` gives `present` stamped with that sample's `t`
    - `decide` normalizes config through `config.ts`; missing Thresholds use `DEFAULT_THRESHOLDS`; empty sequence returns `present`
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 4.8, 4.12, 4.13, 4.14, 4.16, 4.17, 4.18_

  - [x] 1.3 Create shared generators in `src/attention/__tests__/arbitraries.ts`
    - `arbPoseSample` (increasing time walk with gaps 0..400 ms, optional out-of-order jumps, `NaN` and `Infinity` angles, angles on exact limits)
    - `arbRunSequence(debounceMs, mode)` (alternating facing and away runs with durations below, at, and above the debounce time)
    - `arbThresholds` (baseline in [-60, 60], limits in (0, 90], all multiples of 0.25 so boundary and symmetry cases are exact)
    - _Requirements: 4.3, 4.4, 4.18_

  - [x] 1.4 Write property test for determinism and valid output
    - File: `src/attention/__tests__/decision.p01.prop.test.ts`
    - **Property 1: Decision_Function is deterministic and always valid**
    - **Validates: Requirements 4.1, 4.8, 4.14**

  - [x] 1.5 Write property test for long Away runs
    - File: `src/attention/__tests__/decision.p02.prop.test.ts`
    - **Property 2: A long Away run yields away at the right timestamp**
    - **Validates: Requirements 4.3, 4.16, 11.5**

  - [x] 1.6 Write property test for short Away runs
    - File: `src/attention/__tests__/decision.p03.prop.test.ts`, at least 300 runs
    - **Property 3: Short Away runs never produce away**
    - **Validates: Requirements 4.4, 4.15, 10.1, 10.5**

  - [x] 1.7 Write property test for prompt return
    - File: `src/attention/__tests__/decision.p04.prop.test.ts`, at least 300 runs
    - **Property 4: Return is prompt, stamped by the first Facing sample, and away persists until then**
    - **Validates: Requirements 4.5, 4.7, 5.9, 10.2, 10.3**

  - [x] 1.8 Write property test for timestamps and stale samples
    - File: `src/attention/__tests__/decision.p05.prop.test.ts`
    - **Property 5: Signal timestamps never decrease and stale samples are ignored**
    - **Validates: Requirements 4.6, 4.13**

  - [x] 1.9 Write property test for duplicate samples
    - File: `src/attention/__tests__/decision.p06.prop.test.ts`
    - **Property 6: Duplicate samples do not change the result**
    - **Validates: Requirements 4.9**

  - [x] 1.10 Write property test for non-finite angles
    - File: `src/attention/__tests__/decision.p07.prop.test.ts`
    - **Property 7: Non-finite angles behave as no face found**
    - **Validates: Requirements 4.12**

  - [x] 1.11 Write property test for the strict boundary and defaults
    - File: `src/attention/__tests__/decision.p08.prop.test.ts`
    - **Property 8: Baseline-relative boundary is strict and defaults apply**
    - **Validates: Requirements 4.17, 4.18**

  - [x] 1.12 Write property test for baseline symmetry
    - File: `src/attention/__tests__/decision.p21.prop.test.ts`
    - **Property 21: Away classification is symmetric about the baseline**
    - **Validates: Requirements 4.18**

  - [x] 1.13 Write property test for config clamping
    - File: `src/attention/__tests__/config.p09.prop.test.ts`
    - **Property 9: Config clamping**
    - **Validates: Requirements 4.10, 4.11, 6.10, 6.11, 6.12**

  - [x] 1.14 Implement the fallback decision function in `fallback.ts`
    - `FallbackSample`, `FallbackConfig`, `FallbackState`, `initialFallbackState(startT, from?)`, `stepFallback`, `decideFallback`
    - Away by tab: `!tabActive` for longer than the debounce time. Away by idle: `t - lastInputT > idleLimitMs` (strict, immediate). Either gives `away`; the first sample with an active tab and input within the idle limit gives `present` stamped with that sample's `t`
    - Stale samples are ignored as in `stepDecision`. No clock, DOM, or storage access
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.7, 6.13_

  - [x] 1.15 Write property test for short inactivity and short idle
    - Create `src/attention/__tests__/arbFallback.ts` (generator for fallback sequences with hidden runs and idle runs below, at, and above the limits)
    - File: `src/attention/__tests__/fallback.p10.prop.test.ts`
    - **Property 10: Fallback never reports away for short inactivity and short idle**
    - **Validates: Requirements 6.5**

  - [x] 1.16 Write property test for fallback away and return rules
    - File: `src/attention/__tests__/fallback.p11.prop.test.ts`, at least 300 runs
    - **Property 11: Fallback away and return rules**
    - **Validates: Requirements 6.2, 6.3, 6.4, 6.7**

  - [x] 1.17 Write property test for mode switch keeping the signal
    - File: `src/attention/__tests__/modeSwitch.p14.prop.test.ts`
    - **Property 14: Mode switch keeps the signal**
    - **Validates: Requirements 9.2**

  - [ ]* 1.18 Write unit tests for decision and fallback edge cases
    - File: `src/attention/__tests__/decision.unit.test.ts`
    - Empty and single-sample sequences return `present`; difference exactly equal to a limit is Facing; debounce boundary (exactly 1500 ms is not away, 1501 ms is); `clampIdleLimit(30000, 60000)` is 60000; fallback idle exactly at the limit is not away
    - _Requirements: 4.3, 4.14, 4.18, 6.3, 6.10_

  - [x] 1.19 Report results in `docs/BUILD_LOG.md`
    - Append a section for tasks 1.4 to 1.17: properties added (1 to 11, 14, 21), cases run per property, and any counterexample with seed and shrunk input. If a property fails, stop and report it; never weaken the assertion
    - _Requirements: none (testing rule)_

- [x] 2. Implement the camera adapter (includes the MediaPipe spike)
  - [x] 2.1 Fetch the current MediaPipe tasks-vision documentation through Context7 and confirm the open items
    - Load `tool::context7::resolve-library-id` then `tool::context7::query-docs` for the MediaPipe Face Landmarker (web, `@mediapipe/tasks-vision`) before writing any camera or detector code; do not rely on remembered APIs
    - Confirm or correct each item in the design's "Not confirmed in the docs" table: runtime type of each matrix entry, `delegate` values (`"CPU"` valid or not), `detectForVideo` argument types, `forVisionTasks` with a same-origin path, `close()` on the landmarker
    - Record findings and any API that could not be confirmed in `docs/BUILD_LOG.md`; if a method cannot be confirmed, say so and do not invent it
    - _Requirements: 7.4 (and the design and implementation note in the Introduction)_

  - [x] 2.2 Add the dependency and same-origin assets
    - Install `@mediapipe/tasks-vision` pinned to an exact version. License: Apache-2.0 (confirm in the installed package's `package.json`); add a row to the `Dependency Licenses` table in `README.md`
    - Add `scripts/copy-mediapipe.mjs` that copies `node_modules/@mediapipe/tasks-vision/wasm` to `public/mediapipe/wasm/`, run from a `postinstall` script; fail with a clear message if the source folder is missing
    - Fetch the `face_landmarker.task` model card and check its license before committing the file to `public/models/`. If the license cannot be confirmed, stop and ask the user; do not commit the file
    - Install `@testing-library/user-event` as a dev dependency (used by later UI tests). License: MIT (confirm in its `package.json`) and list it in `README.md`
    - No other dependency is added
    - _Requirements: 7.4_

  - [x] 2.3 Write the MediaPipe spike page
    - Create a throwaway `spike/mediapipe-spike.html` and `spike/mediapipe-spike.ts` (not imported by the app, not shipped) that opens the camera with a detached `<video>`, runs `detectForVideo` with `outputFacialTransformationMatrixes: true`, and prints only `faceFound`, `yaw`, and `pitch` as text on the page. It never renders the video, never stores or logs a frame, and never calls `console.*` with pose or frame data
    - Report to the user the exact steps for the manual check (look left, right, up, down; confirm yaw and pitch axes and signs, GPU and CPU delegate, same-origin wasm path, detached video element) and record the outcome in `docs/BUILD_LOG.md` once the user confirms. The adapter in 2.6 is not accepted until the user confirms
    - _Requirements: 7.4, 7.6_

  - [x] 2.4 Implement `pose.ts`
    - `poseFromMatrix16(m)`: column-major 4x4 (`R[row][col] = m[col * 4 + row]`, translation at indices 12 to 14), normalize the three rotation columns, `pitch = asin(clamp(-R[1][2], -1, 1))`, `yaw = atan2(R[0][2], R[2][2])`, both in degrees. The spike (2.3) confirmed column-major order, yaw positive for looking left and pitch positive for looking down
    - Non-finite entries, a zero-length column, or fewer than 16 numbers return `faceFound: false`
    - `PoseReading` stays internal to the module
    - _Requirements: 4.2, 4.12_

  - [x] 2.5 Write property test for pose extraction
    - File: `src/attention/__tests__/pose.p16.prop.test.ts`
    - **Property 16: Pose extraction round trip**
    - **Validates: Requirements 4.2, 4.12**

  - [x] 2.6 Implement `rateGate.ts`
    - `MIN_DETECTION_GAP_MS = 100` and `canStartDetection(nowMs, lastStartMs, tabVisible)`: true only when the tab is visible and (`lastStartMs === null` or `nowMs - lastStartMs >= 100`)
    - _Requirements: 11.1, 11.2, 11.6_

  - [x] 2.7 Write property test for the detection rate gate
    - File: `src/attention/__tests__/rateGate.p15.prop.test.ts`
    - **Property 15: Detection rate gate**
    - **Validates: Requirements 11.1, 11.2, 11.6**

  - [x] 2.8 Implement `detectorAdapter.ts`
    - Dynamic `import('@mediapipe/tasks-vision')` only (never a static import); `FilesetResolver.forVisionTasks('/mediapipe/wasm')`; `FaceLandmarker.createFromOptions` with `modelAssetPath: '/models/face_landmarker.task'`, `runningMode: 'VIDEO'`, `numFaces: 1`, `outputFaceBlendshapes: false`, `outputFacialTransformationMatrixes: true`, GPU delegate first and a single CPU retry only if 2.1 confirmed it
    - `readMatrix4` is the only place that reads the matrix. It reads `matrix.data` (a flat `number[]`), checks `rows === 4`, `columns === 4` and `data.length === 16`, and the layout is column-major; everything downstream gets `number[]` of length 16
    - `detect(video, t)` uses a strictly increasing timestamp, returns `faceFound: false` for empty `faceLandmarks` or a missing matrix, and returns only `PoseReading`. The MediaPipe result object and landmarks are not assigned to any longer-lived variable. `close()` calls the documented `close()`
    - No `console.*`, `fetch`, or storage use
    - _Requirements: 4.2, 7.1, 7.2, 7.3, 7.4, 7.5, 9.4_

  - [x] 2.9 Implement `cameraAdapter.ts`
    - `open()` calls `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })`; this is the only file in the app that calls `getUserMedia`
    - Map `NotAllowedError` and `SecurityError` to `denied`, anything else to `unavailable`; listen for `ended` on every track; `stop()` stops every track and rethrows if a track stop throws
    - The `<video>` is `muted`, `playsInline`, and never inserted into a visible container (mounted with `display: none` only if the spike shows a detached element will not play)
    - _Requirements: 2.6, 5.6, 7.5, 7.6_

  - [x]* 2.10 Write unit tests for the adapters
    - File: `src/attention/__tests__/adapters.unit.test.ts`, using a fake `navigator.mediaDevices` and a fake landmarker module (the adapters under test are real, only the browser and MediaPipe boundary is faked)
    - Denial and other rejection names map correctly; `ended` fires the callback; `stop()` rethrows; empty `faceLandmarks` gives `faceFound: false`; timestamps are strictly increasing; `close()` is called
    - _Requirements: 2.6, 7.5_

  - [x]* 2.11 Write smoke tests for privacy and origin rules
    - File: `src/attention/__tests__/smoke.unit.test.ts`
    - Source scan of non-test files under `src/attention/`: `getUserMedia` appears only in `cameraAdapter.ts`; `@mediapipe/tasks-vision` is only imported with `import()`; no `cdn.jsdelivr.net` or `storage.googleapis.com` string and no external host in `src/attention/`; no `console.`, `fetch(`, `XMLHttpRequest`, `sendBeacon` in `src/attention/`; `src/attention/` imports nothing from `src/reader/`
    - _Requirements: 5.6, 7.1, 7.3, 7.4_

  - [x] 2.12 Report results in `docs/BUILD_LOG.md`
    - Append a section for tasks 2.5 and 2.7: properties added (15, 16), cases run, and any counterexample. Also record the spike outcome from 2.3
    - _Requirements: none (testing rule)_

- [x] 3. Implement the fallback adapter and the controller (signal works end to end without UI)
  - [x] 3.1 Implement `signalBus.ts`
    - `createSignalBus(initial)` with `subscribe` (delivers the current signal once, to that subscriber only), `publish` (no-op if the value is unchanged; clamps the timestamp up to the current one), `current`, `clear`
    - Wrap each callback in `try/catch` so a throwing subscriber neither stops the others nor changes the value
    - No timers; delivery is synchronous
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.8, 5.10, 5.11_

  - [x] 3.2 Write property test for signal bus delivery
    - File: `src/attention/__tests__/signalBus.p12.prop.test.ts`, at least 300 runs
    - **Property 12: Signal bus delivery rules**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.8, 5.10, 5.11**

  - [x] 3.3 Implement the fallback adapter `pageEvents.ts`
    - Listen for `visibilitychange`, window `focus` and `blur`, and passive `keydown`, `pointerdown`, `pointermove`, `touchstart`, `wheel`, `scroll`
    - Expose `{ tabActive(), lastInputT(), onChange(cb), dispose() }`; `tabActive = document.visibilityState === 'visible' && document.hasFocus()`. Input listeners record only a timestamp, no payload
    - `dispose()` removes every listener
    - _Requirements: 4.19, 6.1, 6.3_

  - [x] 3.4 Implement `notices.ts`
    - Add the `Notice` type (`kind` and `text`) to `types.ts`
    - `raiseNotice(state, kind)` returns `{ state, notice }`, with a non-null notice at most once per kind per Session; wording for `denied`, `camera-lost`, `detector-failed`, and `cameraOffFailed` lives here
    - _Requirements: 1.7, 6.6, 7.7_

  - [x] 3.5 Write property test for notices
    - File: `src/attention/__tests__/notices.p20.prop.test.ts`
    - **Property 20: At most one notice per cause per Session**
    - **Validates: Requirements 1.7, 6.6, 7.7**

  - [x] 3.6 Define the status and port types and create the `fakePorts()` test helper
    - In `types.ts` add `AttentionStatus`, `CalibrationProgress`, `AttentionMode`, `AttentionPorts`, `CameraHandle`, `Detector`, and `PageEvents` exactly as in the design (internal to the module, not re-exported from `index.ts`)
    - Create `src/attention/__tests__/fakes.ts` with `fakePorts()`:
    - Manual clock, interval scheduler driven by `advance(ms)`, fake camera (resolve, reject with a chosen error name, end later, `stop()` that can throw), fake detector with scripted `PoseReading`s, fake page-event source, and an in-memory store that can be made to throw
    - _Requirements: none (test infrastructure)_

  - [x] 3.7 Implement `controller.ts` in Fallback_Mode with `pause()`, `resume()`, and `setIdleLimit`
    - `createAttention(ports?)` with injected `now`, `setInterval`, `clearInterval`, `camera`, `detector`, `page`, `store`; default ports use `performance.timeOrigin + performance.now()`
    - `start()`: create the bus with `{ present, now() }`, enter Fallback_Mode for now (the camera path and recorded choice come in 3.8 and 5.2). `stop()`: leave Paused_State, clear the interval, dispose page listeners, `bus.clear()`; idempotent
    - Tick every 250 ms and on every page-event change: build a `FallbackSample`, run `stepFallback`, publish. A Tab_Active change feeds a sample immediately
    - `pause()`: no-op if not running or already paused; set `paused`; if the current signal is `away`, publish `{ present, now() }` at once. While paused no sample is stepped, so no `away` is published
    - `resume()`: no-op if not paused; reset the decision and fallback states with `initial*State(now(), bus.current())`, set the idle origin to `now()`, clear `paused`
    - `setIdleLimit(ms)`: `clampIdleLimit(ms, previous)`, default 60 s; the idle limit applies only in Fallback_Mode; the controller never reads book data
    - Split into helper files if `controller.ts` would pass 200 lines (for example `controllerState.ts`)
    - _Requirements: 4.19, 5.5, 6.1, 6.3, 6.8, 6.9, 6.10, 6.11, 6.12, 6.13, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.10_

  - [x] 3.8 Add Camera_Mode orchestration to the controller
    - `openCamera()`: `camera.open()` and `detector.create()` in parallel, never blocking the reading view. On success set `mode: 'camera'`, `cameraOn: true`, start the detection loop. On `denied`: one notice via `notices`, `cameraAvailable: false`, Fallback_Mode within 1000 ms, no retry this Session. On any other error: one `camera-lost` notice and fallback
    - Detection loop: `requestVideoFrameCallback` when available, otherwise `requestAnimationFrame`. Every callback asks `canStartDetection(now, lastStart, tabVisible)`; when false it skips and reschedules (10 Hz cap). When the tab is hidden, stop scheduling (zero detection calls) and restart on `visibilitychange` within 200 ms with `faceFound` treated as false until the first new detection completes
    - Send the Decision_Function a sample at least every 250 ms (heartbeat repeating the latest pose with a fresh timestamp and current Tab_Active), and on every Tab_Active change, even while detection is stopped. The idle limit is not used in Camera_Mode
    - `status.faceFound` copies only the boolean of the latest reading and is republished only when it changes; it is false when the camera stops, while the tab is hidden, and in Fallback_Mode. Yaw, pitch, and landmarks never enter `AttentionStatus`
    - `releaseCamera()`: the single place that stops every track and closes the detector (within 1000 ms). `fallBack(cause)` calls it, sets `cameraOn: false`, raises one notice, and enters Fallback_Mode seeded with `initialFallbackState(now(), bus.current())`. Triggers: track `ended`, detector creation failure, `detect` throwing
    - Put the camera path in a helper file (for example `controllerCamera.ts`) so every file stays under 200 lines
    - _Requirements: 2.6, 4.19, 6.6, 6.13, 7.1, 7.2, 7.5, 7.7, 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x] 3.9 Implement `index.ts`
    - Export `createAttention` and the `Attention`, `AttentionControls`, `AttentionSignal`, `AttentionStatus` types. Do not export `PoseReading`, `CameraHandle`, `PoseSample`, or any pose, landmark, or frame type
    - Top-of-file comment: the haunt engine must treat every `present` signal as a reset to haunt level 0
    - _Requirements: 5.1, 5.6, 5.7, 10.4_

  - [x] 3.10 Write property test for pause and resume
    - File: `src/attention/__tests__/controller.p13.prop.test.ts`, at least 300 runs, using `fakePorts()` and the real controller (the controller is never mocked)
    - Generator `arbControllerScript`: operations `start`, `stop`, `pause`, `resume`, `sample`, `advance(ms)`, `hide`, `show`
    - **Property 13: Pause suppresses away, and resume resets the accumulator**
    - **Validates: Requirements 8.1, 8.2, 8.4, 8.5, 8.9, 8.10**

  - [x]* 3.11 Write controller example tests
    - File: `src/attention/__tests__/controller.unit.test.ts`
    - `setIdleLimit` default 60 s, below-minimum clamp, non-finite ignored; camera-mode result is independent of idle time; `stop()` from Paused_State shuts down; no detector call while hidden; detection restarts within 200 ms of `show`; face treated as not found until the first detection after returning; camera `ended` and detector failure give exactly one notice and Fallback_Mode with the last signal kept; `stop()` clears timers and subscribers
    - _Requirements: 6.6, 6.9, 6.13, 7.5, 7.7, 8.8, 11.2, 11.3_

  - [x] 3.12 Report results in `docs/BUILD_LOG.md`
    - Append a section for tasks 3.2, 3.5, 3.10: properties added (12, 13, 20), cases run, and any counterexample
    - _Requirements: none (testing rule)_

- [x] 4. Checkpoint - Core signal logic and controller
  - Run `npx vitest --run src/attention/`. Ensure all tests pass, ask the user if questions arise. Remind the user that the manual MediaPipe spike (2.3) must be confirmed before the camera adapter is accepted.

- [x] 5. Implement the Camera_Consent_Dialog
  - [x] 5.1 Implement the choice storage in `storage.ts`
    - `loadChoice`, `saveChoice` using key `rod_attention_choice` with values `'camera'` or `'no-camera'`; every `localStorage` call in `try/catch`; any other stored value or unreadable storage returns `null`; `saveChoice` returns `false` when the write fails
    - Follow the pattern of `src/reader/storage.ts`. Write only this metadata, never pose or frame data
    - _Requirements: 1.4, 1.5, 1.6, 1.8, 7.3_

  - [x] 5.2 Add the consent flow to the controller
    - `start()` reads the choice: `null` sets `status.choice = 'unanswered'` and nothing else happens (no `camera.open`); `'camera'` calls `openCamera()`; `'no-camera'` stays in Fallback_Mode
    - `chooseCamera(true)`: save the choice, then `openCamera()`. `chooseCamera(false)`: save the choice, enter Fallback_Mode, never call `camera.open`. If `saveChoice` returns `false`, still apply the choice in memory for the Session
    - After a denial, `start()` and `chooseCamera` make no second `camera.open` call this Session; only `setCameraOn(true)` (task 10) retries
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 1.7, 1.8_

  - [x] 5.3 Implement `ConsentDialog.tsx`, `ConsentDialog.css`, and `useFocusTrap.ts`
    - `role="dialog"`, `aria-modal="true"`, labelled by its heading. Text states: the camera only tells whether you are facing the screen, processing stays on this device, no picture is stored or sent. Exactly two buttons: "Turn on camera" and "Read without camera"
    - On open, focus moves to the first button; Tab and Shift+Tab stay inside; Enter and Space activate; Escape does not close; on close, focus returns to the element focused before it opened (`useFocusTrap` is a small shared hook reused by the calibration view)
    - Colours only from `src/ui/theme.css` variables, visible `--accent` focus ring, 4.5:1 contrast, fade of about 200 ms removed under `prefers-reduced-motion`, nothing flashes. Each file under 200 lines
    - _Requirements: 1.1, 1.2, 1.3, 1.9, 1.10_

  - [ ]* 5.4 Write example tests for the consent flow
    - Files: `src/attention/__tests__/consent.unit.test.ts` (controller with fake ports) and `src/ui/__tests__/ConsentDialog.unit.test.tsx` (React Testing Library with `user-event`)
    - Controller: no `camera.open` before a choice; choice stored; recorded choice applied without the dialog; unreadable storage shows the dialog; write failure still lets the Session continue; one denial notice and no second `open`
    - Dialog: the three statements, two buttons, initial focus, Tab wrap, Escape does not close, focus return, Enter and Space activate
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_

- [x] 6. Implement the Camera_Indicator and notice banner
  - [x] 6.1 Add camera-off control and error path to the controller
    - `setCameraOn(false)`: `releaseCamera()`, switch to Fallback_Mode with `initialFallbackState(now(), bus.current())`, indicator state removed within 500 ms. If a track `stop()` throws: keep `cameraOn: true`, set `cameraOffError` ("The camera could not be turned off. You can turn it off in your browser's site settings."), leave everything else unchanged
    - `setCameraOn(true)` re-runs `openCamera()`; it is the only retry path after denial
    - _Requirements: 2.3, 2.6, 2.7, 7.5, 9.2, 9.6_

  - [x] 6.2 Implement `CameraIndicator.tsx` and `CameraIndicator.css`
    - Shown while `status.cameraOn`; a small dot icon (inline SVG, `currentColor`) with the text "Camera on" and a "Turn camera off" button. Accessible names state that the camera is on and that the button turns it off
    - Stays at 100% opacity when the top bar fades (add an exception for `.camera-indicator` in the bar's fade rule); also shown while paused and while the tab is hidden; appears from `cameraOn` directly, so within 500 ms
    - Keyboard reachable, visible `--accent` focus ring, Enter and Space activate. Under 200 lines
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 7.8, 8.11, 11.4_

  - [x] 6.3 Implement `NoticeBanner.tsx` and `NoticeBanner.css`
    - Single `role="status"` line showing `status.notice.text` or `status.cameraOffError`, with a "Dismiss" button. Reuse the visual style of `ErrorBanner`; use `--danger` only for `cameraOffError`
    - Texts come from `notices.ts` (for example "Camera access was not allowed. Reading continues without the camera." and "Face detection stopped. Reading continues.")
    - _Requirements: 1.7, 2.7, 6.6, 7.7_

  - [ ]* 6.4 Write example tests for the indicator, banner, and camera-off paths
    - Files: `src/attention/__tests__/cameraOff.unit.test.ts`, `src/ui/__tests__/CameraIndicator.unit.test.tsx`, `src/ui/__tests__/NoticeBanner.unit.test.tsx`
    - Controller: off within 500 ms stops every track and closes the detector; a throwing `stop()` keeps `cameraOn: true` and sets `cameraOffError`; denial and camera loss raise exactly one notice (Property 20 is covered in 3.5)
    - UI: accessible names, keyboard activation, indicator opacity unchanged when the bar is faded, indicator visible while paused and while hidden, banner text and dismiss
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 2.7, 8.11, 11.4_

- [x] 7. Wire the attention module into the reading view with a temporary label
  - [x] 7.1 Implement `src/ui/useAttention.ts`
    - Lazily create one controller (module-level singleton), call `start()` when the reading view mounts (deferred so first paint is not delayed) and `stop()` when it unmounts or the reader returns to the library
    - Subscribe to `AttentionStatus` with `useSyncExternalStore`; expose the commands (`chooseCamera`, `setCameraOn`, and later calibration and debounce commands)
    - _Requirements: 8.6, 8.7, 9.4_

  - [x] 7.2 Implement `TempAttentionLabel.tsx`
    - A small fixed label "Attention: present" or "Attention: away" fed by `attention.subscribe`, marked with a `// TEMPORARY` comment, to be removed when the haunt engine consumes the signal. It sits outside the reading column, never over the current paragraph, and does not take focus
    - _Requirements: 5.1, 5.2, 9.5_

  - [x] 7.3 Mount the pieces in `ReaderView.tsx` and `ReaderView.css`
    - Render `ConsentDialog`, `CameraIndicator` (inside the top bar), `NoticeBanner`, and `TempAttentionLabel`
    - Call `setIdleLimit(3 * suggestedSecs * 1000)` whenever the suggested time changes (the controller clamps it to at least 60 s)
    - Keep `ReaderView.tsx` under 200 lines; move the attention parts into a small `AttentionLayer.tsx` if needed. Do not change reading behavior; reading stays fully usable with the camera off and the consent dialog answered either way
    - _Requirements: 1.1, 2.1, 5.2, 6.8, 9.1, 9.4_

  - [ ]* 7.4 Write integration tests for the reading view wiring
    - File: `src/ui/__tests__/ReaderView.attention.integration.test.tsx`, using a controller with fake ports
    - The reading view renders before the camera and detector finish loading; the label shows "present" at start and "away" after a scripted away run, and "present" after the return; a signal change does not move keyboard focus; no `<video>` element exists in the document; leaving the reading view calls `stop()`
    - _Requirements: 5.5, 7.6, 8.7, 9.4, 9.5_

- [ ] 8. Checkpoint - Core signal works end to end
  - Run `npx vitest --run`. Ensure all tests pass, ask the user if questions arise. The core path (decision function, camera adapter, fallback adapter, consent dialog, camera indicator, wiring with the temporary label) must be green before Calibration starts.

- [ ] 9. Implement Calibration
  - [ ] 9.1 Implement `calibration.ts`
    - `median` (mean of the two middle values for even counts), `deriveLimit(separationDeg, defaultLimit) = clamp(d / 2, 10, defaultLimit)`, `computeThresholds(facing, away, previous)` returning `success`, `no-face` (fewer than 10 finite facing samples), or `too-close` (empty away set, or separation under 20 degrees on both axes)
    - Baseline is the median facing yaw and pitch; a separated axis (`d >= 20`) uses `deriveLimit`, a non-separated axis uses its default limit; non-finite angles are dropped defensively
    - _Requirements: 3.4, 3.5, 3.6, 3.7_

  - [ ] 9.2 Write property test for calibration success
    - File: `src/attention/__tests__/calibration.p17.prop.test.ts`, with generator `arbCalibrationSets` (facing sizes below and above 10, facing centre in [-45, 45], away medians on either side, separation on yaw only, pitch only, both, or neither, including boundary separations 19.75, 20, and 20.25, and an exact d = 20 that gives a limit of exactly 10)
    - **Property 17: Calibration success classifies the medians correctly**
    - **Validates: Requirements 3.4, 3.5, 4.18**

  - [ ] 9.3 Write property test for calibration failure
    - File: `src/attention/__tests__/calibration.p18.prop.test.ts`
    - Include the just-under-20 case: separation of 19.75 degrees on both axes must return `too-close`, while exactly 20 on either axis must not
    - **Property 18: Calibration failure outcomes keep previous Thresholds**
    - **Validates: Requirements 3.6, 3.7**

  - [ ] 9.4 Implement `thresholds.ts` and the Thresholds storage in `storage.ts`
    - `isValidThresholds`, `serializeThresholds` (JSON with `"v": 2`), `parseThresholds` (never throws; `null` for missing, unparseable, non-finite, limit not above 0, or `v: 1`)
    - `loadThresholds`, `saveThresholds` under key `rod_attention_thresholds`, with `try/catch`. Only the four Threshold numbers are stored
    - _Requirements: 3.4, 3.10, 3.11, 7.3_

  - [ ] 9.5 Write property test for Thresholds storage
    - File: `src/attention/__tests__/thresholds.p19.prop.test.ts`
    - **Property 19: Threshold storage round trip and safe load**
    - **Validates: Requirements 3.10, 3.11**

  - [ ] 9.6 Add the calibration run to the controller
    - Put it in a helper file (for example `calibrationRun.ts`) to stay under 200 lines
    - Load stored Thresholds at `start()`; missing or invalid ones use `DEFAULT_THRESHOLDS`, show no error, and set `needsCalibrationOffer` for the next time the camera is turned on. Pass the active Thresholds and debounce into `DecisionConfig`
    - On the first successful camera start with no stored Thresholds, set `needsCalibrationOffer`
    - `startCalibration()`: phase `look-at-page` for 5 s, then `look-away` for 5 s (15 s at most in total), with `secondsLeft` driven by the controller clock, collecting only face-found angles into local arrays. `cancelCalibration()` (skip, before or during) discards all samples, keeps the previous Thresholds, and returns to the previous screen within 1 s
    - On `success`: save and replace Thresholds and set the confirmation message. On `no-face` or `too-close`: keep previous Thresholds (or defaults) and set the message and retry option. Thresholds are replaced only by `success`
    - The signal is held at `present` during Calibration (internal hold, separate from the public `pause()`); the design flags this for review
    - `status.faceFound` keeps updating during Calibration; the camera indicator stays visible
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.7, 3.8, 3.9, 3.11, 7.8_

  - [ ] 9.7 Implement `FaceStatusMarker.tsx` and `FaceStatusMarker.css`
    - One prop: boolean `faceFound`. Inline SVG icon (face outline with a tick when found, with a slash when not, `currentColor`, `aria-hidden`) next to the text "Face detected" or "No face detected", so the state is never colour-only
    - A persistent `role="status"` wrapper (polite live region) whose text changes when the boolean changes. It receives no pose values, landmarks, or frames. Icon colour `--accent` when found and `--text-dim` when not, both at 4.5:1 or better against `--surface` (checked in 10.5). Export the text function so it can be tested directly
    - _Requirements: 3.13, 3.14, 3.15_

  - [ ] 9.8 Write property test for face status
    - File: `src/attention/__tests__/faceStatus.p22.prop.test.ts`, using `fakePorts()` and the real controller
    - **Property 22: Face status carries only the face-found boolean**
    - **Validates: Requirements 3.13, 3.15, 11.3**

  - [ ] 9.9 Implement `CalibrationView.tsx`, `CalibrationView.css`, and `useCalibration.ts`
    - Full-screen text-only panel inside the `useFocusTrap` dialog from 5.3. Shows the phase text ("Look at the page", "Look away") and seconds left in an `aria-live="polite"` region, the result message, and the `FaceStatusMarker`. Buttons: "Start calibration", "Skip", "Try again", "Repeat calibration"
    - The countdown comes from the controller (`secondsLeft`), not from component timers. Shows no video, frame, yaw, pitch, or landmark. The `CameraIndicator` is visible on this screen too. Keyboard only works; every control has a visible focus ring
    - _Requirements: 3.1, 3.3, 3.6, 3.7, 3.9, 3.12, 3.13, 3.15, 7.6, 7.8_

  - [ ] 9.10 Wire Calibration into the reading view
    - `useAttention` exposes `startCalibration` and `cancelCalibration`; `ReaderView` (or `AttentionLayer`) renders `CalibrationView` when `status.calibration` is not null, and offers it when `needsCalibrationOffer` is set after the first camera start
    - _Requirements: 3.1, 3.9_

  - [ ]* 9.11 Write example tests for Calibration
    - Files: `src/attention/__tests__/calibrationRun.unit.test.ts` and `src/ui/__tests__/CalibrationView.unit.test.tsx`
    - Controller: full run takes at most 15 s; skip discards samples and restores the screen within 1 s; failure outcomes keep stored Thresholds; recalibration replaces Thresholds only on success; invalid stored Thresholds offer Calibration next time with no error shown
    - UI: phase text and seconds left; keyboard use; `FaceStatusMarker` text for each boolean, icon beside the text, live region text changes; no `<video>`, yaw, or pitch in the screen
    - _Requirements: 3.2, 3.3, 3.8, 3.9, 3.11, 3.12, 3.13, 3.14, 3.15_

  - [ ] 9.12 Report results in `docs/BUILD_LOG.md`
    - Append a section for tasks 9.2, 9.3, 9.5, 9.8: properties added (17, 18, 19, 22), cases run, and any counterexample
    - _Requirements: none (testing rule)_

- [ ] 10. Implement the Settings_Screen
  - [ ] 10.1 Add the debounce setting to the storage and controller
    - `loadDebounce`, `saveDebounce` under key `rod_attention_debounce` (decimal string; clamp on load with `clampDebounce`; write failures are ignored)
    - `setDebounce(ms)` on the controller: clamp to 500..5000, persist, apply to the next decision step
    - _Requirements: 4.10, 4.11_

  - [ ] 10.2 Implement `SettingsScreen.tsx` and `SettingsScreen.css`
    - Camera on/off control (`role="switch"`, labelled "Camera"), a "Recalibrate" button, and a debounce slider (500 to 5000 ms) with a visible value. When `cameraAvailable` is false the switch is disabled and labelled "Camera unavailable"
    - All controls reachable with Tab, operable with Enter or Space, visible `--accent` focus ring. Camera switch calls `setCameraOn`, Recalibrate calls `startCalibration`, the slider calls `setDebounce`
    - Changing the camera setting switches modes within 1000 ms and keeps the last signal value until the new mode produces a different one
    - _Requirements: 3.8, 9.1, 9.2, 9.3, 9.6_

  - [ ] 10.3 Add the "Settings" button to the top bar and mount the screen
    - Add a "Settings" button in the reader bar and render `SettingsScreen` from the reading view without covering the current paragraph; keep `ReaderView.tsx` under 200 lines
    - _Requirements: 9.3_

  - [ ]* 10.4 Write example tests for the Settings_Screen
    - File: `src/ui/__tests__/SettingsScreen.unit.test.tsx`
    - Controls and accessible names; keyboard operation; disabled "Camera unavailable" after denial; Recalibrate starts Calibration; slider values outside the range are clamped by the controller; camera toggle keeps the last signal
    - _Requirements: 3.8, 9.2, 9.3_

  - [ ]* 10.5 Write a contrast test for new colour pairs
    - File: `src/ui/__tests__/attentionContrast.unit.test.ts`
    - Read the colour values from `src/ui/theme.css`, compute WCAG contrast, and assert at least 4.5:1 for every text and icon pair used by the new components (`--text` and `--text-dim` on `--bg` and `--surface`, `--accent` on `--surface`, `--danger` on `--surface`)
    - _Requirements: 3.14, 2.4_

  - [ ]* 10.6 Write the privacy spy test
    - File: `src/attention/__tests__/privacy.unit.test.ts`
    - Run a controller session with fake ports and spies; assert `fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, and `console.*` are never called with pose or frame data, and that `localStorage.setItem` is called only with the three documented keys (`rod_attention_choice`, `rod_attention_thresholds`, `rod_attention_debounce`). Also assert that `index.ts` exports no pose, landmark, or frame type and contains the haunt-engine comment
    - _Requirements: 5.7, 7.1, 7.2, 7.3, 10.4_

- [ ] 11. Final checkpoint - Ensure all tests pass
  - Run `npx vitest --run` and `npm run build`. Ensure all tests pass, ask the user if questions arise. Remind the user of the manual checks that cannot be automated: the MediaPipe spike result, first paint delay under 100 ms (browser performance panel with and without the module), and keyboard-only passes through consent, indicator, calibration, and settings.

## Notes

- Tasks marked with `*` are optional (example, integration, and smoke tests). Property tests are required, as in reader-core.
- The design uses TypeScript throughout; all code and tests use TypeScript.
- Property tests use `fc.assert(fc.property(...), { numRuns: 100 })` (at least 300 for Properties 3, 4, 11, 12, 13); each file carries the comment `// Feature: attention-signal, Property N: <title>`.
- After each task that adds property tests, report which properties were added, how many cases ran, and any counterexample; counterexamples go to `docs/BUILD_LOG.md`. If a test fails and the cause is unclear, stop and report it; never change the assertion to make it pass.
- Fetch current docs before using any library (MediaPipe through Context7, as in task 2.1). If a method cannot be confirmed, say so instead of inventing it.
- New dependencies and licenses: `@mediapipe/tasks-vision` (Apache-2.0), `@testing-library/user-event` (MIT). Confirm each in the package's own `package.json` and list both in `README.md`. The `face_landmarker.task` model license must be confirmed before the file is committed.
- No video frame, landmark, or pose value is stored, logged, or sent. Components and source files stay under 200 lines. Colours come only from `src/ui/theme.css`.
- The signal is held at `present` during Calibration; the design flags this as an open point for review.
- Design correspondence: the design maps Property 20 to the indicator task and Property 22 to Calibration; here Property 20 is tested in task 3 (where `notices.ts` is first needed by the controller's fallback path) and Property 22 in task 9.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.13", "2.2", "3.4"] },
    { "id": 2, "tasks": ["1.4", "1.5", "1.6", "1.7", "1.8", "1.9", "1.10", "1.11", "1.12", "1.14", "2.3", "2.4", "2.6", "3.1", "3.5"] },
    { "id": 3, "tasks": ["1.15", "1.17", "1.18", "2.5", "2.7", "2.8", "2.9", "3.2", "3.3"] },
    { "id": 4, "tasks": ["1.16", "2.10", "2.11", "3.6"] },
    { "id": 5, "tasks": ["1.19", "3.7"] },
    { "id": 6, "tasks": ["3.8", "5.1"] },
    { "id": 7, "tasks": ["3.9", "5.2", "5.3"] },
    { "id": 8, "tasks": ["2.12", "3.10", "3.11", "5.4", "6.1", "6.2", "6.3"] },
    { "id": 9, "tasks": ["3.12", "6.4", "7.1", "7.2"] },
    { "id": 10, "tasks": ["7.3"] },
    { "id": 11, "tasks": ["7.4", "9.1", "9.4"] },
    { "id": 12, "tasks": ["9.2", "9.3", "9.5", "9.6", "9.7"] },
    { "id": 13, "tasks": ["9.8", "9.9"] },
    { "id": 14, "tasks": ["9.10", "10.1"] },
    { "id": 15, "tasks": ["9.11", "9.12", "10.2", "10.5"] },
    { "id": 16, "tasks": ["10.3", "10.6"] },
    { "id": 17, "tasks": ["10.4"] }
  ]
}
```
