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
- `fallback.ts` treats a non-finite `lastInputT` as not idle. design.md and the requirements are silent on this. No test depends on it.
- The internal trace helper in `decision.p04.prop.test.ts` tracks `lastT` from null instead of from `startT`. The current generators never produce samples before `startT`, so the test passes. It would misjudge such samples.
- Property 14 checks that a carried signal stays unchanged until its value flips. It does not assert that a flip happens in any case.
- Other changes made with user approval: the task 1.2 text in tasks.md was updated for "stale before session start". The unused `th` parameter was removed from `sampleAt` in `decision.p08.prop.test.ts`, with no assertion change.
