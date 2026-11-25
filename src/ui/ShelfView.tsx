import { useRef } from 'react';
import type { BookEntry, ShelfName } from '../library/model';
import { ShelfBook } from './ShelfBook';
import { SHELF_LABELS } from './shelfLabels';
import './ShelfView.css';

export interface ShelfViewProps {
  shelfBooks: Record<ShelfName, BookEntry[]>;
  /** Stored progress per Book_Id, 0-100. */
  progress: Record<string, number>;
  onOpen: (bookId: string) => void;
  onMove: (bookId: string, shelf: ShelfName) => void;
  onRemove: (bookId: string) => Promise<boolean>;
  /** Empty shelf: the caller moves focus to the catalogue grid. */
  onChooseBook: () => void;
}

const ORDER: ShelfName[] = ['reading', 'want-to-read', 'finished'];

export function ShelfView({ shelfBooks, progress, onOpen, onMove, onRemove, onChooseBook }: ShelfViewProps) {
  const rootRef = useRef<HTMLElement>(null);

  // A removed book takes its focused button with it, so park focus on the shelves.
  const remove = async (bookId: string) => {
    const gone = await onRemove(bookId);
    if (gone) rootRef.current?.focus();
    return gone;
  };

  return (
    <section ref={rootRef} tabIndex={-1} className="shelf-view" aria-labelledby="shelves-heading">
      <h2 id="shelves-heading" className="library__heading">
        Your shelves
      </h2>
      {ORDER.map((shelf) => {
        const books = shelfBooks[shelf];
        const headingId = `shelf-${shelf}`;
        return (
          <section key={shelf} className="shelf-view__shelf" aria-labelledby={headingId}>
            <h3 id={headingId} className="shelf-view__heading">
              {SHELF_LABELS[shelf]}
            </h3>
            {books.length === 0 ? (
              <div className="shelf-view__empty">
                <p>Nothing on this shelf yet</p>
                <button type="button" className="shelf-book__button" onClick={onChooseBook}>
                  Choose a book
                </button>
              </div>
            ) : (
              <ul className="shelf-view__list">
                {books.map((book) => (
                  <ShelfBook
                    key={book.bookId}
                    book={book}
                    shelf={shelf}
                    progress={progress[book.bookId] ?? 0}
                    onOpen={onOpen}
                    onMove={onMove}
                    onRemove={remove}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </section>
  );
}
