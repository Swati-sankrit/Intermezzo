# Build log

## reader-core, task 4.2: Property 6 (HTML stripping removes all tag markup)

- Test: `src/reader/__tests__/parser.prop.test.ts`, "Property 6"
- Function under test: `stripHtml` in `src/reader/stripHtml.ts` (DOMParser-based)
- Status: FAILING, not fixed, assertion not weakened.

### Counterexample

Found with 20,000 runs (seed 884226290, path `112:5:3:3:9:10:9:11:10:10:13:14:14:15:21:20`).
At `numRuns: 100` the test usually passes, because the failing shape is rare.

Input (shrunk):

```html
<span class="c"><</span><em class="n"><p style="color: red; font-size: 12px">A</p><p class="n"><p class="n">></p><img src="a.png" alt="x"></p></em>
```

Output: `"<A\n\n>"`, which matches `/<[a-zA-Z][^>]*>/` (`[^>]` also matches newlines).

### Triage

The `<` and `>` in the output are not tags. They are literal text characters in
the source (an unescaped `<` before `</span>` and an unescaped `>` inside a `<p>`),
which the HTML parser correctly treats as text. All real elements were removed.
The same thing happens for valid escaped input: `&lt;b&gt; is bold` decodes to
`<b> is bold`, which also matches the regex.

So the property as written conflicts with correct entity/text decoding: any book
whose text legitimately contains `<letter ... >` will fail it. This is a spec
question, not a clear stripHtml bug. Options for the spec owner:

1. Keep the property and have `stripHtml` neutralise angle brackets in text
   (e.g. replace `<` with `‹` or drop it). Changes book text.
2. Restate the property: no element from the input survives, e.g. "re-parsing
   the output as HTML yields zero elements" or generate text without `<`/`>`.
3. Keep both: restrict the generator's plain text to exclude `<`, plus a separate
   unit test that escaped entities decode to literal characters.

## reader-core, task 4.2: decisions (Property 6 replaced, Property 4 restated)

### Property 6 counterexample (original "no tag markup in output" property)

- Seed 884226290, 20,000 runs. Shrunk input:
  `<span class="c"><</span><em class="n"><p style="color: red; font-size: 12px">A</p><p class="n"><p class="n">></p><img src="a.png" alt="x"></p></em>`
- Output: `"<A\n\n>"`, which matches `/<[a-zA-Z][^>]*>/`.

### Decision

The original property was replaced by an entity-escaped round-trip property.
Bare `<` and `>` in text are correctly kept as text, and re-parsing such output
as HTML would also create elements, so "no tag-like text in output" cannot hold.
`stripHtml` is unchanged. The new property generates text containing `<`, `>`,
`&` and quotes, escapes it as entities, wraps it in random tags (p, div, b, i,
span, br, img), and asserts the output equals the original text, with `\n\n`
where block elements or `<br>` ended. The old counterexample is kept as an
explicit example test with `<`/`>` escaped. Results: 100 runs, 20,000 runs, and
20,000 runs with seed 884226290 all pass.

### Property 4 restated

The old property required every non-whitespace character of the input, headings
included, to appear in chapter titles plus bodies. Chapters with an empty body
are dropped even when titled (e.g. table-of-contents headings), so their heading
text is lost by design. Property 4 now says no body text is lost: non-whitespace
characters of non-heading lines equal those of the chapter bodies, in order.
Property 4b checks every kept chapter has a non-empty body and every non-empty
title is a heading line from the input. Both pass at 100 and 20,000 runs.

## Task 4.3: EPUB parser unit tests found a load bug
### Finding
A jszip-built EPUB fixture, parsed by the real epub.js, made `buildEpubBook` return
`{ ok: false }` for a valid book. epub.js `Section.load()` resolves to the root
`<html>` Element (`section.contents`), not a Document
(node_modules/epubjs/src/section.js:60-66). The parser read
`doc.body ?? doc.documentElement`, and both are undefined on an Element. Every
section therefore stripped to empty text and was skipped, so no EPUB could load.
### Fix
`buildEpubBook` now uses `section.document ?? root.ownerDocument` and reads that
Document's body. The test assertions were not changed. `stripHtml` and the
chapter heading regex were not touched.

## Task 10: Checkpoint, pure-function tests
`npx vitest --run src/reader/__tests__/`: 10 files, 44 tests, all passed. `tsc -p tsconfig.app.json --noEmit` reported no errors.
Every property ran 100 cases (`numRuns: 100`). No new counterexamples. No code or tests changed.
Property files: splitter (P1-P4), parser (P4, P4b, P5, P6, P6 example), gutenberg (P7, P8, P8b), progress (formula, monotonic), paceCalc (4), storage (P10, P11a, P11b), position (2), bookStore (P16, two variants).

## Task 1.8: Property 5 counterexample (attention signal timestamps)
### Finding
Property 5, "Signal timestamps never decrease and stale samples are ignored", in `src/attention/__tests__/decision.p05.prop.test.ts` (sub-property "signal timestamps never decrease across the fold") failed. Seed -2144383221, failed after 115 cases, 47 shrinks.
### What fast-check generated (shrunk)
Session start 0, so the initial signal was `{ present, 0 }`. Two samples: `{ t: -2, faceFound: false, tabActive: false, yaw: 0, pitch: NaN }` and `{ t: -1, faceFound: false, tabActive: false, yaw: 0, pitch: 0 }`. Config: debounceMs 0, returnMs 0, yawLimit 0.25, pitchLimit 0.25. The property calls `stepDecision` directly, so this config reached it unclamped. `decide` would have clamped the debounce to 500 through `config.ts`; this path does not use `decide`.
### Why the timestamp went backwards
Two causes together. `initialDecisionState` set `lastT` to null, so the first sample was accepted even though it was earlier than the session start. And `stepDecision` stamped a new signal with the sample's own `t` without comparing it to the current signal's timestamp. The signal went from `{ present, 0 }` to `{ away, -1 }`.
### Fix (code changed, test assertion left unchanged)
Both changes are in `src/attention/decision.ts`:
1. `initialDecisionState(startT, from?)` now sets `lastT` to `startT`, or to `max(startT, from.timestamp)` when a signal is carried over on a mode switch. Samples earlier than that are ignored as stale.
2. `stepDecision` stamps new `present` and `away` signals with `Math.max(sample.t, state.signal.timestamp)`.
The test file and all other tests were not edited.
### Result after the fix
Property 5 sub-properties: "timestamps never decrease" 500 cases, passed; "stale sample inserted changes nothing" 500 cases, passed; "non-finite timestamps ignored" 300 cases, passed. The failing seed -2144383221 re-run one-off (not committed) passes, and the shrunk input run as a direct example passes. `npx vitest --run src/attention`: 6 files, 18 tests, all passed.

## attention-signal, tasks 1.4 to 1.17: property tests for the decision logic
### Run
`npx vitest --run src/attention`: 14 files, 48 tests, all passed. `npx tsc -p tsconfig.app.json --noEmit`: no errors.
Cases below come from the `numRuns` values in each test file. Each fc.assert block runs its own cases, so total = blocks x cases per block (Property 5 mixes 500, 500, and 300). All files are in `src/attention/__tests__/`.
### Properties
| Property | Name | File | fc.assert blocks | Cases per block | Total cases | Result |
|---|---|---|---|---|---|---|
| 1 | Decision_Function is deterministic and always valid | decision.p01.prop.test.ts | 2 | 300 | 600 | passed |
| 2 | A long Away run yields away at the right timestamp | decision.p02.prop.test.ts | 3 | 300 | 900 | passed |
| 3 | Short Away runs never produce away | decision.p03.prop.test.ts | 3 | 500 | 1500 | passed |
| 4 | Return is prompt, stamped by the first Facing sample | decision.p04.prop.test.ts | 3 | 500 | 1500 | passed |
| 5 | Timestamps never decrease and stale samples are ignored | decision.p05.prop.test.ts | 3 | 500, 500, 300 | 1300 | passed |
| 6 | Duplicate samples do not change the result | decision.p06.prop.test.ts | 2 | 500 | 1000 | passed |
| 7 | Non-finite angles behave as no face found | decision.p07.prop.test.ts | 3 | 500 | 1500 | passed |
| 8 | Baseline-relative boundary is strict and defaults apply | decision.p08.prop.test.ts | 5 | 300 | 1500 | passed |
| 9 | Config clamping | config.p09.prop.test.ts | 3 | 300 | 900 | passed |
| 10 | Fallback never reports away for short inactivity and short idle | fallback.p10.prop.test.ts | 2 | 500 | 1000 | passed |
| 11 | Fallback away and return rules | fallback.p11.prop.test.ts | 5 | 500 | 2500 | passed |
| 14 | Mode switch keeps the signal | modeSwitch.p14.prop.test.ts | 5 | 300 | 1500 | passed |
| 21 | Away classification is symmetric about the baseline | decision.p21.prop.test.ts | 3 | 300 | 900 | passed |

