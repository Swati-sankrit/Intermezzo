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

> `epubjs` uses the BSD-2-Clause license (also known as the "FreeBSD" license).

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
