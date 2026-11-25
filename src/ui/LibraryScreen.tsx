import { useCallback, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { ErrorBanner } from './ErrorBanner';
import { CatalogueGrid } from './CatalogueGrid';
import { ContinueCard } from './ContinueCard';
import { OpenOwnBook } from './OpenOwnBook';
import { ProfileSettings } from './ProfileSettings';
import { ShelfView } from './ShelfView';
import { Skeleton } from './Skeleton';
import { WelcomeHeader } from './WelcomeHeader';
import type { OpenStatus } from './readerState';
import type { useLibrary } from './useLibrary';
import { useProfileActions } from './useProfileActions';
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const profileActions = useProfileActions(lib.updateModel);

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
      <WelcomeHeader
        displayName={model.profile.displayName}
        candleColour={model.profile.candleColour}
        actions={
          <button
            type="button"
            className="icon-button"
            aria-label="Settings"
            disabled={status !== 'ready'}
            onClick={() => setSettingsOpen(true)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
              <circle cx="12" cy="12" r="6.5" />
            </svg>
          </button>
        }
      />
      {settingsOpen && (
        <ProfileSettings profile={model.profile} actions={profileActions} message={lib.message} onClearData={lib.clearAllData} onClose={closeSettings} />
      )}
      <ErrorBanner error={open.failure === 'epub' ? open.error : null} />
      {open.failure === 'epub' && (
        <button type="button" className="library__button btn-quiet" onClick={onBack}>
          Back to library
        </button>
      )}
      <ErrorBanner error={message} />

      <div className="library__continue" aria-busy={status === 'loading' || open.loading}>
        {status === 'loading' || open.loading ? (
          <Skeleton className="library__continue-skeleton" />
        ) : book === null ? (
          <div className="library__prompt">
            <p>Your shelf is quiet. Pick a book and light the candle.</p>
            <button type="button" className="library__button btn-quiet" onClick={focusGrid}>
              Choose a book
            </button>
          </div>
        ) : (
          <ContinueCard
            book={book}
            progress={progress[book.bookId] ?? 0}
            textMissing={textMissing}
            onContinue={onContinue}
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

      {status === 'ready' && (
        <ShelfView
          shelfBooks={lib.shelfBooks}
          progress={progress}
          onOpen={onContinue}
          onMove={lib.moveBook}
          onRemove={lib.removeBook}
          onChooseBook={focusGrid}
        />
      )}

      <section ref={gridRef} tabIndex={-1} className="library__catalogue" aria-labelledby="catalogue-heading">
        <h2 id="catalogue-heading" className="library__heading">
          Choose a book
        </h2>
        {catalogue.status === 'ready' ? (
          <CatalogueGrid entries={catalogue.entries} progress={progress} onOpen={onOpenCatalogue} />
        ) : (
          <div className="library__catalogue-error">
            <p role="alert">{catalogue.message}</p>
            <button type="button" className="library__button btn-quiet" onClick={lib.retryCatalogue}>
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
