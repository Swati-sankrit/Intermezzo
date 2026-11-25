import { useEffect, useRef, useState } from 'react';
import { CATALOGUE } from '../library/catalogueData';
import type { BookEntry, ShelfName } from '../library/model';
import { PlaceholderCover } from './PlaceholderCover';
import { SHELF_LABELS } from './shelfLabels';
import { Skeleton } from './Skeleton';
import './ShelfView.css';

export interface ShelfBookProps {
  book: BookEntry;
  shelf: ShelfName;
  /** Stored progress, 0-100. */
  progress: number;
  onOpen: (bookId: string) => void;
  onMove: (bookId: string, shelf: ShelfName) => void;
  /** Resolves true when the book is gone. */
  onRemove: (bookId: string) => Promise<boolean>;
}

function Cover({ book }: { book: BookEntry }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const entry = book.source === 'catalogue' ? CATALOGUE.find((e) => e.slug === book.catalogueSlug) : undefined;
  return (
    <span className="shelf-book__cover">
      {entry && !failed ? (
        <>
          {!loaded && <Skeleton />}
          <img
            className="shelf-book__image"
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

export function ShelfBook({ book, shelf, progress, onOpen, onMove, onRemove }: ShelfBookProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  const author = book.author.trim();
  const percent = Number.isFinite(progress) ? Math.min(100, Math.max(0, Math.floor(progress))) : 0;
  const targets = (Object.keys(SHELF_LABELS) as ShelfName[]).filter((s) => s !== shelf);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  const cancel = () => {
    setConfirming(false);
    removeRef.current?.focus();
  };

  const confirm = async () => {
    setBusy(true);
    const gone = await onRemove(book.bookId).catch(() => false);
    if (!gone) {
      setBusy(false);
      cancel();
    }
  };

  return (
    <li className="shelf-book">
      <Cover book={book} />
      <div className="shelf-book__body">
        <h4 className="shelf-book__title">{book.title}</h4>
        {author && <p className="shelf-book__author">{author}</p>}
        {percent > 0 && (
          <div
            className="shelf-book__progress"
            role="progressbar"
            aria-label={`Progress in ${book.title}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <span className="shelf-book__track">
              <span className="shelf-book__fill" style={{ width: `${percent}%` }} />
            </span>
            <span>{percent}%</span>
          </div>
        )}
        <div className="shelf-book__actions">
          <button type="button" className="shelf-book__button shelf-book__button--primary" onClick={() => onOpen(book.bookId)}>
            {percent > 0 ? 'Continue ' : 'Open '}
            <span className="shelf-book__sr">{book.title}</span>
          </button>
          {targets.map((s) => (
            <button key={s} type="button" className="shelf-book__button" onClick={() => onMove(book.bookId, s)}>
              Move to {SHELF_LABELS[s]}
              <span className="shelf-book__sr">: {book.title}</span>
            </button>
          ))}
          <button
            ref={removeRef}
            type="button"
            className="shelf-book__button shelf-book__button--quiet"
            onClick={() => setConfirming(true)}
            aria-expanded={confirming}
          >
            Remove{' '}
            <span className="shelf-book__sr">{book.title}</span>
          </button>
        </div>
        {confirming && (
          <div
            className="shelf-book__confirm"
            role="group"
            aria-label={`Remove ${book.title}`}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !busy) {
                e.stopPropagation();
                cancel();
              }
            }}
          >
            <p>
              Remove {book.title}? The book, your place in it and its reading stats will be removed from this
              device.
            </p>
            <div className="shelf-book__actions">
              <button ref={cancelRef} type="button" className="shelf-book__button" onClick={cancel} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="shelf-book__button shelf-book__button--danger" onClick={confirm} disabled={busy}>
                Remove book
              </button>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}
