import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatalogueEntry } from '../library/catalogueData';
import { CATALOGUE } from '../library/catalogueData';
import { CoverCard } from './CoverCard';
import { HoverCard } from './HoverCard';
import { hoverCardId } from './hoverCardId';
import { useNoHover } from './useNoHover';
import './CatalogueGrid.css';

export interface CatalogueGridProps {
  /** Defaults to the bundled catalogue. */
  entries?: readonly CatalogueEntry[];
  /** Stored progress by slug (Book_Id), whole percent. */
  progress?: Readonly<Record<string, number>>;
  onOpen: (slug: string) => void;
}

/** How long the pointer must rest on a cover before its card shows. */
export const HOVER_REST_MS = 200;

function isKeyboardFocus(el: HTMLElement): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
}

export function CatalogueGrid({ entries = CATALOGUE, progress = {}, onOpen }: CatalogueGridProps) {
  // Only one hover card can be open: the state is a single slug.
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const noHover = useNoHover();

  const clearTimer = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);
  const close = useCallback(() => {
    clearTimer();
    setActiveSlug(null);
  }, [clearTimer]);
  useEffect(() => clearTimer, [clearTimer]);

  return (
    <ul className="catalogue-grid" aria-label="Catalogue">
      {entries.map((entry) => {
        const open = activeSlug === entry.slug;
        return (
          <li key={entry.slug} className="catalogue-grid__item">
            <CoverCard
              entry={entry}
              progress={progress[entry.slug]}
              onOpen={onOpen}
              buttonProps={{
                'aria-describedby': open ? hoverCardId(entry.slug) : undefined,
                onPointerEnter: (event) => {
                  if (event.pointerType === 'touch') return;
                  clearTimer();
                  timer.current = setTimeout(() => setActiveSlug(entry.slug), HOVER_REST_MS);
                },
                onPointerLeave: close,
                onFocus: (event) => {
                  if (isKeyboardFocus(event.currentTarget)) {
                    clearTimer();
                    setActiveSlug(entry.slug);
                  }
                },
                onBlur: close,
              }}
              slot={
                <>
                  {noHover && (
                    <button
                      type="button"
                      className="cover-card__about"
                      aria-label={`About this book: ${entry.title}`}
                      aria-expanded={open}
                      aria-controls={open ? hoverCardId(entry.slug) : undefined}
                      onClick={() => setActiveSlug(open ? null : entry.slug)}
                      onBlur={close}
                    >
                      About this book
                    </button>
                  )}
                  {open && <HoverCard entry={entry} onClose={close} />}
                </>
              }
            />
          </li>
        );
      })}
    </ul>
  );
}
