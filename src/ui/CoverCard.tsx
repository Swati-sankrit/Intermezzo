import { useEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { CatalogueEntry } from '../library/catalogueData';
import { LitCover } from './LitCover';
import { PlaceholderCover } from './PlaceholderCover';
import { Skeleton } from './Skeleton';
import { useCoverTilt } from './useCoverTilt';
import './CoverCard.css';

export interface CoverCardProps {
  entry: CatalogueEntry;
  /** Stored progress, whole percent. The bar shows only when above 0. */
  progress?: number;
  onOpen: (slug: string) => void;
  /** Extra attributes for the cover button (HoverCard hooks in here, task 4.4). */
  buttonProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  /** Rendered beside the button, inside the positioned wrapper (HoverCard slot, task 4.4). */
  slot?: ReactNode;
}

type ImageState = 'loading' | 'loaded' | 'error';

export function CoverCard({ entry, progress = 0, onOpen, buttonProps, slot }: CoverCardProps) {
  const [state, setState] = useState<ImageState>('loading');
  const imgRef = useRef<HTMLImageElement>(null);
  const tilt = useCoverTilt();
  const author = entry.author.trim();
  const percent = Number.isFinite(progress) ? Math.min(100, Math.max(0, Math.floor(progress))) : 0;
  const name = [entry.title, author ? `by ${author}` : '', percent > 0 ? `${percent}% read` : '']
    .filter(Boolean)
    .join(', ');

  // A cached image may finish loading before React attaches onLoad.
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete) setState(img.naturalWidth > 0 ? 'loaded' : 'error');
  }, []);

  return (
    <div className="cover-card">
      <button
        type="button"
        {...buttonProps}
        className="cover-card__button"
        aria-label={name}
        onPointerMove={(event) => {
          buttonProps?.onPointerMove?.(event);
          tilt.onPointerMove(event);
        }}
        onPointerLeave={(event) => {
          buttonProps?.onPointerLeave?.(event);
          tilt.onPointerLeave(event);
        }}
        onClick={(event) => {
          buttonProps?.onClick?.(event);
          onOpen(entry.slug);
        }}
      >
        <span className="cover-card__frame">
          {state === 'loading' && <Skeleton className="cover-card__skeleton" />}
          {state === 'error' ? (
            <PlaceholderCover title={entry.title} />
          ) : (
            <LitCover
              src={entry.coverPath}
              imgRef={imgRef}
              loading={state === 'loading'}
              onLoad={() => setState('loaded')}
              onError={() => setState('error')}
            />
          )}
        </span>
        <span className="cover-card__title">{entry.title}</span>
        <span className="cover-card__author">{author}</span>
        {percent > 0 && (
          <span className="cover-card__progress" aria-hidden="true">
            <span className="cover-card__track">
              <span className="cover-card__fill" style={{ width: `${percent}%` }} />
            </span>
            <span className="cover-card__percent">{percent}%</span>
          </span>
        )}
      </button>
      {slot}
    </div>
  );
}
