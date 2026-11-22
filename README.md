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