Property 3 also sets `maxSkipsPerRun: 1000` in one block.
### Counterexamples
1. Property 5. Found earlier and logged in "Task 1.8: Property 5 counterexample" above (seed -2144383221, the signal timestamp went backwards). Fixed in `decision.ts`. The assertion was not changed. Not repeated here.
2. Property 9, test "clampReturnTime". Seed -2104415180, path "3:0", shrunk input `[0]`. The assertion `expect(r).toBeGreaterThan(0)` got 0.
   - Cause: `clampReturnTime` only capped at 1000 and had no lower bound. design.md line 219 said (0, 1000]. design.md line 49 and the requirements only said "at most 1000".
   - Steps: first the user chose to relax the design to "at most 1000", and the `> 0` assertion was removed. The user then reversed that and set one rule everywhere: "Return_Time is greater than 0 and at most 1000 ms; values at or below 0, or non-finite, use the default 1000 ms".
   - Final state: the requirements.md glossary, design.md lines 49 and 219, `types.ts`, the tasks.md task 1.1 text, and `clampReturnTime` in `config.ts` all follow that rule. `clampReturnTime` now returns 1000 for `ms <= 0` or non-finite input. The test asserts the rule: the result is greater than 0 and at most 1000, and values at or below 0 give 1000.
   - The code was fixed. The final assertion is stronger than the original, not weaker.
3. Test-side bugs fixed while writing the tests. These were not code bugs, and no assertion was weakened.
   - Property 2 read `undefined` when a generated sequence had no Away run (seed 1727871493). Fixed with `fc.pre`.
   - Property 4 had a wrong expected tail timestamp in the test. Fixed.
### Open points
- `fallback.ts` treats a non-finite `lastInputT` as not idle. design.md and the requirements are silent on this. No test depends on it. The user confirmed this behaviour and it is kept (see "attention-signal: requirement 6.4 resolution, Property 4 and 14 test fixes", item a).
- The internal trace helper in `decision.p04.prop.test.ts` tracks `lastT` from null instead of from `startT`. The current generators never produce samples before `startT`, so the test passes. It would misjudge such samples. Resolved: see "attention-signal: requirement 6.4 resolution, Property 4 and 14 test fixes".
- Property 14 checks that a carried signal stays unchanged until its value flips. It does not assert that a flip happens in any case. Resolved: see "attention-signal: requirement 6.4 resolution, Property 4 and 14 test fixes".
- Other changes made with user approval: the task 1.2 text in tasks.md was updated for "stale before session start". The unused `th` parameter was removed from `sampleAt` in `decision.p08.prop.test.ts`, with no assertion change.

## attention-signal: requirement 6.4 resolution, Property 4 and 14 test fixes
### a. Requirement 6.4 versus the design
While strengthening the Property 14 test, the reference model showed that design.md and `fallback.ts` said "away if hidden longer than the debounce or idle, present otherwise". So a carried `away` followed by a hidden-tab sample that was still within the debounce and not idle became `present`. Requirement 6.4 said `present` comes when the tab is visible again or input is received. The existing generators never produced that case, so no test had failed.
Resolution (user decision): follow requirement 6.4. `stepFallback` in `fallback.ts` now returns `present` from `away` only when the tab is active and the input is within the idle limit. The fallback section of design.md was updated to match. Requirement 6.4 was reworded to the same rule. New wording: "WHILE the Attention_Signal is `away` in Fallback_Mode, WHEN a sample is received at which the tab is visible and focused and Idle_Time does not exceed the Idle_Limit, THE Attention_Module SHALL emit `present` within the Return_Time (at most 1000 ms), with the timestamp of that first such sample, and THE Attention_Module SHALL NOT emit `present` on any earlier sample at which the tab is hidden or unfocused or Idle_Time exceeds the Idle_Limit."
A non-finite last-input time still counts as not idle (user confirmed). Properties 10 and 11 still pass unchanged.
### b. Property 4 test fix (`decision.p04.prop.test.ts`)
The trace helper used to track accepted samples from null instead of from the session start. It passed only because the generators never produced samples before `startT`. It now starts at `startT`. The test file generates a random `startT` that often falls after early samples (`arbitraries.ts` is unchanged). Each of the two main properties asserts that at least 40% of cases contain a pre-start sample. A new property covers sequences where every sample is before the start, and the state must stay unchanged. The file has 4 fc.assert blocks of 500 cases each. No counterexamples. No assertion was removed or weakened.
### c. Property 14 test fix (`modeSwitch.p14.prop.test.ts`)
Added independent reference models for the camera rules and the fallback rules. At every sample after a switch, the real signal must equal the model in value and timestamp, in both directions, so a missing change now fails.
Example tests: a carried `away` stays `away` through a short hidden-tab sample and through an active but idle sample. Then `present` is stamped 2100 at the first active, non-idle sample.
Flip rates (300 cases each): camera to fallback 216/300 (72%), fallback to camera 148/300 (49%). Each direction asserts at least 30%. A first draft used a 50% floor, and fallback to camera came in at 49.7%, so the floor was set to 30%. Only this new statistic was involved. All model comparisons passed.
Remaining gap: the fallback-to-camera directional test always hands over `present`. A carried `away` into camera mode is covered only by the arbitrary-carried-signal test, which has no flip-rate check.
The file has 10 tests, `numRuns` 300 per fc.assert. No counterexamples.
### d. Unexplained hang
One full `npx vitest --run` run hung for 900 s with no output. The rerun finished in about 4 s. The cause is unknown and it was not reproduced.
### e. Results at the time
As reported by the earlier runs: full `npx vitest --run`, 31 files, 144 tests passed. `npx tsc -p tsconfig.app.json --noEmit` was clean. These were not re-run for this documentation edit.

