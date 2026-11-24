import { useEffect } from 'react';
import {
  createGate,
  createHauntEngine,
  createReducedMotion,
  loadRegistry,
  type AttentionSignalLike,
  type Gate,
  type HauntSettings,
  type Unsubscribe,
  type VisualHosts,
} from '../haunts/engine';
import type { ReadingContext } from '../haunts/engine/returnTypes';
import { getHauntSettingsStore } from './hauntSettingsStore';
import { measureRegions } from './measureRegions';
import { NOOP_EVIDENCE_HOST, NOOP_SPOILER_HOST } from './readingContext';

/** Same time base as attention signal timestamps (src/attention/controllerPorts.ts). */
const now = (): number => performance.timeOrigin + performance.now();

const warn = (msg: string): void => console.warn(msg);

function getStorage(): Pick<Storage, 'getItem'> | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Builds the gate and engine once hosts exist, and tears both down when the
 * hosts change or the component unmounts. Under StrictMode the cleanup runs
 * fully, so the re-run creates fresh instances.
 */
export function useHauntEngine(
  hosts: VisualHosts | null,
  subscribeSignal: (cb: (s: AttentionSignalLike) => void) => Unsubscribe,
  settings: HauntSettings,
  gateRef: { current: Gate | null },
  reading: ReadingContext,
): void {
  useEffect(() => {
    if (hosts === null) return;
    const hasWindow = typeof window !== 'undefined';
    const reducedMotion = createReducedMotion();
    const { haunts, effects } = loadRegistry(warn);
    const gate = createGate({
      audio: {
        createAudioContext: () => new AudioContext(),
        eventTarget: hasWindow ? window : null,
      },
      hosts,
      storage: getStorage(),
      storageEvents: hasWindow ? window : null,
      reducedMotion,
      scheduler: {
        setTimeout: (fn, ms) => setTimeout(fn, ms),
        clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
      },
      warn,
    });
    gate.setSoundEnabled(getHauntSettingsStore().get().sound);
    gateRef.current = gate;
    const engine = createHauntEngine({
      subscribeSignal,
      haunts,
      gate,
      settings: getHauntSettingsStore(),
      clock: { now },
      scheduler: {
        setTimeout: (fn, ms) => setTimeout(fn, ms),
        clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
      },
      random: Math.random,
      effects,
      reading,
      // Evidence and spoiler displays arrive with tasks 9.5 and 10.8.
      evidence: NOOP_EVIDENCE_HOST,
      spoiler: NOOP_SPOILER_HOST,
      reducedMotion: () => reducedMotion.get(),
      // A getter: the column and viewport can change between haunt starts.
      regions: measureRegions,
      extraRandom: Math.random,
      warn,
    });
    engine.start();
    return () => {
      engine.stop();
      gate.dispose();
      if (gateRef.current === gate) gateRef.current = null;
    };
  }, [hosts, subscribeSignal, gateRef, reading]);

  const { sound } = settings;
  useEffect(() => {
    gateRef.current?.setSoundEnabled(sound);
  }, [sound, hosts, gateRef]);
}
