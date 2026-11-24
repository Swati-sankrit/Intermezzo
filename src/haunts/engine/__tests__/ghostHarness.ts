/**
 * Shared harness for the p14 (cap) and p15 (reduced motion) property suites over the ghost-dread haunts:
 * generators for `StartInfo` and for a look-away return, and a driver that begins a REAL Return_Moment
 * through the real Return controller (real planner, real gate, real registry effects) on the fake scheduler.
 *
 * The driver is how these suites begin a Return_Moment: the controller plans it from the args, opens a
 * ReturnPort per effect at the effect's own span, and ends it on its own timers (so time must advance).
 */
import fc from 'fast-check';
import { createReturnController, type ReturnController } from '../returnMoment';
import type { ReturnEffect, ReturnPlan, ReturnPort } from '../returnTypes';
import type { Gate, StartInfo } from '../types';
import { createFakeEvidenceHost, createFakeReading, createFakeSpoilerHost } from './fakes';

/** Uniform in [0, 1). fc.double is biased to 0 and tiny values. */
export const rollArb = fc.integer({ min: 0, max: 999_999 }).map((n) => n / 1_000_000);

/** A side region. Nine in ten are wide enough for the Ghost (48 px or more); the rest are too narrow to draw it. */
const rectArb = fc
  .record({
    width: fc.oneof({ weight: 9, arbitrary: fc.integer({ min: 48, max: 400 }) }, { weight: 1, arbitrary: fc.integer({ min: 0, max: 47 }) }),
    height: fc.integer({ min: 100, max: 900 }),
  })
  .map(({ width, height }) => ({ left: 0, right: width, top: 0, bottom: height }));

/** Start info the engine passes to every haunt. Modes are the two a Ghost can run in. */
export const startInfoArb: fc.Arbitrary<StartInfo> = fc.record({
  mode: fc.constantFrom<'classic' | 'nightmare'>('classic', 'nightmare'),
  ghostStep: fc.constantFrom<0 | 1 | 2 | 3 | 4>(0, 1, 2, 3, 4),
  roll: rollArb,
  regions: fc.oneof(
    { weight: 1, arbitrary: fc.constant(undefined) },
    { weight: 3, arbitrary: fc.record({ left: rectArb, right: rectArb }) },
  ),
});

/** What the engine hands the Return controller when the reader comes back. */
export interface RetArgs {
  readonly mode: 'classic' | 'nightmare';
  readonly awayMs: number;
  readonly lookAwayCount: number;
  /** First, second and every later random draw of the controller (jump, calm, the rest). */
  readonly jump: number;
  readonly calm: number;
  readonly rest: number;
}

/** Mostly qualifying returns (10 s or more) with a low jump roll, so the Jumpscare runs often. */
export const retArgsArb: fc.Arbitrary<RetArgs> = fc.record({
  mode: fc.constantFrom<'classic' | 'nightmare'>('classic', 'nightmare'),
  awayMs: fc.oneof(
    { weight: 1, arbitrary: fc.constantFrom(0, 3000, 9999) },
    { weight: 4, arbitrary: fc.constantFrom(10_000, 15_000, 30_000, 90_000) },
  ),
  lookAwayCount: fc.integer({ min: 0, max: 8 }),
  jump: fc.oneof({ weight: 3, arbitrary: fc.integer({ min: 0, max: 299_999 }).map((n) => n / 1_000_000) }, { weight: 1, arbitrary: rollArb }),
  calm: rollArb,
  rest: rollArb,
});

export interface ReturnDriverOptions {
  readonly gate: Gate;
  readonly effects: readonly ReturnEffect[];
  readonly scheduler: { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(id: unknown): void };
  readonly warn: (msg: string) => void;
  /**
   * Wraps every `openReturn` the controller makes. `doOpen` performs the real call; return its port.
   * The suites use it to see which effects got a port, and to find the jump channel's gain node.
   */
  readonly around?: (effectId: string, jumpSound: boolean, doOpen: () => ReturnPort | null) => ReturnPort | null;
}

export interface ReturnDriver {
  /** Plans and begins a Return_Moment. Null when the controller runs none (Gentle, or one is running). */
  begin(args: RetArgs, reducedMotion: boolean, retireAmbient: (fadeMs: number) => void): ReturnPlan | null;
  abort(reason: 'away' | 'gentle' | 'stop'): void;
  running(): boolean;
}

export function createReturnDriver(o: ReturnDriverOptions): ReturnDriver {
  let draw = 0;
  let current: RetArgs | null = null;
  const gate: Gate = {
    ...o.gate,
    openReturn(effectId, opts) {
      const doOpen = (): ReturnPort | null => o.gate.openReturn(effectId, opts);
      return o.around ? o.around(effectId, opts?.jumpSound === true, doOpen) : doOpen();
    },
  };
  const controller: ReturnController = createReturnController({
    gate,
    effects: o.effects,
    reading: createFakeReading({ activeParagraph: 'The candle burned low, and the long room held its breath.' }),
    evidence: createFakeEvidenceHost(),
    spoiler: createFakeSpoilerHost(),
    scheduler: o.scheduler,
    random: () => {
      const i = draw++;
      if (current === null) return 0.5;
      return i === 0 ? current.jump : i === 1 ? current.calm : current.rest;
    },
    warn: o.warn,
  });
  return {
    begin(args, reducedMotion, retireAmbient) {
      draw = 0;
      current = args;
      return controller.begin(
        { mode: args.mode, awayMs: args.awayMs, lookAwayCount: args.lookAwayCount, reducedMotion },
        retireAmbient,
      );
    },
    abort: (reason) => controller.abort(reason),
    running: () => controller.running(),
  };
}
