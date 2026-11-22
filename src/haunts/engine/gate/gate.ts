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
import { planGains } from './gainPlan';
import type { PortRecord } from './portRecord';
import { allocateFlashRates, effectiveRequests, parseVolumeCap, planFadeOut, scaleGains } from './plan';
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
    const requests = [...ports].map((p) => ({ key: p.id, gain: p.faded ? 0 : p.requested }));
    const effective = effectiveRequests(requests, soundOn, audio.isReady());
    const scaled = scaleGains(effective, cap);
    const nowSec = audio.now();
    const views = [...ports].map((p) => ({
      id: p.id, target: scaled.find((r) => r.key === p.id)?.gain ?? 0, sent: p.sent,
      current: p.channel.currentGain(), inFlight: p.channel.inFlight(), fadeMs: p.fadeMs,
    }));
    const plan = planGains({ nowSec, kind, reduced: isReduced(), capDropped, deadlineSec: capDeadlineSec, ports: views });
    capDeadlineSec = plan.deadlineSec;
    for (const a of plan.actions) {
      const p = [...ports].find((r) => r.id === a.id);
      if (p === undefined) continue;
      p.sent = a.target;
      p.channel.setGain(a.target, a.ramp);
    }
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
    p.fadeMs = ms;
    p.pv.fadeOut(ms);
  }

  function replanAfterFade(): void {
    planAudio('fade');
    planVisual();
  }

  function open(hauntId: string): GatePort {
    const channel = audio.openChannel();
    const vch = visual.openChannel();
    const pv = wrapVisual(vch.visual);
    const rec: PortRecord = {
      id: `${nextId++}:${hauntId}`, channel, pv, closeVisual: () => vch.close(), requested: 0, sent: 0, faded: false, closed: false, audibleOffs: new Set(),
    };
    ports.add(rec);
    const out: AudioOut = {
      whenReady: (cb) => channel.whenReady(cb),
      setGain(requested) {
        if (rec.closed || rec.faded) return;
        rec.requested = Number.isFinite(requested) ? requested : 0;
        planAudio('fade');
      },
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

  return {
    open,
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
    dispose() {
      if (disposed) return;
      disposed = true;
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
