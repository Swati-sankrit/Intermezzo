/**
 * Explicit camera on/off control (Req 2.3, 2.6, 2.7, 9.2, 9.6). Kept apart from
 * controller.ts to stay under the file size limit. No DOM or camera access.
 */
import type { ControllerCore, StatusStore } from './controllerState';
import type { CameraPath } from './controllerCameraTypes';
import { initialFallbackState } from './fallback';
import { NOTICE_TEXT } from './notices';
import type { SignalBus } from './signalBus';
import type { AttentionPorts } from './types';

export interface CameraControlDeps {
  ports: AttentionPorts;
  core: ControllerCore;
  status: StatusStore;
  cam: CameraPath;
  getBus(): SignalBus | null;
}

export function createSetCameraOn(deps: CameraControlDeps): (on: boolean) => Promise<void> {
  const { ports: p, core, status, cam } = deps;

  return async function setCameraOn(on: boolean): Promise<void> {
    if (on) {
      // A session is still held after a failed stop: never open a second camera,
      // and keep the "could not turn off" message, which is still true.
      if (cam.retained()) return;
      // The explicit retry: the only way past a denial (Req 1.7, 5.2).
      status.set({ cameraAvailable: true, cameraOffError: null });
      await cam.open();
      return;
    }
    // release() closes the detector and stops the tracks. If a stop throws, the
    // handle is retained and a repeated call retries it.
    const clean = cam.release();
    // While a handle is retained, cameraOn stays true (the indicator tells the
    // truth) but the detection loop is gone, so the signal comes from the
    // Fallback_Mode logic (page events and idle time). Without that it would
    // freeze at its last value. The reader keeps working and can retry.
    status.set({
      mode: 'fallback',
      cameraOn: cam.retained(),
      faceFound: false,
      cameraOffError: clean ? null : NOTICE_TEXT.cameraOffFailed,
    });
    const bus = deps.getBus();
    if (bus !== null && core.running) {
      const t = p.now();
      core.fallback = initialFallbackState(t, bus.current());
      core.idleOrigin = t;
    }
  };
}