## attention-signal: Task 2.1, MediaPipe docs check (Requirement 7.4)
No packages were installed and no adapter code was written. Sources: Context7 `/websites/developers_google_edge_mediapipe` (Face Landmarker guide), Context7 `/google-ai-edge/mediapipe` (`face_landmarker_result.d.ts`, `vision_task_options.d.ts`), and the published `vision.d.ts` of `@mediapipe/tasks-vision` latest (npm 1.2.3, Apache-2.0), downloaded to /tmp only and read, from `https://unpkg.com/@mediapipe/tasks-vision/vision.d.ts`. The Context7 snippets did not show every type, so the `.d.ts` is the source for items marked "d.ts".
### Items from design.md "Not confirmed in the docs"
1. Runtime type of each matrix entry. CONFIRMED, and it corrects the design. `facialTransformationMatrixes` is `Matrix[]` (Context7, `face_landmarker_result.d.ts`). `Matrix` is `{ rows: number; columns: number; data: number[] }` with `data` a flattened one-dimensional array (d.ts, 1.2.3). It is NOT nested 4x4 arrays. `readMatrix4` must read `matrix.data` and check `rows === 4`, `columns === 4`, `data.length === 16`.
2. Element order of `data` (row-major or column-major). NOT CONFIRMED. Neither the guide nor the `.d.ts` says. Context7 shows no statement either way. `pose.ts` assumes row-major, so the spike (look left, right, up, down) must decide this. If the order is column-major, `poseFromMatrix16` must transpose first. Do not assume.
3. Axis orientation, sign convention, scale in the rotation. NOT CONFIRMED in the docs (the guide says only "4x4 facial transformation matrix from canonical face coordinates to the detected face"). The spike remains required.
4. `delegate: "CPU"`. CONFIRMED. `BaseOptions.delegate` is typed `"CPU" | "GPU" | undefined` (d.ts 1.2.3). The guide's Face Landmarker sample uses `"GPU"` only. The interactive segmenter page lists `{CPU, GPU}` with default CPU. The design's single CPU retry after a GPU creation failure is allowed by the types. Whether CPU actually works for Face Landmarker at runtime is not shown in the docs, so check it in the spike.
5. `detectForVideo` argument types. CONFIRMED (d.ts). `detectForVideo(videoFrame: ImageSource, timestamp: number, imageProcessingOptions?: ImageProcessingOptions): FaceLandmarkerResult`. `ImageSource` is a deprecated alias of `TexImageSource`, which includes `HTMLVideoElement`. `timestamp` is in ms. The guide says timestamps must be monotonic. Whether a detached (never attached) `<video>` is accepted is NOT CONFIRMED in the docs. The guide's sample uses a `<video>` in the page. Keep the design's fallback (mount with `display: none`) and check in the spike.
6. `forVisionTasks` with a same-origin path. PARTLY CONFIRMED. Signature: `static forVisionTasks(basePath?: string, useModule?: boolean): Promise<WasmFileset>`. The doc comment says `basePath` is "the directory the Wasm files should be loaded from", and if omitted they load from the host's root directory. The docs' samples use a jsdelivr URL only. A relative path such as `/mediapipe/wasm` is consistent with the description but no sample shows it, so it stays a spike check. Note that the `.d.ts` also has an optional `useModule` flag, which the design did not mention.
7. `close()` on the landmarker. CONFIRMED (d.ts). `FaceLandmarker extends VisionTaskRunner`, which declares `close(): void` ("Closes and cleans up the resources held by this task"). Context7 snippets for other classes (`MPMask`) also describe `close()`. Create the task once and close it once.
### Also confirmed
- `FaceLandmarker.createFromOptions(wasmFileset, options): Promise<FaceLandmarker>`.
- `runningMode: 'IMAGE' | 'VIDEO'` (default IMAGE). `outputFacialTransformationMatrixes` defaults to `false`, and the Context7 guide's live sample reads `video.readyState >= 2` and changes of `video.currentTime` before calling `detectForVideo(video, performance.now())`.
- Version note: npm latest is 1.2.3 (Apache-2.0). One unpkg fetch pinned to `0.10.35` returned a different, small file and was ignored.
### Not confirmed in docs (open for the spike in task 2.3)
- Row-major or column-major order of `Matrix.data`.
- Axis and sign convention of the pose rotation, and whether it includes scale.
- Whether `delegate: "CPU"` runs Face Landmarker successfully in a browser.
- Whether a detached `<video>` works with `detectForVideo`.
- Whether a relative same-origin `basePath` works with `forVisionTasks`.
- `face_landmarker.task` model license (design item, outside this task).
### Follow-ups for the spec
- design.md ("Not confirmed" table and the `readMatrix4` text) says the docs' example shows nested 4x4 arrays. That is now wrong: the type is `{ rows, columns, data: number[] }`. design.md and tasks 2.3 and 2.8 should be updated to read `data`. This task did not edit them.
## attention-signal: Task 2.3 spike results
Manual check by the user on Chrome, MacBook Air. This resolves the open items from Task 2.1 (row or column order, CPU runtime, detached video, relative basePath).
- `Matrix.data` is column-major. The translation is at indices 12 to 14 (about -50 on z). `readMatrix4` reads `matrix.data` and checks `rows === 4`, `columns === 4`, length 16.
- Yaw, read column-major: straight 1.5, left +25.9, right -46.9. Left is positive.
- Pitch, read column-major: straight -0.8, slight down +16.6, up -38.9. Down is positive.
- Looking far down at the keyboard loses the face (`faceFound` false).
- GPU delegate works. CPU delegate works with the same signs (left +43.5).
- wasm loads from the same-origin `/mediapipe/wasm` (200, then 304). No other origin was contacted.
- A detached video works (`isConnected` false, `faceFound` true).
- Console: only a Chrome extension `runtime.lastError` message and MediaPipe startup info and warnings. No errors from our code.
- `design.md` and `tasks.md` (2.4, 2.8) were updated to column-major and to `matrix.data`.
## npm audit (no dependency changes made)
`npm audit` reports 2 vulnerabilities (1 high, 1 moderate), both one chain: `@xmldom/xmldom` (installed 0.7.13, affected <=0.8.14, high) pulled in by `epubjs@0.3.93` (affected 0.3.89 to 0.3.93, moderate, only because it depends on xmldom). The advisories are 15 xmldom ones (XML serialization injection, ReDoS and quadratic time or memory in parsing, for example GHSA-wh4c-j3r5-mjhp, GHSA-2v35-w6hq-6mfw, GHSA-x4fp-j954-r2f4). Path: `intermezzo > epubjs > @xmldom/xmldom`.
`npm audit --omit=dev` gives the same result, because `epubjs` is a runtime dependency (`package.json` line 18), not a dev one. The code is imported in `src/reader/parser.ts` and is bundled into `dist/assets/src-*.js`, so it can reach production. It parses EPUB files the user opens in their own browser, so the exposure is a crafted EPUB causing a slow parse or odd markup in that user's own session. No server parses it. The only offered fix is `npm audit fix --force`, which installs epubjs@0.4.2 (a breaking change). Not run. Decision pending.
### Outcome (override applied)
`npm audit` lists affected versions as <=0.8.14, so the fixed releases are 0.8.15 (lts tag) and 0.9.12 (latest, MIT licence). I added `"overrides": {"@xmldom/xmldom": "0.9.12"}` to `package.json` and ran `npm install`. `npm ls` shows `@xmldom/xmldom@0.9.12 overridden` under epubjs, and `npm audit` reports 0 vulnerabilities. `npx vitest --run src/reader`: 13 files, 69 tests, all passed. epubjs 0.3.93 only uses `DOMParser` from xmldom (`utils/core.js`, `section.js`), and a direct `DOMParser` parse with 0.9.12 works. I did not test an EPUB open in a real browser; do that once manually. If it misbehaves, fall back to 0.8.15, whose API is closer to 0.7.13. epubjs was not upgraded.
### Wasm build
Added a `prebuild` script (`node scripts/copy-mediapipe.mjs`, `postinstall` kept). `public/mediapipe/wasm` is now in `.gitignore` and its four files were untracked with `git rm --cached` (they had been committed). Check: deleted `public/mediapipe/wasm` and `dist`, ran `npm run build`; `dist/mediapipe/wasm` has all four files and `dist/models/face_landmarker.task` is present.

## attention-signal, tasks 2.5 and 2.7: property tests for pose extraction and the detection rate gate
The spike outcome (column-major `Matrix.data`, yaw positive when looking left, pitch positive when looking down) is in "attention-signal: Task 2.3 spike results" above and is not repeated here.
### Run
`npx vitest run src/attention/__tests__/pose.p16.prop.test.ts src/attention/__tests__/rateGate.p15.prop.test.ts`: 2 files, 12 tests, all passed.
### Properties
| Property | Name | File | Tests | Cases | Result |
|---|---|---|---|---|---|
| 16 | Pose extraction round trip | pose.p16.prop.test.ts | 5 property tests x 500 runs (`RUNS = 500`), plus 1 fixed example | 2,500 generated cases plus 1 fixed example | passed |
| 15 | Detection rate gate | rateGate.p15.prop.test.ts | 5 property tests x 300 runs (`NUM_RUNS = 300`), plus 1 constant check (`MIN_DETECTION_GAP_MS` is 100) | 1,500 generated cases plus the constant check | passed |

Property 16 builds its matrices column-major (`R[row][col] = m[col * 4 + row]`, translation at indices 12 to 14), as the spike showed. Its tests cover: yaw and pitch recovered under uniform scale and translation; recovered with independent positive column scales; non-finite entries, fewer than 16 numbers, and a zero-length rotation column all give `faceFound: false`; the fixed example (yaw 30, pitch -20).
Property 15 covers: a hidden tab never allows detection; a visible tab with no previous start always allows it; with a previous start it is allowed if and only if the gap is at least 100 ms; the 99, 100, and 101 ms boundary; and a simulated frame-callback sequence where accepted starts are at least 100 ms apart and never happen while hidden.
### Counterexamples
None for either property.
### Notes
- The pose test was first written for a row-major matrix. After the spike showed the data is column-major, the test (and `pose.ts`) was changed to column-major. No assertion was weakened. The same recovery, non-finite, short-input, and zero-column checks remain.
- Adapter unit tests (`adapters.unit.test.ts`, task 2.10): the task notes said 35+1 cases. The file reports 38 tests passing in a fresh run, so the earlier count is out of date or counted differently. Smoke tests (`smoke.unit.test.ts`, task 2.11): 7 tests passed.
### Full attention suite
- `npx vitest run src/attention`: 18 files, 111 tests, all passed.
- `npx tsc -b`: exit 0, no errors.
## attention-signal, tasks 3.2, 3.5, 3.10: property tests for the signal bus, notices, and pause and resume
### Run
`npx vitest --run src/attention/__tests__/signalBus.p12.prop.test.ts src/attention/__tests__/controller.p13.prop.test.ts src/attention/__tests__/notices.p20.prop.test.ts`: 3 files, 13 tests, all passed.
### Properties
| Property | Name | File | Tests | Cases | Result |
|---|---|---|---|---|---|
| 12 | Signal bus delivery rules | signalBus.p12.prop.test.ts | 8 property tests x 500 runs (`NUM_RUNS = 500`) | 4,000 generated cases | passed |
| 13 | Pause suppresses away, and resume resets the accumulator | controller.p13.prop.test.ts | 1 property test x 400 runs (`NUM_RUNS = 400`), plus 1 fixed example (`stop` from Paused_State) | 400 generated scripts plus 1 example | passed |
| 20 | At most one notice per cause per Session | notices.p20.prop.test.ts | 3 property tests x 300 runs | 900 generated cases | passed |
Property 12 covers: a reference-model comparison over any interleaving of subscribe, unsubscribe, publish, clear, and throwing subscribers; one delivery of the current signal to a new subscriber only; unchanged publish is a no-op; one notification per change in subscription order; timestamps never decrease; a throwing subscriber does not affect others or the value; `clear()` and unsubscribe stop delivery; a reentrant publish keeps the same sequence for every subscriber.
Property 13 runs the real controller (not mocked) with `fakePorts()` over scripts of `start`, `stop`, `pause`, `resume`, `sample`, `advance`, `hide`, `show`.
Property 20 covers: a notice only on the first raise of each kind, with non-empty text; the input state is not mutated; a fresh gate starts a new Session.
### Counterexamples
None for any of the three properties.
### Design decisions flagged during task 3
- A reentrant `publish` (called from inside a subscriber) is queued and delivered after the current delivery finishes, so all subscribers see the same order.
- Publishing an unchanged value keeps the existing timestamp and notifies nobody.
- The bus is created lazily in `start()`, not in `createAttention()`.
- The camera-lost wording in `notices.ts` is new text, not taken from the design.
- `AttentionPorts` was extended with `frames` and `visibility`, beyond the design's list, for the detection loop and the hidden-tab rule.
- The `AttentionStore` shape is defined in `types.ts`.
- `chooseCamera`, `setCameraOn`, `startCalibration`, and `setDebounce` are still placeholders that throw. They get real bodies in these tasks (from `.kiro/specs/attention-signal/tasks.md`): `chooseCamera` in 5.2; `setCameraOn` in 6.1; `startCalibration` and `cancelCalibration` in 9.6 (UI wiring in 9.10); `setDebounce` in 10.1 (UI in 10.2).
### Full attention suite
- `npx vitest --run src/attention`: 24 files, 152 tests, all passed.
- `npx tsc -b`: exit 0, no errors.

