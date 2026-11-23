/**
 * Safety_Gate: ties the pure plan (plan.ts) to the audio and visual adapters.
 * On any change (a haunt's request, the cap, sound on/off, unlock, reduced motion) the
 * whole plan is recomputed. Haunts only ever see `AudioOut` and `VisualOut`; every gain
 * they ask for passes through `scaleGains` before it reaches a channel.
 */
import { KEYS } from '../settings';
import type { AudioOut, Gate, GatePort } from '../types';
import { createAudibleHub } from './audible';
import { createAudioAdapter } from './audioAdapter';
import type { RampKind } from './audioTypes';
import type { GateDeps } from './gateTypes';
import { wrapVisual } from './gatePort';
import { createReturnHost } from './gateReturn';
import { runAudioPass } from './audioPass';
import type { PortRecord } from './portRecord';
import { allocateFlashRates, parseVolumeCap, planFadeOut } from './plan';
import { createPortTicks } from './tickHost';
import { createVisualAdapter } from './visualAdapter';

export type { GateDeps, StorageEventTarget } from './gateTypes';

export function createGate(deps: GateDeps): Gate {
  const warn = deps.warn ?? (() => undefined);
  const audio = createAudioAdapter({ ...deps.audio, warn: deps.audio.warn ?? warn });
  const visual = createVisualAdapter({ hosts: deps.hosts, reducedMotion: deps.reducedMotion.get(), warn });
  const ports = new Set<PortRecord>();
  let soundOn = true;
  let osReduced = deps.reducedMotion.get();
  let appReduced = false;
  let disposed = false;
  let nextId = 1;

  // Narrow guard: one storage call only, never the parsing.
  function readCap(): number {
    let raw: string | null = null;
    try {
      raw = deps.storage?.getItem(KEYS.volumeCap) ?? null;
    } catch {
      raw = null;
    }
    return parseVolumeCap(raw);
  }
  let cap = readCap();
  /** The one pending cap deadline (audio seconds), or null (gainPlan.ts, rule 4). */
  let capDeadlineSec: number | null = null;

  const isReduced = (): boolean => osReduced || appReduced;

  /** Recompute every target, then apply the ramps chosen by `planGains` (see gainPlan.ts for the rules). */
  function planAudio(kind: RampKind, capDropped = false): void {
    capDeadlineSec = runAudioPass({
      ports: [...ports], kind, capDropped, deadlineSec: capDeadlineSec, soundOn, audioReady: audio.isReady(),
      cap, reduced: isReduced(), nowSec: audio.now(),
    });
  }

  function planVisual(): void {
    visual.applyRates(allocateFlashRates(visual.requests(), isReduced()));
  }

  function setReduced(): void {
    visual.setReducedMotion(isReduced());
    planAudio('fade');
    planVisual();
  }

  const audible = createAudibleHub(() => soundOn && audio.isReady(), warn);

  const offRequest = visual.onRequestChange(planVisual);
  const offReady = audio.onReadyChange(() => {
    planAudio('fade');
    audible.notify();
  });
  const offMotion = deps.reducedMotion.subscribe((on) => {
    osReduced = on;
    setReduced();
  });

  const onStorage = (event: { key: string | null }): void => {
    if (event.key === null || event.key === KEYS.volumeCap) refreshVolumeCap();
  };
  deps.storageEvents?.addEventListener('storage', onStorage);

  function refreshVolumeCap(): void {
    const next = readCap();
    if (next === cap) return;
    const dropped = next < cap;
    cap = next;
    planAudio('cap', dropped);
  }

  function closePort(p: PortRecord): void {
    if (p.closed) return;
    p.closed = true;
    p.ticks.cancelAll();
    ports.delete(p);
    for (const off of [...p.audibleOffs]) off();
    p.audibleOffs.clear();
    p.channel.close();
    p.closeVisual();
    planAudio('fade');
    planVisual();
  }

  /** Per-port part of every fade-out: mark the port faded and fade its visuals. */
  function fadePort(p: PortRecord, ms: number): void {
    p.faded = true;
    p.ticks.cancelAll();
    p.fadeMs = ms;
    p.fadeEndSec = Math.min(p.fadeEndSec ?? Infinity, audio.now() + ms / 1000); // a later fade never extends the deadline
    p.pv.fadeOut(ms);
  }

  function replanAfterFade(): void {
    planAudio('fade');
    planVisual();
  }

  function openPort(hauntId: string, jumpSound: boolean): GatePort {
    const channel = audio.openChannel({ jumpSound });
    const vch = visual.openChannel();
    const pv = wrapVisual(vch.visual);
    const rec: PortRecord = {
      id: `${nextId++}:${hauntId}`, channel, pv, closeVisual: () => vch.close(), requested: 0, sent: 0, faded: false, closed: false, audibleOffs: new Set(),
      ticks: createPortTicks(deps.scheduler, warn),
    };
    ports.add(rec);
    const out: AudioOut = {
      whenReady: (cb) => channel.whenReady(cb),
      setGain(requested) {
        if (rec.closed || rec.faded) return;
        rec.requested = Number.isFinite(requested) ? requested : 0;
        planAudio('fade');
      },
      onTick: (cb, periodMs) => rec.ticks.onTick(cb, periodMs),
      onAudibleChange(cb) {
        if (rec.closed) return () => {};
        const off = audible.subscribe(cb);
        rec.audibleOffs.add(off);
        return () => void (off(), rec.audibleOffs.delete(off));
      },
    };
    const port: GatePort = {
      audio: out,
      visual: pv.visual,
      fadeOut(ms) {
        if (rec.closed) return;
        const planned = planFadeOut(ms);
        fadePort(rec, planned);
        replanAfterFade();
      },
      close: () => closePort(rec),
    };
    if (disposed) closePort(rec);
    return port;
  }

  const returns = createReturnHost({ openPort, scheduler: deps.scheduler, root: deps.hosts.root, reduced: isReduced, warn });

  return {
    open: (hauntId) => openPort(hauntId, false),
    fadeOutAll(requestedMs) {
      const ms = planFadeOut(requestedMs);
      for (const p of ports) fadePort(p, ms);
      replanAfterFade();
      return ms;
    },
    setSoundEnabled(on) {
      if (soundOn === on) return;
      soundOn = on;
      planAudio(on ? 'fade' : 'soundOff');
      audible.notify();
    },
    setReducedMotion(on) {
      if (appReduced === on) return;
      appReduced = on;
      setReduced();
    },
    refreshVolumeCap,
    unlockAudio: () => audio.unlock(),
    beginReturnMoment: returns.begin,
    endReturnMoment: returns.end,
    openReturn: returns.open,
    dispose() {
      if (disposed) return;
      disposed = true;
      returns.dispose();
      audible.clear();
      for (const p of [...ports]) closePort(p);
      offRequest();
      offReady();
      offMotion();
      deps.storageEvents?.removeEventListener('storage', onStorage);
      audio.dispose();
      visual.dispose();
    },
  };
}
