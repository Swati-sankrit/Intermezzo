import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import fc from 'fast-check';
import { ParagraphList } from '../ParagraphList';

const paras = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `para ${i}` }));

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('ParagraphList', () => {
  it('renders paragraphs up to activeIndex and hides later ones', () => {
    render(<ParagraphList paragraphs={paras(5)} activeIndex={2} onAdvance={() => {}} />);
    expect(screen.getByText('para 0')).toBeTruthy();
    expect(screen.getByText('para 2')).toBeTruthy();
    expect(screen.queryByText('para 3')).toBeNull();
    expect(screen.getByTestId('active-paragraph').textContent).toBe('para 2');
  });

  it('advances on click, Enter and Space; Space prevents default', () => {
    const onAdvance = vi.fn();
    render(<ParagraphList paragraphs={paras(3)} activeIndex={0} onAdvance={onAdvance} />);
    const el = screen.getByTestId('active-paragraph');
    fireEvent.click(el);
    fireEvent.keyDown(el, { key: 'Enter' });
    const notCancelled = fireEvent.keyDown(el, { key: ' ' });
    expect(onAdvance).toHaveBeenCalledTimes(3);
    expect(notCancelled).toBe(false);
  });

  it('does not advance when disabled', () => {
    const onAdvance = vi.fn();
    render(<ParagraphList paragraphs={paras(3)} activeIndex={2} onAdvance={onAdvance} disabled />);
    const el = screen.getByTestId('active-paragraph');
    fireEvent.click(el);
    fireEvent.keyDown(el, { key: 'Enter' });
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it('shows the scroll-back button when the active paragraph leaves the viewport', async () => {
    let cb: IntersectionObserverCallback = () => {};
    class FakeIO {
      constructor(c: IntersectionObserverCallback) { cb = c; }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', FakeIO);
    render(<ParagraphList paragraphs={paras(3)} activeIndex={1} onAdvance={() => {}} />);
    expect(screen.queryByRole('button', { name: /back to current paragraph/i })).toBeNull();
    const { act } = await import('react');
    act(() => cb([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(screen.getByRole('button', { name: /back to current paragraph/i })).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it('renders no scroll-back button where IntersectionObserver is missing', () => {
    render(<ParagraphList paragraphs={paras(3)} activeIndex={1} onAdvance={() => {}} />);
    expect(screen.queryByRole('button', { name: /back to current paragraph/i })).toBeNull();
  });

  it('shows exactly activeIndex+1 paragraphs for any in-range index', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 30 }), fc.nat(60), (n, a) => {
        const idx = a % n;
        const { container, unmount } = render(
          <ParagraphList paragraphs={paras(n)} activeIndex={idx} onAdvance={() => {}} />,
        );
        const count = container.querySelectorAll('.paragraph-list__item').length;
        unmount();
        return count === idx + 1;
      }),
      { numRuns: 100 },
    );
  });

  it('dimmed text colour meets WCAG AA against --bg', () => {
    expect(contrast('#8a7f6e', '#14110f')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#e8dcc4', '#14110f')).toBeGreaterThanOrEqual(4.5);
  });
});
