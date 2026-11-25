---
inclusion: always
---

# Technology

Everything runs in the browser, except one serverless function used by the
chapter visitor to call an AI service. That function holds the API key, limits
requests, and stores nothing.

## Stack

- Vite + React + TypeScript
- Vitest for unit tests, fast-check for property-based tests
- MediaPipe Face Landmarker (tasks-vision) for "is the reader facing the screen"
- epub.js (or similar) to read EPUB files; plain .txt read directly
- Web Audio API for ambience and haunt sounds
- Web Speech API for voice: SpeechRecognition for push-to-talk (Chrome, Edge,
  Safari; not Firefox) and speechSynthesis for reading replies and meanings
  aloud. Always feature-detect both and fall back to typing and on-screen text.
- localStorage / IndexedDB for progress and settings
- Deployed on Vercel

Before using any library, fetch its current documentation. Do not rely on
remembered APIs. If a library or method cannot be confirmed in the docs, say so
instead of inventing it.

## Structure

```
src/
  reader/      book parsing, paragraph splitting, progress, pace
  attention/   camera, face detection, present/away signal
  haunts/      haunt engine + one file per haunt
  words/       tap-for-meaning, rare-word detection
  check/       end-of-chapter fill-in-the-blank
  mood/        paragraph mood label and lighting
  visitor/     chapter visitor: context builder, chat, fallback
  ui/          components
api/           the one serverless function for the AI call
public/
  ghosts/      bundled ghost images (PNG or WebP)
  sounds/      bundled haunt audio (MP3, CC0 only)
assets-src/    original, unprocessed source assets kept outside public/,
               for non-destructive image and audio editing
```

## Rules

- Logic lives in pure functions with no DOM or camera access, so it can be
  property-tested. UI components call those functions.
- Components stay under 200 lines.
- The attention module outputs only one thing: `present` or `away`, with a
  timestamp. Nothing else in the app touches the camera.
- A haunt is one file in `src/haunts/` that exports the Haunt interface.
  Adding a haunt must not require editing the engine.
- No video frame is stored, logged, or sent anywhere.
- Never add a dependency without stating its license.
- Bundled images live in `public/ghosts/`; bundled audio lives in
  `public/sounds/`. Every file there is CC0 or the project's own work, with
  no copyrighted characters, no identifiable real person and no gore, and is
  loaded only from the app's own origin through a relative, same-origin URL.
  No third-party server is contacted to fetch an asset. Every file is listed
  in the README with its source and licence, the same as a code dependency.
