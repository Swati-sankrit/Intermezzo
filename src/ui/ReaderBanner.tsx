import { useEffect } from 'react';
import './ReaderBanner.css';

interface ReaderBannerProps {
  /** The message to show (from libraryMessages.ts). Null hides the banner. */
  text: string | null;
  onDismiss: () => void;
}

/**
 * Small status line shown in the reader when a position save fails. It sits in
 * the page flow above the paragraphs, so it never covers the active paragraph,
 * and it does not take focus. Escape dismisses it while focus is on its button.
 */
export function ReaderBanner({ text, onDismiss }: ReaderBannerProps) {
  // Escape anywhere in the page dismisses it, without moving focus.
  useEffect(() => {
    if (text === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [text, onDismiss]);

  if (text === null) return null;
  return (
    <div className="reader-banner" role="status">
      <span className="reader-banner__text">{text}</span>
      <button type="button" className="reader-banner__button" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}
