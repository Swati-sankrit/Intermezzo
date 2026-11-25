import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { isDeepStrictEqual } from 'node:util';
import { EMPTY_DATA_MODEL, MAX_AVERAGE_PACE, MIN_AVERAGE_PACE, type DataModel } from '../model';
import { MAX_FILE_NAME, migrate, migrateWithReport, type LegacyInput } from '../migrator';
import { parse, serialize } from '../serializer';
import { validate } from '../validator';

/**
 * Feature: library-v2, Property 9: Migration preserves legacy position, pace, and book identity
 * **Validates: Requirements 19.2, 19.3**
 */

/**
 * The migrator returns a version-2 `current` unchanged (idempotence, Property 10), so migrating "onto
 * EMPTY_DATA_MODEL" means a model with the empty content that is not yet at the current schema version.
 */
const PRE_V2_EMPTY = { ...EMPTY_DATA_MODEL, schemaVersion: 1 } as unknown as DataModel;

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

const clamp = (n: number) => Math.min(MAX_AVERAGE_PACE, Math.max(MIN_AVERAGE_PACE, n));

// ---- generators ------------------------------------------------------------------------------

const fileName = fc.string({ minLength: 1, maxLength: MAX_FILE_NAME });
const index = fc.nat({ max: 100_000 });
// Finite and above 0: includes values below 50 and above 1000 that must be clamped, and tiny subnormals.
const pace = fc.oneof(
  fc.double({ min: MIN_AVERAGE_PACE, max: MAX_AVERAGE_PACE, noNaN: true }),
  fc.double({ min: 5e-324, max: 1e9, noNaN: true }),
);
const savedAt = fc.oneof(
  fc.integer({ min: 0, max: 4_000_000_000_000 }),
  fc.constant(undefined),
);
const hash = fc.stringMatching(/^[0-9a-f]{64}$/);
const legacyBookId = fc.option(hash, { nil: null });
const guideValue = fc.constantFrom<'true' | 'false' | boolean | undefined | null>(
  'true', 'false', true, false, undefined, null,
);
const stateGuide = fc.option(fc.boolean(), { nil: undefined });
const asJson = fc.boolean();

interface ValidState {
  fileName: string;
  chapterIndex: number;
  paragraphIndex: number;
  averagePace: number;
  savedAt: number | undefined;
  paceGuideEnabled: boolean | undefined;
}

const validState: fc.Arbitrary<ValidState> = fc.record({
  fileName,
  chapterIndex: index,
  paragraphIndex: index,
  averagePace: pace,
  savedAt,
  paceGuideEnabled: stateGuide,
});

function stateObject(s: ValidState): Record<string, unknown> {
  const position: Record<string, unknown> = { chapterIndex: s.chapterIndex, paragraphIndex: s.paragraphIndex };
  if (s.savedAt !== undefined) position.savedAt = s.savedAt;
  const obj: Record<string, unknown> = { fileName: s.fileName, position, averagePace: s.averagePace };
  if (s.paceGuideEnabled !== undefined) obj.paceGuideEnabled = s.paceGuideEnabled;
  return obj;
}

/** Either the JSON string localStorage holds, or an already-parsed object. */
function rawState(s: ValidState, json: boolean): unknown {
  const obj = stateObject(s);
  return json ? JSON.stringify(obj) : obj;
}

function guideOf(raw: 'true' | 'false' | boolean | undefined | null): boolean | null {
  if (raw === true || raw === 'true') return true;
  if (raw === false || raw === 'false') return false;
  return null;
}

// ---- valid records ---------------------------------------------------------------------------

