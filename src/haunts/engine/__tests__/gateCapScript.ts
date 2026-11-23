/** Scripts for ghost-dread Property 23: the actions, the scenario shape and the generators. */
import fc from 'fast-check';

export type Action =
  | { k: 'open' }
  | { k: 'setGain'; who: number; v: number }
  | { k: 'panner'; who: number }
  | { k: 'move'; who: number; dim: 0 | 1 | 2; v: number; rampMs: number | null }
  | { k: 'close'; who: number }
  | { k: 'fade'; who: number; ms: number | undefined }
  | { k: 'fadeAll'; ms: number | undefined }
  | { k: 'rBegin' }
  | { k: 'rEnd'; ms: number | undefined }
  | { k: 'rOpen'; jump: boolean }
  | { k: 'rOpenOutside' }
  | { k: 'cap'; text: string }
  | { k: 'sound'; on: boolean }
  | { k: 'ctx'; state: 'running' | 'suspended' | 'interrupted' }
  | { k: 'unlock'; via: 'pointerdown' | 'keydown' | 'api' }
  | { k: 'osReduced'; on: boolean }
  | { k: 'appReduced'; on: boolean };

export interface Step { readonly a: Action; readonly dt: number }

export interface Scenario {
  readonly capText: string;
  readonly soundOn: boolean;
  readonly osReduced: boolean;
  readonly unlockAtStart: boolean;
  readonly steps: readonly Step[];
}

const whoArb = fc.integer({ min: 0, max: 7 });
/** Low caps (where the cap binds), middle, high, and the edges. */
export const capTextArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 6, arbitrary: fc.integer({ min: 2, max: 20 }).map((n) => String(n / 100)) },
  { weight: 3, arbitrary: fc.integer({ min: 21, max: 59 }).map((n) => String(n / 100)) },
  { weight: 4, arbitrary: fc.integer({ min: 60, max: 99 }).map((n) => String(n / 100)) },
  { weight: 1, arbitrary: fc.constantFrom('0', '1') },
);
const gainArb = fc.oneof(
  { weight: 6, arbitrary: fc.double({ min: 0, max: 1, noNaN: true }) },
  { weight: 3, arbitrary: fc.constantFrom(1, 0.5, 0.25) },
  { weight: 1, arbitrary: fc.constantFrom(0, 2, Number.NaN, Number.POSITIVE_INFINITY, -1) },
);
const fadeMsArb = fc.constantFrom<number | undefined>(undefined, 0, 30, 80, 100, 150, 400, 800, 5000, Number.NaN);
const dtArb = fc.constantFrom(0, 0, 5, 10, 19, 20, 21, 30, 49, 51, 80, 99, 101, 150, 299, 301, 500, 1000, 1500, 2900, 3000, 3100);

const actionArb: fc.Arbitrary<Action> = fc.oneof(
  { weight: 4, arbitrary: fc.constant<Action>({ k: 'open' }) },
  { weight: 6, arbitrary: fc.record({ k: fc.constant('setGain' as const), who: whoArb, v: gainArb }) },
  { weight: 4, arbitrary: fc.record({ k: fc.constant('panner' as const), who: whoArb }) },
  {
    weight: 3,
    arbitrary: fc.record({
      k: fc.constant('move' as const), who: whoArb, dim: fc.constantFrom<0 | 1 | 2>(0, 1, 2),
      v: fc.double({ min: -5, max: 5, noNaN: true }), rampMs: fc.option(fc.integer({ min: 0, max: 2000 }), { nil: null }),
    }),
  },
  { weight: 2, arbitrary: fc.record({ k: fc.constant('close' as const), who: whoArb }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant('fade' as const), who: whoArb, ms: fadeMsArb }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('fadeAll' as const), ms: fadeMsArb }) },
  { weight: 4, arbitrary: fc.constant<Action>({ k: 'rBegin' }) },
  { weight: 3, arbitrary: fc.record({ k: fc.constant('rEnd' as const), ms: fadeMsArb }) },
  { weight: 8, arbitrary: fc.record({ k: fc.constant('rOpen' as const), jump: fc.boolean() }) },
  { weight: 2, arbitrary: fc.constant<Action>({ k: 'rOpenOutside' }) },
  { weight: 4, arbitrary: fc.record({ k: fc.constant('cap' as const), text: capTextArb }) },
  { weight: 3, arbitrary: fc.record({ k: fc.constant('sound' as const), on: fc.boolean() }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant('ctx' as const), state: fc.constantFrom<'running' | 'suspended' | 'interrupted'>('running', 'suspended', 'interrupted') }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant('unlock' as const), via: fc.constantFrom<'pointerdown' | 'keydown' | 'api'>('pointerdown', 'keydown', 'api') }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant('osReduced' as const), on: fc.boolean() }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant('appReduced' as const), on: fc.boolean() }) },
);

