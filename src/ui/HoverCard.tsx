import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CatalogueEntry } from '../library/catalogueData';
import { computePlacement } from '../library/hoverCardPlacement';
import type { Placement } from '../library/hoverCardPlacement';
import { formatReadingTime } from '../library/readingTime';
import { hoverCardId } from './hoverCardId';
import './HoverCard.css';

export interface HoverCardProps {
  entry: CatalogueEntry;
  onClose: () => void;
}

export function HoverCard({ entry, onClose }: HoverCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const card = cardRef.current;
      // The card is rendered inside the cover wrapper, which is its anchor.
      const anchor = card?.parentElement?.getBoundingClientRect();
      if (!anchor || !card) return;
      setPlacement(
        computePlacement(
          anchor,
          { width: document.documentElement.clientWidth, height: window.innerHeight },
          { width: card.offsetWidth, height: card.offsetHeight },
        ),
      );
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, []);

  // Escape hides the card; focus is not moved, so it stays on the cover.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      ref={cardRef}
      id={hoverCardId(entry.slug)}
      role="tooltip"
      className="hover-card"
      data-side={placement?.side}
      style={
        placement
          ? { left: placement.left, top: placement.top }
          : { left: 0, top: 0, visibility: 'hidden' }
      }
    >
      <p className="hover-card__description">{entry.description}</p>
      <p className="hover-card__time">{formatReadingTime(entry.readingMinutes)}</p>
      <ul className="hover-card__tags" aria-label="Mood">
        {entry.moodTags.map((tag) => (
          <li key={tag} className="hover-card__tag">
            {tag}
          </li>
        ))}
      </ul>
    </div>
  );
}
