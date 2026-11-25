import type { CandleColour } from '../library/model';
import './Avatar.css';

export interface AvatarProps {
  candleColour: CandleColour;
  size?: number;
}

/** A small candle drawn in the chosen colour. Decorative; the colour name is not spoken here. */
export function Avatar({ candleColour, size = 40 }: AvatarProps) {
  return (
    <span className={`avatar avatar--${candleColour}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true" focusable="false">
        <path d="M12 2.5c1.9 2.3 2.6 3.8 2.6 5.1a2.6 2.6 0 0 1-5.2 0c0-1.3.7-2.8 2.6-5.1z" fill="currentColor" />
        <rect x="9" y="11" width="6" height="10" rx="1" fill="currentColor" opacity="0.75" />
        <rect x="6.5" y="21" width="11" height="1.5" rx="0.75" fill="currentColor" />
      </svg>
    </span>
  );
}
