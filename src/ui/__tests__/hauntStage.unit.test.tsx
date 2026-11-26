// Task 6.2 (Req 2.12, 9.2, 9.12): HauntStage accessibility, HauntLayer's reading wiring, and
// the HauntStage.css rules. jsdom does not apply the stylesheet, so CSS is checked as text.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AttentionSignalLike, VisualHosts } from '../../haunts/engine';
import { createGate, createReducedMotion } from '../../haunts/engine';
import * as ghostFigure from '../../haunts/ghostFigure';
import type { ReadingContext } from '../../haunts/engine/returnTypes';
import { HauntLayer } from '../HauntLayer';
import { HauntStage } from '../HauntStage';
import { createReadingContext, type ReadingState } from '../readingContext';
import type { Book } from '../../reader/types';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderStage(): { hosts: VisualHosts; container: HTMLElement } {
  let hosts: VisualHosts | null = null;
  const view = render(<HauntStage hostsRef={(h) => { if (h !== null) hosts = h; }} />);
  if (hosts === null) throw new Error('HauntStage did not expose its hosts');
  return { hosts, container: view.container };
}

function makeGate(hosts: VisualHosts) {
  return createGate({
    audio: { createAudioContext: () => { throw new Error('no audio in this test'); }, eventTarget: null },
    hosts,
    storage: null,
    storageEvents: null,
    reducedMotion: createReducedMotion(null),
    scheduler: { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>) },
  });
}

describe('HauntStage accessibility (Req 2.12)', () => {
  it('does not hide the stage root from assistive technology', () => {
    const { container } = renderStage();
    const root = container.querySelector('.haunt-stage');
    expect(root).not.toBeNull();
    expect(root?.hasAttribute('aria-hidden')).toBe(false);
  });

  it('keeps aria-hidden on both glow elements', () => {
    const { container } = renderStage();
    const glows = container.querySelectorAll('.haunt-stage__glow');
    expect(glows).toHaveLength(2);
    for (const glow of glows) expect(glow.getAttribute('aria-hidden')).toBe('true');
  });

  it('exposes a labelled ghost layer as an image with its label', () => {
    const { hosts } = renderStage();
    const gate = makeGate(hosts);
    const port = gate.open('ghostFigure');
    ghostFigure.start(1, port.audio, port.visual, { mode: 'classic', ghostStep: 2, roll: 0.1 });
    const img = screen.getByRole('img', { name: 'A ghost stands nearby' });
    expect(img.classList.contains('haunt-layer')).toBe(true);
    expect(img.hasAttribute('aria-hidden')).toBe(false);
    ghostFigure.stop();
    gate.dispose();
  });

  it('hides a layer that has no label from assistive technology', () => {
    const { hosts, container } = renderStage();
    const gate = makeGate(hosts);
    gate.open('plain').visual.createLayer('left');
    const layer = container.querySelector('.haunt-layer');
    expect(layer?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    gate.dispose();
  });
});

const BOOK: Book = {
  fileName: 'tale.txt',
  title: 'Tale',
  chapters: [
    { title: 'One', text: 'a1 first.\n\na2 second.' },
    { title: 'Two', text: 'b1 only.' },
  ],
};

describe('HauntLayer passes a working reading context to the engine', () => {
  beforeEach(() => localStorage.clear());

  it('delivers a chapter change, and not a paragraph change, to the engine', () => {
    let state: ReadingState = { book: BOOK, chapterIndex: 0, paragraphIndex: 0 };
    const listeners = new Set<() => void>();
    const real = createReadingContext(
      () => state,
      (cb) => {
        listeners.add(cb);
        return () => void listeners.delete(cb);
      },
    );
    // Wraps the real context to see what the engine registers; nothing is faked.
    let engineCallbacks = 0;
    let subscriptions = 0;
    const reading: ReadingContext = {
      ...real,
      subscribeChapter(cb) {
        subscriptions++;
        return real.subscribeChapter!(() => {
          engineCallbacks++;
          cb();
        });
      },
    };
    const subscribeSignal = (cb: (s: AttentionSignalLike) => void) => {
      cb({ value: 'present', timestamp: performance.timeOrigin + performance.now() });
      return () => undefined;
    };
    const change = (next: ReadingState) => {
      state = next;
      act(() => {
        for (const l of [...listeners]) l();
      });
    };

    const view = render(<HauntLayer subscribeSignal={subscribeSignal} reading={reading} />);
    expect(subscriptions).toBe(1); // the engine subscribed through the real hook
    expect(listeners.size).toBe(1);

    change({ ...state, paragraphIndex: 1 });
    expect(engineCallbacks).toBe(0);
    change({ book: BOOK, chapterIndex: 1, paragraphIndex: 0 });
    expect(engineCallbacks).toBe(1);

    view.unmount();
    expect(listeners.size).toBe(0); // stop() released the subscription
  });
});

describe('HauntStage.css rules (static text check)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(resolve(here, '../HauntStage.css'), 'utf8');
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, ' ');

  /** Body of the first `@media (prefers-reduced-motion: reduce) { ... }`, by brace matching. */
  function reducedBlock(): string {
    const at = css.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(at).toBeGreaterThanOrEqual(0);
    const open = css.indexOf('{', at);
    let depth = 0;
    for (let i = open; i < css.length; i++) {
      if (css[i] === '{') depth++;
      if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
    }
    throw new Error('unbalanced reduced-motion block');
  }

  it('declares every colour through var(--...) or a plain keyword', () => {
    const decls = [...css.matchAll(/(?:^|[;{\s])((?:background(?:-color|-image)?|color|fill|stroke|border(?:-[a-z]+)*-color|outline-color|box-shadow|text-shadow))\s*:\s*([^;}]+)/g)];
    expect(decls.length).toBeGreaterThan(0); // not vacuous
    for (const [, prop, value] of decls) {
      const rest = value.replace(/var\(--[a-z-]+\)/g, '');
      expect(rest, `${prop}: ${value}`).not.toMatch(/#[0-9a-f]{3,8}\b|\b(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color-mix)\s*\(/i);
      expect(rest, `${prop}: ${value}`).not.toMatch(/\b(red|crimson|scarlet|maroon|black|white|gray|grey|blue|green|yellow|orange|purple)\b/i);
    }
  });

  it('has a stylesheet for overlays', () => {
    expect(css).toMatch(/\.haunt-overlay\s*\{[^}]*pointer-events:\s*none/);
  });

  it('disables every animation and any movement under reduced motion, leaving only fades', () => {
    const block = reducedBlock();
    for (const sel of ['.haunt-stage__drift', '.haunt-stage.is-guttering .haunt-stage__gutter', '.haunt-layer.is-sweeping', '.haunt-overlay']) {
      expect(block, sel).toContain(sel);
    }
    expect(block).toMatch(/animation:\s*none/);
    expect(block).toMatch(/transform:\s*none/);
    expect(block).not.toContain('@keyframes');
    // Any transition under reduced motion is opacity only.
    for (const [, value] of block.matchAll(/transition(?:-property)?\s*:\s*([^;}]+)/g)) {
      expect(value.trim()).toBe('opacity');
    }
  });

  it('keyframes change only opacity and transform', () => {
    const frames = [...css.matchAll(/@keyframes[^{]+\{([\s\S]*?\n\})/g)].map((m) => m[1]);
    expect(frames.length).toBeGreaterThanOrEqual(3);
    for (const f of frames) expect(f).not.toMatch(/\b(color|background|filter|visibility|display)\s*:/);
  });
});
