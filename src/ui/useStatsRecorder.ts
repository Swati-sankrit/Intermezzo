/**
 * Records reading stats while a book is open. Uses only the attention signal
 * (present or away, camera or not); it never touches the camera and stores no
 * frames, face data or text. Each event goes through the pure `recordEvent`
 * via `session.updateModel`, for the book and for the local date at that moment.
 * There is no break concept in the app yet, so away time counts whenever the
 * signal is `away`.
 */
import { useEffect, useRef } from 'react';
import { recordEvent, type StatEvent } from '../library/statsOps';
import { localDateString } from '../library/statsSelectors';
import { changeTimer, IDLE_TIMER, tickTimer, type TimerState, type TimerStep } from '../library/statsTimer';
import type { AttentionSignal } from '../attention';
import type { ReaderSession } from './bookSession';

export const STATS_FLUSH_MS = 5000;

export interface StatsInput {
  session: ReaderSession;
  chapterIndex: number;
  paragraphIndex: number;
  chapterComplete: boolean;
}

type Subscribe = (cb: (s: AttentionSignal) => void) => () => void;

// Per page load: the session is counted once; chunks and chapters once each.
const page = { sessionCounted: false, opened: new Set<string>(), finished: new Set<string>() };

/** Test seam: forget what this page load has already counted. */
export function resetStatsPage(): void {
  page.sessionCounted = false;
  page.opened.clear();
  page.finished.clear();
}

function record(input: StatsInput, event: StatEvent): void {
  input.session.updateModel((m) => recordEvent(m, input.session.bookId, event, localDateString(new Date())), {
    kind: 'stats',
  });
}

function recordStep(input: StatsInput, step: TimerStep): void {
  if (step.active > 0) record(input, { kind: 'active', seconds: step.active });
  if (step.away > 0) record(input, { kind: 'away', seconds: step.away });
  if (step.lookAway > 0) record(input, { kind: 'lookAway' });
}

export function useStatsRecorder(input: StatsInput | undefined, subscribeSignal: Subscribe): void {
  const inputRef = useRef(input);
  useEffect(() => {
    inputRef.current = input;
  });
  const bookId = input?.session.bookId;
  const loaded = input?.session.status === 'ready';

  // Timing: runs while a book is open. Flushes on every signal change, every 5 s and on close.
  useEffect(() => {
    if (!bookId || !loaded) return;
    let timer: TimerState = { ...IDLE_TIMER, at: Date.now() };
    const apply = (step: TimerStep) => {
      timer = step.state;
      if (inputRef.current) recordStep(inputRef.current, step);
    };
    const unsubscribe = subscribeSignal((s) => apply(changeTimer(timer, s.value, Date.now())));
    const id = setInterval(() => apply(tickTimer(timer, Date.now())), STATS_FLUSH_MS);
    return () => {
      clearInterval(id);
      unsubscribe();
      apply(changeTimer(timer, null, Date.now()));
    };
  }, [bookId, loaded, subscribeSignal]);

  // One session per page load, counted when the first book opens.
  useEffect(() => {
    if (!bookId || !loaded || page.sessionCounted || !inputRef.current) return;
    page.sessionCounted = true;
    record(inputRef.current, { kind: 'session' });
  }, [bookId, loaded]);

  const chapterIndex = input?.chapterIndex;
  const paragraphIndex = input?.paragraphIndex;
  // A paragraph counts the first time it opens in this page load.
  useEffect(() => {
    if (!bookId || !loaded || !inputRef.current) return;
    const key = `${bookId}:${chapterIndex}:${paragraphIndex}`;
    if (page.opened.has(key)) return;
    page.opened.add(key);
    record(inputRef.current, { kind: 'paragraphs', count: 1 });
  }, [bookId, loaded, chapterIndex, paragraphIndex]);

  const complete = input?.chapterComplete ?? false;
  useEffect(() => {
    if (!bookId || !loaded || !complete || !inputRef.current) return;
    const key = `${bookId}:${chapterIndex}`;
    if (page.finished.has(key)) return;
    page.finished.add(key);
    record(inputRef.current, { kind: 'chapter' });
  }, [bookId, loaded, chapterIndex, complete]);
}
