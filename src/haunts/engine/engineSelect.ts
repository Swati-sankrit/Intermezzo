/**
 * Which haunts the engine may run for a mode and level. Pure: no DOM, clock, timer or random access.
 */
import type { Haunt, HauntLevel, HauntMode } from './types';
/** A missing `modes` means all three modes. */
export function allowedIn(haunt: Haunt, mode: HauntMode): boolean {
  return haunt.modes === undefined || haunt.modes.includes(mode);
}
/** Leads (role `'lead'` or missing) that Level_Logic may pick, and layers allowed in `mode`. */
export function selectByMode(
  haunts: readonly Haunt[],
  mode: HauntMode,
): { leads: Haunt[]; layers: Haunt[] } {
  const allowed = haunts.filter((h) => allowedIn(h, mode));
  return {
    leads: allowed.filter((h) => h.role !== 'layer'),
    layers: allowed.filter((h) => h.role === 'layer'),
  };
}
/**
 * Ids of layers to run: the layer's `modes` include `mode` and `level >= minLevel` (default 1).
 * None at level 0 and none in Gentle (Req 8.14, 2.10).
 */
export function layersToRun(layers: readonly Haunt[], level: 0 | 1 | 2 | 3, mode: HauntMode): string[] {
  if (level === 0 || mode === 'gentle') return [];
  return layers
    .filter((h) => allowedIn(h, mode) && level >= ((h.minLevel ?? 1) as HauntLevel))
    .map((h) => h.id);
}
