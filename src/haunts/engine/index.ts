/**
 * Public surface of the haunt engine for src/ui. Re-exports only; no logic and
 * no import-time side effects beyond the glob inside discover.ts.
 */
export { createHauntEngine } from './engine';
export { createGate } from './gate/gate';
export { createReducedMotion } from './gate/reducedMotion';
export { createSettingsStore, DEFAULT_SETTINGS } from './settings';
export { loadHaunts } from './registry';
export { visibleDialogs } from './dialogOrder';
export { computeRegions } from './regions';

export type { CameraChoiceLike, VisibleDialogs } from './dialogOrder';
export type { GateDeps, StorageEventTarget } from './gate/gate';
export type { VisualHosts } from './gate/visualAdapter';
export type { MatchMediaFn, MediaQueryListLike, ReducedMotionAdapter } from './gate/reducedMotion';
export type { Rect, Regions } from './regions';
export type {
  AttentionSignalLike,
  EngineDeps,
  EngineState,
  Gate,
  Haunt,
  HauntEngine,
  HauntSettings,
  SettingsStore,
  Unsubscribe,
} from './types';
