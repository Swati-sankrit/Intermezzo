/**
 * Contracts for the Return_Moment. Types only: no DOM, audio, timer or camera access.
 */

import type { HauntMode } from './ghost/mode';
import type { AudioOut, VisualLayer, VisualOut } from './types';

export type { HauntMode } from './ghost/mode';

export type GhostStep = 0 | 1 | 2 | 3 | 4;

/** A reversible word replacement in a display copy of a paragraph. */
export interface EvidencePatch {
  /** Index of the first replaced word, counted among words. */
  readonly start: number;
  /** The words that were replaced. */
  readonly original: readonly string[];
  /** The message words, same length as `original`. */
  readonly replacement: readonly string[];
}

export interface ReturnPlan {
  /** 0 (Gentle) or 1..3000. */
  readonly durationMs: number;
  /** awayMs >= 10_000 in Classic or Nightmare. */
  readonly qualifying: boolean;
  /** At most 800. */
  readonly ambientFadeMs: number;
  readonly ghostStep: GhostStep;
  /** At most durationMs. */
  readonly ghostLingerMs: number;
  /** Null or 300..800. */
  readonly falseCalmMs: number | null;
  readonly jumpscare: { startMs: number; durationMs: number; render: 'full' | 'fade' } | null;
  /** durationMs in [100, 1000), flickers 1..3. */
  readonly glitch: { startMs: number; durationMs: number; flickers: number } | null;
  /** Reduced-motion replacement, at least 500 ms. */
  readonly fade: { startMs: number; durationMs: number } | null;
  /** durationMs at most 1500. */
  readonly evidence: { message: string; patch: EvidencePatch; startMs: number; durationMs: number } | null;
  readonly spoiler: {
    sentence: string; legibility: number; blurPx: number; holdMs: number; stayMs: number;
  } | null;
}

export type OverlayKind = 'ghost' | 'jumpscare' | 'card-hand' | 'glitch';

export interface GlitchSpec {
  readonly durationMs: number;
  readonly flickers: number;
}

export interface ReturnVisualOut extends VisualOut {
  /** Full-viewport layer above the page. May cover the Reading_Column. The gate removes it when the Return_Moment ends. */
  createOverlay(kind: OverlayKind): VisualLayer;
  /** Tear bands and colour shift over the page. Text content is never changed. */
  runGlitch(spec: GlitchSpec): { grantedFlickers: number };
}

export interface ReturnPort {
  /** Fast attack only when opened with `jumpSound`. */
  readonly audio: AudioOut;
  readonly visual: ReturnVisualOut;
  close(): void;
}

export interface ReturnEffect {
  readonly id: string;
  readonly name: string;
  readonly modes?: readonly HauntMode[];
  readonly jumpSound?: boolean;
  /** Pure. When this effect runs inside the Return_Moment, or null when the plan gives it nothing to do. */
  span(plan: ReturnPlan): { startMs: number; endMs: number } | null;
  begin(plan: ReturnPlan, port: ReturnPort): void;
  end(): void;
}

export interface ReadingContext {
  /** Changes when the reader moves to another chapter. */
  chapterKey(): string;
  activeParagraph(): string | null;
  /** Null when the book has no chapter structure, has one chapter, or the reader is in the final chapter. */
  spoilerSource(): {
    finalChapterSentences: readonly string[];
    otherChapterSentences: readonly string[];
  } | null;
  /** Text before and including the active paragraph, and the offset where it ends. */
  readSoFar(): { text: string; position: number };
}

export interface EvidenceHost {
  /** Show `shown` to sighted readers; screen readers keep `original`. Display only. */
  show(shown: string, original: string): void;
  clear(): void;
}

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export type CardPlacement =
  /** Free space of at least 160 px: beside the column, never over it. */
  | { kind: 'beside'; rect: Rect }
  /** Free space under 160 px: only during the Return_Moment, may cover the text. */
  | { kind: 'overlay' };

export interface SpoilerCardView {
  readonly sentence: string;
  readonly legibility: number;
  readonly blurPx: number;
  readonly holding: boolean;
  readonly placement: CardPlacement;
}

export interface SpoilerHost {
  show(card: SpoilerCardView): void;
  /** False when the Return_Moment ends (the Ghost leaves). */
  setHolding(holding: boolean): void;
  hide(): void;
}
