---
inclusion: always
---

# Testing: no fake tests

A green test must mean the behavior works.

## Forbidden

- Tests that only check an import or that an object exists.
- Wrapping logic in a broad try/catch that returns null or a default.
- Returning early with a placeholder to satisfy a type.
- Weakening or deleting a failing test to make it pass.
- Mocking the function under test.

If a test fails and the cause is unclear, stop and report it. Do not "fix" it
by changing the assertion.

## Proportionate testing

Keep tests proportionate to risk.

- Use property tests for logic where a bug could hurt the reader: timing,
  safety limits, saved progress, and text never being lost.
- For simple code such as fixed lists, layout and UI wiring, a few example
  tests are enough.
- Spend about 30 minutes at most on any single test file. If it needs more,
  stop and ask the user.
- Coverage floors are needed only for property tests that remain.

## Property-based tests (fast-check)

Write these for pure-logic modules where a bug could hurt the reader (see
Proportionate testing). Starting list:

Reader
- Splitting a book into paragraphs and joining them back loses no text.
- Progress is always between 0 and 100 and never decreases when moving forward.
- Saving and restoring progress returns the same position.

Attention
- Any sequence of present/away signals shorter than the debounce time never
  triggers a haunt.
- Returning to `present` always leads back to haunt level 0.

Haunt engine
- Haunt level stays within [0, max] for any event sequence.
- Level never rises while the reader is present.
- Output volume never exceeds the user's cap, for any level and any haunt.
- With reduced motion on, no haunt emits a flashing effect.
- The same haunt is not chosen twice in a row when more than one exists.

Pace and check
- Suggested time for a paragraph grows with its word count.
- The fill-in-the-blank answer always appears in the chapter text.

## Reporting

After each task, state which properties were added, how many cases ran, and
any counterexample found. Counterexamples are recorded in docs/BUILD_LOG.md.
