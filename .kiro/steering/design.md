---
inclusion: always
---

# Visual design

A reading room at night: dark wood, warm paper, one candle. Calm while the
reader reads. The page itself is the hero; everything else stays quiet.

## Colour (CSS custom properties in src/ui/theme.css, used everywhere)

- `--bg`: #14110f, warm near-black (the room)
- `--surface`: #1d1916, slightly lifted panels and cards
- `--text`: #e8dcc4, warm paper colour for the active paragraph
- `--text-dim`: #8a7f6e, earlier paragraphs and secondary labels
- `--accent`: #e0a64a, candlelight: focus rings, progress fill, primary buttons
- `--danger`: #c0564b, errors only
- `--shadow`: rgba(0, 0, 0, 0.6), haunt shadows and vignette

Never hard-code colours in components. Every text colour must meet WCAG AA
(4.5:1) against `--bg`, including dimmed paragraphs; check it, don't assume.

## Type

- Reading text: Literata (designed for long reading). Headings and titles:
  Cormorant Garamond. Interface labels: the system UI font.
- Bundle fonts with @fontsource packages (OFL licence). Do not load them from
  Google Fonts or any other third-party server.
- Reading size 1.25rem on desktop, 1.125rem on small screens, line height 1.7,
  column width at most 65 characters, left-aligned (never justified).

## Layout

- One centred reading column. Generous space above and below the active
  paragraph so it sits near the middle of the screen.
- Controls (progress, pace timer, library, settings) live in a thin bar that
  fades to low opacity while reading and returns on mouse move or focus.
- The library screen: a short shelf of books as cards (title, author), plus a
  clearly labelled "Open your own book" control.
- Works from 360px wide upward with no horizontal scroll.

## Motion

- Paragraph reveal: fade and rise a few pixels over about 400ms.
- Earlier paragraphs dim over about 600ms.
- Ambient candle flicker is slow and subtle; haunts follow haunt-safety.md.
- Under `prefers-reduced-motion`, replace movement with simple fades or none.

## Components

- No UI component library. Small hand-written components with plain CSS
  (CSS modules or one stylesheet per component).
- Icons are inline SVG, drawn simply, using `currentColor`.
- Every interactive element has a visible focus ring in `--accent`, a label
  readable by screen readers, and works with the keyboard.
- Buttons say what they do ("Next chapter", "Back to library"), not "OK".

## Tone of words

Short, warm, slightly gothic, never cute or alarming. Errors say what happened
and what to do next, in plain words.
