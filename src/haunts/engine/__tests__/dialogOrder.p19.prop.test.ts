import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { visibleDialogs } from '../dialogOrder';

// Feature: haunt-feature, Property 19: The Safety_Notice and the Camera_Consent_Dialog are never visible together
// **Validates: Requirements 8.9, 8.10, 8.11**

const NUM_RUNS = 500;

type ChoiceClass = 'unanswered' | 'camera' | 'no-camera' | 'other';

/** Weights: unanswered 0.3, camera 0.2, no-camera 0.2, other string 0.3. */
const choiceArb: fc.Arbitrary<string> = fc.oneof(
  { arbitrary: fc.constant('unanswered'), weight: 3 },
  { arbitrary: fc.constant('camera'), weight: 2 },
  { arbitrary: fc.constant('no-camera'), weight: 2 },
  {
    arbitrary: fc.string({ maxLength: 12 }).filter((s) => s !== 'unanswered' && s !== 'camera' && s !== 'no-camera'),
    weight: 3,
  },
);

function classify(choice: string): ChoiceClass {
  return choice === 'unanswered' || choice === 'camera' || choice === 'no-camera' ? choice : 'other';
}

describe('Property 19: dialog order', () => {
  it('notice and consent are never both visible; notice iff unseen; consent iff seen and unanswered', () => {
    const tally = { total: 0, seen: 0, consent: 0, unanswered: 0, camera: 0, noCamera: 0, other: 0 };

    fc.assert(
      fc.property(fc.boolean(), choiceArb, (noticeSeen, choice) => {
        const v = visibleDialogs(noticeSeen, choice);
        tally.total += 1;
        if (noticeSeen) tally.seen += 1;
        if (v.consent) tally.consent += 1;
        const c = classify(choice);
        if (c === 'unanswered') tally.unanswered += 1;
        else if (c === 'camera') tally.camera += 1;
        else if (c === 'no-camera') tally.noCamera += 1;
        else tally.other += 1;

        expect(v.notice && v.consent).toBe(false);
        expect(v.notice).toBe(!noticeSeen);
        expect(v.consent).toBe(noticeSeen && choice === 'unanswered');
      }),
      { numRuns: NUM_RUNS },
    );

    // Coverage floors, each about 4 SD below the expected count at 500 cases.
    expect(tally.total).toBeGreaterThanOrEqual(NUM_RUNS);
    expect(tally.seen, 'noticeSeen=true').toBeGreaterThanOrEqual(205); // mean 250
    expect(tally.total - tally.seen, 'noticeSeen=false').toBeGreaterThanOrEqual(205);
    expect(tally.consent, 'consent visible').toBeGreaterThanOrEqual(43); // mean 75
    expect(tally.unanswered, "choice 'unanswered'").toBeGreaterThanOrEqual(109); // mean 150
    expect(tally.camera, "choice 'camera'").toBeGreaterThanOrEqual(64); // mean 100
    expect(tally.noCamera, "choice 'no-camera'").toBeGreaterThanOrEqual(64);
    expect(tally.other, 'other string choice').toBeGreaterThanOrEqual(109); // mean 150
  });

  type Step =
    | { readonly kind: 'dismiss' }
    | { readonly kind: 'choose'; readonly choice: string }
    | { readonly kind: 'newSession' };

  const stepArb: fc.Arbitrary<Step> = fc.oneof(
    { arbitrary: fc.constant<Step>({ kind: 'dismiss' }), weight: 3 },
    { arbitrary: choiceArb.map((choice): Step => ({ kind: 'choose', choice })), weight: 4 },
    { arbitrary: fc.constant<Step>({ kind: 'newSession' }), weight: 2 },
  );

  it('over any session sequence the two are never visible together and the notice never returns once seen', () => {
    const tally = { states: 0, noticeStates: 0, consentStates: 0, afterSeen: 0, runsWithDismissLater: 0, runs: 0 };

    fc.assert(
      fc.property(choiceArb, fc.array(stepArb, { minLength: 6, maxLength: 30 }), (firstChoice, steps) => {
        tally.runs += 1;
        let noticeSeen = false;
        let choice = firstChoice;
        let everSeen = false;

        const check = (): void => {
          const v = visibleDialogs(noticeSeen, choice);
          tally.states += 1;
          if (v.notice) tally.noticeStates += 1;
          if (v.consent) tally.consentStates += 1;
          expect(v.notice && v.consent).toBe(false);
          if (everSeen) {
            tally.afterSeen += 1;
            expect(v.notice).toBe(false);
          }
        };

        // First session: the notice shows first, with no consent dialog.
        const first = visibleDialogs(noticeSeen, choice);
        expect(first.notice).toBe(true);
        expect(first.consent).toBe(false);
        check();

        let dismissed = false;
        for (const step of steps) {
          if (step.kind === 'dismiss') {
            noticeSeen = true; // dismissal is saved on the device and never undone
            everSeen = true;
            dismissed = true;
          } else if (step.kind === 'choose') {
            choice = step.choice;
          }
          // 'newSession' keeps the saved notice flag and choice as they are.
          check();
        }
        if (dismissed) tally.runsWithDismissLater += 1;
      }),
      { numRuns: NUM_RUNS },
    );

    // Expected: states ~ 15k, notice states ~ 40%+ of runs, dismissal in ~ 93% of runs.
    expect(tally.runs).toBeGreaterThanOrEqual(NUM_RUNS);
    expect(tally.runsWithDismissLater, 'runs with a dismissal').toBeGreaterThanOrEqual(400);
    expect(tally.afterSeen, 'states after the notice was seen').toBeGreaterThanOrEqual(3000);
    expect(tally.consentStates, 'states with consent visible').toBeGreaterThanOrEqual(500);
    expect(tally.noticeStates, 'states with notice visible').toBeGreaterThanOrEqual(500);
  });
});
