import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AttentionLayer } from './AttentionLayer';
import { ErrorBanner } from './ErrorBanner';
import { HauntControl } from './HauntControl';
import { NoticeBanner } from './NoticeBanner';
import { PaceTimer } from './PaceTimer';
import { ParagraphList } from './ParagraphList';
import { ProgressBar } from './ProgressBar';
import { ReaderBanner } from './ReaderBanner';
import { useReadingContext } from './readingContext';
import type { ReaderSession } from './bookSession';
import type { OpenStatus } from './readerState';
import { useReader } from './useReader';
import './theme.css';
import './ReaderView.css';

const IDLE_MS = 2500;

export interface ReaderViewProps {
  /** The book to open. Without one, no book is shown. */
  session?: ReaderSession;
  /** Shown while no book is open. */
  library?: (status: OpenStatus, back: () => void) => ReactNode;
  /** Called after "Back to library" closes the book. */
  onLeave?: () => void;
  /** Set while a position save has failed. Shows the reader banner; the owner clears it on a later save. */
  saveFailure?: string | null;
  onDismissSaveFailure?: () => void;
  /** Reports whether the book is shown and whether opening it failed. */
  onOpenState?: (state: { ready: boolean; failed: boolean }) => void;
}

const NOOP = () => {};

export function ReaderView({ session, library, onLeave, saveFailure = null, onDismissSaveFailure = NOOP, onOpenState }: ReaderViewProps = {}) {
  const r = useReader(session);
  const ready = !!r.book;
  const failed = !!r.failure;
  useEffect(() => {
    onOpenState?.({ ready, failed });
  }, [ready, failed, onOpenState]);
  const [dismissedNotice, setDismissedNotice] = useState<string | null>(null);
  const reading = useReadingContext(r);
  const [awake, setAwake] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bring the controls back, then let them fade again after a short idle.
  const wake = useCallback(() => {
    setAwake(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAwake(false), IDLE_MS);
  }, []);

  // `awake` starts true, so on mount only the idle timer needs starting.
  useEffect(() => {
    timer.current = setTimeout(() => setAwake(false), IDLE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const leave = () => {
    r.closeBook();
    onLeave?.();
  };

  if (!r.book) {
    if (!library) return <ErrorBanner error={r.error} />;
    return <>{library({ loading: r.loading, failure: r.failure, error: r.error }, leave)}</>;
  }

  const chapter = r.book.chapters[r.chapterIndex];
  const bookTitle = r.book.title;

  const stats = session && library
    ? {
        session,
        chapterIndex: r.chapterIndex,
        paragraphIndex: r.paragraphIndex,
        chapterComplete: r.chapterComplete,
        paragraphText: r.paragraphs[r.paragraphIndex]?.text ?? '',
      }
    : undefined;

  return (
    <AttentionLayer suggestedSecs={r.suggestedSecs} reading={reading} stats={stats}>
      {(cameraIndicator) => (
        <div className="reader" onMouseMove={wake} onFocus={wake}>
          <header className={`reader__bar${awake ? ' reader__bar--awake' : ''}`}>
            <button type="button" className="reader__button" onClick={leave}>
              Back to library
            </button>
            <div className="reader__progress">
              <ProgressBar progress={r.progress} />
            </div>
            <PaceTimer enabled={r.paceGuideEnabled} suggestedSeconds={r.suggestedSecs} />
            <button
              type="button"
              className="reader__button"
              aria-pressed={r.paceGuideEnabled}
              onClick={r.togglePaceGuide}
            >
              Pace Guide: {r.paceGuideEnabled ? 'on' : 'off'}
            </button>
            <HauntControl />
            {cameraIndicator}
          </header>

          <main className="reader__page">
            <p className="reader__book">{bookTitle}</p>
            {chapter?.title ? <h1 className="reader__chapter">{chapter.title}</h1> : null}
            <ErrorBanner error={r.error} />
            <NoticeBanner
              text={r.notice !== dismissedNotice ? r.notice : null}
              isError={false}
              onDismiss={() => setDismissedNotice(r.notice)}
            />
            <ReaderBanner text={saveFailure} onDismiss={onDismissSaveFailure} />
            <ParagraphList
              paragraphs={r.paragraphs}
              activeIndex={r.paragraphIndex}
              onAdvance={r.advance}
              disabled={r.chapterComplete}
            />
            {r.chapterComplete && (
              <section className="reader__complete" role="status">
                <p className="reader__complete-text">
                  {r.hasNextChapter ? 'Chapter complete.' : 'You have reached the end of the book.'}
                </p>
                {r.hasNextChapter && (
                  <button type="button" className="reader__button reader__button--primary" onClick={r.nextChapter}>
                    Next chapter
                  </button>
                )}
              </section>
            )}
          </main>
        </div>
      )}
    </AttentionLayer>
  );
}

export default ReaderView;
