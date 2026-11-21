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
