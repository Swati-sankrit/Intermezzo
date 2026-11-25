---
inclusion: always
---

# Haunt safety and accessibility

These rules apply to every haunt, sound, and animation, in every haunt mode.

## Haunt modes

- There are three haunt modes: Gentle, Classic (the default) and Nightmare.
  The reader chooses one on the safety notice and can change it at any time
  in the top bar.
- Gentle: level 1 only. No ghost figures, no glitch effects, no jumpscares.
- Classic and Nightmare: ghost figures, glitch effects and jumpscares are
  allowed, as described in the ghost-dread spec. Every rule below still
  applies in these modes.

## Sound

- A user volume cap exists in settings and is enforced in one place in the
  audio code. Default cap is moderate; haunts cannot override it. This holds
  for every sound, including jump sounds.
- Every sound fades in over at least 300 ms, except a jump sound.
- A jump sound may start fast, with an attack of at least 20 ms, and never
  goes above the volume cap. Jump sounds play only during the return moment.
- Pulses inside a running sound layer (a footstep, a breath, a knock) may
  use an attack as short as 20 ms, since the layer itself already faded in.
  A pulse never exceeds the layer's current gain target, and that target
  stays at or below the volume cap.
- Ambience is instrumental only. No lyrics or speech while reading, except a
  word meaning read aloud because the reader asked for it.
- Speech (word meanings, visitor replies) obeys the same volume cap and can
  be stopped at any time.
- Sound is off until the user's first click (browser autoplay rules).

## Visuals

- No flashing faster than 3 times per second.
- No full-screen flashes of saturated red.
- Respect `prefers-reduced-motion`: replace movement and flicker with slow
  fades.
- A photosensitivity notice appears before the first session.
- Outside the return moment, effects stay around the text, never on top of
  it, and the reading text keeps WCAG AA contrast at every haunt level.
- During the return moment (at most 3 seconds) effects may cover the text.
  When it ends, the text is fully readable again.
- The spoiler card (ghost-dread) may stay after the return moment ends,
  without the ghost figure, for up to 10 seconds. It never covers the active
  paragraph: it sits beside the reading column. The reader can dismiss it at
  any time, by button or Escape key.
  If the free space beside the column is under 160 px, the card shows only
  during the return moment (it may cover the text then) and is hidden when
  the return moment ends.

## Jumpscares and glitches

- Jumpscares and glitches happen only at the moment the reader returns after
  a look-away. They never happen while the reader is present and reading.
- The return moment lasts at most 3 seconds.
- Under reduced motion, a jumpscare or glitch becomes a slow fade, with no
  sudden movement and no flicker.

## Escalation

- Level 0: calm. Level 1 after a short look-away: subtle (candle dims).
  Higher levels only if the reader stays away.
- Looking back calms the room: ambient haunt effects fade out within one
  second. A ghost may linger for the return moment, at most 3 seconds after
  the reader returns.
- Gentle mode limits haunts to level 1.

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

- No gore. No real people, and nothing aimed at a real person or group.
- No copyrighted characters. Ghosts are original or CC0 images.
- Keyboard-only use must work for the whole reading flow.
