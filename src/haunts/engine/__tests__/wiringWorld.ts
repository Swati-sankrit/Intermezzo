/**
 * Harness for engineWiring.unit.test.ts: the REAL engine and the REAL gate (real audio and visual
 * adapters over jsdom hosts), with a fake clock, fake scheduler, fake AudioContext and simple
 * recording haunts and return effects. Nothing here stands in for the engine or gate.
 */
import { createHauntEngine } from '../engine';
import { createGate } from '../gate/gate';
import { createReducedMotion } from '../gate/reducedMotion';
import type { Regions } from '../regions';
import type { ReadingContext, ReturnEffect } from '../returnTypes';
import { createSettingsStore } from '../settings';
import type { AttentionSignalLike, Gate, Haunt, HauntLevel, HauntMode, StartInfo } from '../types';
import { createFakeAudioContextFactory, createFakeMatchMedia, createFakeReading, createFakeTime } from './fakes';
import type { FakeReading } from './fakes';
export const START_MS = 1_000_000;
export interface RecordingHaunt extends Haunt {
  readonly starts: { level: HauntLevel; info: StartInfo | undefined }[];
  readonly levels: HauntLevel[];
  /** Clock time of each `stop`. */
  readonly stops: number[];
}
export function recordingHaunt(
  id: string,
  now: () => number,
  extra: Pick<Haunt, 'role' | 'modes' | 'minLevel'> = {},
): RecordingHaunt {
  const haunt: RecordingHaunt = {
    id,
    name: id,
    ...extra,
    starts: [],
    levels: [],
    stops: [],
    start: (level, _audio, _visual, info) => void haunt.starts.push({ level, info }),
    setLevel: (level) => void haunt.levels.push(level),
    stop: () => void haunt.stops.push(now()),
  };
  return haunt;
}
export interface RecordingEffect extends ReturnEffect {
  begins: number;
  ends: number;
}
/** A return effect that is active for the whole Return_Moment. */
export function recordingEffect(): RecordingEffect {
  const effect: RecordingEffect = {
    id: 'rec-effect',
    name: 'rec-effect',
    begins: 0,
    ends: 0,
    span: () => ({ startMs: 0, endMs: 3000 }),
    begin: () => void (effect.begins += 1),
    end: () => void (effect.ends += 1),
  };
  return effect;
}
export interface WorldOptions {
  mode?: HauntMode;
  makeHaunts(now: () => number): Haunt[];
  effects?: ReturnEffect[];
  regions?: Regions | (() => Regions | undefined);
  reading?: (base: FakeReading) => ReadingContext;
  /** Value returned by every `extraRandom` draw. Default 0.25. */
  extra?: number;
}
export function createWorld(options: WorldOptions) {
  const { clock, scheduler } = createFakeTime(START_MS);
  const audio = createFakeAudioContextFactory(clock);
  const root = document.createElement('div');
  const left = document.createElement('div');
  const right = document.createElement('div');
  root.append(left, right);
  document.body.append(root);
  const gate: Gate = createGate({
    audio: { createAudioContext: audio.create, eventTarget: new EventTarget() },
    hosts: { root, left, right },
    storage: null,
    storageEvents: null,
    reducedMotion: createReducedMotion(createFakeMatchMedia(false).matchMedia),
    scheduler,
  });
  const settings = createSettingsStore(null);
  settings.set({ mode: options.mode ?? 'classic', noticeSeen: true });
  const fakeReading = createFakeReading({ chapterKey: 'A' });
  const reading = options.reading ? options.reading(fakeReading) : fakeReading;
  const haunts = options.makeHaunts(() => clock.now());
  let listener: ((s: AttentionSignalLike) => void) | null = null;
  const engine = createHauntEngine({
    subscribeSignal(cb) {
      listener = cb;
      cb({ value: 'present', timestamp: clock.now() });
      return () => void (listener = null);
    },
    haunts,
    gate,
    settings,
    clock,
    scheduler,
    random: () => 0.5,
    extraRandom: () => options.extra ?? 0.25,
    warn: (msg) => {
      throw new Error(`unexpected warning: ${msg}`);
    },
    reading,
    effects: options.effects,
    regions: options.regions,
  });
  engine.start();
  const send = (value: 'present' | 'away'): void => listener?.({ value, timestamp: clock.now() });
  return {
    engine, gate, settings, clock, scheduler, haunts, reading: fakeReading,
    away: () => send('away'),
    present: () => send('present'),
    advance: (ms: number) => scheduler.advance(ms),
    cleanup: () => {
      engine.stop();
      gate.dispose();
      root.remove();
    },
  };
}
