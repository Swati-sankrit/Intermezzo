/**
 * Allowlist of bundled ghost images and haunt sounds (Req 14.1 to 14.4).
 * Pure: no DOM, no fetch. `assetUrl` is the only place that builds a request
 * path for these files. Paths are relative to the app's own origin.
 */

export const GHOST_ASSETS = ['ghost-standing.png', 'ghost-face.png'] as const;
export type GhostAssetName = (typeof GHOST_ASSETS)[number];

export const HAUNT_SOUNDS = [
  'footsteps.mp3',
  'breathing.mp3',
  'heartbeat.mp3',
  'creak.mp3',
  'knock.mp3',
  'scream.mp3',
  'drone.mp3',
] as const;
export type HauntSoundName = (typeof HAUNT_SOUNDS)[number];

export type AssetKind = 'ghost' | 'sound';

/** True only for an exact entry of `list`: no case folding, trimming or partial match. */
export function isAllowedAsset(name: string, list: readonly string[]): boolean {
  return list.includes(name);
}

/** '/ghosts/<name>' or '/sounds/<name>', or null when `name` is not in the allowlist for `kind`. */
export function assetUrl(kind: AssetKind, name: string): string | null {
  if (kind === 'ghost') {
    return isAllowedAsset(name, GHOST_ASSETS) ? `/ghosts/${name}` : null;
  }
  return isAllowedAsset(name, HAUNT_SOUNDS) ? `/sounds/${name}` : null;
}
