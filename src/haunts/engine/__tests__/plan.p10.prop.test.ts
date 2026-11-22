import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { effectiveRequests, scaleGains } from '../gate/plan';
import { capArb, gainRequestsArb } from './arbitraries';

const NUM_RUNS = 300;

const inputArb = fc.tuple(gainRequestsArb, fc.boolean(), fc.boolean());

describe('Safety_Gate effectiveRequests: silent when sound is off or audio is locked', () => {
  // Feature: haunt-feature, Property 10: Sound is silent when off or locked
  // **Validates: Requirements 8.5, 8.7, 9.2**
  it('Property 10: every effective gain is 0 when sound is off or audio is locked', () => {
    fc.assert(
      fc.property(inputArb, ([requests, soundOn, unlocked]) => {
        fc.pre(!soundOn || !unlocked);
        const out = effectiveRequests(requests, soundOn, unlocked);
        expect(out.length).toBe(requests.length);
        for (const r of out) expect(Object.is(r.gain, 0)).toBe(true);
      }),
      { numRuns: NUM_RUNS, maxSkipsPerRun: 1000 },
    );
  });

  // Feature: haunt-feature, Property 10: Sound is silent when off or locked
  // **Validates: Requirements 8.5, 8.7, 9.2**
  it('Property 10: keys and order are kept in every state', () => {
    fc.assert(
      fc.property(inputArb, ([requests, soundOn, unlocked]) => {
        const out = effectiveRequests(requests, soundOn, unlocked);
        expect(out.map((r) => r.key)).toEqual(requests.map((r) => r.key));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 10: Sound is silent when off or locked
  // **Validates: Requirements 8.5, 8.7, 9.2**
  it('Property 10: when sound is on and unlocked, gains are the requests with non-finite and negative values as 0', () => {
    fc.assert(
      fc.property(gainRequestsArb, (requests) => {
        const out = effectiveRequests(requests, true, true);
        out.forEach((r, i) => {
          const g = requests[i].gain;
          expect(r.gain).toBe(Number.isFinite(g) && g > 0 ? g : 0);
        });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 10: Sound is silent when off or locked
  // **Validates: Requirements 8.5, 8.7, 9.2**
  it('Property 10: after the Volume_Cap scaling, the gate output is still silent when off or locked', () => {
    fc.assert(
      fc.property(inputArb, capArb, ([requests, soundOn, unlocked], cap) => {
        fc.pre(!soundOn || !unlocked);
        const out = scaleGains(effectiveRequests(requests, soundOn, unlocked), cap);
        for (const r of out) expect(r.gain).toBe(0);
      }),
      { numRuns: NUM_RUNS, maxSkipsPerRun: 1000 },
    );
  });

  // Feature: haunt-feature, Property 10: Sound is silent when off or locked
  // **Validates: Requirements 8.5, 8.7, 9.2**
  it('Property 10: generated inputs cover sound-on+unlocked, sound-off and locked states', () => {
    const seen = { runs: 0, audible: 0, soundOff: 0, locked: 0, nonEmptyAudible: 0 };
    fc.assert(
      fc.property(inputArb, ([requests, soundOn, unlocked]) => {
        seen.runs++;
        if (soundOn && unlocked) {
          seen.audible++;
          if (requests.some((r) => Number.isFinite(r.gain) && r.gain > 0)) seen.nonEmptyAudible++;
        }
        if (!soundOn) seen.soundOff++;
        if (!unlocked) seen.locked++;
      }),
      { numRuns: NUM_RUNS },
    );
    const msg = JSON.stringify(seen);
    expect(seen.audible, `sound on and unlocked: ${msg}`).toBeGreaterThanOrEqual(seen.runs * 0.15);
    expect(seen.soundOff, `sound off: ${msg}`).toBeGreaterThanOrEqual(seen.runs * 0.15);
    expect(seen.locked, `locked: ${msg}`).toBeGreaterThanOrEqual(seen.runs * 0.15);
    expect(seen.nonEmptyAudible, `audible with a positive request: ${msg}`).toBeGreaterThanOrEqual(
      seen.runs * 0.1,
    );
  });
});
