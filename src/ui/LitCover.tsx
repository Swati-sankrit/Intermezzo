import { useEffect, useRef, type RefObject } from 'react';
import { getAnchor, subscribeAnchor, toLocal } from './shell/lightAnchorStore';
import './LitCover.css';

export interface LitCoverProps {
  src: string;
  /** The base image's ref, so the owner can see a cached image that already loaded. */
  imgRef: RefObject<HTMLImageElement | null>;
  loading: boolean;
  onLoad: () => void;
  onError: () => void;
}

/**
 * A cover image in two layers. The base image is dimmed and desaturated (inside the Shell only,
 * by LitCover.css). The lit copy is full colour and shows only where a radial mask around the
 * Light_Anchor lets it through. Only images are filtered; text is a sibling and is never touched.
 */
export function LitCover({ src, imgRef, loading, onLoad, onError }: LitCoverProps) {
  const litRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const lit = litRef.current;
    if (!lit) return;
    let visible = false;
    let frame = 0;

    const paint = () => {
      frame = 0;
      const anchor = getAnchor();
      if (!anchor || !visible) return;
      const local = toLocal(anchor, lit.getBoundingClientRect());
      lit.style.setProperty('--lit-x', `${local.x}px`);
      lit.style.setProperty('--lit-y', `${local.y}px`);
    };
    const schedule = () => {
      if (visible && frame === 0) frame = requestAnimationFrame(paint);
    };

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === 'function') {
      observer = new IntersectionObserver((entries) => {
        visible = entries.some((e) => e.isIntersecting);
        schedule();
      });
      observer.observe(lit);
    } else {
      visible = true;
      schedule();
    }
    const unsubscribe = subscribeAnchor(schedule);
    // Scrolling moves the cover under a still light.
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    return () => {
      unsubscribe();
      window.removeEventListener('scroll', schedule, { capture: true });
      observer?.disconnect();
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      <img
        ref={imgRef}
        className={loading ? 'cover-card__image lit-cover__base cover-card__image--loading' : 'cover-card__image lit-cover__base'}
        src={src}
        alt=""
        loading="lazy"
        onLoad={onLoad}
        onError={onError}
      />
      <img
        ref={litRef}
        className="cover-card__image lit-cover__lit"
        src={src}
        alt=""
        aria-hidden="true"
        loading="lazy"
      />
    </>
  );
}
