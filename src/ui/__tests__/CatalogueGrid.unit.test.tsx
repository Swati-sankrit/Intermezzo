import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CatalogueGrid } from '../CatalogueGrid';
import { CATALOGUE } from '../../library/catalogueData';
import { computePlacement } from '../../library/hoverCardPlacement';

const entries = CATALOGUE.slice(0, 3);
const [first, second] = entries;

function stubMatchMedia(noHover: boolean) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({
      matches: query === '(hover: none)' ? noHover : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  );
}

function coverButton(title: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(title) });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('CatalogueGrid cards', () => {
  it('shows title and author, and the button name contains both', () => {
    stubMatchMedia(false);
    render(<CatalogueGrid entries={entries} onOpen={vi.fn()} />);
    for (const e of entries) {
      expect(screen.getByText(e.title)).toBeTruthy();
      expect(screen.getAllByText(e.author).length).toBeGreaterThan(0);
      const name = coverButton(e.title).getAttribute('aria-label') ?? '';
      expect(name).toContain(e.title);
      expect(name).toContain(e.author);
    }
  });

  it('opens the book on click, Enter, and Space', async () => {
    stubMatchMedia(false);
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<CatalogueGrid entries={entries} onOpen={onOpen} />);
    await user.click(coverButton(first.title));
    expect(onOpen).toHaveBeenLastCalledWith(first.slug);
    coverButton(second.title).focus();
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenLastCalledWith(second.slug);
    await user.keyboard(' ');
    expect(onOpen).toHaveBeenCalledTimes(3);
    expect(onOpen).toHaveBeenLastCalledWith(second.slug);
  });

  it('shows the placeholder cover when the image fails to load', () => {
    stubMatchMedia(false);
    const { container } = render(<CatalogueGrid entries={[first]} onOpen={vi.fn()} />);
    expect(container.querySelector('.placeholder-cover')).toBeNull();
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('.placeholder-cover')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('HoverCard behaviour', () => {
  it('shows after the pointer rests 200 ms and hides on pointer leave', () => {
    stubMatchMedia(false);
    vi.useFakeTimers();
    render(<CatalogueGrid entries={entries} onOpen={vi.fn()} />);
    const button = coverButton(first.title);
    fireEvent.pointerEnter(button);
    act(() => void vi.advanceTimersByTime(199));
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => void vi.advanceTimersByTime(1));
    expect(screen.getByRole('tooltip').textContent).toContain(first.description);
    expect(button.getAttribute('aria-describedby')).toBe(screen.getByRole('tooltip').id);
    fireEvent.pointerLeave(button);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows on keyboard focus, hides on Escape, and focus stays on the cover', async () => {
    stubMatchMedia(false);
    const user = userEvent.setup();
    render(<CatalogueGrid entries={entries} onOpen={vi.fn()} />);
    await user.tab();
    const button = coverButton(first.title);
    expect(document.activeElement).toBe(button);
    expect(screen.getByRole('tooltip').textContent).toContain(first.description);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('shows only one card at a time', async () => {
    stubMatchMedia(false);
    const user = userEvent.setup();
    render(<CatalogueGrid entries={entries} onOpen={vi.fn()} />);
    await user.tab();
    expect(screen.getAllByRole('tooltip')).toHaveLength(1);
    await user.tab();
    const tips = screen.getAllByRole('tooltip');
    expect(tips).toHaveLength(1);
    expect(tips[0].textContent).toContain(second.description);
  });

  it('offers "About this book" without hover, and not on hover devices', async () => {
    stubMatchMedia(true);
    const user = userEvent.setup();
    render(<CatalogueGrid entries={entries} onOpen={vi.fn()} />);
    const about = screen.getAllByRole('button', { name: /About this book/ });
    expect(about).toHaveLength(entries.length);
    await user.click(about[0]);
    expect(screen.getByRole('tooltip').textContent).toContain(first.description);
    cleanup();
    stubMatchMedia(false);
    render(<CatalogueGrid entries={entries} onOpen={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /About this book/ })).toBeNull();
  });
});

describe('computePlacement', () => {
  const viewport = { width: 1200, height: 800 };
  const card = { width: 260, height: 200 };

  it('places the card beside the cover when 280 px or more is free', () => {
    const p = computePlacement({ left: 100, top: 100, right: 260, bottom: 340 }, viewport, card);
    expect(p.side).toBe('right');
    expect(p.left).toBeGreaterThanOrEqual(260);
  });

  it('places the card below when less than 280 px is free on both sides', () => {
    const p = computePlacement({ left: 100, top: 100, right: 260, bottom: 340 }, { width: 400, height: 800 }, card);
    expect(p.side).toBe('below');
    expect(p.top).toBeGreaterThanOrEqual(340);
  });

  it('keeps the card inside the viewport', () => {
    const small = { width: 360, height: 640 };
    const p = computePlacement({ left: 200, top: 500, right: 340, bottom: 630 }, small, card);
    expect(p.left).toBeGreaterThanOrEqual(0);
    expect(p.top).toBeGreaterThanOrEqual(0);
    expect(p.left + card.width).toBeLessThanOrEqual(small.width);
    expect(p.top + card.height).toBeLessThanOrEqual(small.height);
  });
});