### Property 13 one-off failure: not reproducible

The one-off Property 13 failure seen during the parallel 5.2/5.3 run could not be reproduced (30 solo runs, 3 full-suite runs, plus one 10,000-run pass). Treated as a concurrent-edit artifact. The 10,000-run pass executed exactly 10,000 cases in about 191 ms (about 0.5 s total with startup), with no counterexample.

## attention-signal, task 6.1 follow-up: camera-off after a failed track stop
### Fix
- A failed `handle.stop()` no longer drops the camera session. The handle is kept (`src/attention/retainedHandle.ts`); `cameraOn` stays true until every track has stopped. Repeating `setCameraOn(false)` retries the kept handle; success sets `cameraOn` false, Fallback_Mode, and clears `cameraOffError`.
- `setCameraOn(true)` and `openCamera()` do nothing while a handle is kept, so a second camera is never opened.
- While a handle is kept, the detector is closed and the detection loop is gone. The mode switches to Fallback_Mode, so the signal keeps updating from page events and idle time (it does not freeze). `cameraOn` stays true as the indicator.
- The camera-lost and detector-failed path, `chooseCamera(false)`, and `stop()` use the same logic: if the stop throws, `cameraOn` stays true until a later stop succeeds.
- `cameraAdapter.ts`: `createTrackStopper` remembers tracks that stopped and skips them on a repeat `stop()`; tracks that threw are tried again; still stops every track and rethrows the first error.
- Tests: `cameraOff.unit.test.ts`, `trackStopper.unit.test.ts`. `fakes.ts` extended additively (`setTrackCount`, `setTrackFails`, per-track state).
### To check later
- Property 13's generated scripts look very short (10,000 runs in about 191 ms). Check whether the generator should produce longer sequences.

## haunt-feature, task 1.3: generator note (`-0` in test generators)
During task 1.3 the sanity tests for the generators failed twice because of `-0`: `outOfRangeCapTextArb` could produce `-0`, which is not out of range (now stops at `-Number.MIN_VALUE`), and `capArb` could produce `-0`, which broke the text round trip (now maps `-0` to `0`). Both were bugs in the test generators in `src/haunts/engine/__tests__/arbitraries.ts`, not in code under test. Accepted by the user. This is not a property counterexample against code under test.
## haunt-feature, tasks 1.5 and 1.7: generator coverage note (level 2 in Property 4)
A coverage check in the Property 4 test caught that level 2 was almost never generated (`now` was drawn uniformly from a ~3,000,000 ms range while level 2 occupies a 7,000 ms window), so the monotonicity and lead tests rarely crossed the 5 s threshold. Fixed by drawing `now` relative to the away start (offsets weighted toward -1000..20000, plus boundary values 0, 4999, 5000, 11999, 12000). No counterexample against code under test. Only input generation changed; no assertion was touched.
### Task 1.5 (Property 2) check
Property 2 already drew its offset relative to the away start. Measured over one 300-case run: level 1 = 164 (54.7%), level 2 = 59 (19.7%), level 3 = 77 (25.7%). Level 2 is not rare, so nothing was changed.

## haunt-feature, task 1.9: generator coverage note (level 3 with two or more haunts in Property 6)
The Property 6 coverage check caught that level 3 with two or more haunts was under 10% (27 of 300). Gentle mode was drawn about 50% of the time (gentle mode caps the level at 1) and level-0 cases were common. Fixed by weighting `gentle` to false:true = 5:3 (about 37% true). The first attempt, 25% true as approved, made the existing 30% gentle floor fail (71 of 300), so the weight was raised to 37%, which satisfies both floors. No assertion was changed and no floor was lowered or removed. No counterexample against code under test. Coverage over one 300-case run after the fix: level 3 with two or more haunts = 52 (17.3%), level 3 with one haunt = 10, level 2 = 54, level 1 = 116, level 0 = 68, gentle = 98 (32.7%), companion present = 52 (17.3%).
## haunt-feature, task 1.13: Property 9 ratio counterexample (subnormal underflow)
The test "Property 9: the ratio between any two non-zero gains matches their clamped requests" in `src/haunts/engine/__tests__/plan.p09.prop.test.ts` failed. Seed -452344472. Shrunk requests: ee 5.519075373248514e-197, lkthi 0, dtxf 5.519074896707576e-188, apply 0, c 5e-324; cap 5.519075373248516e-197.
Reasoning: the clamped sum exceeds the cap, so `scaleGains` multiplies every gain by a factor of about 0.5. 5e-324 is the smallest subnormal double, and 5e-324 x ~0.5 rounds back to 5e-324, so its ratio to the other gains shifts by about 2x. This is floating-point underflow in the test domain, not a defect in `scaleGains`. Real gains are in 0..1, and the cap and sum guarantees still hold.
Decision (approved by the user): the ratio assertion now compares only pairs whose clamped requests are both at least 1e-200 (`RATIO_FLOOR`). The generator, `plan.ts`, `arbitraries.ts` and all other assertions are unchanged. A precision note was added to Property 9 in design.md.

## haunt-feature, task 1.16: generator coverage note (NaN rates in Property 12)
The first run of the Property 12 coverage check failed on one floor: sets containing a NaN rate were 14 of 300 (4.7%), under the 5% floor (15). The shared `rateRequestsArb` draws NaN rarely. Fixed by input shaping in `plan.p12.prop.test.ts` only: about 1 set in 4 gets one extra bad rate (NaN, Infinity, -Infinity or -1) with key `~bad`. No assertion was changed, no floor was lowered, and `arbitraries.ts` and `plan.ts` are unchanged. No counterexample against code under test. Coverage over one 300-case run after the fix: reduced motion on = 154, off = 146, over budget = 53 (17.7%), within budget = 247, NaN = 61, infinite = 59, negative = 142.
## haunt-feature, task 1.18: nextChangeDelay counterexample and two coverage fixes
### Counterexample against code under test (`levelLogic.p08.prop.test.ts`, "a returned delay raises the level exactly at now + d")
Input: `now: -1`, one `away` event at timestamp 0, `hauntIds: ["a"]`, gentle off. `nextChangeDelay` returned 5000, but at now + 5000 = 4999 the elapsed time is 4999 ms, so the level was still 1.
Cause: `nextChangeDelay` clamped elapsed to 0 when `now` was earlier than the away timestamp (for example a signal timestamp slightly ahead of the engine clock). The engine would wake 1 ms early and recover through a 1 ms timer.
Fix (approved): `nextChangeDelay` uses the unclamped elapsed time (`input.now - start`). `evaluate` is unchanged and keeps `Math.max(0, ...)`. No test was changed for this fix.
### Coverage input fixes (inputs only; no assertion or floor changed)
- `levelLogic.p01.prop.test.ts`, "generators reach levels 0 to 3": level 2 never appeared. The test now draws from `fc.oneof(anyInputArb, relativeInputArb)`. The new branch draws `now` relative to the trailing away start (weighted offsets -1000..20000 plus 0, 4999, 5000, 11999, 12000). The old branch stays, so level 0 still occurs.
- `levelLogic.p08.prop.test.ts` coverage: gentle was 123/300 (41%), above the 40% ceiling. Gentle weight changed from 5:3 to 7:3 (about 30% true).
### Why this appeared late
These failures surfaced on a later full run because seeds are random. The user chose to keep random seeds (no fixed global seed).
### Task 1.18 follow-up: Property 5 coverage test failed once (input shaping only)
`levelLogic.p05.prop.test.ts`, "the generated inputs reach every region the property is about", failed once in a full `src/haunts` run; the message and seed were not captured and 28 solo runs passed. Not reproduced in 1,500 simulated 300-case batches of the same generators (a throwaway script, deleted afterwards), but the measurement showed the cause: shares sat close to their floors.
Before (mean share, standard deviations above the floor, misses in 1,500 batches): level 3 companion 27.2% (floor 20%, 2.9 SD, 1 miss); one haunt 18.3% (floor 10%, 3.8 SD); zero haunts 18.2% (floor 10%, 3.7 SD); consecutive look-aways 50.9% (floor 40%, 3.9 SD); two or more haunts 63.6% (6.2 SD at 5.1); previous lead in list 27.2% (6.5 SD); level 2 35.1% (5.4 SD). The level 3 companion floor was the likely culprit (about 1 miss in 1,500 batches).
Fix (p05 inputs only; no assertion or floor changed; `arbitraries.ts` and `levelLogic.ts` untouched): haunt-list size weights 0:19%, 1:19%, 2 to 5:62%; `gentle` true about 25% (was 50%); one look-away 10% of scenarios (was 20%).
After (1,500 batches, 0 misses): level 3 companion 37.8% (6.3 SD); one haunt 19.0% (3.9 SD); zero haunts 19.0% (4.0 SD); consecutive 55.9% (5.4 SD); two or more haunts 62.1% (4.2 SD); previous lead in list 27.1% (6.7 SD); level 2 49.4% (10.0 SD). The one, zero and two-or-more floors cannot all exceed 4 SD with 300 runs (they must sum to 100%), so they sit at about 3.9 to 4.2 SD, a miss chance near 5e-5 per floor per run. No counterexample against code under test.
### Task 1.22 follow-up: Property 6 coverage test failed once (input shaping only)
`levelLogic.p06.prop.test.ts`, "the generated inputs reach every region the property is about", failed once in a full `src/haunts` run on the `level 3, two or more haunts` floor (10%). Measured with a throwaway script (deleted afterwards), 1,500 batches of 300 cases.
Before (mean share, SD above floor, misses): level 3 two or more haunts 12.8% (floor 10%, 1.4 SD, 89 misses); level 3 one haunt 3.7% (floor 2%, 1.5 SD, 56 misses); level 2 14.3% (floor 10%, 2.1 SD, 17 misses); gentle 37.5% (floor 30%, 2.8 SD, 1 miss); companion 12.8% (floor 10%, 1.4 SD, 89 misses); level 0 27.2% and level 1 42.0% (far above floors). The earlier gentle raise had left the non-gentle share too small.
Fix (p06 inputs only; no assertion or floor changed; `arbitraries.ts` and `levelLogic.ts` untouched): gentle true 42% (was 37.5%); haunt-list size weights 0:8%, 1:28%, 2 to 5:64%; elapsed time weights level 1:5%, level 2:41%, level 3:54% (was a third each); away-ending branch weight 9:1 (was 4:1).
After (1,500 batches, 0 misses): level 3 two or more 19.1% (4.0 SD); level 3 one haunt 8.4% (3.9 SD); level 2 20.0% (4.3 SD); level 1 39.5% (10.5 SD); level 0 13.0% (4.0 SD); gentle 42.0% (4.2 SD); companion 19.1% (4.0 SD). Level 0 and level 3 with one or two or more haunts compete for the same cases, so a uniform 4 SD was not reachable; the lowest is 3.9 SD. No counterexample against code under test.

