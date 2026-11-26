import { useRef, type KeyboardEvent } from 'react';
import { SHELL_TAB_NAMES, type ShellTabName } from './tabStorage';
import './TabBar.css';

export const TAB_LABELS: Record<ShellTabName, string> = {
  library: 'Library',
  ledger: 'The Ledger',
  seance: 'The Séance',
};

export const tabId = (tab: ShellTabName) => `shell-tab-${tab}`;
export const panelId = (tab: ShellTabName) => `shell-panel-${tab}`;

export interface TabBarProps {
  active: ShellTabName;
  onChange: (tab: ShellTabName) => void;
}

/** Plain ARIA tabs: roving tabindex, arrow/Home/End keys with wrap-around. */
export function TabBar({ active, onChange }: TabBarProps) {
  const refs = useRef<Partial<Record<ShellTabName, HTMLButtonElement | null>>>({});

  const move = (index: number) => {
    const count = SHELL_TAB_NAMES.length;
    const next = SHELL_TAB_NAMES[((index % count) + count) % count]!;
    onChange(next);
    refs.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight') move(index + 1);
    else if (e.key === 'ArrowLeft') move(index - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(SHELL_TAB_NAMES.length - 1);
    else return;
    e.preventDefault();
  };

  return (
    <div className="tab-bar" role="tablist" aria-label="Sections">
      {SHELL_TAB_NAMES.map((tab, i) => (
        <button
          key={tab}
          ref={(el) => {
            refs.current[tab] = el;
          }}
          type="button"
          role="tab"
          id={tabId(tab)}
          className={`tab-bar__tab${tab === active ? ' tab-bar__tab--active' : ''}`}
          aria-selected={tab === active}
          aria-controls={panelId(tab)}
          tabIndex={tab === active ? 0 : -1}
          onClick={() => onChange(tab)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {TAB_LABELS[tab]}
        </button>
      ))}
    </div>
  );
}
