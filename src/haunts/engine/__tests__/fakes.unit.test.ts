/**
 * THESE TESTS CHECK THE TEST FAKES, NOT PRODUCTION CODE.
 * The fake AudioParam is the part of fakes.ts that Property 14 and the gate
 * tests lean on, so its automation maths is verified here against hand-worked
 * Web Audio results. Requirements 6.2, 6.3, 6.4, 6.13 (via the fakes they rely on).
 */
import { describe, expect, it } from 'vitest';
import {
  FakeAudioContext,
  FakeGainNode,
  createFakeMatchMedia,
  createFakeTime,
} from './fakes';

function setup(): { ctx: FakeAudioContext; clock: ReturnType<typeof createFakeTime>['clock'] } {
  const { clock } = createFakeTime();
  return { ctx: new FakeAudioContext({ clock }), clock };
}

describe('fake AudioParam (tests the fake)', () => {
  it('evaluates a ramp from the previous event: V0 + (V1-V0)(t-T0)/(T1-T0)', () => {
    const { ctx } = setup();
    const p = ctx.createGain().gain;
    p.setValueAtTime(0, 0);
    p.linearRampToValueAtTime(1, 2);
    expect(p.valueAt(0)).toBeCloseTo(0, 12);
    expect(p.valueAt(0.5)).toBeCloseTo(0.25, 12);
    expect(p.valueAt(1)).toBeCloseTo(0.5, 12);
    expect(p.valueAt(2)).toBeCloseTo(1, 12);
    expect(p.valueAt(10)).toBeCloseTo(1, 12);
  });

  it('chains ramps: the second ramp starts at the first ramp end', () => {
    const { ctx } = setup();
    const p = ctx.createGain().gain;
    p.setValueAtTime(0.4, 1);
    p.linearRampToValueAtTime(0, 1.5); // 0.4 -> 0 over 0.5 s: at 1.25 it is 0.2
    p.linearRampToValueAtTime(1, 2.5); // 0 -> 1 over 1 s: at 2 it is 0.5
    expect(p.valueAt(1.25)).toBeCloseTo(0.2, 12);
    expect(p.valueAt(1.5)).toBeCloseTo(0, 12);
    expect(p.valueAt(2)).toBeCloseTo(0.5, 12);
    expect(p.valueAt(0.5)).toBe(1); // before the first event: intrinsic default of a gain
  });

  it('cancelScheduledValues drops events at or after the time, so an interrupted ramp is gone', () => {
    const { ctx } = setup();
    const p = ctx.createGain().gain;
    p.setValueAtTime(1, 0);
    p.linearRampToValueAtTime(0, 2);
    p.cancelScheduledValues(1);
    expect(p.valueAt(1)).toBe(1);
    expect(p.valueAt(5)).toBe(1);
    // The documented anchor pattern: cancel, pin the current value, ramp again.
    p.setValueAtTime(0.5, 1);
    p.linearRampToValueAtTime(0.9, 1.4);
    expect(p.valueAt(1.2)).toBeCloseTo(0.7, 12);
  });

  it('a ramp with no earlier event starts from the intrinsic value at the current context time', () => {
    const { ctx, clock } = setup();
    ctx.setState('running');
    clock.advance(2000); // currentTime = 2 s
    expect(ctx.currentTime).toBeCloseTo(2, 12);
    const p = ctx.createGain().gain; // default 1
    p.linearRampToValueAtTime(0, 4); // 1 -> 0 over 2..4 s
    expect(p.valueAt(3)).toBeCloseTo(0.5, 12);
    expect(p.valueAt(4)).toBeCloseTo(0, 12);
  });

  it('throws TypeError for a negative time and records nothing', () => {
    const { ctx } = setup();
    const p = ctx.createGain().gain;
    expect(() => p.setValueAtTime(0.5, -0.001)).toThrow(TypeError);
    expect(() => p.linearRampToValueAtTime(0.5, -1)).toThrow(TypeError);
    expect(() => p.cancelScheduledValues(-1)).toThrow(TypeError);
    expect(p.calls).toHaveLength(0);
    expect(ctx.automation).toHaveLength(0);
  });

  it('maxValueOver includes the left limit only when the interval starts before the jump', () => {
    const { ctx } = setup();
    const p = ctx.createGain().gain;
    p.setValueAtTime(0, 0);
    p.linearRampToValueAtTime(0.4, 1);
    p.setValueAtTime(0.1, 1); // jump down at the instant the ramp ends
    expect(p.valueAt(1)).toBeCloseTo(0.1, 12);
    expect(p.valueBefore(1)).toBeCloseTo(0.4, 12);
    expect(p.maxValueOver(0, 3)).toBeCloseTo(0.4, 12);
    // The 0.4 left limit is approached from t < 1, which lies outside the closed
    // interval [1, 3], so the maximum here is the post-jump value 0.1. The
    // maxValueOver(0, 3) assertion above covers the left-limit case.
    expect(p.maxValueOver(1, 3)).toBeCloseTo(0.1, 12);
  });

  it('records every call in order with requested and effective times', () => {
    const { ctx } = setup();
    const p = ctx.createGain().gain;
    p.cancelScheduledValues(0);
    p.setValueAtTime(0.2, 0);
    p.linearRampToValueAtTime(0.3, 0.3);
    expect(ctx.automation.map((c) => c.type)).toEqual([
      'cancelScheduledValues',
      'setValueAtTime',
      'linearRampToValueAtTime',
    ]);
    expect(ctx.automation[2]).toMatchObject({ value: 0.3, time: 0.3, effectiveTime: 0.3 });
  });
});