## haunt-feature, task 1.23: Property 18 zero-area region counterexamples (overlap definition)
Failing test in `src/haunts/engine/__tests__/regions.p18.prop.test.ts`: the safety check that no region overlaps the column.
Counterexample 1: `{width:100,height:0,column:{left:0,right:101,top:0,bottom:0}}` (seeds 363759039, 686407415, 1293822758, 1595410798).
Counterexample 2: `{width:100,height:0,column:{left:-1,right:1,top:0,bottom:0}}` (seeds -1070396569, 976397851).
Cause: the clamped column edge produced a zero-area region (height 0) inside the column's x range, and the test's `overlaps` helper counted it because it only compared the open x interval after widening the column vertically.
Resolution (approved by the user): overlap is defined as a positive-area intersection (overlap width > 0 and overlap height > 0) in the test helper and in Property 18 of design.md. An empty region cannot hold an effect. `computeRegions` (`regions.ts`) and `arbitraries.ts` are unchanged. No other assertion or floor was changed.
## haunt-feature, task 1.25: Property 19 sequence coverage floor missed (input shaping only)
`dialogOrder.p19.prop.test.ts`, sequence test, floor "runs with a dismissal" (at least 400 of 500) failed 4 times out of 4 on the first inputs: 370, 367, 387, 357.
Cause: step array minLength 1 and dismiss weight 2 of 8 produced many short sequences with no dismissal. Measured with a throwaway script (deleted), 200 batches of 500 cases: mean 368.7, SD 9.5, so the floor sat 3.3 SD above the mean.
Fix (inputs only; no assertion or floor changed; `dialogOrder.ts` untouched): step array minLength 6 (was 1); dismiss step weight 3 (was 2).
After (200 batches of 500): mean 491.2, SD 2.8, minimum 483, floor 32 SD below the mean. No counterexample against code under test.

## haunt-feature, task 1.26: summary of property tests for tasks 1.4 to 1.25

### Run
`npx vitest --run src/haunts` on the day of this entry: 18 test files passed, 87 tests passed, 0 failed. The 18 files are the 17 property test files below plus `arbitraries.unit.test.ts`. All property files are in `src/haunts/engine/__tests__/`.

Policy decisions made by the user during this work:
- Random seeds are kept (no global seed). A failing seed is only known if it was captured at the time.
- A shortfall in a coverage-floor check may be fixed by input shaping only. No assertion or floor is weakened.
- Overlap (Property 18) means a positive-area intersection.
- The Property 9 ratio check is restricted to gains of at least 1e-200 (`RATIO_FLOOR`).

### Properties, files and cases run
Cases = sum of `numRuns` over every `fc.assert` block in the file (read from the files; coverage checks are counted because they are also `fc.assert` blocks). Tests that use no `fc.assert` (one default-value check in P13, one empty-storage check in P16) add no cases.

| Task | Property | File | `fc.assert` blocks x numRuns | Cases |
|---|---|---|---|---|
| 1.4 | P1 bounded levels, gentle mode | `levelLogic.p01.prop.test.ts` | 2 x 300 + 1 x 1000 | 1,600 |
| 1.5 | P2 escalation thresholds | `levelLogic.p02.prop.test.ts` | 3 x 300 | 900 |
| 1.6 | P3 present means level 0 | `levelLogic.p03.prop.test.ts` | 4 x 300 | 1,200 |
| 1.7 | P4 monotonic level, stable lead | `levelLogic.p04.prop.test.ts` | 5 x 300 | 1,500 |
| 1.8 | P5 lead variety | `levelLogic.p05.prop.test.ts` | 4 x 300 | 1,200 |
| 1.9 | P6 companion rules | `levelLogic.p06.prop.test.ts` | 5 x 300 | 1,500 |
| 1.10 | P7 determinism, no mutation | `levelLogic.p07.prop.test.ts` | 4 x 300 | 1,200 |
| 1.11 | P8 `nextChangeDelay` | `levelLogic.p08.prop.test.ts` | 3 x 300 | 900 |
| 1.13 | P9 Volume_Cap on combined gain | `plan.p09.prop.test.ts` | 6 x 300 | 1,800 |
| 1.14 | P10 silence when off or locked | `plan.p10.prop.test.ts` | 5 x 300 | 1,500 |
| 1.15 | P11 fade durations | `plan.p11.prop.test.ts` | 4 x 300 | 1,200 |
| 1.16 | P12 flash budget | `plan.p12.prop.test.ts` | 5 x 300 | 1,500 |
| 1.17 | P13 Volume_Cap parsing | `plan.p13.prop.test.ts` | 4 x 300 | 1,200 |
| 1.19 | P16 settings round trip, defaults | `settings.p16.prop.test.ts` | 9 x 300 (includes 2 from `it.each`) | 2,700 |
| 1.21 | P17 registry | `registry.p17.prop.test.ts` | 5 x 300 | 1,500 |
| 1.23 | P18 effect regions | `regions.p18.prop.test.ts` | 7 x 300 | 2,100 |
| 1.25 | P19 dialog order | `dialogOrder.p19.prop.test.ts` | 2 x 500 | 1,000 |
| | Total | 17 files | | 24,500 |

P9, P10 use `maxSkipsPerRun: 1000` on tests with preconditions (P9 two tests, P10 two tests). Tasks 1.12, 1.18, 1.20, 1.22, 1.24 are implementation tasks. Properties 14 and 15 are outside this range.

### Counterexamples and notable fixes (details are in the entries named; not repeated here)
| Where | What | Kind | Seed and shrunk input | Entry above |
|---|---|---|---|---|
| Task 1.3 | `-0` in `outOfRangeCapTextArb` and `capArb` | Test generator bug, not a property counterexample | Not recorded | "task 1.3: generator note" |
| Tasks 1.5 and 1.7 | Level 2 almost never generated in P4 (P2 checked, no change) | Coverage input shaping | Not applicable | "tasks 1.5 and 1.7" |
| Task 1.9 | Level 3 with 2+ haunts under 10% in P6; gentle weight set to 5:3 | Coverage input shaping | Not applicable | "task 1.9" |
| Task 1.13 | P9 ratio underflow with a subnormal gain | Test domain issue; ratio check limited to gains >= 1e-200 | Seed -452344472; requests `ee 5.519075373248514e-197, lkthi 0, dtxf 5.519074896707576e-188, apply 0, c 5e-324`, cap `5.519075373248516e-197` | "task 1.13" |
| Task 1.16 | NaN rates under the 5% floor in P12 (14 of 300) | Coverage input shaping | Not applicable | "task 1.16" |
| Task 1.18 (logged while working on P8, test in task 1.11) | `nextChangeDelay` clamped elapsed time to 0 when `now` was before the away timestamp | Defect in code under test, fixed (approved) | Seed not recorded; `now: -1`, one `away` event at timestamp 0, `hauntIds: ["a"]`, gentle off; returned 5000, level at +5000 was still 1 | "task 1.18: nextChangeDelay counterexample" |
| Task 1.18 | P1 never reached level 2, P8 gentle share over its 40% ceiling | Coverage input shaping (P1 `relativeInputArb`; P8 gentle weight 7:3) | Not applicable | same entry, "Coverage input fixes" |
| Task 1.18 follow-up | P5 coverage check failed once (message and seed not captured) | Coverage input shaping | Not recorded | "Task 1.18 follow-up" |
| Task 1.22 follow-up | P6 coverage floor (level 3 with 2+ haunts) failed once | Coverage input shaping | Not recorded | "Task 1.22 follow-up" |
| Task 1.23 | P18 zero-area regions counted as overlapping the column | Overlap definition (positive-area intersection), approved | Counterexample 1 `{width:100,height:0,column:{left:0,right:101,top:0,bottom:0}}` (seeds 363759039, 686407415, 1293822758, 1595410798); counterexample 2 `{width:100,height:0,column:{left:-1,right:1,top:0,bottom:0}}` (seeds -1070396569, 976397851) | "task 1.23" |
| Task 1.25 | P19 "runs with a dismissal" floor missed (370, 367, 387, 357 of 500, floor 400) | Coverage input shaping | Seeds not recorded | "task 1.25" |

