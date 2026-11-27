/**
 * Scripts for ghost-dread Property 24 (gateReturn.gd24.prop.test.ts): the actions and the generators.
 * A script is a flat list of actions. `step` moves the fake clock; every other action is instant.
 * Blocks (a whole Return_Moment, a visit to a stale port, a normal-port visit) shape the scripts so
 * every case of interest turns up often; the checks are the same for every script.
 */
import fc from 'fast-check';
import type { OverlayKind } from '../returnTypes';

export type Action =
  | { k: 'unlock' }
  | { k: 'begin' }
  | { k: 'end'; ms: number | undefined }
  | { k: 'rOpen'; jump: boolean }
  | { k: 'overlay'; who: number; kind: OverlayKind }
  | { k: 'layerOp'; who: number; op: 'markup' | 'opacity' | 'label' | 'remove' }
  | { k: 'glitch'; who: number; flickers: number }
  | { k: 'portClose'; who: number }
  | { k: 'open'; tryJump: boolean }
  | { k: 'setGain'; who: number; v: number }
  | { k: 'normalClose'; who: number }
  | { k: 'sound'; on: boolean }
  | { k: 'reduced'; on: boolean }
  | { k: 'osReduced'; on: boolean }
  | { k: 'dispose' }
  | { k: 'step'; ms: number };

export type Script = readonly Action[];

const whoArb = fc.integer({ min: 0, max: 9 });
export const KINDS: readonly OverlayKind[] = ['ghost', 'jumpscare', 'card-hand', 'glitch'];
const kindArb = fc.constantFrom<OverlayKind>(...KINDS);
/** Fade arguments of endReturnMoment: missing, invalid, below, at and above the 100 ms cap. */
const fadeArb = fc.constantFrom<number | undefined>(
  undefined, 0, 1, 30, 79, 80, 99, 100, 101, 150, 5000, -5, Number.NaN, Number.POSITIVE_INFINITY,
);
/** Time steps around the 3000 ms guard and the 100 ms removal deadline, and well beyond. */
const stepArb = fc.constantFrom(0, 1, 5, 19, 20, 50, 79, 80, 81, 99, 100, 101, 150, 500, 1000, 2900, 2999, 3000, 3001, 3079, 3080, 3100, 5000);
const gainArb = fc.oneof(
  { weight: 5, arbitrary: fc.double({ min: 0, max: 1, noNaN: true }) },
  { weight: 3, arbitrary: fc.constantFrom(1, 0.5) },
  { weight: 1, arbitrary: fc.constantFrom(0, 2, Number.NaN, -1) },
);
const bool = (pTrue: number): fc.Arbitrary<boolean> =>
  fc.oneof({ weight: pTrue, arbitrary: fc.constant(true) }, { weight: 10 - pTrue, arbitrary: fc.constant(false) });

const step = (ms: number): Action => ({ k: 'step', ms });

/** One free action, any kind. */
const freeArb: fc.Arbitrary<Action> = fc.oneof(
  { weight: 4, arbitrary: fc.constant<Action>({ k: 'begin' }) },
  { weight: 4, arbitrary: fc.record({ k: fc.constant('end' as const), ms: fadeArb }) },
  { weight: 6, arbitrary: fc.record({ k: fc.constant('rOpen' as const), jump: fc.boolean() }) },
  { weight: 8, arbitrary: fc.record({ k: fc.constant('overlay' as const), who: whoArb, kind: kindArb }) },
  { weight: 4, arbitrary: fc.record({ k: fc.constant('layerOp' as const), who: whoArb, op: fc.constantFrom('markup' as const, 'opacity' as const, 'label' as const, 'remove' as const) }) },
  { weight: 3, arbitrary: fc.record({ k: fc.constant('glitch' as const), who: whoArb, flickers: fc.integer({ min: 0, max: 4 }) }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant('portClose' as const), who: whoArb }) },
  { weight: 3, arbitrary: fc.record({ k: fc.constant('open' as const), tryJump: fc.boolean() }) },
  { weight: 3, arbitrary: fc.record({ k: fc.constant('setGain' as const), who: whoArb, v: gainArb }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('normalClose' as const), who: whoArb }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant('sound' as const), on: fc.boolean() }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant('reduced' as const), on: fc.boolean() }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('osReduced' as const), on: fc.boolean() }) },
  { weight: 10, arbitrary: stepArb.map(step) },
);

/** Non-removing operations on five consecutive layer picks, so most layers made so far get touched. */
const SWEEP_OPS = ['markup', 'opacity', 'label'] as const;
const STALE_SWEEP: Action[] = Array.from({ length: 5 }, (_, i): Action => ({ k: 'layerOp', who: 102 + i, op: SWEEP_OPS[i % 3] }));

