// @vitest-environment jsdom
// Validates: Requirements 20.x, 23.4, 23.5
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttentionSignal } from '../../attention';
import type { BookEntry, DataModel } from '../../library/model';
import { EMPTY_DATA_MODEL } from '../../library/model';
import { addBookEntry } from '../../library/shelfOps';
import { statsForBook, statsForDate } from '../../library/statsSelectors';
import type { ReaderSession } from '../bookSession';
import { resetStatsPage, useStatsRecorder, type StatsInput } from '../useStatsRecorder';

const entry: BookEntry = {
  bookId: 'book', title: 't', author: '', fileName: 'f.txt', source: 'upload', format: 'txt', addedAt: 1,
};

function setup() {
  let model: DataModel = addBookEntry(EMPTY_DATA_MODEL, entry);
  const session = {
    bookId: 'book',
    status: 'ready',
    get model() {
      return model;
    },
    updateModel: (fn: (m: DataModel) => DataModel) => {
      model = fn(model);
    },
  } as unknown as ReaderSession;
  let emit: (s: AttentionSignal) => void = () => {};
  const subscribe = (cb: (s: AttentionSignal) => void) => {
    emit = cb;
    return () => {};
  };
  const input: StatsInput = { session, chapterIndex: 0, paragraphIndex: 0, chapterComplete: false };
  return { getModel: () => model, subscribe, input, emit: (s: AttentionSignal) => emit(s) };
}

describe('useStatsRecorder', () => {
  beforeEach(() => {
    resetStatsPage();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 31, 12, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('records active seconds, a look-away and away seconds to the book and today', () => {
    const t = setup();
    const { unmount } = renderHook(() => useStatsRecorder(t.input, t.subscribe));
    t.emit({ value: 'present', timestamp: 0 });
    vi.advanceTimersByTime(7000);
    t.emit({ value: 'away', timestamp: 7000 });
    vi.advanceTimersByTime(3000);
    unmount();

    const book = statsForBook(t.getModel(), 'book');
    const today = statsForDate(t.getModel(), '2025-01-31');
    for (const s of [book, today]) {
      expect(s.activeReadingSeconds).toBe(7);
      expect(s.lookAwayCount).toBe(1);
      expect(s.awaySeconds).toBe(3);
      expect(s.sessionCount).toBe(1);
      expect(s.paragraphsRead).toBe(1);
    }
  });

  it('counts the session once per page load', () => {
    const t = setup();
    const first = renderHook(() => useStatsRecorder(t.input, t.subscribe));
    first.unmount();
    const second = renderHook(() => useStatsRecorder(t.input, t.subscribe));
    second.unmount();
    expect(statsForBook(t.getModel(), 'book').sessionCount).toBe(1);

    resetStatsPage();
    renderHook(() => useStatsRecorder(t.input, t.subscribe)).unmount();
    expect(statsForBook(t.getModel(), 'book').sessionCount).toBe(2);
  });
});
