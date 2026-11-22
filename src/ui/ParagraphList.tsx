import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Paragraph } from '../reader/types';
import './ParagraphList.css';

export interface ParagraphListProps {
  paragraphs: Paragraph[];
  activeIndex: number;
  onAdvance: () => void;
  /** When true (e.g. chapter complete), advancing is suppressed. */
  disabled?: boolean;
}

export function ParagraphList({
  paragraphs,
  activeIndex,
  onAdvance,
  disabled = false,
}: ParagraphListProps) {
  const activeRef = useRef<HTMLDivElement | null>(null);
  const firstRender = useRef(true);
  const [activeInView, setActiveInView] = useState(true);

  const lastVisible = Math.min(activeIndex, paragraphs.length - 1);
  const visible = lastVisible >= 0 ? paragraphs.slice(0, lastVisible + 1) : [];

  // Move focus and view to each newly revealed paragraph (not on first mount).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const el = activeRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'center', behavior: 'auto' });
    }
  }, [activeIndex]);

  // Track whether the active paragraph is visible. Skipped where unsupported (jsdom).
  useEffect(() => {
    const el = activeRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setActiveInView(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) setActiveInView(last.isIntersecting);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [lastVisible]);

  const advance = () => {
    if (!disabled) onAdvance();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      advance();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      advance();
    }
  };

  const scrollBack = () => {
    const el = activeRef.current;
    if (!el) return;
    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    el.focus({ preventScroll: true });
  };

  return (
    <>
      <div className="paragraph-list" data-reading-column>
        {visible.map((p, i) => {
          const isActive = i === lastVisible;
          if (!isActive) {
            return (
              <p key={i} className="paragraph-list__item">
                {p.text}
              </p>
            );
          }
          return (
            <div
              key={i}
              ref={activeRef}
              className="paragraph-list__item paragraph-list__item--active"
              role="button"
              tabIndex={0}
              aria-disabled={disabled}
              data-testid="active-paragraph"
              onClick={advance}
              onKeyDown={handleKeyDown}
            >
              {p.text}
            </div>
          );
        })}
      </div>
      {!activeInView && (
        <button type="button" className="paragraph-list__scroll-back" onClick={scrollBack}>
          Back to current paragraph
        </button>
      )}
    </>
  );
}
