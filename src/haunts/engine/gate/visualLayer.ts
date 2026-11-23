/** One haunt layer: a `div` inside a side region. Writes only to its own element. */
import type { VisualLayer } from '../types';
import { planFadeIn, planFadeOut, sweepRate } from './plan';
import { parseSvgMarkup } from './svgMarkup';

export interface LayerContext {
  readonly doc: Document;
  readonly region: HTMLElement;
  reduced(): boolean;
  /** The layer's sweep request changed. */
  changed(): void;
  warn(msg: string): void;
}

export interface LayerRecord {
  readonly key: string;
  readonly layer: VisualLayer;
  /** Rate the layer asks for, 0 when it wants no sweep. */
  requestedRate(): number;
  /** Apply the allocated rate; stops the sweep when it is 0 or motion is reduced. */
  applyRate(allocated: number): void;
  destroy(): void;
}

const MIN_SWEEP_PERIOD_MS = 2000;

function unit(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

export function createLayerRecord(ctx: LayerContext, key: string): LayerRecord {
  const el = ctx.doc.createElement('div');
  el.className = 'haunt-layer';
  el.setAttribute('aria-hidden', 'true');
  el.style.opacity = '0';
  ctx.region.appendChild(el);

  let opacity = 0;
  let sweepMs: number | null = null;
  let allocated = 0;
  let removed = false;

  function stopSweep(): void {
    el.classList.remove('is-sweeping');
    el.style.removeProperty('--sweep-period');
  }

  function applyRate(rate: number): void {
    allocated = Number.isFinite(rate) && rate > 0 ? rate : 0;
    if (removed || ctx.reduced() || sweepMs === null || allocated <= 0) {
      stopSweep();
      return;
    }
    const period = Math.max(sweepMs, MIN_SWEEP_PERIOD_MS);
    const wanted = sweepRate(period);
    // Slower than asked when the allocation is smaller; never faster.
    const effective = allocated >= wanted ? period : 1000 / allocated;
    el.style.setProperty('--sweep-period', `${effective}ms`);
    el.classList.add('is-sweeping');
  }

  const layer: VisualLayer = {
    setMarkup(svg) {
      if (removed) return;
      const parsed = parseSvgMarkup(svg, ctx.doc);
      el.replaceChildren();
      if (parsed === null) {
        ctx.warn('haunt layer markup rejected: not usable SVG');
        return;
      }
      el.appendChild(parsed);
    },
    setOpacity(next, fadeMs) {
      if (removed) return;
      const target = unit(next);
      const ms = target >= opacity ? planFadeIn(fadeMs, ctx.reduced()) : planFadeOut(fadeMs);
      opacity = target;
      el.style.transitionDuration = `${ms}ms`;
      el.style.opacity = String(target);
    },
    setSweep(periodMs) {
      if (removed) return;
      sweepMs = periodMs !== null && Number.isFinite(periodMs) ? Math.max(periodMs, MIN_SWEEP_PERIOD_MS) : null;
      applyRate(allocated);
      ctx.changed();
    },
    // Inert placeholder until ghost-dread task 3.
    setLabel() {},
    remove() {
      destroy();
      ctx.changed();
    },
  };

  function destroy(): void {
    if (removed) return;
    removed = true;
    sweepMs = null;
    stopSweep();
    el.remove();
  }

  return {
    key,
    layer,
    requestedRate: () => (removed || sweepMs === null ? 0 : sweepRate(sweepMs)),
    applyRate,
    destroy,
  };
}
