/** Types shared by the visual adapter files. */
import type { Unsubscribe, VisualOut } from '../types';
import type { RateRequest } from './plan';

/** The stage host elements. The adapter writes only to these and to elements it creates inside them. */
export interface VisualHosts {
  /** Receives glow and gutter custom properties and classes. */
  readonly root: HTMLElement;
  /** Region beside the Reading_Column, left. Layers are appended here. */
  readonly left: HTMLElement;
  /** Region beside the Reading_Column, right. */
  readonly right: HTMLElement;
}

export interface VisualAdapterDeps {
  readonly hosts: VisualHosts;
  readonly reducedMotion?: boolean;
  readonly warn?: (msg: string) => void;
}

/** One port's view of the stage. `visual` is what the haunt receives. */
export interface VisualChannel {
  readonly visual: VisualOut;
  /** Removes the channel's layers and its glow request. Safe to call twice. */
  close(): void;
}

export interface VisualAdapter {
  openChannel(): VisualChannel;
  setReducedMotion(on: boolean): void;
  /**
   * Flash-equivalent rates the haunts ask for: one `*:gutter` entry per channel and one
   * `*:layer*` entry per layer that wants a sweep (rate from `sweepRate`).
   */
  requests(): readonly RateRequest[];
  /**
   * Apply the rates the gate allocated (`allocateFlashRates` over `requests()`). The adapter
   * never runs a gutter or sweep faster than its allocated rate. A key missing from
   * `allocated` counts as 0.
   */
  applyRates(allocated: readonly RateRequest[]): void;
  /** Called after a haunt changes a gutter or sweep request, so the gate can reallocate. */
  onRequestChange(cb: () => void): Unsubscribe;
  /** Removes every layer and clears every property and class the adapter set. */
  dispose(): void;
}
