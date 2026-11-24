/**
 * Task 5.8: the engine wiring (selection, layers, StartInfo, chapter reset, Return_Moment, mode change,
 * stop). Real engine and real gate; fake clock, scheduler and AudioContext; recording haunts and effects.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Regions } from '../regions';
import type { Haunt } from '../types';
import { createWorld, recordingEffect, recordingHaunt } from './wiringWorld';
import type { RecordingHaunt } from './wiringWorld';
const REGIONS: Regions = {
  left: { left: 0, right: 100, top: 0, bottom: 600 },
  right: { left: 900, right: 1000, top: 0, bottom: 600 },
};
const BOTH = ['classic', 'nightmare'] as const;
let cleanups: (() => void)[] = [];
afterEach(() => {
  for (const fn of cleanups) fn();
  cleanups = [];
});
function world(options: Parameters<typeof createWorld>[0]) {
  const w = createWorld(options);
  cleanups.push(w.cleanup);
  return w;
}
const byId = (w: { haunts: Haunt[] }, id: string): RecordingHaunt => w.haunts.find((h) => h.id === id) as RecordingHaunt;
const standard = (now: () => number): Haunt[] => [
  recordingHaunt('lead', now),
  recordingHaunt('foot', now, { role: 'layer', modes: [...BOTH] }),
  recordingHaunt('knock', now, { role: 'layer', modes: [...BOTH], minLevel: 3 }),
];
describe('engine wiring', () => {
  it('starts layers by level and starts each layer once per look-away, even across a mode round trip', () => {
    const w = world({ makeHaunts: standard });
    w.away();
    expect(byId(w, 'foot').starts).toHaveLength(1);
    expect(byId(w, 'knock').starts).toHaveLength(0);
    w.advance(12_000);
    expect(byId(w, 'knock').starts).toHaveLength(1);
    expect(byId(w, 'foot').levels).toContain(3);
    w.settings.set({ mode: 'gentle' });
    w.advance(900);
    expect(byId(w, 'knock').stops).toHaveLength(1);
    w.settings.set({ mode: 'classic' });
    w.advance(1_000);
    expect(byId(w, 'foot').starts).toHaveLength(1);
    expect(byId(w, 'knock').starts).toHaveLength(1);
    w.present();
    w.advance(3_000);
    w.away();
    expect(byId(w, 'foot').starts).toHaveLength(2);
  });
  it('gives no layer in Gentle', () => {
    const w = world({ mode: 'gentle', makeHaunts: standard });
    w.away();
    w.advance(13_000);
    expect(byId(w, 'lead').starts).toHaveLength(1);
    expect(byId(w, 'foot').starts).toHaveLength(0);
    expect(w.engine.getState().level).toBe(1);
  });
  it('passes StartInfo: mode, ghostStep per look-away, one extra roll and regions', () => {
    const w = world({ makeHaunts: standard, regions: () => REGIONS, extra: 0.25 });
    w.away();
    const first = byId(w, 'lead').starts[0].info;
    expect(first).toEqual({ mode: 'classic', ghostStep: 0, roll: 0.25, regions: REGIONS });
    w.present();
    w.advance(3_000);
    w.away();
    expect(byId(w, 'lead').starts[1].info?.ghostStep).toBe(1);
  });
  it('leaves regions undefined when none are given', () => {
    const w = world({ makeHaunts: standard });
    w.away();
    expect(byId(w, 'lead').starts[0].info?.regions).toBeUndefined();
  });
  it('resets ghostStep when the chapter changes, through subscribeChapter, with no look-away between', () => {
    let notify: () => void = () => undefined;
    const w = world({
      makeHaunts: standard,
      reading: (base) => ({
        chapterKey: base.chapterKey,
        activeParagraph: base.activeParagraph,
        spoilerSource: base.spoilerSource,
        readSoFar: base.readSoFar,
        subscribeChapter: (cb) => {
          notify = cb;
          return () => void (notify = () => undefined);
        },
      }),
    });
    for (let i = 0; i < 2; i++) {
      w.away();
      w.present();
      w.advance(3_000);
    }
    w.reading.options.chapterKey = 'B';
    notify();
    w.reading.options.chapterKey = 'A';
    notify();
    w.away();
    expect(byId(w, 'lead').starts.map((s) => s.info?.ghostStep)).toEqual([0, 1, 0]);
  });
  it('without subscribeChapter it checks the chapter key when a look-away starts', () => {
    const w = world({ makeHaunts: standard });
    w.away();
    w.present();
    w.advance(3_000);
    w.reading.options.chapterKey = 'B';
    w.away();
    expect(byId(w, 'lead').starts.map((s) => s.info?.ghostStep)).toEqual([0, 0]);
  });
});
describe('Return_Moment wiring', () => {
  const build = (mode: 'classic' | 'gentle' = 'classic') => {
    const effect = recordingEffect();
    return { effect, w: world({ mode, makeHaunts: standard, effects: [effect] }) };
  };
  it('starts a Return_Moment on present after a look-away in Classic and ends it by 3000 ms', () => {
    const { effect, w } = build();
    w.away();
    w.advance(13_000);
    w.present();
    expect(effect.begins).toBe(1);
    expect(effect.ends).toBe(0);
    w.advance(3_000);
    expect(effect.ends).toBe(1);
  });
  it('starts no Return_Moment in Gentle and still calms the room', () => {
    const { effect, w } = build('gentle');
    w.away();
    w.advance(13_000);
    w.present();
    w.advance(700);
    expect(effect.begins).toBe(0);
    expect(w.engine.getState()).toMatchObject({ level: 0, running: [] });
  });
  it('a new away during a Return_Moment aborts it at once', () => {
    const { effect, w } = build();
    w.away();
    w.advance(13_000);
    w.present();
    w.advance(500);
    w.away();
    expect(effect.ends).toBe(1);
    w.advance(3_000);
    expect(effect.ends).toBe(1);
  });
  it('a mode change to Gentle aborts it; another mode change lets it finish', () => {
    const run = (next: 'gentle' | 'nightmare') => {
      const { effect, w } = build();
      w.away();
      w.advance(13_000);
      w.present();
      w.advance(500);
      w.settings.set({ mode: next });
      return { effect, w };
    };
    const gentle = run('gentle');
    expect(gentle.effect.ends).toBe(1);
    const nightmare = run('nightmare');
    expect(nightmare.effect.ends).toBe(0);
    nightmare.w.advance(3_000);
    expect(nightmare.effect.ends).toBe(1);
  });
  it('stop aborts a running Return_Moment', () => {
    const { effect, w } = build();
    w.away();
    w.advance(13_000);
    w.present();
    w.advance(500);
    w.engine.stop();
    expect(effect.ends).toBe(1);
  });
  it('fades every layer to stopped within 800 ms of present (Req 1.12)', () => {
    const { w } = build();
    w.away();
    w.advance(13_000);
    const presentAt = w.clock.now();
    w.present();
    w.advance(800);
    for (const id of ['lead', 'foot', 'knock']) {
      const { stops } = byId(w, id);
      expect(stops).toHaveLength(1);
      expect(stops[0] - presentAt).toBeLessThanOrEqual(800);
    }
    expect(w.engine.getState().running).toEqual([]);
  });
});
