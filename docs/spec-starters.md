# Spec starters

Kiro writes the real spec files (requirements.md, design.md, tasks.md) inside
`.kiro/specs/<name>/`. Create each spec in Kiro and paste the matching starter
below as your description. Review what Kiro produces, correct it, then run the
tasks one at a time.

Keep notes on what Kiro got right and wrong. The submission write-up asks how
specs compared with vibe coding.

---

## Spec 1: reader-core (build first)

Build the reading flow for a browser app with no backend.

User stories and acceptance criteria:

1. As a reader, I want to load my own book so I can read it here.
   - WHEN the user selects a .txt file THE SYSTEM SHALL load it in the browser
     without uploading it anywhere.
   - WHEN the user selects an .epub file THE SYSTEM SHALL extract chapters and
     text in reading order.
   - IF the file cannot be read THEN THE SYSTEM SHALL show a plain error and
     keep any book already loaded.

2. As a reader, I want one paragraph at a time so I stay focused.
   - THE SYSTEM SHALL split each chapter into paragraphs without losing or
     reordering text.
   - WHEN a chapter opens THE SYSTEM SHALL show only the first paragraph.
   - WHEN the user clicks the paragraph or presses Space/Enter THE SYSTEM SHALL
     reveal the next paragraph and dim the earlier ones.
   - THE SYSTEM SHALL let the user scroll back to reread earlier paragraphs.

3. As a reader, I want a gentle pace guide.
   - WHERE the pace guide is enabled THE SYSTEM SHALL show a small timer icon
     with a suggested time based on the paragraph's word count and the user's
     own average pace.
   - THE SYSTEM SHALL NOT block or penalize the user when the time runs out.

4. As a reader, I want to continue where I stopped.
   - WHEN the user returns THE SYSTEM SHALL restore the book, chapter, and
     paragraph from local storage.
   - THE SYSTEM SHALL show progress as a percentage of the book.

Constraints: pure functions for parsing, splitting, pace, and progress, each
with fast-check property tests listed in the testing steering file.

---

## Spec 2: attention-signal

Detect whether the reader is facing the screen and expose a single signal.

1. WHEN the user starts a session THE SYSTEM SHALL explain why the camera is
   used and ask permission.
2. WHILE the camera is on THE SYSTEM SHALL show a visible indicator.
3. THE SYSTEM SHALL run a short calibration (look at the page, then look away)
   to set this user's thresholds.
4. WHEN no face is found, or the head is turned away beyond the threshold, for
   longer than the debounce time THE SYSTEM SHALL emit `away`.
5. WHEN the reader faces the screen again THE SYSTEM SHALL emit `present`
   within one second.
6. IF camera permission is denied THEN THE SYSTEM SHALL fall back to tab
   visibility and idle time to produce the same signal.
7. THE SYSTEM SHALL process frames on-device and never store or send them.

Constraints: the decision logic (landmarks/pose in, present/away out) is a pure
function tested with generated input sequences.

---

## Spec 3: haunt-engine

Turn the attention signal into escalating, varied, safe haunts.

1. WHILE the signal is `away` THE SYSTEM SHALL raise the haunt level in steps
   over time up to a maximum.
2. WHEN the signal becomes `present` THE SYSTEM SHALL return to level 0 within
   one second.
3. THE SYSTEM SHALL choose a haunt that differs from the previous one when
   more than one is available.
4. A haunt SHALL be a single file exporting: id, levels supported, a start
   function, and a stop function.
5. WHEN a new haunt file is added THE SYSTEM SHALL discover it without changes
   to the engine.
6. THE SYSTEM SHALL enforce the volume cap, fade-in, flash-rate, and
   reduced-motion rules from the haunt-safety steering file for every haunt.
7. WHERE gentle mode is on THE SYSTEM SHALL never exceed level 1.

First three haunts: the candle dims and gutters; whispers fade in from one
side; a shadow crosses the edge of the page.

---

## Spec 4: chapter-visitor (stretch, after the gate on Nov 24)

When a chapter is finished, a character from it visits and the reader can
talk with them. This is the reward for finishing, never shown mid-chapter.

1. WHEN the reader finishes a chapter THE SYSTEM SHALL offer a visit from one
   character who appears in that chapter.
2. THE SYSTEM SHALL show the visitor as a portrait whose pose and lighting
   match the mood of the chapter's final scene (calm, tense, sad, joyful).
