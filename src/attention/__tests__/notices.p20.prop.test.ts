import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { initialNoticeGate, raiseNotice, NOTICE_TEXT } from '../notices';
import type { NoticeKind } from '../types';

const KINDS: readonly NoticeKind[] = ['denied', 'camera-lost', 'detector-failed', 'cameraOffFailed'];
const arbKind = fc.constantFrom(...KINDS);
const arbKinds = fc.array(arbKind, { minLength: 0, maxLength: 40 });

/**
 * Feature: attention-signal, Property 20: At most one notice per cause per Session
 * **Validates: Requirements 1.7, 6.6, 7.7**
 */
describe('Property 20: At most one notice per cause per Session', () => {
  it('yields a notice only on the first raise of each kind, with that kind\'s non-empty text', () => {
    fc.assert(
      fc.property(arbKinds, (kinds) => {
        let state = initialNoticeGate();
        const seen = new Set<NoticeKind>();
        const counts = new Map<NoticeKind, number>();
        for (const kind of kinds) {
          const r = raiseNotice(state, kind);
          if (seen.has(kind)) {
            expect(r.notice).toBeNull();
          } else {
            expect(r.notice).not.toBeNull();
            expect(r.notice!.kind).toBe(kind);
            expect(r.notice!.text.length).toBeGreaterThan(0);
            expect(r.notice!.text).toBe(NOTICE_TEXT[kind]);
            seen.add(kind);
          }
          if (r.notice) counts.set(kind, (counts.get(kind) ?? 0) + 1);
          state = r.state;
        }
        for (const c of counts.values()) expect(c).toBe(1);
        expect(counts.size).toBe(new Set(kinds).size);
      }),
      { numRuns: 300 },
    );
  });

  it('does not mutate the input state', () => {
    fc.assert(
      fc.property(arbKinds, arbKind, (prior, kind) => {
        let state = initialNoticeGate();
        for (const k of prior) state = raiseNotice(state, k).state;
        const before = [...state.shown].sort();
        const sizeBefore = state.shown.size;
        raiseNotice(state, kind);
        expect([...state.shown].sort()).toEqual(before);
        expect(state.shown.size).toBe(sizeBefore);
      }),
      { numRuns: 300 },
    );
  });

  it('a fresh initialNoticeGate starts a new Session and notices again', () => {
    fc.assert(
      fc.property(arbKinds, arbKind, (kinds, kind) => {
        let state = initialNoticeGate();
        for (const k of kinds) state = raiseNotice(state, k).state;
        const fresh = initialNoticeGate();
        expect(fresh.shown.size).toBe(0);
        const r = raiseNotice(fresh, kind);
        expect(r.notice).not.toBeNull();
        expect(r.notice!.text).toBe(NOTICE_TEXT[kind]);
        // Old session is unaffected by the new one.
        expect(raiseNotice(fresh, kind).notice).not.toBeNull();
      }),
      { numRuns: 300 },
    );
  });
});
