/**
 * Checks of ghost-dread Property 23, run after every action and every timer stop. All gain is read
 * through the reference in gateCapRef.ts (replayed from the recorded automation).
 */
import { expect } from 'vitest';
import { allowedAt, makeRef, replayDisagreement, sampleTimes, type Ref } from './gateCapRef';
import type { FakeAudioContext } from './fakes';
import type { PortRec, World } from './gateCapWorld';

/** The same tolerance the existing cap property uses for float rounding. */
export const EPS = 1e-9;
const AUDIBLE = 1e-4;
/** Req 1.12 and 9.x: a fade-out ends at 0 within 800 ms. */
const FADE_S = 0.8;

function checkCap(w: World, ref: Ref, times: readonly number[]): number {
  let peak = 0;
  for (const t of times) {
    const g = ref.combined(t);
    peak = Math.max(peak, g);
    const allowed = allowedAt(w.hist, t);
    if (g > allowed + EPS) expect(g, `combined gain at ctx time ${t}s, cap allowed there ${allowed}`).toBeLessThanOrEqual(allowed + EPS);
  }
  return peak;
}

function checkRises(w: World, ctx: FakeAudioContext, ref: Ref): void {
  for (let i = w.mark; i < ctx.automation.length; i++) {
    const c = ctx.automation[i];
    if (c.type !== 'linearRampToValueAtTime' || !c.param.label.startsWith('gain#')) continue;
    const owner = w.ports.find((p) => p.node?.gain === c.param);
    if (owner === undefined) continue; // the master gain: only ever set to 1
    const calls = c.param.calls;
    const prev = calls[calls.indexOf(c) - 1];
    expect(prev?.type, `${c.param.label}: a ramp is anchored by setValueAtTime`).toBe('setValueAtTime');
    if (!((c.value as number) > (prev.value as number) + 1e-12)) continue;
    const reduced = w.reduced;
    const dur = c.effectiveTime - c.atContextTime;
    const min = owner.jump ? (reduced ? 0.3 : 0.02) : reduced ? 1 : 0.3;
    expect(dur, `${c.param.label} rise ${prev.value} to ${c.value} (jump channel: ${owner.jump}, reduced: ${reduced})`).toBeGreaterThanOrEqual(min - EPS);
    if (!owner.jump) continue;
    w.flags.add('jumpRise');
    if (reduced) w.flags.add('reducedJump');
    let others = 0;
    for (const n of ref.channels) if (n !== owner.node) others += ref.value(n, c.atContextTime);
    const room = Math.max(0, Math.min(1, w.capModel) - others * (ref.master === null ? 1 : ref.value(ref.master, c.atContextTime)));
    expect(c.value as number, `jump target at ctx time ${c.atContextTime}s: cap ${w.capModel} minus the others' ${others}`).toBeLessThanOrEqual(room + EPS);
  }
  w.mark = ctx.automation.length;
}

function checkFades(w: World, ref: Ref, times: readonly number[]): void {
  for (const { p, v0 } of w.justFaded) {
    if (p.node === null || !ref.channels.includes(p.node)) continue;
    for (const t of times) {
      const v = ref.value(p.node, t);
      if (v > v0 + EPS) expect(v, `fade-out started with an upward step: ${v0} before, ${v} at ${t}s`).toBeLessThanOrEqual(v0 + EPS);
    }
  }
  w.justFaded = [];
  w.obligations = w.obligations.filter(({ p }) => p.node !== null && ref.channels.includes(p.node));
  for (const { p, t: t0 } of w.obligations) {
    if (p.node === null) continue;
    for (const t of times) {
      if (t < t0 + FADE_S - 1e-12) continue;
      const v = ref.value(p.node, t);
      if (v > EPS) expect(v, `channel still at ${v} at ctx time ${t}s, ${(t - t0).toFixed(3)} s after a fade-out at ${t0}s`).toBeLessThanOrEqual(EPS);
    }
  }
}

/** A Return_Moment's ports are gone within 100 ms of its end, jump channels included. */
function checkRemoval(w: World, ref: Ref): void {
  const now = w.clock.now();
  for (const p of w.ports) {
    const end = p.window?.endAt;
    if (end === null || end === undefined || p.node === null || now < end + 100) continue;
    expect(ref.channels.includes(p.node), `a ${p.jump ? 'jump ' : ''}channel of the Return_Moment that ended at ${end} ms is still connected at ${now} ms`).toBe(false);
  }
}

/** Every path from a spatial source to the speakers runs through the port's channel gain (Req 1.6, 13.7). */
function checkSpatial(w: World, ctx: FakeAudioContext, ref: Ref): void {
  for (const p of w.ports) {
    if (p.node === null || !ref.channels.includes(p.node) || p.panners.length === 0) continue;
    for (const d of [0, 0.05, 0.3, 1]) {
      const t = ctx.currentTime + d;
      const expected = ref.value(p.node, t) * (ref.master === null ? 1 : ref.value(ref.master, t));
      for (const rec of p.panners) {
        expect(ctx.effectiveGainAt(rec.raw, t), `panner at ${t}s`).toBeCloseTo(expected, 9);
        expect(ctx.effectiveGainAt(rec.src, t), `spatial source at ${t}s`).toBeCloseTo(expected, 9);
      }
    }
  }
}

function peakOf(ref: Ref, p: PortRec, times: readonly number[]): number {
  if (p.node === null) return 0;
  let m = 0;
  for (const t of times) m = Math.max(m, ref.value(p.node, t));
  return m;
}

export function verify(w: World): void {
  const ctx = w.ctx();
  if (ctx === undefined) return;
  const ref = makeRef(ctx);
  const now = ctx.currentTime;
  const times = sampleTimes(ref, w.hist, now, w.obligations.map((o) => o.t + FADE_S));
  expect(replayDisagreement(ref, [now, ...ref.breakpoints().filter((t) => t >= now).slice(0, 12)]), 'replayed automation matches the fake timeline').toBeNull();
  const peak = checkCap(w, ref, times);
  checkRises(w, ctx, ref);
  checkFades(w, ref, times);
  checkRemoval(w, ref);
  checkSpatial(w, ctx, ref);
  if (peak > AUDIBLE && w.capModel <= 0.2) w.flags.add('capLow');
  if (peak > AUDIBLE && w.capModel >= 0.6) w.flags.add('capHigh');
  const live = w.ports.filter((p) => p.node !== null && ref.channels.includes(p.node));
  if (live.some((p) => p.jump && peakOf(ref, p, times) > AUDIBLE)) w.flags.add('jumpPlaying');
  if (live.filter((p) => peakOf(ref, p, times) > AUDIBLE).length >= 3) w.flags.add('several');
}
