import { useEffect, useState, type ReactNode } from 'react';
import { visibleDialogs } from '../haunts/engine';
import type { ReadingContext } from '../haunts/engine/returnTypes';
import { CameraIndicator } from './CameraIndicator';
import { ConsentDialog } from './ConsentDialog';
import { NoticeBanner } from './NoticeBanner';
import { HauntLayer } from './HauntLayer';
import { useAttention } from './useAttention';
import { useHauntSettings } from './useHauntSettings';
import { useStatsRecorder, type StatsInput } from './useStatsRecorder';

interface AttentionLayerProps {
  /** Suggested reading time for the active paragraph; sets the idle limit. */
  suggestedSecs: number;
  /** Passed to the haunt layer. */
  reading: ReadingContext;
  /** Library mode only: records reading stats from the attention signal. */
  stats?: StatsInput;
  /** Receives the camera indicator so the caller can place it in the top bar. */
  children: (cameraIndicator: ReactNode) => ReactNode;
}

/**
 * Owns the single useAttention() call, so the controller runs only while the
 * reading view (not the library) is mounted. Never blocks reading.
 */
export function AttentionLayer({ suggestedSecs, reading, stats, children }: AttentionLayerProps) {
  const { status, chooseCamera, setCameraOn, setIdleLimit, subscribeSignal } = useAttention();

  const { settings } = useHauntSettings();
  useStatsRecorder(stats, subscribeSignal);

  useEffect(() => {
    setIdleLimit(3 * suggestedSecs * 1000);
  }, [setIdleLimit, suggestedSecs]);

  const isError = status.cameraOffError != null;
  const text = status.cameraOffError ?? status.notice?.text ?? null;

  // Dismissal is local. It forgets itself once the text clears, so a later
  // notice or error shows again; the same text still showing stays hidden.
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (text === null && dismissed !== null) setDismissed(null);

  return (
    <>
      {visibleDialogs(settings.noticeSeen, status.choice).consent && <ConsentDialog onChoose={chooseCamera} />}
      <NoticeBanner
        text={text === dismissed ? null : text}
        isError={isError}
        onDismiss={() => setDismissed(text)}
      />
      {children(<CameraIndicator cameraOn={status.cameraOn} onTurnOff={() => void setCameraOn(false)} />)}
      <HauntLayer subscribeSignal={subscribeSignal} cameraChoice={status.choice} reading={reading} />
    </>
  );
}
