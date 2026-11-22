/**
 * Camera_Mode path of the attention controller. Owns the camera handle, the
 * detector, the detection loop, and the one place that releases them.
 *
 * Privacy: only the boolean `faceFound` reaches the status. The latest yaw and
 * pitch stay in a private variable so the heartbeat can repeat them; no frame,
 * landmark, or MediaPipe result object is kept.
 */
import { CameraError } from './cameraAdapter';
import {
  CAMERA_CONFIG,
  NO_FACE,
  type CameraPath,
  type CameraPathDeps,
  type Session,
} from './controllerCameraTypes';
import { initialDecisionState, stepDecision } from './decision';
import { initialFallbackState } from './fallback';
import { initialNoticeGate, raiseNotice } from './notices';
import { canStartDetection } from './rateGate';
import { createRetainedHandle } from './retainedHandle';
import type { CameraHandle, Detector, NoticeKind, PoseReading } from './types';

export function createCameraPath(deps: CameraPathDeps): CameraPath {
  const { ports: p, core, status } = deps;
  let gate = initialNoticeGate();
  let session: Session | null = null;
  let latest: PoseReading = NO_FACE;
  let generation = 0;
  let opening = false;
  const held = createRetainedHandle();
  function raise(kind: NoticeKind): void {
    const r = raiseNotice(gate, kind);
    gate = r.state;
    if (r.notice !== null) status.set({ notice: r.notice });
  }

  function feed(): void {
    const bus = deps.getBus();
    if (bus === null || core.decision === null || core.paused) return;
    core.decision = stepDecision(
      core.decision,
      {
        t: p.now(),
        faceFound: latest.faceFound,
        yaw: latest.yaw,
        pitch: latest.pitch,
        tabActive: p.page.tabActive(),
      },
      CAMERA_CONFIG,
    );
    bus.publish(core.decision.signal);
  }

  function setLatest(reading: PoseReading): void {
    latest = reading;
    status.set({ faceFound: reading.faceFound });
  }

  function schedule(s: Session): void {
    if (session !== s || s.frame !== null || !p.visibility.visible()) return;
    s.frame = p.frames.request(() => onFrame(s), s.handle.video);
  }

  function onFrame(s: Session): void {
    s.frame = null;
    if (session !== s || !p.visibility.visible()) return;
    const t = p.now();
    if (!canStartDetection(t, s.lastStart, true)) {
      schedule(s);
      return;
    }
    s.lastStart = t;
    let reading: PoseReading;
    try {
      reading = s.detector.detect(s.handle.video, t);
    } catch {
      fallBack('detector-failed');
      return;
    }
    setLatest({ faceFound: reading.faceFound, yaw: reading.yaw, pitch: reading.pitch });
    feed();
    schedule(s);
  }

  function onVisibility(s: Session, visible: boolean): void {
    if (session !== s) return;
    if (visible) {
      // faceFound stays false until the first new detection completes.
      schedule(s);
      return;
    }
    if (s.frame !== null) p.frames.cancel(s.frame);
    s.frame = null;
    setLatest(NO_FACE);
    feed();
  }

  function release(): boolean {
    generation += 1;
    const s = session;
    session = null;
    latest = NO_FACE;
    if (s === null) return held.retry(); // retry the retained handle, if any
    if (s.frame !== null) p.frames.cancel(s.frame);
    s.unsubVisibility();
    let clean = true;
    try {
      s.detector.close();
    } catch {
      clean = false;
    }
    return held.stop(s.handle) && clean;
  }

  function enterFallback(): void {
    const bus = deps.getBus();
    // cameraOn stays true while a handle is retained, so the indicator is honest.
    status.set({ mode: 'fallback', cameraOn: held.has(), faceFound: false });
    if (bus === null) return;
    const t = p.now();
    core.fallback = initialFallbackState(t, bus.current());
    core.idleOrigin = t;
  }

  function fallBack(cause: 'camera-lost' | 'detector-failed'): void {
    release();
    raise(cause);
    enterFallback();
  }

  function start(handle: CameraHandle, detector: Detector): void {
    const bus = deps.getBus();
    if (bus === null || core.decision === null) return;
    const s: Session = {
      handle,
      detector,
      frame: null,
      lastStart: null,
      unsubVisibility: () => undefined,
    };
    session = s;
    s.unsubVisibility = p.visibility.onChange((v) => onVisibility(s, v));
    handle.onEnded(() => {
      if (session === s) fallBack('camera-lost');
    });
    core.decision = initialDecisionState(p.now(), bus.current());
    latest = NO_FACE;
    status.set({ mode: 'camera', cameraOn: true, faceFound: false });
    schedule(s);
  }

  async function open(): Promise<void> {
    if (opening || session !== null || held.has() || !core.running || !status.get().cameraAvailable) return;
    opening = true;
    generation += 1;
    const mine = generation;
    try {
      const [cam, det] = await Promise.allSettled([p.camera.open(), p.detector.create()]);
      const stale = mine !== generation || !core.running;
      if (cam.status === 'fulfilled' && det.status === 'fulfilled' && !stale) {
        start(cam.value, det.value);
        return;
      }
      if (det.status === 'fulfilled') safely(() => det.value.close());
      if (cam.status === 'fulfilled') held.stop(cam.value);
      if (stale) return;
      if (cam.status === 'rejected') {
        const denied = cam.reason instanceof CameraError && cam.reason.kind === 'denied';
        if (denied) status.set({ cameraAvailable: false });
        raise(denied ? 'denied' : 'camera-lost');
      } else {
        raise('detector-failed');
      }
      enterFallback();
    } finally {
      opening = false;
    }
  }

  return {
    open,
    heartbeat() {
      if (session !== null) feed();
    },
    release,
    retained: held.has,
  };
}

function safely(fn: () => void): void {
  try {
    fn();
  } catch {
    // Cleanup of a half-opened pair must not mask the original failure.
  }
}