/**
 * What the opening does right after the jump channel is asked to play (shapes only; the checks are the same).
 * Outside 'none' the other channels start quiet and the jump channel asks for full gain, so it has headroom to rise.
 */
const tailArb = fc.constantFrom('none', 'none', 'endRising', 'endRising', 'soundToggle', 'soundToggle', 'soundToggle', 'reduced', 'reduced');
const mostlyTrue = fc.oneof({ weight: 3, arbitrary: fc.constant(true) }, { weight: 1, arbitrary: fc.constant(false) });

/** A short opening that tends to put sound on the destination, so the later steps have something to cut. */
const openingArb: fc.Arbitrary<Step[]> = fc.record({
  gains: fc.array(gainArb, { minLength: 1, maxLength: 3 }),
  withReturn: mostlyTrue,
  jump: mostlyTrue,
  jumpGain: gainArb,
  panner: fc.boolean(),
  tail: tailArb,
}).map((o) => {
  const steps: Step[] = [];
  o.gains.forEach((v, i) => {
    steps.push({ a: { k: 'open' }, dt: 0 });
    steps.push({ a: { k: 'setGain', who: i, v: o.tail === 'none' ? v : v * 0.05 }, dt: 0 });
    if (o.panner) steps.push({ a: { k: 'panner', who: i }, dt: 0 });
  });
  steps.push({ a: { k: 'panner', who: 0 }, dt: 150 });
  if (o.withReturn) {
    if (o.tail === 'reduced') steps.push({ a: { k: 'appReduced', on: true }, dt: 0 });
    steps.push({ a: { k: 'rBegin' }, dt: 0 });
    steps.push({ a: { k: 'rOpen', jump: o.jump }, dt: 0 });
    steps.push({ a: { k: 'setGain', who: o.gains.length, v: o.tail === 'none' ? o.jumpGain : 1 }, dt: o.tail === 'soundToggle' ? 400 : 10 });
    if (o.tail === 'endRising') steps.push({ a: { k: 'rEnd', ms: 80 }, dt: 50 });
    if (o.tail === 'soundToggle') {
      steps.push({ a: { k: 'sound', on: false }, dt: 100 });
      steps.push({ a: { k: 'sound', on: true }, dt: 0 });
    }
  }
  return steps;
});

export const scenarioArb: fc.Arbitrary<Scenario> = fc.record({
  capText: capTextArb,
  soundOn: fc.oneof({ weight: 9, arbitrary: fc.constant(true) }, { weight: 1, arbitrary: fc.constant(false) }),
  osReduced: fc.oneof({ weight: 3, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
  unlockAtStart: fc.oneof({ weight: 9, arbitrary: fc.constant(true) }, { weight: 1, arbitrary: fc.constant(false) }),
  opening: openingArb,
  steps: fc.array(fc.record({ a: actionArb, dt: dtArb }), { minLength: 8, maxLength: 24 }),
}).map(({ opening, steps, ...rest }) => ({ ...rest, steps: [...opening, ...steps] }));
