import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import type { ShelfName } from '../library/model';
import { SHELF_LABELS } from './shelfLabels';
import './ShelfMenu.css';

export interface ShelfMenuProps {
  title: string;
  shelf: ShelfName;
  /** The "⋯" button; the parent keeps the ref so it can return focus here. */
  buttonRef: RefObject<HTMLButtonElement | null>;
  onMove: (shelf: ShelfName) => void;
  onRemove: () => void;
}

export function ShelfMenu({ title, shelf, buttonRef, onMove, onRemove }: ShelfMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const targets = (Object.keys(SHELF_LABELS) as ShelfName[]).filter((s) => s !== shelf);
  const count = targets.length + 1;

  useEffect(() => {
    if (open) itemRefs.current[0]?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = itemRefs.current.findIndex((el) => el === document.activeElement);
    if (e.key === 'Escape') {
      e.stopPropagation();
      close(true);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      itemRefs.current[(at + step + count) % count]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      itemRefs.current[e.key === 'Home' ? 0 : count - 1]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const choose = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div ref={rootRef} className="shelf-menu" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className="btn-quiet shelf-menu__button"
        aria-label={`More actions for ${title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={`Actions for ${title}`} className="shelf-menu__list">
          {targets.map((s, i) => (
            <button
              key={s}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              className="shelf-menu__item"
              onClick={() => choose(() => onMove(s))}
            >
              Move to {SHELF_LABELS[s]}
            </button>
          ))}
          <button
            ref={(el) => {
              itemRefs.current[targets.length] = el;
            }}
            type="button"
            role="menuitem"
            className="shelf-menu__item"
            onClick={() => choose(onRemove)}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
