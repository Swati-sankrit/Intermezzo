/**
 * Defaults for the optional engine inputs (task 5.8). No DOM, audio, camera or `src/attention/` access.
 */
import type { EvidenceHost, ReadingContext, SpoilerHost } from './returnTypes';
import type { Regions } from './regions';
import type { EngineDeps } from './types';
const NO_READING: ReadingContext = {
  chapterKey: () => '',
  activeParagraph: () => null,
  spoilerSource: () => null,
  readSoFar: () => ({ text: '', position: 0 }),
};
const NO_EVIDENCE: EvidenceHost = { show: () => undefined, clear: () => undefined };
const NO_SPOILER: SpoilerHost = { show: () => undefined, setHolding: () => undefined, hide: () => undefined };
/** Fixed-seed generator (mulberry32) in [0, 1). Used only when the caller gives no `extraRandom`. */
function fixedSeedRandom(seed = 0x9e3779b9): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export interface ResolvedWiring {
  reading: ReadingContext;
  evidence: EvidenceHost;
  spoiler: SpoilerHost;
  reducedMotion(): boolean;
  extraRandom(): number;
  effects: NonNullable<EngineDeps['effects']>;
  /** The regions now, or undefined. A throwing getter gives undefined. */
  regions(): Regions | undefined;
}
export function resolveWiring(deps: EngineDeps): ResolvedWiring {
  const { regions } = deps;
  return {
    reading: deps.reading ?? NO_READING,
    evidence: deps.evidence ?? NO_EVIDENCE,
    spoiler: deps.spoiler ?? NO_SPOILER,
    reducedMotion: deps.reducedMotion ?? (() => false),
    extraRandom: deps.extraRandom ?? fixedSeedRandom(),
    effects: deps.effects ?? [],
    regions() {
      if (typeof regions !== 'function') return regions;
      try {
        return regions();
      } catch (error) {
        deps.warn(`regions failed: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
      }
    },
  };
}
