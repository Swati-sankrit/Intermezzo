import { useState } from 'react';
import type { BookEntry } from '../library/model';
import { CATALOGUE } from '../library/catalogueData';
import { PlaceholderCover } from './PlaceholderCover';
import { Skeleton } from './Skeleton';
import './ContinueCard.css';

export interface ContinueCardProps {
  /** The book on the reading shelf to continue, or null for the empty state. */
  book: BookEntry | null;
  /** Stored progress, 0-100. Shown as a whole percentage. */
  progress?: number;
  /** The book's uploaded text could not be found. */
  textMissing?: boolean;
  onContinue: (bookId: string) => void;
  /** Empty state: the caller moves focus to the catalogue grid. */
  onChooseBook: () => void;
  /** Missing text: pick the same file again. */
  onReopenFile?: (bookId: string) => void;
  /** Missing text: pick a different book. */
  onChooseAgain?: (bookId: string) => void;
}

function Cover({ book }: { book: BookEntry }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const entry =
    book.source === 'catalogue' ? CATALOGUE.find((e) => e.slug === book.catalogueSlug) : undefined;
  return (
    <span className="continue-card__cover">
      {entry && !failed ? (
        <>
          {!loaded && <Skeleton />}
          <img
            className="continue-card__image"
            src={entry.coverPath}
            alt=""
            hidden={!loaded}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        </>
      ) : (
        <PlaceholderCover title={book.title} />
      )}
    </span>
  );
}

export function ContinueCard({
  book,
  progress = 0,
  textMissing = false,
  onContinue,
  onChooseBook,
  onReopenFile,
  onChooseAgain,
}: ContinueCardProps) {
  if (!book) {
    return (
      <section className="continue-card continue-card--empty" aria-label="Continue reading">
        <p className="continue-card__empty">Your shelf is quiet. Pick a book and light the candle.</p>
        <button type="button" className="continue-card__button" onClick={onChooseBook}>
          Choose a book
        </button>
      </section>
    );
  }

  const percent = Number.isFinite(progress) ? Math.min(100, Math.max(0, Math.floor(progress))) : 0;
  const author = book.author.trim();

  return (
    <section className="continue-card" aria-label="Continue reading">
      <Cover book={book} />
      <div className="continue-card__body">
        <h2 className="continue-card__title">{book.title}</h2>
        {author && <p className="continue-card__author">{author}</p>}
        {textMissing ? (
          <>
            <p className="continue-card__notice" role="status">
              This book needs its file opened again. Your place is kept.
            </p>
            <div className="continue-card__actions">
              <button type="button" className="continue-card__button" onClick={() => onReopenFile?.(book.bookId)}>
                Reopen the file
              </button>
              <button
                type="button"
                className="continue-card__button continue-card__button--quiet"
                onClick={() => onChooseAgain?.(book.bookId)}
              >
                Choose the book again
              </button>
            </div>
          </>
        ) : (
          <>
            <div
              className="continue-card__progress"
              role="progressbar"
              aria-label={`Progress in ${book.title}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <span className="continue-card__track">
                <span className="continue-card__fill" style={{ width: `${percent}%` }} />
              </span>
              <span className="continue-card__percent">{percent}%</span>
            </div>
            <button type="button" className="continue-card__button" onClick={() => onContinue(book.bookId)}>
              Continue
            </button>
          </>
        )}
      </div>
    </section>
  );
}
