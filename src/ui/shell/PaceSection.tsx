import { PaceBar } from './PaceBar';
import { PACE_FALLBACK, PACE_SOURCE, paceSentence, TYPICAL_SPEEDS_TEXT } from './ledgerText';

/** The reader's measured pace beside the typical speeds, with the source and the app's aim. */
export function PaceSection({ pace }: { pace: number | undefined }) {
  return (
    <section className="ledger-card" aria-labelledby="ledger-pace-h">
      <h3 id="ledger-pace-h">Your pace</h3>
      {pace === undefined ? (
        <p>{PACE_FALLBACK}</p>
      ) : (
        <>
          <p className="ledger-big">{`${pace} wpm`}</p>
          <p>{paceSentence(pace)}</p>
        </>
      )}
      <PaceBar pace={pace} />
      <p>{TYPICAL_SPEEDS_TEXT}</p>
      <p className="ledger-note">
        <span className="ledger-note__tag">Source: </span>
        {PACE_SOURCE}
      </p>
    </section>
  );
}
