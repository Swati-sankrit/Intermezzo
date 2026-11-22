// TEMPORARY: remove this file (and TempAttentionLabel.css) when the haunt
// engine consumes the attention signal. It exists only so the signal can be
// seen working before then.
import { useEffect, useState } from 'react';
import type { AttentionSignal } from '../attention';
import './TempAttentionLabel.css';

export interface TempAttentionLabelProps {
  /** `subscribeSignal` from useAttention(). The label never starts the controller itself. */
  subscribeSignal: (cb: (s: AttentionSignal) => void) => () => void;
}

/**
 * Small fixed corner label. It is aria-hidden on purpose: it is a developer
 * aid, and announcing every change (aria-live) would interrupt the reader.
 * It has no tabindex, is not a button, and ignores the pointer.
 */
export function TempAttentionLabel({ subscribeSignal }: TempAttentionLabelProps) {
  const [value, setValue] = useState<AttentionSignal['value']>('present');

  useEffect(() => subscribeSignal((s) => setValue(s.value)), [subscribeSignal]);

  return (
    <div className="temp-attention-label" aria-hidden="true" data-testid="temp-attention-label">
      Attention: {value}
    </div>
  );
}
