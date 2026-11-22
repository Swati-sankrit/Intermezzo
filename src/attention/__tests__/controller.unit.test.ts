/**
 * Example tests for the real attention controller with fake ports (task 3.11).
 * Camera_Mode basics are in controllerCamera.unit.test.ts; the cases here
 * cover the idle limit, pause/stop, hidden-tab detection, face-found reset,
 * failure notices, and teardown.
 */
import { describe, expect, it } from 'vitest';
import { createAttention } from '../controller';
import type { AttentionSignal, AttentionStatus } from '../types';
import { fakePorts } from './fakes';

const TURNED = { faceFound: true, yaw: 60, pitch: 0 };
const MINUTE = 60_000;

function setup() {
  const fp = fakePorts();
  const attention = createAttention(fp.ports);
  const signals: AttentionSignal[] = [];
  attention.subscribe((s) => signals.push(s));
  attention.start();
  const last = (): AttentionSignal['value'] | undefined => signals[signals.length - 1]?.value;
  return { fp, attention, signals, last };
}

async function setupCamera() {
  const s = setup();
  await s.attention.openCamera();
  return s;
}

/** One frame every `step` ms for `ms` milliseconds. */
function run(fp: ReturnType<typeof fakePorts>, ms: number, step = 100): void {
  for (let i = 0; i < ms / step; i += 1) {
    fp.advance(step);
    fp.frames.runFrame();
  }
}

describe('setIdleLimit (Fallback_Mode)', () => {
  it('defaults to 60 s: not away at exactly 60 s of idleness, away just after', () => {
    const { fp, last } = setup();
    fp.advance(MINUTE);
    expect(last()).toBe('present');
    fp.advance(250);
    expect(last()).toBe('away');
  });

  it('clamps a value below the minimum up to 60 s', () => {
    const { fp, attention, last } = setup();
    attention.setIdleLimit(1000);
    fp.advance(30_000);
    expect(last()).toBe('present');
    fp.advance(MINUTE);
    expect(last()).toBe('away');
  });

  it('accepts a longer limit, and ignores non-finite values afterwards', () => {
    const { fp, attention, last } = setup();
    attention.setIdleLimit(120_000);
    attention.setIdleLimit(Number.NaN);
    attention.setIdleLimit(Number.POSITIVE_INFINITY);
    fp.advance(100_000);
    expect(last()).toBe('present');
    fp.advance(21_000);
    expect(last()).toBe('away');
  });

  it('keeps the default when the first value is non-finite', () => {
    const { fp, attention, last } = setup();
    attention.setIdleLimit(Number.NaN);
    fp.advance(61_000);
    expect(last()).toBe('away');
  });
});

describe('Camera_Mode ignores idle time', () => {
  it('stays present with no input for 10 minutes while the face is found', async () => {
    const { fp, attention, last } = await setupCamera();
    run(fp, 10 * MINUTE, 500);
    expect(attention.getStatus().mode).toBe('camera');
    expect(last()).toBe('present');
  });

  it('turns away on a turned head even with fresh input every tick', async () => {
    const { fp, last } = await setupCamera();
    fp.detector.setReading(TURNED);
    for (let i = 0; i < 20; i += 1) {
      fp.page.setLastInputT(fp.clock.now());
      run(fp, 100);
    }
    expect(last()).toBe('away');
  });
});

describe('stop()', () => {
  it('from Paused_State shuts everything down', () => {
    const { fp, attention, signals } = setup();
    attention.pause();
    expect(attention.getStatus().paused).toBe(true);
    attention.stop();
    expect(attention.getStatus().paused).toBe(false);
    expect(fp.clock.activeIntervals()).toBe(0);
    expect(fp.page.disposed).toBe(true);
    const count = signals.length;
    fp.advance(5 * MINUTE);
    expect(signals.length).toBe(count);
  });

  it('clears timers, page listeners, and signal and status subscribers', async () => {
    const { fp, attention, signals } = await setupCamera();
    const statuses: AttentionStatus[] = [];
    attention.subscribeStatus((s) => statuses.push(s));
    const signalCount = signals.length;
    const statusCount = statuses.length;
    const handle = fp.camera.last();
    attention.stop();
    expect(fp.clock.activeIntervals()).toBe(0);
    expect(fp.page.listenerCount).toBe(0);
    expect(fp.frames.pending).toBe(0);
    expect(handle?.stopCalls).toBe(1);
    expect(fp.detector.closeCalls).toBe(1);
    // Status changes made by stop() itself may reach subscribers before they are cleared;
    // nothing may arrive afterwards.
    const afterStop = statuses.length;
    fp.detector.setReading(TURNED);
    fp.visibility.setVisible(false);
    fp.advance(5 * MINUTE);
    fp.frames.runFrame();
    expect(statuses.length).toBe(afterStop);
    expect(afterStop).toBeGreaterThanOrEqual(statusCount);
    expect(signals.length).toBe(signalCount);
  });

  it('is idempotent', () => {
    const { attention } = setup();
    attention.stop();
    expect(() => attention.stop()).not.toThrow();
  });
});

