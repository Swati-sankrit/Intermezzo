import { useEffect } from 'react';
import {
  createGate,
  createHauntEngine,
  createReducedMotion,
  loadHaunts,
  type AttentionSignalLike,
  type Gate,
  type HauntSettings,
  type Unsubscribe,
  type VisualHosts,
} from '../haunts/engine';
import { getHauntSettingsStore } from './hauntSettingsStore';

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
): void {
  useEffect(() => {
    if (hosts === null) return;
    const hasWindow = typeof window !== 'undefined';
    const gate = createGate({
      audio: {
        createAudioContext: () => new AudioContext(),
        eventTarget: hasWindow ? window : null,
      },
      hosts,
      storage: getStorage(),
      storageEvents: hasWindow ? window : null,
      reducedMotion: createReducedMotion(),
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
      haunts: loadHaunts(warn),
      gate,
      settings: getHauntSettingsStore(),
      clock: { now },
      scheduler: {
        setTimeout: (fn, ms) => setTimeout(fn, ms),
        clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
      },
      random: Math.random,
      warn,
    });
    engine.start();
    return () => {
      engine.stop();
      gate.dispose();
      if (gateRef.current === gate) gateRef.current = null;
    };
  }, [hosts, subscribeSignal, gateRef]);

  const { sound } = settings;
  useEffect(() => {
    gateRef.current?.setSoundEnabled(sound);
  }, [sound, hosts, gateRef]);
}
