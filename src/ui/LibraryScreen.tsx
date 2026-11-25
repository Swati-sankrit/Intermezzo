import { useMemo, useRef, type ChangeEvent } from 'react';
import { ErrorBanner } from './ErrorBanner';
import { CatalogueGrid } from './CatalogueGrid';
import { ContinueCard } from './ContinueCard';
import { OpenOwnBook } from './OpenOwnBook';
import { Skeleton } from './Skeleton';
import { WelcomeHeader } from './WelcomeHeader';
import type { OpenStatus } from './readerState';
import type { useLibrary } from './useLibrary';
import './theme.css';
import './LibraryScreen.css';

export interface LibraryScreenProps {
  lib: ReturnType<typeof useLibrary>;
  /** State of the book being opened, if any. */
  open: OpenStatus;
  /** The book that failed to open, if any. */
  failedBookId: string | null;
  /** Shown after "Reopen the file" picked a different file. */
  notice: string | null;
  onOpenCatalogue: (slug: string) => void;
  onOpenFile: (file: File) => void;
  onContinue: (bookId: string) => void;
  /** Called with the file picked for "Reopen the file". */
  onReopenPicked: (bookId: string, file: File) => void;
  /** Leave the failed book and show the library. */
  onBack: () => void;
}

export function LibraryScreen({
  lib,
  open,
  failedBookId,
  notice,
  onOpenCatalogue,
  onOpenFile,
  onContinue,
  onReopenPicked,
  onBack,
}: LibraryScreenProps) {
  const gridRef = useRef<HTMLElement>(null);
  const reopenInput = useRef<HTMLInputElement>(null);
  const reopenFor = useRef<string | null>(null);
  const { model, status, catalogue, currentBook } = lib;

  const progress = useMemo(
    () => Object.fromEntries(Object.entries(model.positions).map(([id, p]) => [id, p.progress])),
    [model.positions],
  );
  const textMissing = open.failure === 'text' && failedBookId !== null;
  const book = textMissing ? (model.books[failedBookId] ?? null) : currentBook;
  const focusGrid = () => gridRef.current?.focus();

  const handleReopen = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (file && reopenFor.current) onReopenPicked(reopenFor.current, file);
    input.value = '';
  };

  const message = notice ?? lib.message;

  return (
    <main className="library">
      <WelcomeHeader displayName={model.profile.displayName} />
      <ErrorBanner error={open.failure === 'epub' ? open.error : null} />
      {open.failure === 'epub' && (
        <button type="button" className="library__button" onClick={onBack}>
          Back to library
        </button>
      )}
      <ErrorBanner error={message} />

      <div className="library__continue" aria-busy={status === 'loading' || open.loading}>
        {status === 'loading' || open.loading ? (
          <Skeleton className="library__continue-skeleton" />
        ) : (
          <ContinueCard
            book={book}
            progress={book ? (progress[book.bookId] ?? 0) : 0}
            textMissing={textMissing}
            onContinue={onContinue}
            onChooseBook={focusGrid}
            onReopenFile={(id) => {
              reopenFor.current = id;
              reopenInput.current?.click();
            }}
            onChooseAgain={() => {
              onBack();
              focusGrid();
            }}
          />
        )}
        <input
          ref={reopenInput}
          type="file"
          accept=".txt,.epub"
          hidden
          tabIndex={-1}
          aria-label="Choose the file to reopen"
          onChange={handleReopen}
        />
      </div>

      <section ref={gridRef} tabIndex={-1} className="library__catalogue" aria-labelledby="catalogue-heading">
        <h2 id="catalogue-heading" className="library__heading">
          Choose a book
        </h2>
        {catalogue.status === 'ready' ? (
          <CatalogueGrid entries={catalogue.entries} progress={progress} onOpen={onOpenCatalogue} />
        ) : (
          <div className="library__catalogue-error">
            <p role="alert">{catalogue.message}</p>
            <button type="button" className="library__button" onClick={lib.retryCatalogue}>
              Try again
            </button>
          </div>
        )}
      </section>

      <OpenOwnBook onSelectFile={onOpenFile} />
    </main>
  );
}

export default LibraryScreen;
