/**
 * Unit tests for cameraAdapter and detectorAdapter. The adapters are real;
 * only the browser (navigator.mediaDevices, video playback) and the
 * @mediapipe/tasks-vision module are faked.
 *
 * Requirements: 2.6, 7.5
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCameraAdapter, CameraError } from '../cameraAdapter';
import { createDetector } from '../detectorAdapter';

// ---------------------------------------------------------------------------
// Fake MediaPipe module
// ---------------------------------------------------------------------------

const mp = vi.hoisted(() => {
  interface FakeResult {
    faceLandmarks: unknown[];
    facialTransformationMatrixes?: unknown[];
  }
  const state = {
    /** Delegates passed to createFromOptions, in call order. */
    delegates: [] as string[],
    /** Per-delegate failure switches. */
    failGpu: false,
    failCpu: false,
    /** Timestamps passed to detectForVideo. */
    timestamps: [] as number[],
    /** Result returned by the next detectForVideo. */
    result: { faceLandmarks: [] } as FakeResult,
    close: vi.fn(),
    forVisionTasks: vi.fn(async (path: string) => ({ wasmLoaderPath: path })),
  };
  return state;
});

vi.mock('@mediapipe/tasks-vision', () => {
  return {
    FilesetResolver: { forVisionTasks: mp.forVisionTasks },
    FaceLandmarker: {
      createFromOptions: vi.fn(
        async (_fileset: unknown, options: { baseOptions: { delegate: string } }) => {
          const delegate = options.baseOptions.delegate;
          mp.delegates.push(delegate);
          if (delegate === 'GPU' && mp.failGpu) throw new Error('gpu failed');
          if (delegate === 'CPU' && mp.failCpu) throw new Error('cpu failed');
          return {
            detectForVideo: (_video: unknown, ts: number) => {
              mp.timestamps.push(ts);
              return mp.result;
            },
            close: mp.close,
          };
        },
      ),
    },
  };
});

// ---------------------------------------------------------------------------
// Fake browser camera
// ---------------------------------------------------------------------------

class FakeTrack extends EventTarget {
  stop = vi.fn();
}

function installMediaDevices(getUserMedia: () => Promise<unknown>): void {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(getUserMedia) },
  });
}

function streamOf(tracks: FakeTrack[]): unknown {
  return { getTracks: () => tracks };
}

function rejectWith(name: string): void {
  installMediaDevices(() => Promise.reject(Object.assign(new Error(name), { name })));
}

beforeEach(() => {
  mp.delegates = [];
  mp.failGpu = false;
  mp.failCpu = false;
  mp.timestamps = [];
  mp.result = { faceLandmarks: [] };
  mp.close.mockClear();
  mp.forVisionTasks.mockClear();
  // jsdom does not implement media playback; this is the browser boundary.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'mediaDevices');
});

// ---------------------------------------------------------------------------
// cameraAdapter
// ---------------------------------------------------------------------------

describe('cameraAdapter.open error mapping', () => {
  it.each(['NotAllowedError', 'SecurityError'])('maps %s to denied', async (name) => {
    rejectWith(name);
    await expect(createCameraAdapter().open()).rejects.toMatchObject({
      name: 'CameraError',
      kind: 'denied',
    });
  });

  it.each(['NotFoundError', 'NotReadableError', 'OverconstrainedError', 'AbortError'])(
    'maps %s to unavailable',
    async (name) => {
      rejectWith(name);
      const err = await createCameraAdapter()
        .open()
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(CameraError);
      expect((err as CameraError).kind).toBe('unavailable');
    },
  );

  it('maps a rejection that is not an Error object to unavailable', async () => {
    installMediaDevices(() => Promise.reject('boom'));
    await expect(createCameraAdapter().open()).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('requests only a front-facing video track, no audio', async () => {
    installMediaDevices(() => Promise.resolve(streamOf([new FakeTrack()])));
    await createCameraAdapter().open();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: 'user' },
      audio: false,
    });
  });

  it('stops the tracks and reports unavailable when playback fails', async () => {
    const track = new FakeTrack();
    installMediaDevices(() => Promise.resolve(streamOf([track])));
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('no play'));
    await expect(createCameraAdapter().open()).rejects.toMatchObject({ kind: 'unavailable' });
    expect(track.stop).toHaveBeenCalledTimes(1);
  });
});

