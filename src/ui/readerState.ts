import { DEFAULT_WPM } from '../reader/paceCalc';
import type { Book } from '../reader/types';
import type { OpenFailure } from './bookSession';

export interface ReaderState {
  book: Book | null;
  chapterIndex: number;
  paragraphIndex: number; // last revealed paragraph in the chapter
  chapterComplete: boolean;
  error: string | null;
  averagePace: number;
  paceGuideEnabled: boolean;
  loading: boolean;
  notice: string | null;
  failure: OpenFailure | null;
}

export const INITIAL_READER_STATE: ReaderState = {
  book: null,
  chapterIndex: 0,
  paragraphIndex: 0,
  chapterComplete: false,
  error: null,
  averagePace: DEFAULT_WPM,
  paceGuideEnabled: false,
  loading: false,
  notice: null,
  failure: null,
};

/** What the library screen needs to know about a book being opened. */
export type OpenStatus = Pick<ReaderState, 'loading' | 'failure' | 'error'>;
