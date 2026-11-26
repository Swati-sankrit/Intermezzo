/** The current Light_Anchor in viewport pixels, shared so lit covers can follow the light. */
export interface AnchorPoint {
  x: number;
  y: number;
}

let current: AnchorPoint | null = null;
const listeners = new Set<() => void>();

export function getAnchor(): AnchorPoint | null {
  return current;
}

export function publishAnchor(x: number, y: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  current = { x, y };
  listeners.forEach((fn) => fn());
}

export function subscribeAnchor(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Pure. Centre of the light in a cover's own coordinates, given the cover's viewport box. */
export function toLocal(anchor: AnchorPoint, box: { left: number; top: number }): AnchorPoint {
  return { x: anchor.x - box.left, y: anchor.y - box.top };
}
