/**
 * Test infrastructure (not a test file): real, in-memory implementations of
 * every port the attention controller receives. Nothing here touches the
 * DOM, camera, timers, or localStorage; time only moves when a test calls
 * `advance(ms)`.
 *
 * Frame scheduling and page visibility are not part of AttentionPorts in the
 * design, so they are exposed as extra members of the returned object
 * (`frames`, `visibility`) for the detection-loop work in task 3.8.
 */
import { CameraError } from '../cameraAdapter';
import type {
  AttentionPorts,
  AttentionStore,
  CameraAdapter,
  CameraErrorKind,
  CameraHandle,
  Detector,
  PageEvents,
  PoseReading,
  Thresholds,
  Unsubscribe,
} from '../types';

// ---------------------------------------------------------------------------
// Clock and interval scheduler
// ---------------------------------------------------------------------------

export interface FakeClock {
  now(): number;
  setInterval(fn: () => void, ms: number): number;
  clearInterval(id: number): void;
  /** Moves time forward, firing due intervals in time order. */
  advance(ms: number): void;
  /** Number of intervals that are still scheduled. */
  activeIntervals(): number;
}

export function createFakeClock(startMs = 1_000_000): FakeClock {
  let t = startMs;
  let nextId = 1;
  const timers = new Map<number, { fn: () => void; every: number; next: number }>();

  const dueTimer = (limit: number): [number, { fn: () => void; every: number; next: number }] | null => {
    let best: [number, { fn: () => void; every: number; next: number }] | null = null;
    for (const entry of timers) {
      if (entry[1].next <= limit && (best === null || entry[1].next < best[1].next)) best = entry;
    }
    return best;
  };

  return {
    now: () => t,
    setInterval(fn, ms) {
      const id = nextId++;
      const every = Math.max(1, ms);
      timers.set(id, { fn, every, next: t + every });
      return id;
    },
    clearInterval(id) {
      timers.delete(id);
    },
    advance(ms) {
      const target = t + Math.max(0, ms);
      for (let due = dueTimer(target); due !== null; due = dueTimer(target)) {
        const timer = due[1];
        t = timer.next;
        timer.next += timer.every;
        timer.fn();
      }
      t = target;
    },
    activeIntervals: () => timers.size,
  };
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

export interface FakeCameraHandle extends CameraHandle {
  /** Simulates a track ending on its own (device unplugged, permission revoked). */
  end(): void;
  readonly stopCalls: number;
  /** Per track: has it stopped? A stopped track is not stopped again. */
  readonly trackStopped: readonly boolean[];
  /** Per track: how many times stop was attempted on it. */
  readonly trackStopAttempts: readonly number[];
}

export interface FakeCamera extends CameraAdapter {
  /** Next open() resolves (default). */
  resolveNext(): void;
  /** Next open() rejects with a CameraError of this kind, until changed. */
  rejectWith(kind: CameraErrorKind): void;
  /** When true, stop() on handles opened from now on throws. Applies to existing handles too. */
  setStopThrows(throws: boolean): void;
  /** Tracks per handle opened from now on (default 1). */
  setTrackCount(count: number): void;
  /** While true, stopping track `index` throws (on every handle). Set false to fix it later. */
  setTrackFails(index: number, fails: boolean): void;
  readonly openCalls: number;
  /** Every handle returned so far, oldest first. */
  readonly handles: readonly FakeCameraHandle[];
  /** The most recent handle, or null. */
  last(): FakeCameraHandle | null;
}

export function createFakeCamera(): FakeCamera {
  let rejectKind: CameraErrorKind | null = null;
  let stopThrows = false;
  let trackCount = 1;
  const failingTracks = new Set<number>();
  let openCalls = 0;
  const handles: FakeCameraHandle[] = [];

  return {
    async open() {
      openCalls += 1;
      if (rejectKind !== null) throw new CameraError(rejectKind);
      const endedCallbacks: Array<() => void> = [];
      let ended = false;
      let stopCalls = 0;
      const trackStopped: boolean[] = Array.from({ length: trackCount }, () => false);
      const trackStopAttempts: number[] = Array.from({ length: trackCount }, () => 0);
      const handle: FakeCameraHandle = {
        // Detached element, as in the real adapter; frames are never read from it.
        video: document.createElement('video'),
        onEnded(cb) {
          if (ended) cb();
          else endedCallbacks.push(cb);
        },
        stop() {
          stopCalls += 1;
          // Like the real adapter: try every track not yet stopped, then rethrow.
          let failed = false;
          for (let i = 0; i < trackStopped.length; i++) {
            if (trackStopped[i]) continue;
            trackStopAttempts[i] = (trackStopAttempts[i] ?? 0) + 1;
            if (stopThrows || failingTracks.has(i)) failed = true;
            else trackStopped[i] = true;
          }
          if (failed) throw new Error('track.stop failed');
        },
        trackStopped,
        trackStopAttempts,
        end() {
          if (ended) return;
          ended = true;
          for (const cb of endedCallbacks) cb();
        },
        get stopCalls() {
          return stopCalls;
        },
      };
      handles.push(handle);
      return handle;
    },
    resolveNext() {
      rejectKind = null;
    },
    rejectWith(kind) {
      rejectKind = kind;
    },
    setStopThrows(throws) {
      stopThrows = throws;
    },
    setTrackCount(count) {
      trackCount = Math.max(1, count);
    },
    setTrackFails(index, fails) {
      if (fails) failingTracks.add(index);
      else failingTracks.delete(index);
    },
    get openCalls() {
      return openCalls;
    },
    handles,
    last: () => handles[handles.length - 1] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

export interface FakeDetector extends Detector {
  readonly closeCalls: number;
  readonly detectCalls: number;
}

export interface FakeDetectorFactory {
  create(): Promise<Detector>;
  /** Readings returned by detect(), in order. The last one repeats when the script runs out. */
  script(readings: readonly PoseReading[]): void;
  /** Replaces the script with one reading that repeats. */
  setReading(reading: PoseReading): void;
  /** detect() throws while true. */
  setDetectThrows(throws: boolean): void;
  /** create() rejects while true. */
  setCreateFails(fails: boolean): void;
  readonly createCalls: number;
  readonly detectCalls: number;
  readonly closeCalls: number;
  /** Timestamps passed to detect(), in call order. */
  readonly detectTimes: readonly number[];
  last(): FakeDetector | null;
}

export const FACING: PoseReading = { faceFound: true, yaw: 0, pitch: 0 };
export const NO_FACE: PoseReading = { faceFound: false, yaw: 0, pitch: 0 };

export function createFakeDetectorFactory(): FakeDetectorFactory {
  let readings: readonly PoseReading[] = [FACING];
  let cursor = 0;
  let detectThrows = false;
  let createFails = false;
  let createCalls = 0;
  let detectCalls = 0;
  let closeCalls = 0;
  const detectTimes: number[] = [];
  const instances: FakeDetector[] = [];

  return {
    async create() {
      createCalls += 1;
      if (createFails) throw new Error('detector creation failed');
      let ownDetects = 0;
      let ownCloses = 0;
      const detector: FakeDetector = {
        detect(_video, t) {
          detectCalls += 1;
          ownDetects += 1;
          detectTimes.push(t);
          if (detectThrows) throw new Error('detect failed');
          const reading = readings[Math.min(cursor, readings.length - 1)] ?? NO_FACE;
          cursor += 1;
          return reading;
        },
        close() {
          closeCalls += 1;
          ownCloses += 1;
        },
        get detectCalls() {
          return ownDetects;
        },
        get closeCalls() {
          return ownCloses;
        },
      };
      instances.push(detector);
      return detector;
    },
    script(next) {
      readings = next.length > 0 ? next : [NO_FACE];
      cursor = 0;
    },
    setReading(reading) {
      readings = [reading];
      cursor = 0;
    },
    setDetectThrows(throws) {
      detectThrows = throws;
    },
    setCreateFails(fails) {
      createFails = fails;
    },
    get createCalls() {
      return createCalls;
    },
    get detectCalls() {
      return detectCalls;
    },
    get closeCalls() {
      return closeCalls;
    },
    detectTimes,
    last: () => instances[instances.length - 1] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Page events
// ---------------------------------------------------------------------------

export interface FakePage extends PageEvents {
  /** Sets the tab state; fires onChange callbacks only when it changes. */
  setTabActive(active: boolean): void;
  /** Sets the time of the last input. Does not fire onChange (as in the real adapter). */
  setLastInputT(t: number): void;
  /** Fires onChange callbacks with the current value, even if unchanged. */
  fireChange(): void;
  readonly disposed: boolean;
  readonly listenerCount: number;
}

export function createFakePage(initialInputT: number): FakePage {
  let active = true;
  let lastInput = initialInputT;
  let disposed = false;
  const listeners = new Set<(tabActive: boolean) => void>();

  const notify = (): void => {
    for (const cb of Array.from(listeners)) cb(active);
  };

  return {
    tabActive: () => active,
    lastInputT: () => lastInput,
    onChange(cb): Unsubscribe {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    dispose() {
      disposed = true;
      listeners.clear();
    },
    setTabActive(next) {
      if (next === active) return;
      active = next;
      notify();
    },
    setLastInputT(t) {
      lastInput = t;
    },
    fireChange: notify,
    get disposed() {
      return disposed;
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

// ---------------------------------------------------------------------------
// Frame scheduling and visibility (extras for the detection loop, task 3.8)
// ---------------------------------------------------------------------------

export interface FakeFrames {
  /** Schedules a callback for the next frame; returns a handle for cancel(). */
  request(cb: (nowMs: number) => void): number;
  cancel(handle: number): void;
  /** Runs every callback scheduled before this call, once, with the clock's time. */
  runFrame(): void;
  /** Callbacks currently waiting for a frame. */
  readonly pending: number;
}

export function createFakeFrames(clock: Pick<FakeClock, 'now'>): FakeFrames {
  let nextHandle = 1;
  const queue = new Map<number, (nowMs: number) => void>();
  return {
    request(cb) {
      const handle = nextHandle++;
      queue.set(handle, cb);
      return handle;
    },
    cancel(handle) {
      queue.delete(handle);
    },
    runFrame() {
      const batch = Array.from(queue.entries());
      queue.clear();
      for (const [, cb] of batch) cb(clock.now());
    },
    get pending() {
      return queue.size;
    },
  };
}

export interface FakeVisibility {
  /** Document visibility, separate from focus (tab can be visible but unfocused). */
  visible(): boolean;
  setVisible(visible: boolean): void;
  onChange(cb: (visible: boolean) => void): Unsubscribe;
}

export function createFakeVisibility(): FakeVisibility {
  let visible = true;
  const listeners = new Set<(visible: boolean) => void>();
  return {
    visible: () => visible,
    setVisible(next) {
      if (next === visible) return;
      visible = next;
      for (const cb of Array.from(listeners)) cb(next);
    },
    onChange(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

export interface FakeStore extends AttentionStore {
  /** When true, every load returns null and every save returns false (as storage.ts does on failure). */
  setBroken(broken: boolean): void;
  readonly saveCalls: number;
}

export function createFakeStore(): FakeStore {
  let broken = false;
  let saveCalls = 0;
  let choice: 'camera' | 'no-camera' | null = null;
  let thresholds: Thresholds | null = null;
  let debounce: number | null = null;

  const save = (write: () => void): boolean => {
    saveCalls += 1;
    if (broken) return false;
    write();
    return true;
  };

  return {
    loadChoice: () => (broken ? null : choice),
    saveChoice: (c) => save(() => (choice = c)),
    loadThresholds: () => (broken ? null : thresholds),
    saveThresholds: (th) => save(() => (thresholds = { ...th })),
    loadDebounce: () => (broken ? null : debounce),
    saveDebounce: (ms) => save(() => (debounce = ms)),
    setBroken(next) {
      broken = next;
    },
    get saveCalls() {
      return saveCalls;
    },
  };
}

// ---------------------------------------------------------------------------
// Everything together
// ---------------------------------------------------------------------------

export interface FakePorts {
  /** Pass this to createAttention(). */
  readonly ports: AttentionPorts;
  readonly clock: FakeClock;
  readonly camera: FakeCamera;
  readonly detector: FakeDetectorFactory;
  readonly page: FakePage;
  readonly store: FakeStore;
  readonly frames: FakeFrames;
  readonly visibility: FakeVisibility;
  /** Moves the clock forward and fires due intervals. */
  advance(ms: number): void;
}

export function fakePorts(startMs = 1_000_000): FakePorts {
  const clock = createFakeClock(startMs);
  const camera = createFakeCamera();
  const detector = createFakeDetectorFactory();
  const page = createFakePage(startMs);
  const store = createFakeStore();
  const frames = createFakeFrames(clock);
  const visibility = createFakeVisibility();

  const ports: AttentionPorts = {
    now: clock.now,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    camera,
    detector,
    page,
    store,
    frames,
    visibility,
  };

  return { ports, clock, camera, detector, page, store, frames, visibility, advance: clock.advance };
}
