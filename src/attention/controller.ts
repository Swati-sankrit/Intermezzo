/**
 * Attention controller: Fallback_Mode (3.7) plus Camera_Mode orchestration
 * (3.8, camera path in controllerCamera.ts) and the consent flow (5.2).
 * Camera-off comes in 6.1. It never reads book data.
 */
import { clampIdleLimit } from './config';
import { createCameraPath } from './controllerCamera';
import { createSetCameraOn } from './controllerCameraControl';
import { defaultPorts } from './controllerPorts';
import {
  TICK_MS,
  buildFallbackSample,
  createStatusStore,
  fallbackConfig,
  initialCore,
} from './controllerState';
import { initialDecisionState } from './decision';
import { initialFallbackState, stepFallback } from './fallback';
import { createSignalBus, type SignalBus } from './signalBus';
import type {
  AttentionPorts,
  AttentionSignal,
  AttentionStatus,
  Unsubscribe,
} from './types';

export interface Attention {
  subscribe(cb: (s: AttentionSignal) => void): Unsubscribe;
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  setIdleLimit(ms: number): void;
}

export interface AttentionControls {
  getStatus(): AttentionStatus;
  subscribeStatus(cb: (s: AttentionStatus) => void): Unsubscribe;
  /** Opens camera and detector; the consent flow (5.2) and setCameraOn (6.1) call this. */
  openCamera(): Promise<void>;
  chooseCamera(on: boolean): void;
  setCameraOn(on: boolean): Promise<void>;
  startCalibration(): void;
  cancelCalibration(): void;
  setDebounce(ms: number): void;
}

function notYet(task: string): never {
  throw new Error(`Not implemented yet (${task}).`);
}

export function createAttention(
  ports?: Partial<AttentionPorts>,
): Attention & AttentionControls {
  const p: AttentionPorts = { ...defaultPorts(), ...ports };
  const core = initialCore();
  const status = createStatusStore();
  let bus: SignalBus | null = null;
  const cam = createCameraPath({ ports: p, core, status, getBus: () => bus });

  const ensureBus = (): SignalBus =>
    (bus ??= createSignalBus({ value: 'present', timestamp: p.now() }));

  function tick(): void {
    if (!core.running || core.paused || core.fallback === null || bus === null) return;
    if (status.get().mode === 'camera') {
      cam.heartbeat();
      return;
    }
    const sample = buildFallbackSample(p.now(), p.page, core.idleOrigin);
    core.fallback = stepFallback(core.fallback, sample, fallbackConfig(core));
    bus.publish(core.fallback.signal);
  }

  function start(): void {
    if (core.running) return;
    const b = ensureBus();
    const t = p.now();
    core.running = true;
    core.paused = false;
    core.idleOrigin = t;
    core.decision = initialDecisionState(t, b.current());
    core.fallback = initialFallbackState(t, b.current());
    status.set({ mode: 'fallback', paused: false });
    core.unsubPage = p.page.onChange(() => tick());
    core.timerId = p.setInterval(tick, TICK_MS);
    // Recorded choice (Req 1.4 to 1.6). Unreadable storage counts as no choice.
    const recorded = readChoice();
    status.set({ choice: recorded ?? 'unanswered' });
    if (recorded === 'camera') void cam.open();
  }

  function readChoice(): 'camera' | 'no-camera' | null {
    try {
      return p.store.loadChoice();
    } catch {
      return null;
    }
  }

  function chooseCamera(on: boolean): void {
    const choice = on ? 'camera' : 'no-camera';
    try {
      // A failed write is not an error: the choice still applies for this Session.
      p.store.saveChoice(choice);
    } catch {
      // Same as a false return.
    }
    status.set({ choice });
    if (on) {
      void cam.open();
      return;
    }
    // Cancels any open in flight, then stays in (or returns to) Fallback_Mode.
    cam.release();
    status.set({ mode: 'fallback', cameraOn: cam.retained(), faceFound: false });
    if (bus !== null && core.running) {
      const t = p.now();
      core.fallback = initialFallbackState(t, bus.current());
      core.idleOrigin = t;
    }
  }

  function stop(): void {
    if (!core.running) return;
    core.running = false;
    core.paused = false;
    cam.release();
    status.set({ mode: 'fallback', cameraOn: cam.retained(), faceFound: false });
    if (core.timerId !== null) p.clearInterval(core.timerId);
    core.timerId = null;
    core.unsubPage?.();
    core.unsubPage = null;
    p.page.dispose();
    bus?.clear();
    bus = null;
    status.set({ paused: false });
    status.clearSubscribers();
  }

  function pause(): void {
    if (!core.running || core.paused || bus === null) return;
    core.paused = true;
    status.set({ paused: true });
    if (bus.current().value === 'away') bus.publish({ value: 'present', timestamp: p.now() });
  }

  function resume(): void {
    if (!core.running || !core.paused || bus === null) return;
    const t = p.now();
    core.decision = initialDecisionState(t, bus.current());
    core.fallback = initialFallbackState(t, bus.current());
    core.idleOrigin = t;
    core.paused = false;
    status.set({ paused: false });
  }

  return {
    subscribe: (cb) => ensureBus().subscribe(cb),
    start,
    stop,
    pause,
    resume,
    setIdleLimit(ms) {
      core.idleLimitMs = clampIdleLimit(ms, core.idleLimitMs);
    },
    getStatus: status.get,
    subscribeStatus: status.subscribe,
    openCamera: cam.open,
    chooseCamera,
    setCameraOn: createSetCameraOn({ ports: p, core, status, cam, getBus: () => bus }),
    startCalibration: () => notYet('calibration, a later task'),
    cancelCalibration: () => notYet('calibration, a later task'),
    setDebounce: () => notYet('debounce setting, a later task'),
  };
}
