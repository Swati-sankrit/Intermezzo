/**
 * Return controller (task 5.7): order of steps, null results, effect scheduling and the end of the
 * moment. Real gate, planner and controller; only time, the AudioContext and the effects are stand-ins.
 * Requirements 3.1, 3.3, 3.5, 3.6, 3.9, 5.3, 9.8. Abort and history are in returnMomentAbort.unit.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { CLASSIC, makeEnv, noRetire, plain } from './returnMomentEnv';

describe('begin: order of steps (Requirements 3.3, 9.8)', () => {
  it('plans, records history, retires ambient, then begins the gate state, then starts effects', () => {
    const env = makeEnv();
    const c = env.controller([env.fx('a')]);
    let retiredWith = -1;
    const plan = plain(
      c.begin(CLASSIC, (ms) => {
        retiredWith = ms;
        // The gate state has not begun yet, and the plan's outcome is already recorded.
        env.log.push(`retire(openReturn=${env.gate.openReturn('probe') === null ? 'null' : 'port'}, history=${c.history().join()})`);
      }),
    );
    expect(plan.jumpscare).not.toBeNull();
    expect(retiredWith).toBe(plan.ambientFadeMs);
    expect(retiredWith).toBeLessThanOrEqual(800);
    expect(env.log).toEqual(['retire(openReturn=null, history=true)', 'a:begin@0']);
    expect(env.gate.openReturn('after')).not.toBeNull();
  });
});

describe('begin: null results', () => {
  it('returns null in Gentle and does nothing at all', () => {
    const env = makeEnv();
    const c = env.controller([env.fx('a')]);
    let retired = 0;
    expect(c.begin({ ...CLASSIC, mode: 'gentle' }, () => void (retired += 1))).toBeNull();
    expect(retired).toBe(0);
    expect(env.log).toEqual([]);
    expect(c.running()).toBe(false);
    expect(c.history()).toEqual([]);
    expect(env.gate.openReturn('probe')).toBeNull();
    expect(env.scheduler.pendingCount).toBe(0);
  });

  it('returns null for a second begin while one runs, without retiring ambient again', () => {
    const env = makeEnv();
    const c = env.controller([env.fx('a')]);
    let retired = 0;
    expect(c.begin(CLASSIC, () => void (retired += 1))).not.toBeNull();
    env.scheduler.advance(500);
    expect(c.begin(CLASSIC, () => void (retired += 1))).toBeNull();
    expect(retired).toBe(1);
    expect(env.log.filter((l) => l.endsWith('@0') && l.includes('begin'))).toHaveLength(1);
    expect(c.history()).toEqual([true]);
  });

  it('allows a new begin once the first moment has ended', () => {
    const env = makeEnv();
    const c = env.controller([]);
    const first = plain(c.begin(CLASSIC, noRetire));
    env.scheduler.advance(first.durationMs);
    expect(c.running()).toBe(false);
    expect(c.begin(CLASSIC, noRetire)).not.toBeNull();
  });
});

describe('effects (Requirements 3.5, 3.6, 3.9, 5.3)', () => {
  it('skips an effect whose modes exclude the current mode and runs it in an allowed mode', () => {
    for (const [mode, expected] of [['classic', false], ['nightmare', true]] as const) {
      const env = makeEnv();
      const c = env.controller([env.fx('only-nightmare', { modes: ['nightmare'] }), env.fx('any')]);
      c.begin({ ...CLASSIC, mode }, noRetire);
      expect(env.log.some((l) => l.startsWith('only-nightmare:begin'))).toBe(expected);
      expect(env.log.some((l) => l.startsWith('any:begin'))).toBe(true);
    }
  });

  it('warns about a throwing effect and still runs and ends the others', () => {
    const env = makeEnv();
    const c = env.controller([
      env.fx('bad-span', { throwOn: 'span' }), env.fx('bad-begin', { throwOn: 'begin' }),
      env.fx('bad-end', { throwOn: 'end' }), env.fx('good'),
    ]);
    const plan = plain(c.begin(CLASSIC, noRetire));
    env.scheduler.advance(plan.durationMs);
    expect(env.warnings.some((w) => w.includes('bad-span') && w.includes('boom'))).toBe(true);
    expect(env.warnings.some((w) => w.includes('bad-begin') && w.includes('boom'))).toBe(true);
    expect(env.warnings.some((w) => w.includes('bad-end') && w.includes('boom'))).toBe(true);
    expect(env.log).toContain('good:begin@0');
    expect(env.log).toContain(`good:end@${plan.durationMs}`);
    // A begin that threw is cleaned up through end(); a span that threw never began.
    expect(env.log.some((l) => l.startsWith('bad-begin:end'))).toBe(true);
    expect(env.log.some((l) => l.startsWith('bad-span:'))).toBe(false);
    env.scheduler.advance(100);
    expect(env.overlays()).toHaveLength(0);
  });

  it('starts each effect at its span start and ends it by its span end or the end of the moment', () => {
    const env = makeEnv();
    const c = env.controller([
      env.fx('early', { span: () => ({ startMs: 0, endMs: 400 }) }),
      env.fx('mid', { span: () => ({ startMs: 500, endMs: 1200 }) }),
      env.fx('long', { span: () => ({ startMs: 300, endMs: 99_999 }) }),
      env.fx('none', { span: () => null }),
    ]);
    const plan = plain(c.begin(CLASSIC, noRetire));
    env.scheduler.advance(plan.durationMs + 100);
    expect(env.log).toEqual([
      'early:begin@0', 'long:begin@300', 'early:end@400', 'mid:begin@500', 'mid:end@1200', `long:end@${plan.durationMs}`,
    ]);
  });
});

describe('the moment ends at durationMs (Requirements 3.5, 9.8)', () => {
  it('stays open until durationMs, then ends effects and closes the gate state', () => {
    const env = makeEnv();
    const c = env.controller([env.fx('a')]);
    const plan = plain(c.begin(CLASSIC, noRetire));
    expect(plan.durationMs).toBeGreaterThan(0);
    expect(plan.durationMs).toBeLessThanOrEqual(3000);
    env.scheduler.advance(plan.durationMs - 1);
    expect(c.running()).toBe(true);
    expect(env.overlays()).toHaveLength(1);
    expect(env.gate.openReturn('probe')).not.toBeNull();
    env.scheduler.advance(1);
    expect(c.running()).toBe(false);
    expect(env.log).toContain(`a:end@${plan.durationMs}`);
    expect(env.gate.openReturn('probe')).toBeNull();
    env.scheduler.advance(100);
    expect(env.overlays()).toHaveLength(0);
    expect(env.scheduler.pendingCount).toBe(0);
  });
});
