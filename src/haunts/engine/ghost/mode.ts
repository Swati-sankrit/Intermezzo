/**
 * Haunt modes. Pure: no DOM, audio, timer, clock or random access.
 */

export type HauntMode = 'gentle' | 'classic' | 'nightmare';

export const HAUNT_MODES: readonly HauntMode[] = ['gentle', 'classic', 'nightmare'];

export const DEFAULT_MODE: HauntMode = 'classic';

function isMode(value: string): value is HauntMode {
  return (HAUNT_MODES as readonly string[]).includes(value);
}

/**
 * A valid saved mode wins. Any other string gives Classic. A missing mode (null)
 * migrates from the old gentle flag: 'true' gives Gentle, anything else Classic.
 */
export function resolveMode(modeRaw: string | null, gentleRaw: string | null): HauntMode {
  if (modeRaw !== null) return isMode(modeRaw) ? modeRaw : DEFAULT_MODE;
  return gentleRaw === 'true' ? 'gentle' : DEFAULT_MODE;
}
