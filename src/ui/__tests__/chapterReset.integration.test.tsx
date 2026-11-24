// Task 5.8 / 6.2 follow-up (Req 2.3, 2.4): the real reading context reaches the real engine, so a
// chapter change resets the Ghost_Distance even when the reader did not look away in between.
//
// Real: useReader, useReadingContext, AttentionLayer, HauntLayer, useHauntEngine, HauntStage,
// createHauntEngine, createGate (real adapters), the haunts from `loadRegistry`, the haunt
// settings store, the book parser (`restoreBook`) and the saved-book store (fake-indexeddb).
// Fake: the attention signal source (through the `setAttentionForTests` seam), time (vitest fake
// timers, which also move `performance.now`, the engine's clock) and the AudioContext.
//
// Why two views.
//  - `ReaderView` is the real app. It has "Next chapter" but no "previous chapter", and "Back to
//    library" unmounts the engine, so a return to an earlier chapter with the engine still alive is
//    not reachable there. The ReaderView test covers what the UI can do: next chapter.
//  - `Harness` is the highest real component that can change the chapter in both directions: it
//    calls the real `useReadingContext` and renders the real `AttentionLayer` (-> `HauntLayer` ->
//    `useHauntEngine` -> engine). Only the chapter index comes from a test prop instead of useReader.
//
// The step is observed through behaviour only: the height (viewBox) of the ghost SVG the real
// `ghostFigure` haunt draws in its side layer. It is compared with `ghostArt(step).heightUnits`.
import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { getHauntSettingsStore } from '../hauntSettingsStore';
import { ghostArt } from '../../haunts/engine/ghost/ghostArt';
import { createFakeAudioContextFactory, createFakeTime } from '../../haunts/engine/__tests__/fakes';
import { clearSavedBook, saveBook } from '../../reader/bookStore';
import { restoreBook } from '../../reader/bookCodec';
import type { AttentionSignal, AttentionStatus } from '../../attention';
import { AttentionLayer } from '../AttentionLayer';
import { ReaderView } from '../ReaderView';
import { resetAttention, setAttentionForTests, type AttentionApi } from '../useAttention';
import { useReadingContext } from '../readingContext';

const FILE = 'chapter-reset.txt';
const TITLE = 'Chapter Reset';
const TEXT = [
  'Chapter 1',
  'Alpha one.',
  'Alpha two.',
  'Chapter 2',
  'Beta one.',
  'Beta two.',
].join('\n\n');

const GHOST = '.haunt-layer[aria-label="A ghost stands nearby"]';
const nowMs = (): number => performance.timeOrigin + performance.now();

const STATUS: AttentionStatus = {
  mode: 'fallback', paused: false, cameraOn: false, cameraAvailable: true, faceFound: false,
  choice: 'no-camera', needsCalibrationOffer: false, calibration: null, notice: null, cameraOffError: null,
};

/** A controllable signal source with the surface `useAttention` needs. */
function createSignalSource() {
  const listeners = new Set<(s: AttentionSignal) => void>();
  let value: AttentionSignal['value'] = 'present';
  const api: AttentionApi = {
    subscribe(cb) {
      listeners.add(cb);
      cb({ value, timestamp: nowMs() }); // the current signal arrives at subscribe time, as in the real bus
      return () => void listeners.delete(cb);
    },
    start: () => undefined, stop: () => undefined, pause: () => undefined, resume: () => undefined,
    setIdleLimit: () => undefined,
    getStatus: () => STATUS,
    subscribeStatus: () => () => undefined,
    openCamera: async () => undefined, chooseCamera: () => undefined, setCameraOn: async () => undefined,
    startCalibration: () => undefined, cancelCalibration: () => undefined, setDebounce: () => undefined,
  };
  return {
    api,
    listenerCount: () => listeners.size,
    emit(next: AttentionSignal['value']) {
      value = next;
      act(() => {
        for (const cb of [...listeners]) cb({ value: next, timestamp: nowMs() });
      });
    },
  };
}

const advance = (ms: number): void => void act(() => void vi.advanceTimersByTime(ms));

/** The step of the ghost drawn now, from its SVG height; null when no ghost is drawn. */
function drawnStep(): number | null {
  const layers = document.querySelectorAll(GHOST);
  if (layers.length === 0) return null;
  expect(layers).toHaveLength(1);
  const viewBox = layers[0].querySelector('svg')?.getAttribute('viewBox') ?? '';
  const height = Number(viewBox.split(' ')[3]);
  const step = [0, 1, 2, 3, 4].find((s) => ghostArt(s).heightUnits === height);
  expect(step, `no ghost step has height ${height}`).toBeDefined();
  return step ?? null;
}