describe('hidden tab', () => {
  it('makes no detector call while hidden, even as time passes', async () => {
    const { fp } = await setupCamera();
    run(fp, 300);
    fp.visibility.setVisible(false);
    const before = fp.detector.detectCalls;
    expect(fp.frames.pending).toBe(0);
    run(fp, 5000);
    expect(fp.detector.detectCalls).toBe(before);
  });

  it('restarts detection within 200 ms of show', async () => {
    const { fp } = await setupCamera();
    fp.visibility.setVisible(false);
    run(fp, 1000);
    const before = fp.detector.detectCalls;
    fp.visibility.setVisible(true);
    run(fp, 200, 50);
    expect(fp.detector.detectCalls).toBeGreaterThan(before);
  });

  it('treats the face as not found until the first detection after show', async () => {
    const { fp, attention, last } = await setupCamera();
    run(fp, 300);
    expect(attention.getStatus().faceFound).toBe(true);
    fp.visibility.setVisible(false);
    // Heartbeats with no face turn the signal away while hidden.
    fp.advance(3000);
    expect(last()).toBe('away');
    fp.visibility.setVisible(true);
    // Time passes with no frame: still no face, still away.
    fp.advance(500);
    expect(attention.getStatus().faceFound).toBe(false);
    expect(last()).toBe('away');
    // The first completed detection flips both.
    fp.frames.runFrame();
    expect(attention.getStatus().faceFound).toBe(true);
    expect(last()).toBe('present');
  });
});

describe('camera failures', () => {
  function noticeCounter(attention: ReturnType<typeof createAttention>) {
    const kinds: string[] = [];
    let prev: unknown = null;
    attention.subscribeStatus((s) => {
      if (s.notice !== null && s.notice !== prev) kinds.push(s.notice.kind);
      prev = s.notice;
    });
    return kinds;
  }

  it('camera ended: one notice, Fallback_Mode, last signal kept', async () => {
    const { fp, attention, signals, last } = await setupCamera();
    const kinds = noticeCounter(attention);
    fp.detector.setReading(TURNED);
    run(fp, 2000);
    expect(last()).toBe('away');
    const away = signals[signals.length - 1];
    const count = signals.length;
    fp.camera.last()?.end();
    fp.camera.last()?.end();
    expect(kinds).toEqual(['camera-lost']);
    expect(attention.getStatus()).toMatchObject({ mode: 'fallback', cameraOn: false, faceFound: false });
    expect(signals.length).toBe(count);
    expect(signals[signals.length - 1]).toEqual(away);
  });

  it('detector failure: one notice, Fallback_Mode, last signal kept', async () => {
    const { fp, attention, signals, last } = await setupCamera();
    const kinds = noticeCounter(attention);
    fp.detector.setReading(TURNED);
    run(fp, 2000);
    expect(last()).toBe('away');
    const count = signals.length;
    fp.detector.setDetectThrows(true);
    // One frame triggers the failure; later fallback ticks may legitimately
    // return to present, so check the signal right at the switch.
    run(fp, 100);
    expect(kinds).toEqual(['detector-failed']);
    expect(attention.getStatus().mode).toBe('fallback');
    expect(attention.getStatus().cameraOn).toBe(false);
    expect(fp.detector.closeCalls).toBe(1);
    expect(fp.camera.last()?.stopCalls).toBe(1);
    expect(signals.length).toBe(count);
    expect(last()).toBe('away');
  });

  it('keeps working in Fallback_Mode after a failure (idle rules apply)', async () => {
    const { fp, attention, last } = await setupCamera();
    run(fp, 200);
    fp.camera.last()?.end();
    expect(attention.getStatus().mode).toBe('fallback');
    fp.advance(61_000);
    expect(last()).toBe('away');
  });

  it('does not restart detection after falling back', async () => {
    const { fp } = await setupCamera();
    fp.camera.last()?.end();
    const before = fp.detector.detectCalls;
    fp.visibility.setVisible(false);
    fp.visibility.setVisible(true);
    run(fp, 500);
    expect(fp.detector.detectCalls).toBe(before);
  });
});
