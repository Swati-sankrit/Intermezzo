import fc from 'fast-check';
import type { PulseSpec } from '../pulses';

/** Roll values: whole range, both ends, just inside the end, and non-finite or out of range. */
export const rollArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 4, arbitrary: fc.double({ min: 0, max: 1, noNaN: true, maxExcluded: true }) },
  { weight: 2, arbitrary: fc.double({ min: 0, max: 0.05, noNaN: true }) },
  { weight: 2, arbitrary: fc.double({ min: 0.95, max: 1, noNaN: true }) },
  { weight: 2, arbitrary: fc.constantFrom(0, -0, 1, 0.5, 1 - Number.EPSILON, Number.MIN_VALUE) },
  { weight: 2, arbitrary: fc.constantFrom(NaN, Infinity, -Infinity, -1, 2, 1e300, -1e300) },
  { weight: 1, arbitrary: fc.double() },
);
export const sideArb: fc.Arbitrary<'left' | 'right'> = fc.constantFrom('left', 'right');

/** Levels 1 to 3 mostly, with out-of-range, fractional and NaN levels as well. */
export const levelArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 6, arbitrary: fc.constantFrom(1, 2, 3) },
  { weight: 2, arbitrary: fc.constantFrom(0, 4, -1, 1.4, 2.5, 3.6, NaN, Infinity, -Infinity, -0) },
  { weight: 1, arbitrary: fc.double({ min: -5, max: 8, noNaN: true }) },
);

export const azimuthArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 4, arbitrary: fc.double({ min: -360, max: 360, noNaN: true }) },
  { weight: 3, arbitrary: fc.constantFrom(0, -0, 90, -90, 180, -180, 270, 360, 60, 120) },
  { weight: 2, arbitrary: fc.constantFrom(NaN, Infinity, -Infinity) },
  { weight: 1, arbitrary: fc.double({ noNaN: true, noDefaultInfinity: true }) },
);
export const distanceArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 4, arbitrary: fc.double({ min: 0, max: 100, noNaN: true }) },
  { weight: 2, arbitrary: fc.constantFrom(0, -0, 0.5, 1, 6, 1e-300, 1e6) },
  { weight: 2, arbitrary: fc.constantFrom(NaN, Infinity, -Infinity, -1, -0.5, -1e300) },
  { weight: 1, arbitrary: fc.double({ min: -50, max: 0, noNaN: true }) },
);

export const kindArb: fc.Arbitrary<PulseSpec['kind']> = fc.constantFrom('footstep', 'breath', 'knock', 'jump');

/** Sample rates: valid range mostly, with bad values. */
export const sampleRateArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 5, arbitrary: fc.integer({ min: 8000, max: 96000 }) },
  { weight: 3, arbitrary: fc.constantFrom(8000, 22050, 44100, 48000, 96000) },
  { weight: 2, arbitrary: fc.constantFrom(NaN, Infinity, -Infinity, 0, -44100, 100, 1e9, 8000.5) },
);
/** Durations in seconds, kept small so buffers stay small. */
export const secondsArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 5, arbitrary: fc.double({ min: 0.05, max: 2, noNaN: true }) },
  { weight: 2, arbitrary: fc.double({ min: 2, max: 4, noNaN: true }) },
  { weight: 2, arbitrary: fc.constantFrom(NaN, Infinity, -Infinity, 0, -1, 0.001, 0.05) },
);
/** Attack: at or near 20 ms, below it, and up to 2000 ms, plus bad values. */
export const attackArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom(20, 20.0001, 20.5, 21, 19.999, 0, -5, 1) },
  { weight: 3, arbitrary: fc.double({ min: 20, max: 21, noNaN: true }) },
  { weight: 3, arbitrary: fc.double({ min: 20, max: 300, noNaN: true }) },
  { weight: 1, arbitrary: fc.double({ min: 300, max: 2000, noNaN: true }) },
  { weight: 1, arbitrary: fc.constantFrom(NaN, Infinity, -Infinity, 1e9) },
);
export const peakArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 3, arbitrary: fc.double({ min: 0.001, max: 1, noNaN: true }) },
  { weight: 2, arbitrary: fc.constantFrom(0, 1, 0.5, 0.001) },
  { weight: 2, arbitrary: fc.constantFrom(1.0001, 2, 10, 1e9) },
  { weight: 1, arbitrary: fc.constantFrom(-0, -1, NaN, Infinity, -Infinity) },
);
export const pulseCountArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 5, arbitrary: fc.integer({ min: 1, max: 40 }) },
  { weight: 2, arbitrary: fc.integer({ min: 41, max: 400 }) },
  { weight: 2, arbitrary: fc.constantFrom(0, -3, 1.7, NaN, Infinity, -Infinity) },
);

export const pulseSpecArb: fc.Arbitrary<PulseSpec> = fc.record({
  kind: kindArb,
  pulsesPerLoop: pulseCountArb,
  attackMs: attackArb,
  peak: peakArb,
});

export interface PulseCase {
  readonly rate: number;
  readonly seconds: number;
  readonly spec: PulseSpec;
}
export const pulseCaseArb: fc.Arbitrary<PulseCase> = fc.record({
  rate: sampleRateArb,
  seconds: secondsArb,
  spec: pulseSpecArb,
});