/** One whole Return_Moment: begin, ports and overlays, some time, then one of several ways to end. */
const momentArb: fc.Arbitrary<Action[]> = fc.record({
  jump: bool(8),
  second: bool(3),
  kinds: fc.array(kindArb, { minLength: 1, maxLength: 4 }),
  glitch: bool(3),
  reduced: bool(2),
  pre: fc.constantFrom(0, 0, 10, 500, 2000, 2900, 2999),
  toggle: bool(5),
  touch: bool(9),
  again: bool(4),
  ending: fc.oneof(
    { weight: 6, arbitrary: fc.record({ t: fc.constant('end' as const), ms: fadeArb, wait: stepArb }) },
    { weight: 6, arbitrary: fc.record({ t: fc.constant('guard' as const), wait: fc.constantFrom(3000, 3001, 3079, 3080, 3100, 5000) }) },
    { weight: 3, arbitrary: fc.record({ t: fc.constant('double' as const), ms: fadeArb, wait: stepArb }) },
    { weight: 2, arbitrary: fc.record({ t: fc.constant('dispose' as const) }) },
    { weight: 1, arbitrary: fc.record({ t: fc.constant('open' as const) }) },
  ),
}).map((m) => {
  const out: Action[] = [{ k: 'begin' }];
  if (m.second) out.push({ k: 'begin' });
  if (m.reduced) out.push({ k: 'reduced', on: true });
  out.push({ k: 'rOpen', jump: m.jump });
  m.kinds.forEach((kind, i) => out.push({ k: 'overlay', who: 100 + i, kind }));
  out.push({ k: 'setGain', who: 0, v: 1 });
  if (m.glitch) out.push({ k: 'glitch', who: 100, flickers: 3 });
  if (m.toggle) out.push({ k: 'sound', on: false }, step(30), { k: 'sound', on: true });
  out.push(step(m.pre));
  const e = m.ending;
  /** Right after an end, still inside the fade: touch what the moment left behind, open more, maybe begin again. */
  const touchAfter: Action[] = m.touch
    ? [
        { k: 'layerOp', who: 100, op: 'markup' }, { k: 'layerOp', who: 101, op: 'opacity' }, { k: 'overlay', who: 100, kind: 'jumpscare' },
        ...STALE_SWEEP,
        { k: 'rOpen', jump: true }, { k: 'glitch', who: 100, flickers: 2 },
        ...(m.again ? [{ k: 'begin' } as Action, { k: 'rOpen', jump: false } as Action] : []),
      ]
    : [];
  if (e.t === 'end') out.push({ k: 'end', ms: e.ms }, ...touchAfter, step(e.wait), step(120));
  else if (e.t === 'guard') out.push(step(e.wait), ...touchAfter, step(120));
  else if (e.t === 'double') out.push({ k: 'end', ms: e.ms }, { k: 'end', ms: e.ms }, ...touchAfter, step(e.wait), step(120));
  else if (e.t === 'dispose') out.push({ k: 'dispose' }, step(200));
  if (m.reduced) out.push({ k: 'reduced', on: false });
  return out;
});

/** A visit to ports and layers of an earlier Return_Moment (or none), and to the normal ports. */
const staleArb: fc.Arbitrary<Action[]> = fc.record({
  overlays: fc.array(fc.record({ who: whoArb, kind: kindArb }), { minLength: 1, maxLength: 3 }),
  glitch: fc.integer({ min: 0, max: 4 }),
  jump: fc.boolean(),
  op: fc.constantFrom('markup' as const, 'opacity' as const, 'label' as const, 'remove' as const),
  wait: stepArb,
}).map((s) => [
  { k: 'step', ms: 120 } as Action,
  ...s.overlays.map((o): Action => ({ k: 'overlay', who: o.who, kind: o.kind })),
  { k: 'glitch', who: 100, flickers: s.glitch } as Action,
  { k: 'rOpen', jump: s.jump } as Action,
  { k: 'layerOp', who: 100, op: s.op } as Action,
  ...STALE_SWEEP,
  step(s.wait),
]);

const normalArb: fc.Arbitrary<Action[]> = fc.record({
  tryJump: bool(7), v: gainArb, toggle: bool(4), reduced: bool(3), close: bool(3),
}).map((n) => {
  const out: Action[] = [{ k: 'open', tryJump: n.tryJump }, { k: 'setGain', who: 100, v: n.v }, step(20)];
  if (n.toggle) out.push({ k: 'sound', on: false }, step(50), { k: 'sound', on: true });
  if (n.reduced) out.push({ k: 'osReduced', on: true }, step(10), { k: 'osReduced', on: false });
  out.push(step(400));
  if (n.close) out.push({ k: 'normalClose', who: 100 });
  return out;
});

const blockArb: fc.Arbitrary<Action[]> = fc.oneof(
  { weight: 10, arbitrary: momentArb },
  { weight: 3, arbitrary: staleArb },
  { weight: 4, arbitrary: normalArb },
  { weight: 2, arbitrary: fc.array(freeArb, { minLength: 1, maxLength: 5 }) },
);

export const scriptArb: fc.Arbitrary<Script> = fc
  .array(blockArb, { minLength: 2, maxLength: 6 })
  .map((blocks) => [{ k: 'unlock' } as Action, ...blocks.flat()]);
