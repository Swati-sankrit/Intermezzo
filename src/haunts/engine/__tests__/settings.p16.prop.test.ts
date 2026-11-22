import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_SETTINGS, KEYS, createSettingsStore, parseSettings, serializeSettings } from '../settings';
import type { HauntSettings } from '../types';
import { hauntSettingsArb, storageMapArb } from './arbitraries';

const NUM_RUNS = 300;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** A real in-memory storage that records every key written. */
function memoryStorage(initial: Record<string, string | null> = {}) {
  const data = new Map<string, string>();
  for (const [k, v] of Object.entries(initial)) if (v !== null) data.set(k, v);
  const written: string[] = [];
  const storage: StorageLike = {
    getItem: (key) => (data.has(key) ? (data.get(key) as string) : null),
    setItem: (key, value) => {
      written.push(key);
      data.set(key, value);
    },
  };
  return { storage, written, data };
}

const throwingStorage: StorageLike = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('quota');
  },
};

const readerOf = (map: Record<string, string | null>) => (key: string): string | null =>
  Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;

/** What the spec says one stored value means. */
const expectedBool = (raw: string | null, fallback: boolean): boolean =>
  raw === 'true' ? true : raw === 'false' ? false : fallback;

/** One field of a shaped map: each case is 20% of draws. */
type Shape = 'true' | 'false' | 'garbage' | 'null' | 'missing';
const shapeArb: fc.Arbitrary<Shape> = fc.constantFrom('true', 'false', 'garbage', 'null', 'missing');
const garbageArb = fc
  .string({ maxLength: 10 })
  .filter((s) => s !== 'true' && s !== 'false');

/** Storage contents where every one of the three keys hits every case often, plus junk keys and a cap value. */
const shapedMapArb: fc.Arbitrary<{ map: Record<string, string | null>; shapes: Shape[] }> = fc
  .tuple(fc.tuple(shapeArb, shapeArb, shapeArb), garbageArb, storageMapArb)
  .map(([shapes, garbage, extra]) => {
    const map: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(extra)) {
      if (k !== KEYS.sound && k !== KEYS.gentle && k !== KEYS.noticeSeen) map[k] = v;
    }
    [KEYS.sound, KEYS.gentle, KEYS.noticeSeen].forEach((key, i) => {
      const s = shapes[i];
      if (s === 'true' || s === 'false') map[key] = s;
      else if (s === 'garbage') map[key] = garbage;
      else if (s === 'null') map[key] = null;
    });
    return { map, shapes: [...shapes] };
  });

const anyMapArb = fc.oneof(storageMapArb, shapedMapArb.map((r) => r.map));

const patchArb = fc.record(
  { sound: fc.boolean(), gentle: fc.boolean(), noticeSeen: fc.boolean() },
  { requiredKeys: [] },
);

