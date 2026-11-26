/** Pure migration from legacy version-1 data (rod_state, rod_pace_guide) to the current Data_Model. No DOM. */
import {
  DEFAULT_AVERAGE_PACE,
  EMPTY_DATA_MODEL,
  MAX_AVERAGE_PACE,
  MIN_AVERAGE_PACE,
  SCHEMA_VERSION,
  type DataModel,
} from './model';

export interface LegacyInput {
  /** Raw `rod_state` value: the JSON string from localStorage (an already-parsed object is also accepted), or undefined/null. */
  rodState: unknown;
  /** Raw `rod_pace_guide` value: 'true' or 'false' (booleans also accepted), or undefined/null. */
  rodPaceGuide: unknown;
  /** SHA-256 of the legacy `current` text, computed by the store, or null when that text is missing. */
  legacyBookId: string | null;
  /**
   * Paragraph count of each chapter of the legacy book, when the caller has parsed the text.
   * When given, the saved position is range-checked and a progress is computed. When absent, progress stays 0.
   */
  chapterParagraphCounts?: readonly number[] | null;
}

export type LegacyKey = 'rod_state' | 'rod_pace_guide';

export interface MigrationResult {
  model: DataModel;
  /** Legacy keys whose value was valid and used. The store may remove these once the new model is saved. */
  consumed: LegacyKey[];
  /** Legacy keys present but invalid. The store must keep these untouched. */
  invalid: LegacyKey[];
}

export const MAX_FILE_NAME = 255;

interface ParsedState {
  fileName: string;
  chapterIndex: number;
  paragraphIndex: number;
  savedAt: number;
  averagePace: number;
  paceGuideEnabled: boolean | null;
}

type Rec = Record<string, unknown>;

function isRecord(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isIndex(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function isAbsent(v: unknown): boolean {
  return v === undefined || v === null;
}

function parseState(raw: unknown, counts: readonly number[] | null): ParsedState | null {
  let v: unknown = raw;
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isRecord(v)) return null;
  const fileName = v.fileName;
  if (typeof fileName !== 'string' || fileName.length < 1 || fileName.length > MAX_FILE_NAME) return null;
  const p = v.position;
  if (!isRecord(p) || !isIndex(p.chapterIndex) || !isIndex(p.paragraphIndex)) return null;
  const pace = v.averagePace;
  if (typeof pace !== 'number' || !Number.isFinite(pace) || pace <= 0) return null;
  if (counts) {
    if (p.chapterIndex >= counts.length) return null;
    if (p.paragraphIndex > counts[p.chapterIndex]) return null;
  }
  const savedAt = typeof p.savedAt === 'number' && Number.isFinite(p.savedAt) ? p.savedAt : 0;
  return {
    fileName,
    chapterIndex: p.chapterIndex,
    paragraphIndex: p.paragraphIndex,
    savedAt,
    averagePace: pace,
    paceGuideEnabled: typeof v.paceGuideEnabled === 'boolean' ? v.paceGuideEnabled : null,
  };
}

function parsePaceGuide(raw: unknown): boolean | null {
  if (raw === true || raw === 'true') return true;
  if (raw === false || raw === 'false') return false;
  return null;
}

/** Whole-number progress, 0-100: paragraphs before the position over all paragraphs. 0 when counts are unknown. */
export function legacyProgress(
  chapterIndex: number,
  paragraphIndex: number,
  counts: readonly number[] | null,
): number {
  if (!counts) return 0;
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let before = paragraphIndex;
  for (let i = 0; i < chapterIndex && i < counts.length; i++) before += counts[i];
  return Math.max(0, Math.min(100, Math.round((before / total) * 100)));
}

function clampPace(n: number): number {
  return Math.min(MAX_AVERAGE_PACE, Math.max(MIN_AVERAGE_PACE, n));
}

function titleFromFileName(fileName: string): string {
  const stripped = fileName.replace(/\.[^./\\]+$/, '');
  return stripped.length > 0 ? stripped : fileName;
}

function emptyModel(): DataModel {
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: { ...EMPTY_DATA_MODEL.profile },
    shelves: { reading: [], 'want-to-read': [], finished: [] },
    books: {},
    positions: {},
    stats: {},
    daily: {},
  };
}

/** Like `migrate`, and also reports which legacy keys were used and which were invalid. */
export function migrateWithReport(legacy: LegacyInput, current: DataModel): MigrationResult {
  if (current.schemaVersion === SCHEMA_VERSION) return { model: current, consumed: [], invalid: [] };

  const counts = legacy.chapterParagraphCounts ?? null;
  const consumed: LegacyKey[] = [];
  const invalid: LegacyKey[] = [];
  const model = emptyModel();

  const state = isAbsent(legacy.rodState) ? null : parseState(legacy.rodState, counts);
  if (!isAbsent(legacy.rodState)) (state ? consumed : invalid).push('rod_state');

  const guide = isAbsent(legacy.rodPaceGuide) ? null : parsePaceGuide(legacy.rodPaceGuide);
  if (!isAbsent(legacy.rodPaceGuide)) (guide !== null ? consumed : invalid).push('rod_pace_guide');

  // rod_pace_guide wins; the pace-guide flag stored inside rod_state is the fallback, as the old reader did.
  const paceGuide = guide ?? state?.paceGuideEnabled ?? null;
  if (paceGuide !== null) model.profile.paceGuideEnabled = paceGuide;

  if (state) {
    const bookId = legacy.legacyBookId ?? `legacy-${state.fileName}`;
    const isEpub = /\.epub$/i.test(state.fileName);
    model.profile.averagePace = clampPace(state.averagePace || DEFAULT_AVERAGE_PACE);
    model.books[bookId] = {
      bookId,
      title: titleFromFileName(state.fileName),
      author: '',
      fileName: state.fileName,
      source: 'upload',
      format: isEpub ? 'epub' : 'txt',
      addedAt: state.savedAt,
    };
    model.positions[bookId] = {
      chapterIndex: state.chapterIndex,
      paragraphIndex: state.paragraphIndex,
      savedAt: state.savedAt,
      progress: legacyProgress(state.chapterIndex, state.paragraphIndex, counts),
    };
    model.stats[bookId] = {
      paragraphsRead: 0,
      chaptersFinished: 0,
      activeReadingSeconds: 0,
      lookAwayCount: 0,
      sessionCount: 0,
      awaySeconds: 0,
      wordsRead: 0,
    };
    model.shelves.reading.push(bookId);
  }

  return { model, consumed, invalid };
}

/** Converts legacy data into a version-2 model. A version-2 `current` is returned unchanged (idempotent). */
export function migrate(legacy: LegacyInput, current: DataModel): DataModel {
  return migrateWithReport(legacy, current).model;
}