Only two entries are failures against something other than a coverage floor: the P8 `nextChangeDelay` defect (code fixed) and the P18 overlap definition and P9 underflow (test definitions refined with user approval). No assertion was weakened and no floor was lowered in any entry.

### Discrepancies between the request and the existing entries
- The `nextChangeDelay` counterexample is logged under the heading "task 1.18", but the test it came from is Property 8 (task 1.11); task 1.18 is `settings.ts`, so it surfaced on a later full run (the entry explains the late discovery). The request's "(now: -1, away at 0)" matches the entry.
- The P6 shaping is logged as "Task 1.22 follow-up", not task 1.23. The P5 shaping is logged as "Task 1.18 follow-up", under the same heading as the P8 counterexample. The task 1.23 entry is the P18 overlap one only.
- Seeds exist in the log only for P9 (task 1.13) and P18 (task 1.23). The P8 defect, the P5 and P6 coverage misses, and P19 have no recorded seed.
- The task 1.3 `-0` issue and the level-2 coverage notes for P4 are not counterexamples against code under test, as their entries say.

## haunt-feature, task 3.1: API documentation findings

Fetched on the day of task 3.1. MDN pages were read directly (developer.mozilla.org) and compatibility data came from the MDN browser-compat-data JSON on GitHub. Context7 (`/mdn/content`) was used to cross-check the `AudioParam` methods. No code or tests were changed. Sections below are paraphrased.

### Summary

- Every API in the task list is confirmed except two items: reading `param.value` mid-ramp (not described on any page fetched) and the exact rule for a zero-length `createBuffer` (not described). Both are marked "do not rely on" below.
- **Do not use `cancelAndHoldAtTime`.** Firefox has no support (Firefox `version_added: false`, bug 1308431), so a ramp interrupted mid-flight cannot be held in place with it.
- **Do not use `MediaQueryList.addListener` / `removeListener`.** Deprecated. Use `addEventListener('change', ...)`.
- **Do not use `webkitAudioContext`.** The unprefixed `AudioContext` is in Chrome 35, Firefox 25, Safari 14.1. Not needed for the target browsers.
- **Do not use `exponentialRampToValueAtTime` for the fade to zero.** Not fetched here, so no claim is made about it. The gate uses linear ramps as in design.md.
- jsdom 31.0.1 (the project test environment) defines none of `AudioContext`, `webkitAudioContext`, `ResizeObserver`, `matchMedia`. Task 3.3 fakes must cover all three.

### AudioContext (constructor, `state`, `resume()`, `close()`, `currentTime`, `destination`)

- Constructor: `new AudioContext()` or `new AudioContext(options)`. Options: `latencyHint`, `sampleRate` (3000 to 768000 Hz), `renderSizeHint`, `sinkId`. Throws `InvalidStateError` if the document is not fully active, `NotSupportedError` for an unsupported `sampleRate` or `renderSizeHint`. Chrome throws `TypeError` for a bad `latencyHint`. The adapter calls it with no options. A throw means "not ready" (design: failure table, Req 8.7), so the factory call must be inside try/catch.
- `state`: `running`, `suspended`, `closed`, or `interrupted`. `interrupted` is set by the browser when something outside the page pauses audio (a call, a closed laptop lid; iOS Safari does it when the user leaves the page). It needs `resume()` like `suspended`. The adapter must treat any state other than `running` as "not producing sound" and not only compare to `'suspended'`. Listen to `onstatechange` / the `statechange` event to follow changes.
- `resume()`: returns a Promise. It resolves when the context is running again and rejects if the context is already closed. Handle the rejection (catch) so a closed context cannot raise an unhandled rejection. Baseline widely available (Chrome 41, Firefox 40, Safari 9).
- `close()`: returns a Promise, releases system audio resources, stops time. `OfflineAudioContext` throws `INVALID_STATE_ERR`; not relevant here. After `close()`, `resume()` rejects. What `close()` does when called on an already closed context is not stated on the page; guard with a `state !== 'closed'` check and do not rely on it.
- `currentTime`: seconds on the audio timeline, starting at 0. It advances in render blocks (128 frames, about 2.7 to 2.9 ms), so repeated reads can return the same value. It stops advancing while the context is suspended. It is separate from `Date.now()` and `performance.now()`. Firefox may round it (1 ms default, 16.667 ms with resistFingerprinting). Do not compare it with the engine clock (`performance.timeOrigin + performance.now()`); use it only to schedule `AudioParam` events.
- `destination`: read-only `AudioDestinationNode`. Only `audioAdapter.ts` may touch it (design and tasks 3.4).
- Autoplay: browsers allow audio only after a user interaction, a muted or zero-volume start, or an allowlist. Starting playback outside a user input is subject to the autoplay rules. Chrome (since 71) creates an `AudioContext` made before the first user gesture in the `suspended` state and needs `resume()` after the gesture. Creating the context inside the gesture handler is the alternative; Chrome's guidance is to check `state` after creation (`running` means allowed, `suspended` means not yet). Chrome's article says the set of events that count as a gesture is not defined consistently across browsers and recommends `click`. design.md uses `pointerdown` and `keydown`. MDN's autoplay guide says "clicking, tapping, pressing keys, etc."; a `pointerdown` or `keydown` is reasonable but not guaranteed in every browser. Safari and Firefox gesture rules were not found in the fetched pages. Plan: on unlock, create the context if needed, call `resume()`, and treat the context as ready only when `state === 'running'` (listen to `statechange`), instead of assuming `resume()` succeeded.
- Browser support (BCD): constructor Chrome 35, Firefox 25, Safari 14.1 (earlier Safari had only `webkitAudioContext`). Edge follows Chrome.
- Sources: https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/AudioContext , https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state , https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume , https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/close , https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/currentTime , https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/destination , https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay , https://developer.chrome.com/blog/autoplay , https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/AudioContext.json

### GainNode

- One input, one output. `gain` is an a-rate `AudioParam`. Setting `gain.value` directly applies at once and can click. MDN says to use `AudioParam` automation instead. Baseline widely available (July 2015).
- Gotcha: any gain change, including the cap change (50 ms) and sound off (150 ms), must go through a ramp, never `gain.value = x`.
- Source: https://developer.mozilla.org/en-US/docs/Web/API/GainNode

### AudioParam

- `setValueAtTime(value, startTime)`: instant change at `startTime`. If `startTime` is before `currentTime` the change happens immediately. A negative `startTime` throws `TypeError`. Returns the `AudioParam` (older implementations return `undefined`, so do not chain). Baseline widely available (July 2015).
- `linearRampToValueAtTime(value, endTime)`: linear change that starts at the time of the previous scheduled event and ends at `endTime` with `value`. `endTime` is an absolute time on the context clock (the example uses `currentTime + 2`). MDN labels it "limited availability" without a visible per-browser table in the fetched text, and the BCD entry for this method was not read. Per-browser support for the ramp is therefore not confirmed here, although `setValueAtTime` is Baseline. Task 3.4 should check the BCD (`api/AudioParam.json`) or test in Firefox and Safari by hand.
- **Gotcha: a ramp starts from the previous event, not from "now".** If no event precedes it, or the previous event is far in the past, the ramp can start from an unintended point. Required pattern before every ramp: `cancelScheduledValues(now)`, then `setValueAtTime(current, now)`, then `linearRampToValueAtTime(target, now + durationSeconds)`.
- `cancelScheduledValues(startTime)`: cancels all events scheduled at or after `startTime`. Does not set a value. Returns the `AudioParam` (older ones return `undefined`). The page does not say what value the parameter holds afterwards, so the value to anchor with must be known by the adapter (see next point).
- **Reading the current value is not confirmed.** None of the fetched pages states what `param.value` returns while a ramp is running. Do not rely on `param.value` for "the current value" mid-ramp. The adapter should compute the in-flight value itself from the start value, target, start time and end time of the ramp it scheduled, or track the last-set target when no ramp is active. Task 3.3's fake `AudioParam` should record the calls so this can be tested. This is a difference from design.md ("from the current value"); see below.
- `cancelAndHoldAtTime(cancelTime)`: documented (cancels future changes and holds the value at that time), but BCD shows Chrome 57, Safari 14.1, and **Firefox not supported**. Mark: **do not use**.
- Units: all times are seconds on the `AudioContext` clock, so convert from the plan's milliseconds (`ms / 1000`).
- Sources: https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/linearRampToValueAtTime , https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setValueAtTime , https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/cancelScheduledValues , https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/cancelAndHoldAtTime , https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/AudioParam.json (Context7 `/mdn/content` agreed on the ramp, cancel and hold descriptions)

