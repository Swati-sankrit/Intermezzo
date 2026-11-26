interface CandleGaugeProps {
  /** What the gauge shows, for example "Today". */
  label: string;
  /** 0-100, or undefined when there is no data (an unlit candle). */
  score: number | undefined;
  /** 'large' draws the candle about 96 px tall, for the Focus card. */
  size?: 'normal' | 'large';
}

const TOP = 6;
const BOTTOM = 54;

/** A still candle that burns down as the score falls. The score is also written as text. */
export function CandleGauge({ label, score, size = 'normal' }: CandleGaugeProps) {
  const [svgWidth, svgHeight] = size === 'large' ? [60, 96] : [40, 64];
  const lit = score !== undefined;
  const height = lit ? Math.round(((BOTTOM - TOP) * score) / 100) : 0;
  const text = lit ? `${score}% focus` : 'No reading yet';
  const alt = lit ? `${label}: candle showing ${score}% focus` : `${label}: candle unlit, no reading yet`;
  return (
    <figure className="ledger-gauge">
      <svg viewBox="0 0 40 64" width={svgWidth} height={svgHeight} role="img" aria-label={alt} focusable="false">
        <rect x="11" y={TOP} width="18" height={BOTTOM - TOP} rx="2" fill="none" stroke="currentColor" strokeOpacity="0.4" />
        {lit && (
          <>
            <rect x="12" y={BOTTOM - height} width="16" height={height} fill="currentColor" fillOpacity="0.55" />
            <path d={`M20 ${BOTTOM - height - 9} q4 5 0 9 q-4 -4 0 -9z`} fill="var(--accent)" />
          </>
        )}
      </svg>
      <figcaption>
        <span className="ledger-gauge__label">{label}</span>
        <span className="ledger-gauge__score">{text}</span>
      </figcaption>
    </figure>
  );
}
