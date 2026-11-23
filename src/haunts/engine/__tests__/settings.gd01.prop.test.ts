import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_MODE, HAUNT_MODES, resolveMode } from '../ghost/mode';
import type { HauntMode } from '../ghost/mode';
import { KEYS, parseSettings, serializeSettings } from '../settings';
import { hauntSettingsArb } from './arbitraries';

const NUM_RUNS = 300;

/** A stored mode value: missing, a valid name, or any other string (including near misses). */
type ModeCase = 'missing' | 'valid' | 'other';
/** A stored legacy flag: missing, 'true', 'false', or any other string. */
type LegacyCase = 'missing' | 'true' | 'false' | 'other';

const otherArb = fc
  .oneof(fc.string({ maxLength: 12 }), fc.constantFrom('Gentle', 'CLASSIC', ' nightmare', '', 'true', '1'))
  .filter((s) => !(HAUNT_MODES as readonly string[]).includes(s) && s !== 'true' && s !== 'false');

const modeRawArb: fc.Arbitrary<{ kind: ModeCase; raw: string | null }> = fc.oneof(
  fc.constant({ kind: 'missing' as const, raw: null }),
  fc.constantFrom(...HAUNT_MODES).map((raw) => ({ kind: 'valid' as const, raw: raw as string })),
  fc.oneof(otherArb, fc.constantFrom('true', 'false')).map((raw) => ({ kind: 'other' as const, raw })),
);

const legacyRawArb: fc.Arbitrary<{ kind: LegacyCase; raw: string | null }> = fc.oneof(
  fc.constant({ kind: 'missing' as const, raw: null }),
  fc.constant({ kind: 'true' as const, raw: 'true' }),
  fc.constant({ kind: 'false' as const, raw: 'false' }),
  otherArb.map((raw) => ({ kind: 'other' as const, raw })),
);

function expectedMode(mode: string | null, legacy: string | null): HauntMode {
  if (mode !== null) {
    return (HAUNT_MODES as readonly string[]).includes(mode) ? (mode as HauntMode) : 'classic';
  }
  return legacy === 'true' ? 'gentle' : 'classic';
}

describe('Haunt mode resolution and settings round trip', () => {
  // Feature: ghost-dread, Property 1: Haunt mode resolution and settings round trip
  // **Validates: Requirements 8.2, 8.7, 8.8, 8.9**
  it('Property 1: resolveMode returns one of the three modes by the stated rules', () => {
    fc.assert(
      fc.property(modeRawArb, legacyRawArb, (m, l) => {
        const out = resolveMode(m.raw, l.raw);
        expect(HAUNT_MODES).toContain(out);
        if (m.kind === 'valid') expect(out).toBe(m.raw);
        if (m.kind === 'other') expect(out).toBe('classic');
        if (m.kind === 'missing' && l.kind === 'true') expect(out).toBe('gentle');
        if (m.kind === 'missing' && l.kind !== 'true') expect(out).toBe('classic');
        expect(out).toBe(expectedMode(m.raw, l.raw));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: ghost-dread, Property 1: Haunt mode resolution and settings round trip
  // **Validates: Requirements 8.7, 8.8, 8.9**
  it('Property 1: parseSettings applies the same mode rules to stored keys, and the default is Classic', () => {
    expect(DEFAULT_MODE).toBe('classic');
    fc.assert(
      fc.property(modeRawArb, legacyRawArb, (m, l) => {
        const store: Record<string, string | null> = {
          [KEYS.mode]: m.raw,
          [KEYS.gentleLegacy]: l.raw,
        };
        expect(parseSettings((k) => store[k] ?? null).mode).toBe(expectedMode(m.raw, l.raw));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: ghost-dread, Property 1: Haunt mode resolution and settings round trip
  // **Validates: Requirements 8.2, 10.5**
  it('Property 1: parseSettings over serializeSettings returns an equal value', () => {
    fc.assert(
      fc.property(hauntSettingsArb, (s) => {
        const ser = serializeSettings(s);
        expect(parseSettings((k) => (k in ser ? ser[k] : null))).toEqual(s);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: ghost-dread, Property 1: Haunt mode resolution and settings round trip
  // **Validates: Requirements 8.7, 8.9**
  it('Property 1: the generated inputs reach every mode case and legacy case', () => {
    const seen = { runs: 0, missing: 0, valid: 0, other: 0, lMissing: 0, lTrue: 0, lFalse: 0, lOther: 0,
      migrate: 0, modes: { gentle: 0, classic: 0, nightmare: 0 } };
    fc.assert(
      fc.property(modeRawArb, legacyRawArb, hauntSettingsArb, (m, l, s) => {
        seen.runs++;
        seen[m.kind]++;
        if (l.kind === 'missing') seen.lMissing++;
        else if (l.kind === 'true') seen.lTrue++;
        else if (l.kind === 'false') seen.lFalse++;
        else seen.lOther++;
        if (m.kind === 'missing' && l.kind === 'true') seen.migrate++;
        seen.modes[s.mode]++;
        expect(resolveMode(m.raw, l.raw)).toBe(expectedMode(m.raw, l.raw));
      }),
      { numRuns: NUM_RUNS },
    );
    const msg = JSON.stringify(seen);
    const floor = seen.runs * 0.1;
    for (const k of ['missing', 'valid', 'other', 'lMissing', 'lTrue', 'lFalse', 'lOther'] as const) {
      expect(seen[k], `${k}: ${msg}`).toBeGreaterThanOrEqual(floor);
    }
    expect(seen.migrate, `migrate: ${msg}`).toBeGreaterThanOrEqual(seen.runs * 0.03);
    for (const mode of HAUNT_MODES) {
      expect(seen.modes[mode], `${mode}: ${msg}`).toBeGreaterThanOrEqual(seen.runs * 0.2);
    }
  });
});
