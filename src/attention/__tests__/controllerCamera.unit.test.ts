/**
 * Minimal end-to-end sanity run of Camera_Mode with the real controller and
 * fake ports (task 3.8). The full property and example tests are 3.10 and 3.11.
 */
import { describe, expect, it } from 'vitest';
import { createAttention } from '../controller';
import type { AttentionSignal } from '../types';
import { FACING, NO_FACE, fakePorts } from './fakes';

const TURNED = { faceFound: true, yaw: 60, pitch: 0 };

async function startedCamera() {
  const fp = fakePorts();
  const attention = createAttention(fp.ports);
  const signals: AttentionSignal[] = [];
  attention.subscribe((s) => signals.push(s));
  attention.start();
  await attention.openCamera();
  return { fp, attention, signals };
}

/** One frame every 100 ms for `ms` milliseconds. */
function run(fp: ReturnType<typeof fakePorts>, ms: number): void {
  for (let i = 0; i < ms / 100; i += 1) {
    fp.advance(100);
    fp.frames.runFrame();
  }
}

describe('Camera_Mode', () => {
  it('switches to camera mode and detects frames', async () => {
    const { fp, attention } = await startedCamera();
    expect(attention.getStatus()).toMatchObject({ mode: 'camera', cameraOn: true });
    run(fp, 300);
    expect(fp.detector.detectCalls).toBeGreaterThan(0);
    expect(attention.getStatus().faceFound).toBe(true);
  });

  it('turns away after a long look-away and back on return', async () => {
    const { fp, attention, signals } = await startedCamera();
    fp.detector.setReading(TURNED);
    run(fp, 2000);
    expect(signals[signals.length - 1]?.value).toBe('away');
    fp.detector.setReading(FACING);
    run(fp, 200);
    expect(signals[signals.length - 1]?.value).toBe('present');
    expect(attention.getStatus().mode).toBe('camera');
  });

  it('makes no detection calls while hidden, and restarts after show', async () => {
    const { fp, attention } = await startedCamera();
    run(fp, 200);
    fp.visibility.setVisible(false);
    const before = fp.detector.detectCalls;
    run(fp, 1000);
    expect(fp.detector.detectCalls).toBe(before);
    expect(attention.getStatus().faceFound).toBe(false);
    fp.visibility.setVisible(true);
    expect(attention.getStatus().faceFound).toBe(false);
    run(fp, 100);
    expect(fp.detector.detectCalls).toBeGreaterThan(before);
    expect(attention.getStatus().faceFound).toBe(true);
  });

  it('sends heartbeat samples without frames and turns away on no face', async () => {
    const { fp, signals } = await startedCamera();
    fp.detector.setReading(NO_FACE);
    run(fp, 200);
    fp.advance(2000); // no frames; only the 250 ms heartbeat runs
    expect(signals[signals.length - 1]?.value).toBe('away');
  });

  it('falls back with one notice on denial and does not retry', async () => {
    const fp = fakePorts();
    const attention = createAttention(fp.ports);
    attention.start();
    fp.camera.rejectWith('denied');
    await attention.openCamera();
    await attention.openCamera();
    expect(fp.camera.openCalls).toBe(1);
    expect(attention.getStatus()).toMatchObject({
      mode: 'fallback',
      cameraOn: false,
      cameraAvailable: false,
    });
    expect(attention.getStatus().notice?.kind).toBe('denied');
  });

  it('releases the camera and falls back when the track ends', async () => {
    const { fp, attention } = await startedCamera();
    fp.camera.last()?.end();
    expect(fp.camera.last()?.stopCalls).toBe(1);
    expect(fp.detector.closeCalls).toBe(1);
    expect(attention.getStatus()).toMatchObject({ mode: 'fallback', cameraOn: false });
    expect(attention.getStatus().notice?.kind).toBe('camera-lost');
  });

  it('falls back when detect throws', async () => {
    const { fp, attention } = await startedCamera();
    fp.detector.setDetectThrows(true);
    run(fp, 200);
    expect(attention.getStatus().notice?.kind).toBe('detector-failed');
    expect(attention.getStatus().mode).toBe('fallback');
    expect(fp.camera.last()?.stopCalls).toBe(1);
  });

  it('falls back and stops the camera when detector creation fails', async () => {
    const fp = fakePorts();
    const attention = createAttention(fp.ports);
    attention.start();
    fp.detector.setCreateFails(true);
    await attention.openCamera();
    expect(attention.getStatus().notice?.kind).toBe('detector-failed');
    expect(attention.getStatus().cameraOn).toBe(false);
    expect(fp.camera.last()?.stopCalls).toBe(1);
  });
});
