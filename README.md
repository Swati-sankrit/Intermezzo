# Read or Dread

A privacy-first, in-browser reading app. Book content never leaves the device.

## Dependency Licenses

| Package | License | Purpose |
|---|---|---|
| react | MIT | UI framework |
| react-dom | MIT | UI framework (DOM renderer) |
| vite | MIT | Build tool and dev server |
| typescript | Apache-2.0 | Type system |
| @vitejs/plugin-react | MIT | Vite React integration |
| epubjs | BSD-2-Clause | EPUB file parsing in the browser |
| vitest | MIT | Test runner |
| @vitest/coverage-v8 | MIT | Coverage reporter |
| jsdom | MIT | Browser-like DOM environment for Vitest |
| @testing-library/react | MIT | React component test utilities |
| @testing-library/jest-dom | MIT | DOM assertion matchers |
| fast-check | MIT | Property-based testing |
| fake-indexeddb | Apache-2.0 | In-memory IndexedDB for tests |
| @testing-library/user-event | MIT | Simulated user input in component tests |
| @mediapipe/tasks-vision (1.2.3) | Apache-2.0 | On-device face detection for the attention signal; wasm copied to `public/mediapipe/wasm/` by `scripts/copy-mediapipe.mjs` |
| face_landmarker.task (model file, `public/models/`) | Apache-2.0 | Face Landmarker model bundle; license sources: the [Hugging Face model card](https://huggingface.co/litert-community/MediaPipe-FaceLandmarker) (Google's Face Landmarker page links to it) and Google's [BlazeFace model card](https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20(Short%20Range).pdf) (Apache-2.0) |
| sharp | Apache-2.0 | Dev-only, used by the Node script `scripts/fetch-catalogue.mjs` to resize covers and write WebP; not shipped to the browser |
| @xmldom/xmldom (0.9.12, transitive override) | MIT | Pulled in by epubjs; pinned with `overrides` in `package.json` because the 0.7.13 that epubjs asks for has 15 security advisories (fixed in 0.8.15 and 0.9.x) |
| @fontsource/literata | OFL-1.1 | Reading text font (bundled, self-hosted) |
| @fontsource/cormorant-garamond | OFL-1.1 | Headings and titles font (bundled, self-hosted) |
> `epubjs` uses the BSD-2-Clause license (also known as the "FreeBSD" license).

## Licences / Fonts

Fonts are bundled from npm via Fontsource and served from this app. Nothing loads from Google Fonts or any other third-party server. Only the Latin subset is imported, at the weights in use.

| Package | Font | Licence | Weights imported |
|---|---|---|---|
| @fontsource/literata | Literata (reading text) | SIL Open Font License 1.1 (OFL-1.1) | 400 |
| @fontsource/cormorant-garamond | Cormorant Garamond (headings, titles) | SIL Open Font License 1.1 (OFL-1.1) | 500, 600 |

Interface labels use the system UI font. The `license` field in both packages' package.json reads `OFL-1.1`.

## Images and audio (`public/ghosts/`, `public/sounds/`)

Every bundled image or sound file is CC0 or the project's own work, contains no copyrighted character and no identifiable real person, and is served only from this app's own origin.

| File | Source | Licence |
|---|---|---|
| `public/ghosts/ghost-standing.png` | Own work, generated with Google Gemini | Own work, generated with Google Gemini |
| `public/ghosts/ghost-face.png` | Own work, generated with Google Gemini | Own work, generated with Google Gemini |

A backup of the original, unprocessed files is kept outside `public/`, in `assets-src/ghosts/`, so later cleanup work stays reversible.

## Bundled books and covers (`public/books/`, `public/covers/`)

The 16 catalogue books and their covers come from [Standard Ebooks](https://standardebooks.org). Standard Ebooks dedicates its editions to the public domain under CC0 1.0, and the underlying works are in the public domain. Every file is served only from this app's own origin. The files are fetched once by `scripts/fetch-catalogue.mjs` and committed.

| File | Source | Licence |
|---|---|---|
| `public/books/dracula.epub` | [standardebooks.org/ebooks/bram-stoker/dracula](https://standardebooks.org/ebooks/bram-stoker/dracula). | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/books/frankenstein.epub` | [standardebooks.org/ebooks/mary-shelley/frankenstein](https://standardebooks.org/ebooks/mary-shelley/frankenstein). | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/books/the-strange-case-of-dr-jekyll-and-mr-hyde.epub` | [standardebooks.org/ebooks/robert-louis-stevenson/the-strange-case-of-dr-jekyll-and-mr-hyde](https://standardebooks.org/ebooks/robert-louis-stevenson/the-strange-case-of-dr-jekyll-and-mr-hyde). | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/books/the-picture-of-dorian-gray.epub` | [standardebooks.org/ebooks/oscar-wilde/the-picture-of-dorian-gray](https://standardebooks.org/ebooks/oscar-wilde/the-picture-of-dorian-gray). | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/books/the-vampire.epub` | [standardebooks.org/ebooks/john-william-polidori/the-vampire](https://standardebooks.org/ebooks/john-william-polidori/the-vampire). | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/books/the-turn-of-the-screw.epub` | [standardebooks.org/ebooks/henry-james/the-turn-of-the-screw](https://standardebooks.org/ebooks/henry-james/the-turn-of-the-screw). | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/books/the-hound-of-the-baskervilles.epub` | [standardebooks.org/ebooks/arthur-conan-doyle/the-hound-of-the-baskervilles](https://standardebooks.org/ebooks/arthur-conan-doyle/the-hound-of-the-baskervilles). | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/books/short-fiction.epub` | [standardebooks.org/ebooks/edgar-allan-poe/short-fiction](https://standardebooks.org/ebooks/edgar-allan-poe/short-fiction). | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/books/pride-and-prejudice.epub` | [standardebooks.org/ebooks/jane-austen/pride-and-prejudice](https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice). | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/books/jane-eyre.epub` | [standardebooks.org/ebooks/charlotte-bronte/jane-eyre](https://standardebooks.org/ebooks/charlotte-bronte/jane-eyre). | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/books/wuthering-heights.epub` | [standardebooks.org/ebooks/emily-bronte/wuthering-heights](https://standardebooks.org/ebooks/emily-bronte/wuthering-heights). | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/books/a-christmas-carol.epub` | [standardebooks.org/ebooks/charles-dickens/a-christmas-carol](https://standardebooks.org/ebooks/charles-dickens/a-christmas-carol). | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/books/treasure-island.epub` | [standardebooks.org/ebooks/robert-louis-stevenson/treasure-island](https://standardebooks.org/ebooks/robert-louis-stevenson/treasure-island). | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/books/the-time-machine.epub` | [standardebooks.org/ebooks/h-g-wells/the-time-machine](https://standardebooks.org/ebooks/h-g-wells/the-time-machine). | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/books/the-invisible-man.epub` | [standardebooks.org/ebooks/h-g-wells/the-invisible-man](https://standardebooks.org/ebooks/h-g-wells/the-invisible-man). | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/books/the-adventures-of-sherlock-holmes.epub` | [standardebooks.org/ebooks/arthur-conan-doyle/the-adventures-of-sherlock-holmes](https://standardebooks.org/ebooks/arthur-conan-doyle/the-adventures-of-sherlock-holmes). | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/covers/dracula.webp` | Cover image from the same Standard Ebooks edition, resized to at most 400 px wide and converted to WebP by `scripts/fetch-catalogue.mjs` | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/covers/frankenstein.webp` | Cover image from the same Standard Ebooks edition, resized to at most 400 px wide and converted to WebP by `scripts/fetch-catalogue.mjs` | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/covers/the-strange-case-of-dr-jekyll-and-mr-hyde.webp` | Cover image from the same Standard Ebooks edition, resized to at most 400 px wide and converted to WebP by `scripts/fetch-catalogue.mjs` | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/covers/the-picture-of-dorian-gray.webp` | Cover image from the same Standard Ebooks edition, resized to at most 400 px wide and converted to WebP by `scripts/fetch-catalogue.mjs` | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/covers/the-vampire.webp` | Cover image from the same Standard Ebooks edition, resized to at most 400 px wide and converted to WebP by `scripts/fetch-catalogue.mjs` | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/covers/the-turn-of-the-screw.webp` | Cover image from the same Standard Ebooks edition, resized to at most 400 px wide and converted to WebP by `scripts/fetch-catalogue.mjs` | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/covers/the-hound-of-the-baskervilles.webp` | Cover image from the same Standard Ebooks edition, resized to at most 400 px wide and converted to WebP by `scripts/fetch-catalogue.mjs` | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/covers/short-fiction.webp` | Cover image from the same Standard Ebooks edition, resized to at most 400 px wide and converted to WebP by `scripts/fetch-catalogue.mjs` | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/covers/pride-and-prejudice.webp` | Cover image from the same Standard Ebooks edition, resized to at most 400 px wide and converted to WebP by `scripts/fetch-catalogue.mjs` | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/covers/jane-eyre.webp` | Cover image from the same Standard Ebooks edition, resized to at most 400 px wide and converted to WebP by `scripts/fetch-catalogue.mjs` | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/covers/wuthering-heights.webp` | Cover image from the same Standard Ebooks edition, resized to at most 400 px wide and converted to WebP by `scripts/fetch-catalogue.mjs` | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/covers/a-christmas-carol.webp` | Cover image from the same Standard Ebooks edition, resized to at most 400 px wide and converted to WebP by `scripts/fetch-catalogue.mjs` | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/covers/treasure-island.webp` | Cover image from the same Standard Ebooks edition, resized to at most 400 px wide and converted to WebP by `scripts/fetch-catalogue.mjs` | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/covers/the-time-machine.webp` | Cover image from the same Standard Ebooks edition, resized to at most 400 px wide and converted to WebP by `scripts/fetch-catalogue.mjs` | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/covers/the-invisible-man.webp` | Cover image from the same Standard Ebooks edition, resized to at most 400 px wide and converted to WebP by `scripts/fetch-catalogue.mjs` | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |
| `public/covers/the-adventures-of-sherlock-holmes.webp` | Cover image from the same Standard Ebooks edition, resized to at most 400 px wide and converted to WebP by `scripts/fetch-catalogue.mjs` | Standard Ebooks, CC0 1.0 public domain dedication (the underlying work is in the public domain) |

---

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