describe('fake AudioContext graph and state (tests the fake)', () => {
  it('computes the gain chain from a source to the destination', () => {
    const { ctx } = setup();
    const input = ctx.createGain();
    const master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    input.connect(master).connect(comp).connect(ctx.destination);
    input.gain.setValueAtTime(0.5, 0);
    master.gain.setValueAtTime(0.4, 0);
    expect(ctx.effectiveGainAt(input, 0)).toBeCloseTo(0.2, 12);
    expect(ctx.pathsToDestination(input)).toHaveLength(1);
    input.disconnect(master);
    expect(ctx.effectiveGainAt(input, 0)).toBe(0);
    expect(() => input.disconnect(master)).toThrow();
  });

  it('stays suspended until resume(), and time only advances while running', async () => {
    const { ctx, clock } = setup();
    expect(ctx.state).toBe('suspended');
    clock.advance(1000);
    expect(ctx.currentTime).toBe(0);
    await ctx.resume();
    expect(ctx.state).toBe('running');
    clock.advance(500);
    expect(ctx.currentTime).toBeCloseTo(0.5, 12);
  });

  it('can reject resume() and can throw from the constructor', async () => {
    const { clock } = createFakeTime();
    const rejecting = new FakeAudioContext({ clock, resumeRejects: true });
    await expect(rejecting.resume()).rejects.toThrow();
    expect(rejecting.state).toBe('suspended');
    expect(() => new FakeAudioContext({ clock, constructorThrows: true })).toThrow();
  });

  it('creates typed nodes and logs creation', () => {
    const { ctx } = setup();
    const g = ctx.createGain();
    ctx.createBiquadFilter();
    ctx.createStereoPanner();
    ctx.createBufferSource();
    expect(g).toBeInstanceOf(FakeGainNode);
    expect(ctx.createdNodes.map((n) => n.kind)).toEqual(['gain', 'biquad', 'stereoPanner', 'bufferSource']);
  });
});

describe('fake scheduler and matchMedia (tests the fakes)', () => {
  it('fires timers in due order, including timers created by timers', () => {
    const { clock, scheduler } = createFakeTime();
    const fired: string[] = [];
    scheduler.setTimeout(() => {
      fired.push('b@' + clock.now());
      scheduler.setTimeout(() => fired.push('c@' + clock.now()), 50);
    }, 100);
    scheduler.setTimeout(() => fired.push('a@' + clock.now()), 10);
    const cancelled = scheduler.setTimeout(() => fired.push('x'), 20);
    scheduler.clearTimeout(cancelled);
    scheduler.advance(200);
    expect(fired).toEqual(['a@10', 'b@100', 'c@150']);
    expect(clock.now()).toBe(200);
    expect(scheduler.pendingCount).toBe(0);
  });

  it('notifies change listeners and removes them', () => {
    const fake = createFakeMatchMedia(false);
    const mql = fake.matchMedia('(prefers-reduced-motion: reduce)');
    const seen: boolean[] = [];
    const cb = (e: { matches: boolean }): void => void seen.push(e.matches);
    mql.addEventListener('change', cb);
    fake.setMatches(true);
    expect(mql.matches).toBe(true);
    mql.removeEventListener('change', cb);
    fake.setMatches(false);
    expect(seen).toEqual([true]);
    expect(fake.listenerCount).toBe(0);
  });
});
