/**
 * Return controller (task 5.7): abort and history. Real gate, planner and controller; only time, the
 * AudioContext and the effects are stand-ins. Requirements 3.7, 3.11, 5.3, 5.13, 8.10.
 */
import { describe, expect, it } from 'vitest';
import type { ReturnPlan } from '../returnTypes';
import { CLASSIC, makeEnv, noRetire, plain } from './returnMomentEnv';

describe('abort (Requirements 3.7, 3.11, 5.13, 8.10)', () => {
  async function running(reason: 'away' | 'gentle' | 'stop') {
    const env = makeEnv();
    const ctx = await env.unlock();
    const c = env.controller([env.fx('ghost'), env.fx('jump', { jumpSound: true })]);
    c.begin(CLASSIC, noRetire);
    env.scheduler.advance(500);
    const channels = ctx.nodesOfKind('gain').slice(1);
    const connected = (): number => ctx.connections.filter((e) => channels.includes(e.from)).length;
    expect(env.overlays().length).toBeGreaterThan(0);
    expect(connected()).toBeGreaterThan(0);
    c.abort(reason);
    return { env, c, connected };
  }

  it.each([['away', 80], ['gentle', 100]] as const)(
    'abort(%s) ends effects at once and removes overlays and channels within 100 ms (fade %i ms)',
    async (reason, fade) => {
      const { env, c, connected } = await running(reason);
      expect(c.running()).toBe(false);
      expect(env.log).toContain('ghost:end@500');
      expect(env.log).toContain('jump:end@500');
      expect(env.gate.openReturn('probe')).toBeNull();
      env.scheduler.advance(100);
      expect(env.overlays()).toHaveLength(0);
      expect(connected()).toBe(0);
      expect(env.scheduler.pendingCount).toBe(0);
      expect(env.scheduler.requestedDelays.at(-1)).toBe(fade);
      expect(fade).toBeLessThanOrEqual(800);
    },
  );

  it('abort(stop) removes everything at once', async () => {
    const { env, c, connected } = await running('stop');
    expect(c.running()).toBe(false);
    expect(env.overlays()).toHaveLength(0);
    expect(connected()).toBe(0);
    expect(env.scheduler.pendingCount).toBe(0);
  });

  it('does nothing when no moment runs, and the cancelled end timer does not fire later', async () => {
    const { env, c } = await running('away');
    c.abort('gentle');
    c.abort('stop');
    env.scheduler.advance(5000);
    expect(env.log.filter((l) => l.startsWith('ghost:end'))).toHaveLength(1);
    expect(env.warnings).toEqual([]);
  });
});

describe('history (Requirement 5.3)', () => {
  it('records only qualifying returns, with the jumpscare outcome, keeping the last two', () => {
    const env = makeEnv(() => 0);
    const c = env.controller([]);
    const go = (awayMs: number): ReturnPlan => {
      const plan = plain(c.begin({ ...CLASSIC, mode: 'nightmare', awayMs }, noRetire));
      env.scheduler.advance(3000);
      return plan;
    };
    expect(go(9_999).qualifying).toBe(false);
    expect(c.history()).toEqual([]);
    expect(go(10_000).jumpscare).not.toBeNull();
    expect(c.history()).toEqual([true]);
    expect(go(10_000).jumpscare).not.toBeNull();
    expect(c.history()).toEqual([true, true]);
    // Nightmare allows two jumpscares in a window: the third return has none.
    expect(go(10_000).jumpscare).toBeNull();
    expect(c.history()).toEqual([true, false]);
  });

  it('takes the rolls from the injected random, never from Math.random', () => {
    const env = makeEnv(() => 0.99);
    const c = env.controller([]);
    const spy = Math.random;
    let called = 0;
    Math.random = () => {
      called += 1;
      return 0;
    };
    try {
      expect(plain(c.begin(CLASSIC, noRetire)).jumpscare).toBeNull();
    } finally {
      Math.random = spy;
    }
    expect(called).toBe(0);
    expect(c.history()).toEqual([false]);
  });
});
