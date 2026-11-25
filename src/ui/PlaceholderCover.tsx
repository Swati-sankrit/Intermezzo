import './PlaceholderCover.css';

interface PlaceholderCoverProps {
  title: string;
}

/** Shown when a cover image fails to load. Decorative: the button names the book. */
export function PlaceholderCover({ title }: PlaceholderCoverProps) {
  return (
    <div className="placeholder-cover" aria-hidden="true">
      <svg className="placeholder-cover__icon" viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M12 3c1.5 2 2.2 3.2 2.2 4.4A2.2 2.2 0 0 1 12 9.6a2.2 2.2 0 0 1-2.2-2.2C9.8 6.2 10.5 5 12 3z" />
        <path d="M8 12h8v8H8z" />
      </svg>
      <span className="placeholder-cover__title">{title}</span>
    </div>
  );
}