### DynamicsCompressorNode

- One input, one output, channel count mode `clamped-max`, count 2. Parameters are k-rate `AudioParam`s: `threshold`, `knee`, `ratio`, `attack`, `release`. `reduction` is a read-only float. Created with `ctx.createDynamicsCompressor()` or the `DynamicsCompressorNode` constructor. Baseline widely available.
- Gotcha: it is a limiter-like safety net only. It does not replace the gain cap computed in `plan.ts`; the cap is enforced by the gain values. Default parameter values were not confirmed on the page, so the adapter should set `threshold`, `ratio`, `attack` and `release` explicitly if it needs a specific behaviour.
- Source: https://developer.mozilla.org/en-US/docs/Web/API/DynamicsCompressorNode

### AudioBuffer and `createBuffer` (for `noise.ts`, task 3.2)

- `ctx.createBuffer(numberOfChannels, length, sampleRate)`. `length` is in sample frames: seconds times `sampleRate`. All browsers must support at least 1 to 32 channels and 8000 to 96000 Hz. Throws `NotSupportedError` for negative or invalid values and `RangeError` if memory cannot be allocated.
- `buffer.getChannelData(channel)` returns a `Float32Array` of the live sample data. Samples are 32-bit floats, nominal range -1 to 1. `copyToChannel` also exists. Buffers are meant for short sounds (about 45 seconds or less).
- Gotchas: use `Math.round(seconds * ctx.sampleRate)` (length must be an integer), use `ctx.sampleRate` as the third argument, and guard against `seconds <= 0` or non-finite values before calling (zero length behaviour is not stated on the page, so it is not relied on). Fill with values in [-1, 1].
- Sources: https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/createBuffer , https://developer.mozilla.org/en-US/docs/Web/API/AudioBuffer

### `window.matchMedia('(prefers-reduced-motion: reduce)')`

- `matchMedia(query)` returns a `MediaQueryList`. Feature expressions must be in parentheses. `mql.matches` is the instant answer; the `change` event fires when the result flips, and its event object has `matches`.
- Use `mql.addEventListener('change', cb)` and `removeEventListener`. `addListener` and `removeListener` are deprecated aliases for old browsers where `MediaQueryList` was not an `EventTarget`. **Do not use `addListener`.** `MediaQueryList` is Baseline widely available (July 2015).
- Gotcha: `window.matchMedia` is absent in jsdom, and the adapter must also handle a missing function (design: returns false). The `prefers-reduced-motion` media feature itself was not separately fetched; it is the same string design.md already uses in CSS.
- Sources: https://developer.mozilla.org/en-US/docs/Web/API/Window/matchMedia , https://developer.mozilla.org/en-US/docs/Web/API/MediaQueryList , https://developer.mozilla.org/en-US/docs/Web/API/MediaQueryList/addListener

### ResizeObserver

- `new ResizeObserver(callback)`, with `observe(element)`, `unobserve(element)` and `disconnect()`. The callback gets an array of entries; use `entry.contentBoxSize[0]` (`inlineSize`, `blockSize`) and fall back to `entry.contentRect` if `contentBoxSize` is missing. The callback runs before paint. A callback that resizes what it observes can loop; the browser then fires a window `error` event with "ResizeObserver loop completed with undelivered notifications". Setting only size-independent state, or deferring with `requestAnimationFrame`, avoids it.
- Support (BCD): Chrome 64, Firefox 69, Safari 13.1, Edge follows Chrome. Not in jsdom.
- Gotcha: `HauntStage` should call `disconnect()` in its cleanup, and feature-detect `typeof ResizeObserver !== 'undefined'` (design: fallback is a 65ch estimate).
- Sources: https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver , https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/ResizeObserver.json

### `storage` event

- Fires on `window` when another document sharing the same storage area changes it. It does **not** fire in the document that made the change. For `localStorage` it fires in all other browsing contexts of the same origin (other tabs included). For `sessionStorage` only in same-tab frames. It does not bubble and cannot be cancelled. The event is a `StorageEvent`. Baseline widely available (April 2017).
- Gotcha: `refreshVolumeCap()` on the `storage` event only reacts to changes from another tab. Same-tab writes must call `refreshVolumeCap()` directly (design: "There is no function in this spec that writes `rod_volume_cap`", so no same-tab path exists today). Filter on `event.key === 'rod_volume_cap'` or `event.key === null` (null for `clear()`; not stated on the page, so treat as a safe extra case rather than a documented one).
- Source: https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event

### Test environment check (jsdom)

- `vite.config.ts`: `test.environment: 'jsdom'`, `globals: true`, `setupFiles: ['src/test/setup.ts']`. `src/test/setup.ts` only imports `@testing-library/jest-dom/vitest`. It defines no audio, `matchMedia` or `ResizeObserver` stubs. jsdom version 31.0.1.
- Checked by constructing a `JSDOM` window in node: `AudioContext` undefined, `webkitAudioContext` undefined, `ResizeObserver` undefined, `matchMedia` undefined, `MediaQueryList` undefined, `Element.prototype.animate` undefined. `StorageEvent` and `localStorage` are defined.
- Consequence for task 3.3: the fakes must supply a fake `AudioContext` (nodes, `AudioParam` automation recording, `state`, `currentTime`, `resume`, `close`, `destination`), a fake `matchMedia` (`matches`, `addEventListener('change')`, `removeEventListener`), and a fake or stubbed `ResizeObserver` for any component test. They must be passed in through the `GateDeps` factories, not installed on `window`, so the "unavailable" paths in design.md stay testable too.

### Discrepancies with design.md

1. design.md (audio adapter paragraph and Property 14) says gains change "with `linearRampToValueAtTime` from the current value". MDN confirms the ramp starts at the previous event, so the adapter must anchor with `cancelScheduledValues(now)` plus `setValueAtTime(current, now)`. Reading "current" from `param.value` mid-ramp is unconfirmed, so the adapter should compute it from its own schedule. design.md does not state either point. No design.md edit made; flagged for the orchestrator.
2. design.md says the unlock "creates the context if needed and calls `resume()`". It does not mention the `interrupted` state, or that `resume()` can reject. The adapter should treat "ready" as `state === 'running'` and catch the rejection. Same for creation failure: wrap the constructor in try/catch (design already says "cannot be created" gives not ready).
3. design.md and the haunt-safety steering file use `pointerdown` and `keydown` as the unlock gestures. The Chrome article recommends `click` and says the gesture list is not consistent across browsers. Not a conflict with the docs, but a `resume()` that does not reach `running` after the first `pointerdown` or `keydown` should not be treated as final; the `once` option on the listener would then leave audio locked. This is a risk to confirm by hand in Safari and Firefox.
4. design.md's "storage event" mention in `refreshVolumeCap` is correct for other tabs only. The event never fires in the writing tab.
5. No other mismatch found for `matchMedia` (design already uses a `change` subscription and a false fallback) or `ResizeObserver` (design already has the missing-API fallback).

## haunt-feature, task 3.3: fakes sanity test expectation corrected
The sanity test in `src/haunts/engine/__tests__/fakes.unit.test.ts` had a wrong expectation. It expected 0.4 for `maxValueOver(1, 3)` after a jump down at t=1. The correct value is 0.1, because the 0.4 left limit is approached from t < 1, outside [1, 3]. The fake was correct. The expectation was corrected and the test renamed to "maxValueOver includes the left limit only when the interval starts before the jump". Approved by the user. The preceding `maxValueOver(0, 3)` assertion (0.4) covers the left-limit case. Not a counterexample against code under test.
### Open items flagged in 3.3
- `GateDeps` is not yet in code. The fakes follow the shapes in `types.ts` and `reducedMotion.ts`.
- The fake throws `TypeError` for negative times in all three automation methods. The spec may use `RangeError` for `cancelScheduledValues`.
- `createBuffer` with length < 1 throws in the fake. This is unconfirmed in the docs.
- design.md mentions `port.fadeOut`, which is not in `GatePort`. To be decided with the user.

