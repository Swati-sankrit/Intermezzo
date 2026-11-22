/**
 * Types and constants for the camera path (controllerCamera.ts). No DOM,
 * clock, or camera access here.
 */
import { DEFAULT_DEBOUNCE_MS, DEFAULT_RETURN_MS, DEFAULT_THRESHOLDS } from './config';
import type { ControllerCore, StatusStore } from './controllerState';
import type { SignalBus } from './signalBus';
import type {
  AttentionPorts,
  CameraHandle,
  DecisionConfig,
  Detector,
  PoseReading,
  Unsubscribe,
} from './types';

export const CAMERA_CONFIG: DecisionConfig = {
  thresholds: DEFAULT_THRESHOLDS,
  debounceMs: DEFAULT_DEBOUNCE_MS,
  returnMs: DEFAULT_RETURN_MS,
};

export const NO_FACE: PoseReading = { faceFound: false, yaw: 0, pitch: 0 };

export interface CameraPathDeps {
  ports: AttentionPorts;
  core: ControllerCore;
  status: StatusStore;
  getBus(): SignalBus | null;
}

export interface CameraPath {
  /** Opens camera and detector in parallel. Resolves when the attempt is settled. */
  open(): Promise<void>;
  /** Sends one sample built from the latest reading. No-op outside Camera_Mode. */
  heartbeat(): void;
  /** Stops every track and closes the detector. Returns false if either threw. */
  release(): boolean;
  /** True while a handle whose stop() threw is kept. Repeating release() retries it. */
  retained(): boolean;
}

export interface Session {
  handle: CameraHandle;
  detector: Detector;
  frame: number | null;
  lastStart: number | null;
  unsubVisibility: Unsubscribe;
}
