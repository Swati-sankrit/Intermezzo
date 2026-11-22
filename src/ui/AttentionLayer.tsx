import { useEffect, useState, type ReactNode } from 'react';
import { CameraIndicator } from './CameraIndicator';
import { ConsentDialog } from './ConsentDialog';
import { NoticeBanner } from './NoticeBanner';
import { TempAttentionLabel } from './TempAttentionLabel';
import { useAttention } from './useAttention';

interface AttentionLayerProps {
  /** Suggested reading time for the active paragraph; sets the idle limit. */
  suggestedSecs: number;
  /** Receives the camera indicator so the caller can place it in the top bar. */
  children: (cameraIndicator: ReactNode) => ReactNode;
}

/**
 * Owns the single useAttention() call, so the controller runs only while the
 * reading view (not the library) is mounted. Never blocks reading.
 */
export function AttentionLayer({ suggestedSecs, children }: AttentionLayerProps) {
  const { status, chooseCamera, setCameraOn, setIdleLimit, subscribeSignal } = useAttention();

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
      {status.choice === 'unanswered' && <ConsentDialog onChoose={chooseCamera} />}
      <NoticeBanner
        text={text === dismissed ? null : text}
        isError={isError}
        onDismiss={() => setDismissed(text)}
      />
      {children(<CameraIndicator cameraOn={status.cameraOn} onTurnOff={() => void setCameraOn(false)} />)}
      <TempAttentionLabel subscribeSignal={subscribeSignal} />
    </>
  );
}
