/** Library data model (Schema_Version 3). Pure types and constants; holds no book text. */

export const SCHEMA_VERSION = 3 as const;

export const CANDLE_COLOURS = ['amber', 'rose', 'violet', 'teal', 'ash', 'moss'] as const;
export type CandleColour = (typeof CANDLE_COLOURS)[number];

export const SHELF_NAMES = ['reading', 'want-to-read', 'finished'] as const;
export type ShelfName = (typeof SHELF_NAMES)[number];

export const MAX_DISPLAY_NAME = 40;
export const MIN_AVERAGE_PACE = 50;
export const MAX_AVERAGE_PACE = 1000;
export const DEFAULT_AVERAGE_PACE = 200;

export interface Profile {
  /** '' means none; 1-40 characters when set. */
  displayName: string;
  candleColour: CandleColour;
  onboardingCompleted: boolean;
  paceGuideEnabled: boolean;
  /** Words per minute, 50-1000. */
  averagePace: number;
}

export interface BookEntry {
  bookId: string;
  title: string;
  /** '' is allowed. */
  author: string;
  fileName: string;
  source: 'catalogue' | 'upload';
  format: 'txt' | 'epub';
  /** Present only when source is 'catalogue'. */
  catalogueSlug?: string;
  addedAt: number;
}

export interface Position {
  chapterIndex: number;
  /** First paragraph of the active Reading_Chunk. */
  paragraphIndex: number;
  savedAt: number;
  /** Whole number, 0-100. */
  progress: number;
}

export interface Stats {
  paragraphsRead: number;
  chaptersFinished: number;
  activeReadingSeconds: number;
  lookAwayCount: number;
  sessionCount: number;
  awaySeconds: number;
  /** Words in the paragraphs recorded as read. A number only; no book text. */
  wordsRead: number;
}

export interface Shelves {
  reading: string[];
  'want-to-read': string[];
  finished: string[];
}

export interface DataModel {
  schemaVersion: typeof SCHEMA_VERSION;
  profile: Profile;
  shelves: Shelves;
  /** Keyed by Book_Id. */
  books: Record<string, BookEntry>;
  /** Keyed by Book_Id. At most one per book. */
  positions: Record<string, Position>;
  /** Per-book stats, keyed by Book_Id. */
  stats: Record<string, Stats>;
  /** Per-day stats keyed by Local_Date YYYY-MM-DD. Needs no matching book entry. */
  daily: Record<string, Stats>;
}

export const STATS_FIELDS = [
  'paragraphsRead',
  'chaptersFinished',
  'activeReadingSeconds',
  'lookAwayCount',
  'sessionCount',
  'awaySeconds',
  'wordsRead',
] as const;

/** First_Visit_State: no name, default colour, onboarding not completed, no books. */
export const EMPTY_DATA_MODEL: DataModel = {
  schemaVersion: SCHEMA_VERSION,
  profile: {
    displayName: '',
    candleColour: 'amber',
    onboardingCompleted: false,
    paceGuideEnabled: false,
    averagePace: DEFAULT_AVERAGE_PACE,
  },
  shelves: { reading: [], 'want-to-read': [], finished: [] },
  books: {},
  positions: {},
  stats: {},
  daily: {},
};
