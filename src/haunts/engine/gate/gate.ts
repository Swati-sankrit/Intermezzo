/**
 * Safety_Gate: ties the pure plan (plan.ts) to the audio and visual adapters.
 * On any change (a haunt's request, the cap, sound on/off, unlock, reduced motion) the
 * whole plan is recomputed. Haunts only ever see `AudioOut` and `VisualOut`; every gain
 * they ask for passes through `scaleGains` before it reaches a channel.
 */
import { KEYS } from '../settings';
import type { AudioOut, Gate, GatePort } from '../types';
import { createAudioAdapter } from './audioAdapter';
import type { AudioChannel, RampKind } from './audioTypes';
import type { GateDeps } from './gateTypes';
import { wrapVisual, type PortVisual } from './gatePort';
import { allocateFlashRates, effectiveRequests, parseVolumeCap, planFadeOut, scaleGains } from './plan';
import { createVisualAdapter } from './visualAdapter';

export type { GateDeps, StorageEventTarget } from './gateTypes';

interface PortRecord {
  readonly id: string;
  readonly channel: AudioChannel;
  readonly pv: PortVisual;
  readonly closeVisual: () => void;
  requested: number;
  /** Last target sent to the channel; new channels start silent. */
  sent: number;
  faded: boolean;
  closed: boolean;
}

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

  const isReduced = (): boolean => osReduced || appReduced;

  function planAudio(kind: RampKind, fadeMs?: number): void {
    const requests = [...ports].map((p) => ({ key: p.id, gain: p.faded ? 0 : p.requested }));
    const effective = effectiveRequests(requests, soundOn, audio.isReady());
    const scaled = scaleGains(effective, cap);
    for (const p of ports) {
      const target = scaled.find((r) => r.key === p.id)?.gain ?? 0;
      if (target === p.sent) continue;
      p.sent = target;
      p.channel.setGain(target, { kind, requestedMs: fadeMs, reduced: isReduced() });
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

  const offRequest = visual.onRequestChange(planVisual);
  const offReady = audio.onReadyChange(() => planAudio('fade'));
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
    cap = next;
    planAudio('cap');
  }

  function closePort(p: PortRecord): void {
    if (p.closed) return;
    p.closed = true;
    ports.delete(p);
    p.channel.close();
    p.closeVisual();
    planAudio('fade');
    planVisual();
  }

  /** Per-port part of every fade-out: mark the port faded and fade its visuals. */
  function fadePort(p: PortRecord, ms: number): void {
    p.faded = true;
    p.pv.fadeOut(ms);
  }

  function replanAfterFade(ms: number): void {
    planAudio('fade', ms);
    planVisual();
  }

  function open(hauntId: string): GatePort {
    const channel = audio.openChannel();
    const vch = visual.openChannel();
    const pv = wrapVisual(vch.visual);
    const rec: PortRecord = {
      id: `${nextId++}:${hauntId}`, channel, pv, closeVisual: () => vch.close(), requested: 0, sent: 0, faded: false, closed: false,
    };
    ports.add(rec);
    const out: AudioOut = {
      whenReady: (cb) => channel.whenReady(cb),
      setGain(requested) {
        if (rec.closed || rec.faded) return;
        rec.requested = Number.isFinite(requested) ? requested : 0;
        planAudio('fade');
      },
    };
    const port: GatePort = {
      audio: out,
      visual: pv.visual,
      fadeOut(ms) {
        if (rec.closed) return;
        const planned = planFadeOut(ms);
        fadePort(rec, planned);
        replanAfterFade(planned);
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
      replanAfterFade(ms);
      return ms;
    },
    setSoundEnabled(on) {
      if (soundOn === on) return;
      soundOn = on;
      planAudio(on ? 'fade' : 'soundOff');
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
