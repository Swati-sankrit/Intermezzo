/**
 * Pure placement for the catalogue hover card (library-v2, Requirements 3.4, 3.6, 3.7).
 * All values are viewport pixels. No DOM access.
 */

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

export interface Size {
  width: number
  height: number
}

export type PlacementSide = 'right' | 'left' | 'below' | 'above'

export interface Placement {
  side: PlacementSide
  left: number
  top: number
}

/** Free width beside the cover needed to place the card beside it. */
export const BESIDE_MIN_FREE_WIDTH = 280
export const CARD_GAP = 8
export const VIEWPORT_MARGIN = 8

function clamp(value: number, min: number, max: number): number {
  // When the card is larger than the room, favour the top/left edge.
  return Math.max(min, Math.min(value, max))
}

/**
 * Beside the cover (right first, then left) when at least 280 px of free width
 * exists on that side, otherwise below it (above when there is no room below).
 * The result is clamped so the card stays inside the viewport. The card never
 * overlaps the cover's own rectangle, which holds its title and author.
 */
export function computePlacement(anchor: Box, viewport: Size, card: Size): Placement {
  const maxLeft = viewport.width - card.width - VIEWPORT_MARGIN
  const maxTop = viewport.height - card.height - VIEWPORT_MARGIN
  const freeRight = viewport.width - anchor.right - CARD_GAP - VIEWPORT_MARGIN
  const freeLeft = anchor.left - CARD_GAP - VIEWPORT_MARGIN
  const minFree = Math.max(BESIDE_MIN_FREE_WIDTH, card.width)

  if (freeRight >= minFree || freeLeft >= minFree) {
    const onRight = freeRight >= minFree
    const left = onRight ? anchor.right + CARD_GAP : anchor.left - CARD_GAP - card.width
    return {
      side: onRight ? 'right' : 'left',
      left: clamp(left, VIEWPORT_MARGIN, maxLeft),
      top: clamp(anchor.top, VIEWPORT_MARGIN, maxTop),
    }
  }

  const left = clamp(anchor.left, VIEWPORT_MARGIN, maxLeft)
  const below = anchor.bottom + CARD_GAP
  if (below <= maxTop) return { side: 'below', left, top: below }
  const above = anchor.top - CARD_GAP - card.height
  if (above >= VIEWPORT_MARGIN) return { side: 'above', left, top: above }
  return { side: 'below', left, top: clamp(below, VIEWPORT_MARGIN, maxTop) }
}