describe('Settings: round trip and safe defaults', () => {
  // Feature: haunt-feature, Property 16: Settings round trip and safe defaults
  // **Validates: Requirements 9.4, 9.5**
  it('Property 16: parseSettings over serializeSettings returns an equal value', () => {
    fc.assert(
      fc.property(hauntSettingsArb, (s) => {
        const ser = serializeSettings(s);
        expect(parseSettings((k) => (k in ser ? ser[k] : null))).toEqual(s);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 16: Settings round trip and safe defaults
  // **Validates: Requirements 9.4**
  it('Property 16: serializeSettings writes only true/false for the three keys, never rod_volume_cap', () => {
    fc.assert(
      fc.property(hauntSettingsArb, (s) => {
        const ser = serializeSettings(s);
        expect(Object.keys(ser).sort()).toEqual([KEYS.sound, KEYS.gentle, KEYS.noticeSeen].sort());
        expect(KEYS.volumeCap in ser).toBe(false);
        for (const v of Object.values(ser)) expect(['true', 'false']).toContain(v);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 16: Settings round trip and safe defaults
  // **Validates: Requirements 9.5, 9.6**
  it('Property 16: over any storage map, parseSettings gives booleans and defaults for missing or unreadable values', () => {
    fc.assert(
      fc.property(anyMapArb, (map) => {
        const read = readerOf(map);
        const out = parseSettings(read);
        expect(typeof out.sound).toBe('boolean');
        expect(typeof out.gentle).toBe('boolean');
        expect(typeof out.noticeSeen).toBe('boolean');
        expect(out.sound).toBe(expectedBool(read(KEYS.sound), DEFAULT_SETTINGS.sound));
        expect(out.gentle).toBe(expectedBool(read(KEYS.gentle), DEFAULT_SETTINGS.gentle));
        expect(out.noticeSeen).toBe(expectedBool(read(KEYS.noticeSeen), DEFAULT_SETTINGS.noticeSeen));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 16: Settings round trip and safe defaults
  // **Validates: Requirements 9.6**
  it('Property 16: an empty storage gives sound on, gentle off, notice not seen', () => {
    expect(parseSettings(() => null)).toEqual({ sound: true, gentle: false, noticeSeen: false });
    expect(DEFAULT_SETTINGS).toEqual({ sound: true, gentle: false, noticeSeen: false });
  });

  // Feature: haunt-feature, Property 16: Settings round trip and safe defaults
  // **Validates: Requirements 9.4, 9.5**
  it('Property 16: a store reads what is stored, saves changes, and a new store restores them', () => {
    fc.assert(
      fc.property(anyMapArb, patchArb, (map, patch) => {
        const mem = memoryStorage(map);
        const store = createSettingsStore(mem.storage);
        expect(store.get()).toEqual(parseSettings(readerOf(map)));
        const before = store.get();
        store.set(patch);
        const expected: HauntSettings = { ...before, ...patch };
        expect(store.get()).toEqual(expected);
        expect(createSettingsStore(mem.storage).get()).toEqual(expected);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 16: Settings round trip and safe defaults
  // **Validates: Requirements 9.4**
  it('Property 16: the store never writes rod_volume_cap and leaves a stored cap untouched', () => {
    fc.assert(
      fc.property(anyMapArb, fc.array(patchArb, { maxLength: 6 }), (map, patches) => {
        const mem = memoryStorage(map);
        const capBefore = mem.data.get(KEYS.volumeCap);
        const store = createSettingsStore(mem.storage);
        for (const p of patches) store.set(p);
        expect(mem.written).not.toContain(KEYS.volumeCap);
        expect(mem.data.get(KEYS.volumeCap)).toBe(capBefore);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 16: Settings round trip and safe defaults
  // **Validates: Requirements 9.5, 9.6**
  it('Property 16: get() keeps the same object until a value changes, and subscribers hear only changes', () => {
    fc.assert(
      fc.property(anyMapArb, fc.array(patchArb, { maxLength: 8 }), (map, patches) => {
        const store = createSettingsStore(memoryStorage(map).storage);
        let calls = 0;
        store.subscribe(() => calls++);
        for (const p of patches) {
          const before = store.get();
          const calledBefore = calls;
          store.set(p);
          const changed = (Object.keys(p) as (keyof HauntSettings)[]).some((k) => p[k] !== before[k]);
          if (changed) {
            expect(store.get()).not.toBe(before);
            expect(calls).toBe(calledBefore + 1);
          } else {
            expect(store.get()).toBe(before);
            expect(calls).toBe(calledBefore);
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 16: Settings round trip and safe defaults
  // **Validates: Requirements 9.6**
  it.each([
    ['getItem and setItem throw', throwingStorage],
    ['storage is null', null],
  ])('Property 16: when %s, defaults apply and values hold in memory', (_name, storage) => {
    fc.assert(
      fc.property(fc.array(patchArb, { maxLength: 8 }), (patches) => {
        const store = createSettingsStore(storage);
        expect(store.get()).toEqual(DEFAULT_SETTINGS);
        let expected: HauntSettings = DEFAULT_SETTINGS;
        for (const p of patches) {
          expect(() => store.set(p)).not.toThrow();
          expected = { ...expected, ...p };
          expect(store.get()).toEqual(expected);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 16: Settings round trip and safe defaults
  // **Validates: Requirements 9.5, 9.6**
  it('Property 16: the generated inputs reach every region the property is about', () => {
    const seen = {
      runs: 0,
      // per key (sound, gentle, notice): counts for each shape
      t: [0, 0, 0], f: [0, 0, 0], garbage: [0, 0, 0], nul: [0, 0, 0], missing: [0, 0, 0],
      soundOn: 0, gentleOn: 0, noticeOn: 0, capKey: 0,
    };
    fc.assert(
      fc.property(shapedMapArb, hauntSettingsArb, ({ map, shapes }, s) => {
        seen.runs++;
        shapes.forEach((sh, i) => {
          if (sh === 'true') seen.t[i]++;
          else if (sh === 'false') seen.f[i]++;
          else if (sh === 'garbage') seen.garbage[i]++;
          else if (sh === 'null') seen.nul[i]++;
          else seen.missing[i]++;
        });
        if (s.sound) seen.soundOn++;
        if (s.gentle) seen.gentleOn++;
        if (s.noticeSeen) seen.noticeOn++;
        if (KEYS.volumeCap in map) seen.capKey++;
        // keep the run meaningful: parse still agrees with the spec
        expect(parseSettings(readerOf(map)).sound).toBe(
          expectedBool(readerOf(map)(KEYS.sound), true),
        );
      }),
      { numRuns: NUM_RUNS },
    );
    const msg = JSON.stringify(seen);
    // Each shape is drawn 20% of the time per key; floor 10% is about 4 SD below the mean at 300 runs.
    const floor = seen.runs * 0.1;
    for (let i = 0; i < 3; i++) {
      for (const [name, arr] of Object.entries({
        true: seen.t, false: seen.f, garbage: seen.garbage, null: seen.nul, missing: seen.missing,
      })) {
        expect(arr[i], `key ${i} shape ${name}: ${msg}`).toBeGreaterThanOrEqual(floor);
      }
    }
    // Booleans are 50/50; floor 30% is about 7 SD below the mean.
    expect(seen.soundOn, `sound on: ${msg}`).toBeGreaterThanOrEqual(seen.runs * 0.3);
    expect(seen.gentleOn, `gentle on: ${msg}`).toBeGreaterThanOrEqual(seen.runs * 0.3);
    expect(seen.noticeOn, `notice on: ${msg}`).toBeGreaterThanOrEqual(seen.runs * 0.3);
    expect(seen.runs - seen.soundOn, `sound off: ${msg}`).toBeGreaterThanOrEqual(seen.runs * 0.3);
  });
});
