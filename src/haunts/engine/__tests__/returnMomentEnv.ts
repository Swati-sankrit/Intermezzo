/**
 * Shared setup for the Return controller tests (task 5.7): the real gate, planner and controller on the
 * fake scheduler, AudioContext and storage, plus fake return effects that draw one overlay each.
 */
import { afterEach } from 'vitest';
import { createGate } from '../gate/gate';
import { createReducedMotion } from '../gate/reducedMotion';
import type { HauntMode } from '../ghost/mode';
import { createReturnController, type ReturnController } from '../returnMoment';
import type { ReturnEffect, ReturnPlan, ReturnPort } from '../returnTypes';
import { KEYS } from '../settings';
import type { VisualLayer } from '../types';
import {
  createFakeAudioContextFactory, createFakeEvidenceHost, createFakeMatchMedia, createFakeReading,
  createFakeSpoilerHost, createFakeStorage, createFakeTime, type FakeAudioContext,
} from './fakes';

const SQUARE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="var(--shadow)"/></svg>';
const roots: HTMLElement[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) r.remove();
});

export type Span = { startMs: number; endMs: number } | null;
export interface FxOptions {
  span?: (plan: ReturnPlan) => Span;
  modes?: readonly HauntMode[];
  jumpSound?: boolean;
  throwOn?: 'span' | 'begin' | 'end';
}

export function makeEnv(random: () => number = () => 0) {
  const { clock, scheduler } = createFakeTime();
  const factory = createFakeAudioContextFactory(clock);
  const root = document.createElement('div');
  const left = document.createElement('div');
  const right = document.createElement('div');
  root.append(left, right);
  document.body.append(root);
  roots.push(root);
  const unlockTarget = new EventTarget();
  const warnings: string[] = [];
  const log: string[] = [];
  const gate = createGate({
    audio: { createAudioContext: factory.create, eventTarget: unlockTarget },
    hosts: { root, left, right },
    storage: createFakeStorage({ [KEYS.volumeCap]: '0.5' }),
    storageEvents: null,
    reducedMotion: createReducedMotion(createFakeMatchMedia(false).matchMedia),
    scheduler,
    warn: (m) => void warnings.push(m),
  });
  const overlays = (): HTMLElement[] => [...root.querySelectorAll<HTMLElement>('.haunt-overlay')];

  function fx(id: string, o: FxOptions = {}): ReturnEffect {
    let layer: VisualLayer | null = null;
    return {
      id,
      name: id,
      modes: o.modes,
      jumpSound: o.jumpSound,
      span(plan) {
        if (o.throwOn === 'span') throw new Error(`${id} span boom`);
        return o.span === undefined ? { startMs: 0, endMs: plan.durationMs } : o.span(plan);
      },
      begin(_plan: ReturnPlan, port: ReturnPort) {
        log.push(`${id}:begin@${clock.now()}`);
        layer = port.visual.createOverlay('ghost');
        layer.setMarkup(SQUARE);
        layer.setOpacity(1, 300);
        if (o.jumpSound === true) port.audio.setGain(1);
        if (o.throwOn === 'begin') throw new Error(`${id} begin boom`);
      },
      end() {
        log.push(`${id}:end@${clock.now()}`);
        layer?.remove();
        if (o.throwOn === 'end') throw new Error(`${id} end boom`);
      },
    };
  }

  function controller(effects: readonly ReturnEffect[]): ReturnController {
    return createReturnController({
      gate, effects, reading: createFakeReading({ activeParagraph: 'The candle burned low in the quiet hall.' }),
      evidence: createFakeEvidenceHost(), spoiler: createFakeSpoilerHost(),
      scheduler, random, warn: (m) => void warnings.push(m),
    });
  }

  async function unlock(): Promise<FakeAudioContext> {
    unlockTarget.dispatchEvent(new Event('pointerdown'));
    for (let i = 0; i < 6; i++) await Promise.resolve();
    return factory.contexts[0];
  }
  return { gate, scheduler, clock, root, warnings, log, overlays, fx, controller, unlock };
}


export const CLASSIC = { mode: 'classic' as const, awayMs: 12_000, lookAwayCount: 0, reducedMotion: false };
export const noRetire = (): void => undefined;

export function plain(plan: ReturnPlan | null): ReturnPlan {
  if (plan === null) throw new Error('expected a plan');
  return plan;
}
