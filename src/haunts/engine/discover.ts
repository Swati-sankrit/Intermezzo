/**
 * The only import.meta.glob call in the haunt feature. Patterns are literals
 * relative to this file: `../*.ts` is `src/haunts/*.ts` (one level, so it never
 * matches `engine/`). Haunt modules must have no import-time side effects.
 */
const modules = import.meta.glob(['../*.ts', '!../*.test.ts', '!../*.d.ts'], { eager: true });

export const discovered: Record<string, unknown> = modules;
