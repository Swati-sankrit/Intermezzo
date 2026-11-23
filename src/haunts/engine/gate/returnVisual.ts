/**
 * Visual side of a ReturnPort: full-viewport overlays that may cover the Reading_Column.
 * They exist only inside a Return_Moment (the gate hands this out through `openReturn` only).
 * Overlays are `div`s inside the stage root. The adapter writes layout and opacity, never
 * `color` or `background-color`; any colour comes from the haunt's SVG (theme variables).
 * No movement and no sweep, so an overlay cannot flash. Fade-ins use `planOverlayFade`, which
 * applies the reduced-motion floors.
 */
import type { GlitchSpec, OverlayKind, ReturnVisualOut } from '../returnTypes';
import type { VisualLayer, VisualOut } from '../types';
import { planOverlayFade, type FadeKind } from './returnRules';
import { parseSvgMarkup } from './svgMarkup';

export interface ReturnVisualDeps {
  readonly root: HTMLElement;
  reduced(): boolean;
  warn(msg: string): void;
}

export interface ReturnVisual {
  readonly visual: ReturnVisualOut;
  /** Overlays fade to 0 over `ms` and ignore further requests. They stay in the DOM until `removeAll`. */
  fadeAndRemove(ms: number): void;
  /** Fades the overlays that exist to 0 over `ms`. New overlays are still allowed; `removeAll` ends them. */
  fadeOut(ms: number): void;
  /** Removes every overlay now and refuses new ones. Safe to call twice. */
  removeAll(): void;
}

const FADE_KIND: Readonly<Record<OverlayKind, FadeKind>> = {
  ghost: 'ghost',
  jumpscare: 'jumpscare',
  'card-hand': 'card',
  glitch: 'glitch',
};

function unit(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

const NOOP_LAYER: VisualLayer = {
  setMarkup: () => {},
  setOpacity: () => {},
  setSweep: () => {},
  setLabel: () => {},
  remove: () => {},
};

interface OverlayRecord {
  readonly layer: VisualLayer;
  fade(ms: number): void;
  destroy(): void;
}

function createOverlay(kind: OverlayKind, deps: ReturnVisualDeps, isEnded: () => boolean): OverlayRecord {
  const { root } = deps;
  const doc = root.ownerDocument;
  const el = doc.createElement('div');
  el.className = 'haunt-overlay';
  el.setAttribute('data-overlay-kind', kind);
  el.setAttribute('aria-hidden', 'true');
  for (const [name, value] of [
    ['position', 'absolute'], ['inset', '0'], ['pointer-events', 'none'], ['opacity', '0'],
    ['transition-property', 'opacity'], ['transition-timing-function', 'linear'],
  ] as const) {
    el.style.setProperty(name, value);
  }
  root.appendChild(el);
  let removed = false;

  const layer: VisualLayer = {
    setMarkup(svg) {
      if (removed || isEnded()) return;
      const parsed = parseSvgMarkup(svg, doc);
      el.replaceChildren();
      if (parsed === null) deps.warn('return overlay markup rejected: not usable SVG');
      else el.appendChild(parsed);
    },
    setOpacity(next, fadeMs) {
      if (removed || isEnded()) return;
      el.style.transitionDuration = `${planOverlayFade(FADE_KIND[kind], fadeMs, deps.reduced())}ms`;
      el.style.opacity = String(unit(next));
    },
    setSweep: () => {}, // Overlays never move: a sweep request is ignored.
    setLabel(text) {
      if (removed || isEnded()) return;
      const label = typeof text === 'string' ? text.trim() : '';
      if (label === '') {
        el.removeAttribute('role');
        el.removeAttribute('aria-label');
        el.setAttribute('aria-hidden', 'true');
        return;
      }
      el.removeAttribute('aria-hidden');
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', label);
    },
    remove: () => destroy(),
  };

  function destroy(): void {
    if (removed) return;
    removed = true;
    el.remove();
  }

  return {
    layer,
    fade(ms) {
      if (removed) return;
      el.style.transitionDuration = `${Math.max(0, ms)}ms`;
      el.style.opacity = '0';
    },
    destroy,
  };
}

export function createReturnVisual(base: VisualOut, deps: ReturnVisualDeps): ReturnVisual {
  const overlays = new Set<OverlayRecord>();
  let ended = false;

  const visual: ReturnVisualOut = {
    glow: base.glow,
    createLayer: (side) => base.createLayer(side),
    createOverlay(kind) {
      if (ended) return NOOP_LAYER;
      const rec = createOverlay(kind, deps, () => ended);
      overlays.add(rec);
      return rec.layer;
    },
    // Real Glitch effect: task 8.3. Until then the gate grants no flickers, so nothing flashes.
    runGlitch: (_spec: GlitchSpec) => ({ grantedFlickers: 0 }),
  };

  return {
    visual,
    fadeAndRemove(ms) {
      ended = true;
      for (const o of overlays) o.fade(ms);
    },
    fadeOut(ms) {
      for (const o of overlays) o.fade(ms);
    },
    removeAll() {
      ended = true;
      for (const o of overlays) o.destroy();
      overlays.clear();
    },
  };
}