3. WHEN the reader sends a message THE SYSTEM SHALL reply in that character's
   voice and manner as written in the book.
4. THE SYSTEM SHALL give the visitor only the text the reader has finished, so
   it cannot reveal later events.
5. IF the reader asks about something not in the text read so far THEN THE
   SYSTEM SHALL have the character say they do not know, in character.
6. THE SYSTEM SHALL label the visitor's replies as AI-generated, not the
   author's words.
7. THE SYSTEM SHALL tell the reader, before the first visit, that the text
   read so far is sent to an AI service for this feature, and let them decline.
8. THE SYSTEM SHALL limit each visit to a fixed number of messages and let the
   reader end it at any time.
9. IF the AI service fails or the reader declines THEN THE SYSTEM SHALL show
   the fill-in-the-blank check instead.
10. THE SYSTEM SHALL call the AI service only through a server function that
    holds the key. The key SHALL never appear in browser code.

Property tests: for any reading position, the context sent contains no text
beyond that position; the message count never exceeds the limit; the fallback
always triggers on a failed call.

---

## Spec 5: discipline-loop (after the gate on Nov 24)

Rewards, a penance for breaking focus, points, and rest breaks.

Definitions: a "breach" is a look-away that lasts longer than the breach time
(default 20 seconds), or more than the allowed number of look-aways in one
chapter (default 5). Both are settings.

1. WHEN the reader finishes a chapter with no breach THE SYSTEM SHALL award
   focus points and show a short reward (a new candle, a calmer room, or a
   word of praise from the guide).
2. THE SYSTEM SHALL also award a small number of points for each paragraph
   read while present.
3. WHEN a breach occurs THE SYSTEM SHALL pause the book and require a penance
   before the next paragraph opens.
4. The penance SHALL be a short haunt scene (10 to 15 seconds) that follows
   every rule in the haunt-safety steering file.
5. WHERE the reader has enough points THE SYSTEM SHALL offer to spend them to
   skip the penance, and show the cost before they choose.
6. THE SYSTEM SHALL never let the point balance go below zero.
7. WHERE gentle mode or reduced motion is on THE SYSTEM SHALL replace the
   penance scene with a calm 10-second pause.
8. WHEN the reader has finished 5 chapters or 100 pages since the last break,
   or has read for 45 minutes, whichever comes first, THE SYSTEM SHALL suggest
   a break: stand, stretch, drink water.
9. THE SYSTEM SHALL offer the break at the end of a paragraph, never mid-
   paragraph, and let the reader postpone it once.
10. WHILE a break is in progress THE SYSTEM SHALL pause attention detection so
    that leaving the screen is not a breach.
11. THE SYSTEM SHALL keep points, streaks, and break history in local storage.

Property tests: the balance is never negative for any sequence of earn and
spend events; a penance is required after every breach unless points were
spent; no breach is recorded during a break; a break is always offered before
the limits are exceeded by more than one paragraph.

---

## Smaller specs (after the gate on Nov 24)

- mood-lighting: a pure function labels each paragraph calm, tense, sad, or
  joyful from its words (a word list, no AI); the page's light and ambience
  follow it with slow transitions. This is rough by nature; say so.
- word-help: tap a word for a simple meaning; if a paragraph takes much longer
  than the reader's pace, offer meanings for its rarest words.
- chapter-check: one fill-in-the-blank made from the chapter text, plus
  session stats (paragraphs read, look-aways, time).
- highlights: a button (and the H key) marks the current paragraph; highlights
  are saved locally and listed at the end of the chapter.

---

## Parked: gesture highlight (only after everything above works live)

One gesture only: a pinch held for half a second highlights the current
paragraph. The highlight button stays as the primary way.

1. WHERE gesture mode is on THE SYSTEM SHALL highlight the current paragraph
   when a pinch is held for the hold time.
2. THE SYSTEM SHALL ignore gestures shorter than the hold time and shall not
   repeat a highlight until the hand is released.
3. THE SYSTEM SHALL show a brief confirmation and an undo for each gesture
   highlight.
4. Gesture mode SHALL be off by default.

Before building, measure frame rate with face and hand tracking running
together on an ordinary laptop. If reading feels slower, do not ship it.

---

## Hook to create in Kiro (do not hand-write the hook file)

"When a file is added under src/haunts/, check it exports the Haunt interface,
add it to the haunt list in the README, generate property tests for the safety
rules, and append an entry to docs/BUILD_LOG.md."

Record this hook working on screen. It belongs in the demo video.
