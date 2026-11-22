/**
 * Camera-off with a failed track stop (task 6.1 follow-up): real controller,
 * fake ports. The camera session is kept until every track has stopped.
 */
import { describe, expect, it } from 'vitest';
import { createAttention } from '../controller';
import type { AttentionSignal } from '../types';
import { fakePorts } from './fakes';

async function twoTrackCamera() {
  const fp = fakePorts();
  fp.camera.setTrackCount(2);
  const attention = createAttention(fp.ports);
  const signals: AttentionSignal[] = [];
  attention.subscribe((s) => signals.push(s));
  attention.start();
  await attention.openCamera();
  return { fp, attention, signals };
}

describe('setCameraOn(false) after a failed stop', () => {
  it('keeps the session, then a retry stops the rest and reports success', async () => {
    const { fp, attention } = await twoTrackCamera();
    fp.camera.setTrackFails(1, true);
    await attention.setCameraOn(false);

    const handle = fp.camera.last();
    expect(handle?.trackStopped).toEqual([true, false]);
    expect(attention.getStatus()).toMatchObject({ cameraOn: true, mode: 'fallback' });
    expect(attention.getStatus().cameraOffError).not.toBeNull();

    fp.camera.setTrackFails(1, false);
    await attention.setCameraOn(false);

    expect(handle?.trackStopped).toEqual([true, true]);
    expect(handle?.trackStopAttempts).toEqual([1, 2]);
    expect(attention.getStatus()).toMatchObject({
      cameraOn: false,
      mode: 'fallback',
      cameraOffError: null,
    });
    expect(fp.detector.closeCalls).toBe(1);
  });

  it('does not open a second camera while the session is kept', async () => {
    const { fp, attention } = await twoTrackCamera();
    fp.camera.setTrackFails(0, true);
    await attention.setCameraOn(false);
    await attention.setCameraOn(true);
    await attention.openCamera();
    expect(fp.camera.openCalls).toBe(1);
    expect(attention.getStatus().cameraOn).toBe(true);
    expect(attention.getStatus().cameraOffError).not.toBeNull();
  });

  it('keeps cameraOn true until every track has stopped', async () => {
    const { fp, attention } = await twoTrackCamera();
    fp.camera.setTrackFails(0, true);
    fp.camera.setTrackFails(1, true);
    const seen: boolean[] = [];
    attention.subscribeStatus((s) => seen.push(s.cameraOn));
    await attention.setCameraOn(false);
    await attention.setCameraOn(false);
    expect(seen.every(Boolean)).toBe(true);
    expect(attention.getStatus().cameraOn).toBe(true);

    fp.camera.setTrackFails(0, false);
    await attention.setCameraOn(false);
    expect(attention.getStatus().cameraOn).toBe(true); // track 1 still live

    fp.camera.setTrackFails(1, false);
    await attention.setCameraOn(false);
    expect(attention.getStatus().cameraOn).toBe(false);
  });

  it('lets the camera open again once the stop has succeeded', async () => {
    const { fp, attention } = await twoTrackCamera();
    fp.camera.setTrackFails(0, true);
    await attention.setCameraOn(false);
    fp.camera.setTrackFails(0, false);
    await attention.setCameraOn(false);
    await attention.setCameraOn(true);
    expect(fp.camera.openCalls).toBe(2);
    expect(attention.getStatus()).toMatchObject({ mode: 'camera', cameraOn: true });
  });

  it('keeps the signal live from page events while the session is kept', async () => {
    const { fp, attention, signals } = await twoTrackCamera();
    fp.camera.setTrackFails(0, true);
    await attention.setCameraOn(false);
    fp.page.setTabActive(false);
    fp.advance(10_000);
    expect(signals[signals.length - 1]?.value).toBe('away');
    fp.page.setTabActive(true);
    fp.advance(1_000);
    expect(signals[signals.length - 1]?.value).toBe('present');
  });
});

describe('camera lost with a failing stop', () => {
  it('keeps cameraOn true until a later stop succeeds', async () => {
    const { fp, attention } = await twoTrackCamera();
    fp.camera.setTrackFails(0, true);
    fp.camera.last()?.end();
    expect(attention.getStatus()).toMatchObject({ cameraOn: true, mode: 'fallback' });
    await attention.setCameraOn(true);
    expect(fp.camera.openCalls).toBe(1);

    fp.camera.setTrackFails(0, false);
    await attention.setCameraOn(false);
    expect(attention.getStatus()).toMatchObject({ cameraOn: false, cameraOffError: null });
  });
});