## haunt-feature, task 3.6 rework: `GatePort.fadeOut` and restricted audio context
Two decisions approved by the user.
1. `GatePort.fadeOut(ms)` added in `types.ts`. It fades only that port's audio and visuals to 0 over `planFadeOut(ms)` (at most 800 ms in every mode), then the port ignores further audio and visual requests. It does not release the port; `close()` does. In `gate.ts`, `fadeOutAll` and `port.fadeOut` share `fadePort` and `replanAfterFade`. This resolves the open item "design.md mentions `port.fadeOut`" from task 3.3. `createFakeGate` ports now record `fadeOut(ms)` in `port.fadeOuts` and in `gate.calls` (`{ type: 'fadeOut', hauntId, ms }`).
2. `AudioOut.whenReady` now calls `cb(ctx: HauntAudioContext)` instead of `cb(ctx: AudioContext, input: AudioNode)`. Types are in `engine/hauntAudio.ts`; the wrappers are built in `engine/gate/restrictedAudio.ts`. Haunts get wrapper objects only (buffer source, biquad filter, stereo panner), never a real node, so no `.context` or `destination` is reachable. `connect` accepts only a wrapper of the same port or `ctx.input`, and throws `TypeError` otherwise. `ctx.input` has no `connect`. `noise.ts` is unchanged and works with `ctx.createBuffer` and `ctx.sampleRate`. `audioAdapter.ts` passes `rec.restricted` (created in `attach` in `audioGraph.ts`). The static scan (task 5.4) will allow `.destination` in `audioAdapter.ts` and `audioGraph.ts`.
3. New test `engine/__tests__/restrictedAudio.unit.test.ts` (3 tests, real audio adapter on the fake `AudioContext`): no `destination`, `context` or routing factories on the context or any wrapper (own and inherited properties and reachable values walked); connecting to a raw node, `destination`, another port's wrapper or input, or a non-node throws; the chain source, filter, panner, input has exactly one path to `destination` through channel gain, master gain and compressor. No counterexamples. No change to `fakes.ts` was needed for this test.
4. Fake changes in `fakes.ts` (interface changes only): `FakeGatePort.fadeOuts`, `fadeOut`, `GateCall` variant `fadeOut`, and `fireReady(ctx: HauntAudioContext)` / `readyCallbacks` typed with the new callback.
## haunt-feature, task 4.3: coverage fix in p08 and Property 20 added
### p08 coverage test: gentle share (input shaping only)
- Failure seen once: `levelLogic.p08.prop.test.ts`, "gentle at least 25%". Gentle was weighted 7:3 (30%) with a 25% to 40% band and 300 runs.
- Before (7:3, 300 runs, 3000 batches measured with a throwaway script outside `src/`): mean 30.0%, SD 2.67%. The lower edge was 1.87 SD away, the upper edge 3.73 SD away. 74 of 3000 batches (2.5%) fell outside the band.
- After (27:13 = 32.5%, coverage test at 1000 runs, 3000 batches): mean 32.5%, SD 1.46%, 5.13 SD from 25% and 5.12 SD from 40%. 0 of 3000 batches outside the band.
- Changed: the weights and a new `COVERAGE_RUNS = 1000` used only by the coverage test. The other two p08 tests still use 300. No assertion, floor or band changed. The throwaway script was deleted.
### Property 20 (`engine.p20.prop.test.ts`, helper `engineScript.ts`)
- Real `createHauntEngine`, real `createSettingsStore` over a fake storage, fake haunts, fake gate, fake clock and scheduler. 200 scripts for the property, 1000 for the coverage check.
- Model decisions: arming is one-way (the notice is dismissed once, Req 8.3), so "not armed" only happens before arming. Time moves through `scheduler.advance` and `fireNext`, so timers fire on time. A retiring haunt (running but neither lead nor companion) may only appear when `present` arrives or when gentle turns on (then only the previous companion). It must be gone 800 ms later, or 50 ms after a new look-away begins.
- Mutation check (copies under a throwaway directory, deleted): removing the flush on a new look-away, removing the restart flush, skipping retiring haunts in `closeAll`, keeping the timer on `stop()`, and skipping the retire of the companion on gentle-on were each caught by the test.
- Counterexamples: none.

## haunt-feature, task 4.5: summary of tasks 3 and 4

### Run
`npx vitest --run src/haunts`: first run 21 files, 104 passed, 1 failed (the p07 coverage check, see below). After the input fix, a second full run: 21 files, 105 tests, all passed. Task 3.7 and task 4.4 (optional unit tests) are not written.

### Property 20 added
- File: `src/haunts/engine/__tests__/engine.p20.prop.test.ts` (helper `engineScript.ts`). Two `fc.assert` blocks: the property at 200 scripts (`NUM_RUNS`) and the coverage check at 1000 scripts (`COVERAGE_RUNS`). Total 1,200 cases. Read from the file.
- Counterexamples: none. The existing task 4.3 entry records none, and none were seen in the runs for this entry. No seed or shrunk input exists to record.
- Model and mutation details: see "task 4.3: coverage fix in p08 and Property 20 added".

### Task 3.1 findings (summary; full detail in "task 3.1: API documentation findings")
- Do not use `cancelAndHoldAtTime` (no Firefox support), `MediaQueryList.addListener`, or `webkitAudioContext`.
- A ramp starts at the previous event, so each ramp needs `cancelScheduledValues`, `setValueAtTime`, then `linearRampToValueAtTime`. Reading `param.value` mid-ramp is not confirmed in the docs, so the adapter tracks its own schedule.
- "Ready" means `state === 'running'`; `resume()` can reject; `interrupted` is a state; `new AudioContext()` can throw.
- jsdom has no `AudioContext`, `matchMedia` or `ResizeObserver`, so the fakes supply them.
- Five discrepancies with design.md are listed at the end of that entry.

### Later task 3 and 4 decisions
- 3.3 fakes expectation: `maxValueOver(1, 3)` expected 0.1, not 0.4. The fake was right and the test was wrong. See "task 3.3: fakes sanity test expectation corrected".
- 3.6 user decisions: (1) `GatePort.fadeOut(ms)`, at most 800 ms; (2) a restricted `HauntAudioContext` with wrappers, tested by `restrictedAudio.unit.test.ts`. The static scan (task 5.4) stays as a second guard and allows `.destination` only in `audioAdapter.ts` and `audioGraph.ts`. See "task 3.6 rework".
- 3.4 unlock listener: the listener on `pointerdown` and `keydown` (capture) is not `once`. It stays attached until `dispose`, and a failed `resume()` or a failed context creation leaves the audio locked and tries again on the next gesture (`audioAdapter.ts`, `unlock`, `arm`). This follows discrepancy 3 in the task 3.1 entry. Compressor settings (`audioTypes.ts`, `LIMITER`): threshold -6 dB, knee 6, ratio 20, attack 0.003 s, release 0.25 s, set with `setValueAtTime`. Cap change ramps in 50 ms and sound off in 150 ms.
- 3.5 SVG: `gate/svgMarkup.ts` parses the string as `image/svg+xml` with `DOMParser` (no `innerHTML`) and copies only allow-listed elements and attributes into the stage. Event-handler attributes, external references (`http:`, `data:`, `javascript:`, `//`) and non-fragment `href` values are dropped; a rejected string gives `null`.
- 4.1 engine choices (`engine.ts`, `engineRoster.ts`): `running` includes retiring haunts; retiring haunts are flushed in two steps (a retiring instance of an id is stopped before that id starts again, and a new look-away shortens every remaining fade to 50 ms, `FLUSH_MS`); a haunt whose start or `setLevel` failed is not retried within the same look-away (`failed` set, cleared on the next look-away).
- 4.2 p08 flake and 4.3 p08 fix: the gentle share check failed once (30% gentle, band 25% to 40%, 300 runs; 2.5% of batches missed). The fix: gentle weighted 27:13 (32.5%), coverage check at 1000 runs, 0 of 3000 batches outside the band. See "task 4.3: coverage fix in p08".
- 4.3 mutation check: five mutants. The property test catches four (no flush on a new look-away, no restart flush, retiring haunts skipped in `closeAll`, timer kept on `stop()`). The mutant that skips retiring the companion on gentle-on is caught only by the coverage check (user-supplied; see discrepancies).
- Arming is modelled one-way only (the notice is dismissed once, Req 8.3).

### Coverage input fix found in this run (input shaping only)
`levelLogic.p07.prop.test.ts`, "the generated inputs reach every level and both gentle settings", failed once on the level 2 floor (10%): level 2 was 26 of 300 (8.7%); l0 87, l1 123, l3 64, gentle 113, companion 49. Seed not captured. Cause: the three elapsed ranges were equally weighted, but gentle mode (about 37%) and empty haunt lists remove cases from level 2. Fix: `elapsedArb` weights 2:4:3 for levels 1:2:3 (was equal). No assertion or floor changed; `levelLogic.ts` and `arbitraries.ts` untouched. After the fix: 25 solo runs of the file all passed, then the full `src/haunts` run passed. No share measurement with a throwaway script was made this time, so the margin over the floor is not quantified.

### Open items for later tasks
- No tests exercise the real gate's `port.fadeOut` or close semantics (task 3.7 is optional and skipped).
- Manual check in Safari and Firefox of the retrying unlock listener (not done).
- `HauntParam` has no `setTargetAtTime` or exponential ramps. Adding them would be an engine edit.
- `fakes.ts` is 939 lines (large).
- The stage stylesheet with `@keyframes`, `.is-sweeping` and `.is-guttering` belongs to task 6.1.
- Disarm (`noticeSeen` going back to false) is not tested.

### Discrepancies between the request and the existing entries
- Before this entry there was no log entry for 3.4 (unlock retry, compressor settings), 3.5 (SVG allow-list), 4.1 choices, or the 4.2 flake as a separate item. These were written above from the code (`audioAdapter.ts`, `audioTypes.ts`, `svgMarkup.ts`, `engine.ts`, `engineRoster.ts`), not from earlier entries. The 4.2 flake and 4.3 fix share the "task 4.3" entry.
- The task 4.3 entry says all five mutants "were each caught by the test". It does not say that the gentle-on companion retire mutant is caught only by the coverage check. That detail comes from the request and was not re-run.
- The 3.4 design change is recorded in the 3.1 entry only as a risk (discrepancy 3), not as a decision.
- `fakes.ts` is 939 lines, not 929 as in the request.
- The task 3.6 entry says the `HauntAudioContext` types are in `engine/hauntAudio.ts` and that `audioAdapter.ts` passes `rec.restricted`; not re-verified here.