describe('Property 9: Migration preserves legacy position, pace, and book identity', () => {
  it('carries the legacy position, pace, book identity, shelf and pace guide into a valid model', () => {
    fc.assert(
      fc.property(validState, guideValue, legacyBookId, asJson, (s, guide, id, json) => {
        const input: LegacyInput = deepFreeze({
          rodState: rawState(s, json),
          rodPaceGuide: guide,
          legacyBookId: id,
        });
        const current = deepFreeze({ ...PRE_V2_EMPTY });
        const before = JSON.stringify(input);

        const { model, consumed, invalid } = migrateWithReport(input, current);

        // Exactly one Book_Entry, with the expected Book_Id.
        const expectedId = id ?? `legacy-${s.fileName}`;
        expect(Object.keys(model.books)).toEqual([expectedId]);
        expect(model.books[expectedId].fileName).toBe(s.fileName);
        expect(model.books[expectedId].bookId).toBe(expectedId);

        // Position and pace.
        const pos = model.positions[expectedId];
        expect(pos.chapterIndex).toBe(s.chapterIndex);
        expect(pos.paragraphIndex).toBe(s.paragraphIndex);
        expect(pos.progress).toBe(0);
        expect(Object.keys(model.positions)).toEqual([expectedId]);
        expect(model.profile.averagePace).toBe(clamp(s.averagePace));

        // On `reading`, and nowhere else.
        expect(model.shelves.reading).toEqual([expectedId]);
        expect(model.shelves['want-to-read']).toEqual([]);
        expect(model.shelves.finished).toEqual([]);

        // Pace guide: rod_pace_guide wins; otherwise the flag stored in rod_state; otherwise the default.
        const expectedGuide = guideOf(guide) ?? s.paceGuideEnabled ?? EMPTY_DATA_MODEL.profile.paceGuideEnabled;
        expect(model.profile.paceGuideEnabled).toBe(expectedGuide);

        // Rest of the profile stays at First_Visit_State (19.4), so Onboarding shows once.
        expect(model.profile.displayName).toBe('');
        expect(model.profile.candleColour).toBe(EMPTY_DATA_MODEL.profile.candleColour);
        expect(model.profile.onboardingCompleted).toBe(false);

        // Report.
        expect(consumed).toContain('rod_state');
        expect(invalid).toEqual([]);
        expect(consumed.includes('rod_pace_guide')).toBe(guideOf(guide) !== null);

        // The result is valid and survives serialisation.
        const checked = validate(model);
        expect(checked.ok).toBe(true);
        const round = validate(parse(serialize(model)));
        expect(round.ok).toBe(true);
        if (round.ok) expect(isDeepStrictEqual(round.value, model)).toBe(true);

        // Inputs untouched (they are frozen, so a write would also have thrown).
        expect(JSON.stringify(input)).toBe(before);
        expect(migrate(input, current)).toEqual(model);
      }),
      { numRuns: 500 },
    );
  });

  // ---- invalid records ---------------------------------------------------------------------

  const badState: fc.Arbitrary<unknown> = fc.oneof(
    // Not parseable, or parseable but not a record.
    fc.constantFrom('{not json', '', '[]', '42', '"text"', 'true', '{"fileName":'),
    // Empty or over-long file name.
    validState.map((s) => stateObject({ ...s, fileName: '' })),
    fc.tuple(validState, fc.integer({ min: MAX_FILE_NAME + 1, max: MAX_FILE_NAME + 50 })).map(([s, n]) =>
      stateObject({ ...s, fileName: 'a'.repeat(n) }),
    ),
    // Negative or fractional indexes.
    fc.tuple(validState, fc.integer({ min: -1000, max: -1 })).map(([s, n]) => stateObject({ ...s, chapterIndex: n })),
    fc.tuple(validState, fc.integer({ min: -1000, max: -1 })).map(([s, n]) => stateObject({ ...s, paragraphIndex: n })),
    fc.tuple(validState, fc.double({ min: 0, max: 1000, noNaN: true }).filter((n) => !Number.isInteger(n)))
      .map(([s, n]) => stateObject({ ...s, chapterIndex: n })),
    fc.tuple(validState, fc.double({ min: 0, max: 1000, noNaN: true }).filter((n) => !Number.isInteger(n)))
      .map(([s, n]) => stateObject({ ...s, paragraphIndex: n })),
    // Non-positive or non-finite pace.
    fc.tuple(validState, fc.oneof(fc.constant(0), fc.double({ max: -5e-324, noNaN: true }))).map(([s, n]) =>
      stateObject({ ...s, averagePace: n }),
    ),
    validState.map((s) => stateObject({ ...s, averagePace: Number.NaN })),
    validState.map((s) => stateObject({ ...s, averagePace: Number.POSITIVE_INFINITY })),
  );
  // JSON turns NaN and Infinity into null, so only some bad records go through JSON text.
  const badStateRaw = fc.tuple(badState, asJson).map(([b, json]) => {
    if (typeof b === 'string') return b;
    return json ? JSON.stringify(b) : b;
  });

  it('ignores an invalid rod_state, reports it, and still migrates a valid rod_pace_guide', () => {
    fc.assert(
      fc.property(badStateRaw, fc.boolean(), legacyBookId, (bad, guide, id) => {
        const input: LegacyInput = deepFreeze({ rodState: bad, rodPaceGuide: String(guide), legacyBookId: id });
        const { model, consumed, invalid } = migrateWithReport(input, deepFreeze({ ...PRE_V2_EMPTY }));

        expect(invalid).toEqual(['rod_state']);
        expect(consumed).toEqual(['rod_pace_guide']);
        expect(model.books).toEqual({});
        expect(model.positions).toEqual({});
        expect(model.stats).toEqual({});
        expect(model.shelves).toEqual({ reading: [], 'want-to-read': [], finished: [] });
        expect(model.profile.paceGuideEnabled).toBe(guide);
        expect(model.profile.averagePace).toBe(EMPTY_DATA_MODEL.profile.averagePace);
        expect(validate(model).ok).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('ignores an invalid rod_pace_guide, reports it, and still migrates a valid rod_state', () => {
    const badGuide = fc.oneof(
      fc.constantFrom('maybe', '', 'TRUE', 'yes', '1', 0, 1, {}, []),
      fc.string().filter((x) => x !== 'true' && x !== 'false'),
    );
    fc.assert(
      fc.property(validState, badGuide, legacyBookId, asJson, (s, guide, id, json) => {
        const input: LegacyInput = deepFreeze({ rodState: rawState(s, json), rodPaceGuide: guide, legacyBookId: id });
        const { model, consumed, invalid } = migrateWithReport(input, deepFreeze({ ...PRE_V2_EMPTY }));

        const expectedId = id ?? `legacy-${s.fileName}`;
        expect(invalid).toEqual(['rod_pace_guide']);
        expect(consumed).toEqual(['rod_state']);
        expect(Object.keys(model.books)).toEqual([expectedId]);
        expect(model.positions[expectedId].chapterIndex).toBe(s.chapterIndex);
        expect(model.positions[expectedId].paragraphIndex).toBe(s.paragraphIndex);
        expect(model.profile.averagePace).toBe(clamp(s.averagePace));
        expect(model.shelves.reading).toEqual([expectedId]);
        expect(model.profile.paceGuideEnabled).toBe(s.paceGuideEnabled ?? false);
        expect(validate(model).ok).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('with both keys invalid, produces an empty valid model and reports both', () => {
    fc.assert(
      fc.property(badStateRaw, fc.constantFrom('maybe', 'nope', 7), (bad, guide) => {
        const { model, consumed, invalid } = migrateWithReport(
          deepFreeze({ rodState: bad, rodPaceGuide: guide, legacyBookId: null }),
          deepFreeze({ ...PRE_V2_EMPTY }),
        );
        expect(invalid).toEqual(['rod_state', 'rod_pace_guide']);
        expect(consumed).toEqual([]);
        expect(isDeepStrictEqual(model, EMPTY_DATA_MODEL)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
