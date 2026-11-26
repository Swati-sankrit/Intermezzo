import { useRef, type CSSProperties } from 'react';
import { CANDLE_COLOURS, type CandleColour } from '../../library/model';
import { shellEffects, type ShellEffects } from '../shellEffects';
import { useLightAnchor } from './useLightAnchor';
import './ShellEffects.css';

/** The theme variable for a Candle_Colour; a missing or unknown name gives amber. */
export function candleVariable(colour: unknown): string {
  const name: CandleColour = (CANDLE_COLOURS as readonly unknown[]).includes(colour)
    ? (colour as CandleColour)
    : 'amber';
  return `var(--candle-${name})`;
}

export interface CandlePoolProps {
  candleColour?: string;
  effects?: ShellEffects;
}

/** A soft pool of candlelight, `lightRadiusPx` across, that follows the Light_Anchor. */
export function CandlePool({ candleColour, effects = shellEffects }: CandlePoolProps) {
  const ref = useRef<HTMLDivElement>(null);
  const size = effects.strengths.lightRadiusPx;
  useLightAnchor(ref, size);
  const style = { '--pool-colour': candleVariable(candleColour), width: size, height: size } as CSSProperties;
  return <div ref={ref} className="shell-candle-pool" style={style} aria-hidden="true" />;
}