/** One look-away: away, wait, read the drawn step, return, wait until the room is calm again. */
function lookAway(source: ReturnType<typeof createSignalSource>): number | null {
  source.emit('away');
  advance(1000);
  const step = drawnStep();
  source.emit('present');
  advance(4000);
  expect(document.querySelectorAll(GHOST)).toHaveLength(0);
  return step;
}

let source: ReturnType<typeof createSignalSource>;
let warn: MockInstance;

function useFakeTime(): void {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
  vi.setSystemTime(1_000_000);
}

beforeEach(() => {
  localStorage.clear();
  getHauntSettingsStore().set({ mode: 'classic', noticeSeen: true });
  warn = vi.spyOn(console, 'warn');
  vi.spyOn(Math, 'random').mockReturnValue(0.9); // no Jumpscare, no False_Calm: a plain return
  const audio = createFakeAudioContextFactory(createFakeTime(0).clock);
  vi.stubGlobal('AudioContext', function FakeAudioContext() {
    return audio.create();
  });
  source = createSignalSource();
  setAttentionForTests(source.api);
});

afterEach(() => {
  cleanup();
  resetAttention();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('chapter change resets the Ghost_Distance (real hook, layer, engine)', () => {
  const book = (() => {
    const r = restoreBook(FILE, TEXT, TITLE);
    if (!r.ok) throw new Error('fixture book must parse');
    return r.book;
  })();

  function Harness({ chapterIndex }: { chapterIndex: number }) {
    const reading = useReadingContext({ book, chapterIndex, paragraphIndex: 0 });
    return (
      <main data-reading-column>
        <AttentionLayer suggestedSecs={30} reading={reading}>{() => null}</AttentionLayer>
      </main>
    );
  }
  const setChapter = (view: ReturnType<typeof render>, index: number) =>
    act(() => view.rerender(<Harness chapterIndex={index} />));

  it('chapter 1 twice, chapter 2, back to chapter 1 with no look-away in between: the next look-away is at step 0', () => {
    useFakeTime();
    const view = render(<Harness chapterIndex={0} />);
    expect(source.listenerCount()).toBe(1); // the engine is running

    expect(lookAway(source)).toBe(0);
    expect(lookAway(source)).toBe(1); // the ghost grew, so the next check is not vacuous

    setChapter(view, 1);
    setChapter(view, 0);
    expect(lookAway(source)).toBe(0);
    expect(lookAway(source)).toBe(1); // and it counts up again from there
    expect(warn).not.toHaveBeenCalled();
  });

  it('negative case: with no chapter change, the third look-away is at step 2', () => {
    useFakeTime();
    render(<Harness chapterIndex={0} />);
    expect([lookAway(source), lookAway(source), lookAway(source)]).toEqual([0, 1, 2]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('a paragraph change is not a chapter change: the count keeps growing', () => {
    useFakeTime();
    function Reading({ paragraphIndex }: { paragraphIndex: number }) {
      const reading = useReadingContext({ book, chapterIndex: 0, paragraphIndex });
      return (
        <main data-reading-column>
          <AttentionLayer suggestedSecs={30} reading={reading}>{() => null}</AttentionLayer>
        </main>
      );
    }
    const view = render(<Reading paragraphIndex={0} />);
    expect(lookAway(source)).toBe(0);
    act(() => view.rerender(<Reading paragraphIndex={1} />));
    expect(lookAway(source)).toBe(1);
  });

  it('unmounting releases the engine and its signal subscription', () => {
    useFakeTime();
    const view = render(<Harness chapterIndex={0} />);
    expect(source.listenerCount()).toBe(1);
    view.unmount();
    expect(source.listenerCount()).toBe(0);
  });
});

describe('real ReaderView: Next chapter resets the Ghost_Distance', () => {
  beforeEach(async () => {
    await clearSavedBook();
    await saveBook(FILE, TEXT, TITLE);
  });

  it('look away twice in chapter 1, open chapter 2: the first look-away there is at step 0', async () => {
    useFakeTime(); // before the render, so the engine and the signals share one clock
    render(<ReaderView />);
    // The saved book is restored from IndexedDB (setImmediate stays real); wait for it to show.
    for (let i = 0; i < 100 && screen.queryByTestId('active-paragraph') === null; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
    }
    expect(screen.getByTestId('active-paragraph')).toHaveTextContent('Alpha one.');

    expect(lookAway(source)).toBe(0);
    expect(lookAway(source)).toBe(1);

    const active = () => screen.getByTestId('active-paragraph');
    fireEvent.click(active()); // Alpha two.
    fireEvent.click(active()); // past the last paragraph: chapter complete
    fireEvent.click(screen.getByRole('button', { name: 'Next chapter' }));
    expect(screen.getByRole('heading', { name: 'Chapter 2' })).toBeInTheDocument();

    expect(lookAway(source)).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });
});