describe('cameraAdapter handle', () => {
  it('returns a muted, inline video that is not in the document', async () => {
    installMediaDevices(() => Promise.resolve(streamOf([new FakeTrack()])));
    const handle = await createCameraAdapter().open();
    expect(handle.video.muted).toBe(true);
    expect(handle.video.playsInline).toBe(true);
    expect(handle.video.isConnected).toBe(false);
  });

  it('fires onEnded when a track ends, once, even if several tracks end', async () => {
    const a = new FakeTrack();
    const b = new FakeTrack();
    installMediaDevices(() => Promise.resolve(streamOf([a, b])));
    const handle = await createCameraAdapter().open();
    const cb = vi.fn();
    handle.onEnded(cb);
    expect(cb).not.toHaveBeenCalled();
    b.dispatchEvent(new Event('ended'));
    a.dispatchEvent(new Event('ended'));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('calls an onEnded callback registered after the track already ended', async () => {
    const a = new FakeTrack();
    installMediaDevices(() => Promise.resolve(streamOf([a])));
    const handle = await createCameraAdapter().open();
    a.dispatchEvent(new Event('ended'));
    const cb = vi.fn();
    handle.onEnded(cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('stop() stops every track', async () => {
    const tracks = [new FakeTrack(), new FakeTrack(), new FakeTrack()];
    installMediaDevices(() => Promise.resolve(streamOf(tracks)));
    const handle = await createCameraAdapter().open();
    handle.stop();
    for (const t of tracks) expect(t.stop).toHaveBeenCalledTimes(1);
  });

  it('stop() still stops the remaining tracks and rethrows when one throws', async () => {
    const tracks = [new FakeTrack(), new FakeTrack(), new FakeTrack()];
    const failure = new Error('stop failed');
    tracks[1].stop.mockImplementation(() => {
      throw failure;
    });
    installMediaDevices(() => Promise.resolve(streamOf(tracks)));
    const handle = await createCameraAdapter().open();
    expect(() => handle.stop()).toThrow(failure);
    for (const t of tracks) expect(t.stop).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// detectorAdapter
// ---------------------------------------------------------------------------

const video = document.createElement('video');

/** Column-major 4x4 whose third column (indices 8..10) is the given direction. */
function matrixLooking(x: number, y: number, z: number): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, x, y, z, 0, 0, 0, 0, 1];
}

function withMatrix(matrix: unknown): void {
  mp.result = { faceLandmarks: [[{ x: 0, y: 0, z: 0 }]], facialTransformationMatrixes: [matrix] };
}

describe('detectorAdapter.detect', () => {
  it('gives faceFound:false for empty faceLandmarks, even with a valid matrix', async () => {
    mp.result = {
      faceLandmarks: [],
      facialTransformationMatrixes: [{ rows: 4, columns: 4, data: matrixLooking(0, 0, 1) }],
    };
    const d = await createDetector();
    expect(d.detect(video, 10)).toEqual({ faceFound: false, yaw: 0, pitch: 0 });
  });

  it('gives faceFound:false when the matrix list is missing', async () => {
    mp.result = { faceLandmarks: [[{ x: 0, y: 0, z: 0 }]] };
    const d = await createDetector();
    expect(d.detect(video, 10).faceFound).toBe(false);
  });

  it.each([
    ['undefined matrix', undefined],
    ['null matrix', null],
    ['wrong rows', { rows: 3, columns: 4, data: matrixLooking(0, 0, 1) }],
    ['wrong columns', { rows: 4, columns: 3, data: matrixLooking(0, 0, 1) }],
    ['short data', { rows: 4, columns: 4, data: matrixLooking(0, 0, 1).slice(0, 15) }],
    ['long data', { rows: 4, columns: 4, data: [...matrixLooking(0, 0, 1), 0] }],
    ['data not an array', { rows: 4, columns: 4, data: 'x'.repeat(16) }],
    ['missing data', { rows: 4, columns: 4 }],
  ])('gives faceFound:false for an invalid matrix: %s', async (_label, matrix) => {
    withMatrix(matrix);
    const d = await createDetector();
    expect(d.detect(video, 10).faceFound).toBe(false);
  });

  it('gives faceFound:false for a matrix with a non-finite entry', async () => {
    const data = matrixLooking(0, 0, 1);
    data[5] = NaN;
    withMatrix({ rows: 4, columns: 4, data });
    const d = await createDetector();
    expect(d.detect(video, 10).faceFound).toBe(false);
  });

  it('reads a valid column-major matrix as the expected yaw', async () => {
    const yaw = 30;
    const rad = (yaw * Math.PI) / 180;
    withMatrix({ rows: 4, columns: 4, data: matrixLooking(Math.sin(rad), 0, Math.cos(rad)) });
    const d = await createDetector();
    const reading = d.detect(video, 10);
    expect(reading.faceFound).toBe(true);
    expect(reading.yaw).toBeCloseTo(30, 6);
    expect(reading.pitch).toBeCloseTo(0, 6);
  });

  it('reads a valid column-major matrix as the expected pitch', async () => {
    const rad = (20 * Math.PI) / 180;
    withMatrix({ rows: 4, columns: 4, data: matrixLooking(0, -Math.sin(rad), Math.cos(rad)) });
    const d = await createDetector();
    const reading = d.detect(video, 10);
    expect(reading.faceFound).toBe(true);
    expect(reading.pitch).toBeCloseTo(20, 6);
    expect(reading.yaw).toBeCloseTo(0, 6);
  });

  it('returns only faceFound, yaw and pitch', async () => {
    withMatrix({ rows: 4, columns: 4, data: matrixLooking(0, 0, 1) });
    const d = await createDetector();
    expect(Object.keys(d.detect(video, 10)).sort()).toEqual(['faceFound', 'pitch', 'yaw']);
  });
});

describe('detectorAdapter timestamps', () => {
  it('passes strictly increasing timestamps for repeated and decreasing input', async () => {
    const d = await createDetector();
    for (const t of [100, 100, 100, 50, 0, 200, 200, 199.9, 1000]) d.detect(video, t);
    expect(mp.timestamps).toHaveLength(9);
    for (let i = 1; i < mp.timestamps.length; i++) {
      expect(mp.timestamps[i]).toBeGreaterThan(mp.timestamps[i - 1]);
    }
  });

  it('passes the input through unchanged when it is already increasing', async () => {
    const d = await createDetector();
    for (const t of [10, 20, 35]) d.detect(video, t);
    expect(mp.timestamps).toEqual([10, 20, 35]);
  });

  it('keeps increasing after a non-finite input that follows a finite one', async () => {
    const d = await createDetector();
    d.detect(video, 100);
    d.detect(video, NaN);
    d.detect(video, 101);
    expect(mp.timestamps[1]).toBeGreaterThan(mp.timestamps[0]);
    expect(mp.timestamps[2]).toBeGreaterThan(mp.timestamps[1]);
  });

  it.each([NaN, Infinity, -Infinity])(
    'passes finite, strictly increasing timestamps when the first t is %s',
    async (first) => {
      const d = await createDetector();
      for (const t of [first, 5, Infinity, NaN, 3, 50]) d.detect(video, t);
      expect(mp.timestamps).toHaveLength(6);
      expect(mp.timestamps[0]).toBe(0);
      for (const ts of mp.timestamps) expect(Number.isFinite(ts)).toBe(true);
      for (let i = 1; i < mp.timestamps.length; i++) {
        expect(mp.timestamps[i]).toBeGreaterThan(mp.timestamps[i - 1]);
      }
    },
  );
});

describe('detectorAdapter creation', () => {
  it('loads the wasm from the same origin and uses the GPU delegate first', async () => {
    await createDetector();
    expect(mp.forVisionTasks).toHaveBeenCalledWith('/mediapipe/wasm');
    expect(mp.delegates).toEqual(['GPU']);
  });

  it('retries exactly once on CPU when the GPU delegate fails', async () => {
    mp.failGpu = true;
    const d = await createDetector();
    expect(mp.delegates).toEqual(['GPU', 'CPU']);
    expect(d.detect(video, 1).faceFound).toBe(false);
  });

  it('rejects, with no further retry, when the CPU retry also fails', async () => {
    mp.failGpu = true;
    mp.failCpu = true;
    await expect(createDetector()).rejects.toThrow('cpu failed');
    expect(mp.delegates).toEqual(['GPU', 'CPU']);
  });

  it('calls close() on the landmarker when the detector is closed', async () => {
    const d = await createDetector();
    expect(mp.close).not.toHaveBeenCalled();
    d.close();
    expect(mp.close).toHaveBeenCalledTimes(1);
  });
});
