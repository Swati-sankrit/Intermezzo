import { useCallback, useEffect, useRef, useState } from 'react';
import { AttentionLayer } from './AttentionLayer';
import { ErrorBanner } from './ErrorBanner';
import { HauntControl } from './HauntControl';
import { LibraryScreen } from './LibraryScreen';
import { PaceTimer } from './PaceTimer';
import { ParagraphList } from './ParagraphList';
import { ProgressBar } from './ProgressBar';
import { useReader } from './useReader';
import './theme.css';
import './ReaderView.css';

const IDLE_MS = 2500;

export function ReaderView() {
  const r = useReader();
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

  if (!r.book) {
    return (
      <>
        <ErrorBanner error={r.error} />
        <LibraryScreen onSelectFile={r.selectBook} onSelectLibraryBook={r.selectLibraryBook} />
      </>
    );
  }

  const chapter = r.book.chapters[r.chapterIndex];
  const bookTitle = r.book.title;

  return (
    <AttentionLayer suggestedSecs={r.suggestedSecs}>
      {(cameraIndicator) => (
        <div className="reader" onMouseMove={wake} onFocus={wake}>
          <header className={`reader__bar${awake ? ' reader__bar--awake' : ''}`}>
            <button type="button" className="reader__button" onClick={r.closeBook}>
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
