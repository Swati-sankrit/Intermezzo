/**
 * Visual adapter for the Safety_Gate. Writes only inside the stage host elements:
 * custom properties and classes on the stage root, and `div` layers in the side regions.
 * It never writes `color` or `background-color`, and never touches the Reading_Column.
 * No Web Animations API: movement is a CSS class and a custom property; the stage
 * stylesheet owns the `@keyframes`.
 *
 * The adapter records what haunts ask for. The gate allocates the flash budget over
 * `requests()` with `allocateFlashRates` and passes the result to `applyRates`.
 */
import type { Unsubscribe, VisualOut } from '../types';
import { planFadeIn, planFadeOut, MAX_FLASHES_PER_SEC, type RateRequest } from './plan';
import { createLayerRecord, type LayerRecord } from './visualLayer';
import type { VisualAdapter, VisualAdapterDeps, VisualChannel } from './visualTypes';

export type { VisualAdapter, VisualAdapterDeps, VisualChannel, VisualHosts } from './visualTypes';

interface ChannelRecord {
  readonly id: number;
  dim: number;
  depth: number;
  rate: number;
  layers: Set<LayerRecord>;
  closed: boolean;
}

function unit(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

export function createVisualAdapter(deps: VisualAdapterDeps): VisualAdapter {
  const { root, left, right } = deps.hosts;
  const doc = root.ownerDocument;
  const warn = deps.warn ?? (() => undefined);
  const channels = new Set<ChannelRecord>();
  const listeners = new Set<() => void>();
  let reduced = deps.reducedMotion === true;
  let allocated = new Map<string, number>();
  let appliedDim = 0;
  let nextId = 1;
  let disposed = false;

  const notify = (): void => {
    for (const cb of [...listeners]) cb();
  };
  const gutterKey = (c: ChannelRecord): string => `${c.id}:gutter`;
  const gutterRequest = (c: ChannelRecord): number =>
    reduced || c.depth <= 0 ? 0 : Math.min(MAX_FLASHES_PER_SEC, Math.max(0, c.rate));

  function writeGlow(requestedFadeMs: number | undefined): void {
    let dim = 0;
    for (const c of channels) dim = Math.max(dim, c.dim);
    const ms = dim >= appliedDim ? planFadeIn(requestedFadeMs, reduced) : planFadeOut(requestedFadeMs);
    appliedDim = dim;
    root.style.setProperty('--glow-fade', `${ms}ms`);
    root.style.setProperty('--glow-dim', String(dim));
  }

  function writeGutter(): void {
    // One gutter animation on the root: the channel with the deepest dip drives it.
    let best: { depth: number; rate: number } | null = null;
    for (const c of channels) {
      const rate = Math.min(gutterRequest(c), allocated.get(gutterKey(c)) ?? 0);
      if (rate > 0 && (best === null || c.depth > best.depth)) best = { depth: c.depth, rate };
    }
    if (reduced || best === null) {
      root.classList.remove('is-guttering');
      root.style.removeProperty('--gutter-depth');
      root.style.removeProperty('--gutter-period');
      return;
    }
    root.style.setProperty('--gutter-depth', String(best.depth));
    root.style.setProperty('--gutter-period', `${1000 / best.rate}ms`);
    root.classList.add('is-guttering');
  }

  function writeRates(): void {
    for (const c of channels) {
      for (const l of c.layers) l.applyRate(reduced ? 0 : (allocated.get(l.key) ?? 0));
    }
    writeGutter();
  }

  function openChannel(): VisualChannel {
    const rec: ChannelRecord = { id: nextId++, dim: 0, depth: 0, rate: 0, layers: new Set(), closed: false };
    if (disposed) rec.closed = true;
    else channels.add(rec);
    let layerCount = 0;

    const visual: VisualOut = {
      glow: {
        setDim(amount, fadeMs) {
          if (rec.closed) return;
          rec.dim = unit(amount);
          writeGlow(fadeMs);
        },
        setGutter(depth, dipsPerSec) {
          if (rec.closed) return;
          rec.depth = unit(depth);
          rec.rate = Number.isFinite(dipsPerSec) ? Math.max(0, dipsPerSec) : 0;
          writeGutter();
          notify();
        },
      },
      createLayer(side) {
        const region = side === 'left' ? left : right;
        const lr = createLayerRecord(
          { doc, region, reduced: () => reduced, changed: notify, warn },
          `${rec.id}:layer${layerCount++}`,
        );
        if (rec.closed) lr.destroy();
        else rec.layers.add(lr);
        return lr.layer;
      },
    };

    return {
      visual,
      close() {
        if (rec.closed) return;
        rec.closed = true;
        for (const l of rec.layers) l.destroy();
        rec.layers.clear();
        channels.delete(rec);
        writeGlow(undefined);
        writeGutter();
        notify();
      },
    };
  }

  return {
    openChannel,
    setReducedMotion(on) {
      if (reduced === on) return;
      reduced = on;
      writeRates();
      notify();
    },
    requests() {
      const out: RateRequest[] = [];
      for (const c of channels) {
        out.push({ key: gutterKey(c), rate: gutterRequest(c) });
        for (const l of c.layers) {
          const rate = reduced ? 0 : l.requestedRate();
          if (rate > 0) out.push({ key: l.key, rate });
        }
      }
      return out;
    },
    applyRates(next) {
      allocated = new Map(next.map((r) => [r.key, r.rate]));
      writeRates();
    },
    onRequestChange(cb): Unsubscribe {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const c of [...channels]) {
        c.closed = true;
        for (const l of c.layers) l.destroy();
      }
      channels.clear();
      listeners.clear();
      root.classList.remove('is-guttering');
      for (const p of ['--glow-dim', '--glow-fade', '--gutter-depth', '--gutter-period']) {
        root.style.removeProperty(p);
      }
    },
  };
}
