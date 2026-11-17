---
inclusion: always
---

# Haunt safety and accessibility

These rules apply to every haunt, sound, and animation.

## Sound

- No sudden full-volume sound. Every sound fades in over at least 300 ms.
- A user volume cap exists in settings and is enforced in one place in the
  audio code. Default cap is moderate; haunts cannot override it.
- Ambience is instrumental only. No lyrics or speech while reading, except a
  word meaning read aloud because the reader asked for it.
- Speech (word meanings, visitor replies) obeys the same volume cap and can
  be stopped at any time.
- Sound is off until the user's first click (browser autoplay rules).

## Visuals

- No flashing faster than 3 times per second.
- Respect `prefers-reduced-motion`: replace movement and flicker with slow
  fades.
- A photosensitivity notice appears before the first session.
- Reading text keeps WCAG AA contrast at every haunt level. Haunts happen
  around the text, never on top of the current paragraph.

## Escalation

- Level 0: calm. Level 1 after a short look-away: subtle (candle dims).
  Higher levels only if the reader stays away.
- Looking back always de-escalates within one second.
- A "gentle mode" limits haunts to level 1.

## Penance and breaks

- A penance scene lasts at most 15 seconds and obeys every sound and visual
  rule above. It is never louder or harsher than a level-3 haunt.
- Gentle mode and reduced motion replace it with a calm pause.
- A penance can always be skipped with points when the balance allows.
- Break prompts are suggestions. Leaving the screen during a break is never
  counted as a breach.

## Camera and privacy

- Ask for the camera only after explaining why, in plain words.
- Show a visible indicator whenever the camera is on.
- Processing is on-device. No frame is stored or transmitted.
- If permission is denied, fall back to tab-switch and idle detection without
  nagging.

## Content

- No gore, no jump-scare faces, nothing aimed at a real person or group.
- Keyboard-only use must work for the whole reading flow.
