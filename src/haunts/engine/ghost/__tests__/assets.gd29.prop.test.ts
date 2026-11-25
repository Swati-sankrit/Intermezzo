// Feature: ghost-dread, Property 29: The asset allowlist accepts only exact names
// **Validates: Requirements 14.1, 14.2, 14.3, 11.18**
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { GHOST_ASSETS, HAUNT_SOUNDS, assetUrl, isAllowedAsset } from '../assets';

const GHOSTS = ['ghost-standing.png', 'ghost-face.png'];
const SOUNDS = [
  'footsteps.mp3',
  'breathing.mp3',
  'heartbeat.mp3',
  'creak.mp3',
  'knock.mp3',
  'scream.mp3',
  'drone.mp3',
];

describe('Property 29: asset allowlist', () => {
  it('resolves each of the nine names to its exact path', () => {
    for (const name of GHOSTS) {
      expect(assetUrl('ghost', name)).toBe(`/ghosts/${name}`);
      expect(isAllowedAsset(name, GHOST_ASSETS)).toBe(true);
    }
    for (const name of SOUNDS) {
      expect(assetUrl('sound', name)).toBe(`/sounds/${name}`);
      expect(isAllowedAsset(name, HAUNT_SOUNDS)).toBe(true);
    }
  });

  it('returns a URL only for exact allowlisted names (300 runs)', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const ghost = assetUrl('ghost', s);
        const sound = assetUrl('sound', s);
        if (GHOSTS.includes(s)) expect(ghost).toBe(`/ghosts/${s}`);
        else expect(ghost).toBeNull();
        if (SOUNDS.includes(s)) expect(sound).toBe(`/sounds/${s}`);
        else expect(sound).toBeNull();
      }),
      { numRuns: 300 },
    );
  });
});
