import { useRef, useState } from 'react';
import {
  visibleDialogs,
  type AttentionSignalLike,
  type CameraChoiceLike,
  type Gate,
  type Unsubscribe,
  type VisualHosts,
} from '../haunts/engine';
import type { ReadingContext } from '../haunts/engine/returnTypes';
import { HauntStage } from './HauntStage';
import { SafetyNotice } from './SafetyNotice';
import { useHauntEngine } from './useHauntEngine';
import { useHauntSettings } from './useHauntSettings';

interface HauntLayerProps {
  subscribeSignal: (cb: (s: AttentionSignalLike) => void) => Unsubscribe;
  /** Only the notice is computed here, and it ignores the choice. */
  cameraChoice?: CameraChoiceLike;
  /** Read-only view of the reader state, for the engine (chapter changes, active paragraph). */
  reading: ReadingContext;
}

/** Wires the stage, gate, engine and first-run safety notice together. */
export function HauntLayer({ subscribeSignal, cameraChoice = 'unanswered', reading }: HauntLayerProps) {
  const { settings } = useHauntSettings();
  const [hosts, setHosts] = useState<VisualHosts | null>(null);
  const gateRef = useRef<Gate | null>(null);
  useHauntEngine(hosts, subscribeSignal, settings, gateRef, reading);

  return (
    <>
      <HauntStage hostsRef={setHosts} />
      {visibleDialogs(settings.noticeSeen, cameraChoice).notice && <SafetyNotice />}
    </>
  );
}
