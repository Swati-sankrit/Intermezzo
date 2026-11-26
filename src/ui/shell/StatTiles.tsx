export interface StatTilesProps {
  booksFinished: number;
  booksInProgress: number;
  paragraphsRead: number;
  chaptersRead: number;
}

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div className="stat-tile">
      <dt className="stat-tile__label">{label}</dt>
      <dd className="stat-tile__value">{value}</dd>
    </div>
  );
}

/** The "Your reading" card: four numbers as text, each with its label. */
export function StatTiles({ booksFinished, booksInProgress, paragraphsRead, chaptersRead }: StatTilesProps) {
  return (
    <section className="ledger-card" aria-labelledby="ledger-totals-h">
      <h3 id="ledger-totals-h">Your reading</h3>
      <dl className="stat-tiles">
        <Tile value={booksFinished} label="Books finished" />
        <Tile value={booksInProgress} label="Books in progress" />
        <Tile value={paragraphsRead} label="Paragraphs read" />
        <Tile value={chaptersRead} label="Chapters read" />
      </dl>
    </section>
  );
}
