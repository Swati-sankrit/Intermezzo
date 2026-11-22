/**
 * Audio adapter for the Safety_Gate. The only file in the project that touches
 * `ctx.destination`.
 *
 * Graph: channel GainNode (one per port) -> master GainNode -> DynamicsCompressorNode -> destination.
 * The volume cap is enforced by the gains the gate passes in (plan.ts). The compressor is a
 * safety limiter for filter resonance peaks, not the guarantee.
 */
import { applyGain, attach, buildGraph, newRecord, type ChannelRecord, type Graph } from './audioGraph';
import { valueAt } from './gainSchedule';
import type { AudioAdapter, AudioAdapterDeps, UnlockEvent } from './audioTypes';

export { CAP_RAMP_MS, SOUND_OFF_RAMP_MS, LIMITER } from './audioTypes';
export type {
  AudioAdapter, AudioAdapterDeps, AudioChannel, GainRamp, RampKind, ReadyCallback, UnlockTarget,
} from './audioTypes';

const UNLOCK_EVENTS: readonly UnlockEvent[] = ['pointerdown', 'keydown'];

export function createAudioAdapter(deps: AudioAdapterDeps): AudioAdapter {
  let graph: Graph | null = null;
  let ready = false;
  let armed = false;
  let disposed = false;
  const channels = new Set<ChannelRecord>();
  const readyListeners = new Set<(ready: boolean) => void>();

  function fireWaiters(): void {
    for (const rec of [...channels]) {
      if (rec.node === null || rec.restricted === null) continue;
      for (const cb of [...rec.waiters]) {
        rec.waiters.delete(cb);
        try {
          cb(rec.restricted);
        } catch (e) {
          deps.warn?.(`audio ready callback threw: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
  }

  function setReady(next: boolean): void {
    if (ready === next) return;
    ready = next;
    for (const cb of [...readyListeners]) cb(next);
    if (next) {
      disarm();
      if (graph !== null) fireWaiters();
    } else if (!disposed) {
      arm(); // e.g. `interrupted`: wait for a later gesture
    }
  }

  function checkState(): void {
    setReady(graph !== null && graph.ctx.state === 'running');
  }

  function unlock(): void {
    if (disposed) return;
    if (graph === null) {
      graph = buildGraph(deps.createAudioContext);
      graph?.ctx.addEventListener('statechange', checkState);
    }
    if (graph === null) return; // cannot be created: stay quiet, try on a later gesture
    const g = graph;
    for (const rec of channels) if (rec.node === null) attach(g, rec);
    if (g.ctx.state === 'running') {
      checkState();
      return;
    }
    g.ctx.resume().then(checkState, () => {
      // Rejected (blocked or closed): stay locked; the listener is still attached.
    });
  }

  function arm(): void {
    if (armed || deps.eventTarget === null) return;
    armed = true;
    for (const type of UNLOCK_EVENTS) deps.eventTarget.addEventListener(type, unlock, true);
  }

  function disarm(): void {
    if (!armed || deps.eventTarget === null) return;
    armed = false;
    for (const type of UNLOCK_EVENTS) deps.eventTarget.removeEventListener(type, unlock, true);
  }

  arm();

  return {
    openChannel() {
      const rec = newRecord();
      channels.add(rec);
      if (graph !== null) attach(graph, rec);
      return {
        whenReady(cb) {
          if (rec.closed) return () => {};
          rec.waiters.add(cb);
          if (ready && graph !== null && rec.node !== null) fireWaiters();
          return () => void rec.waiters.delete(cb);
        },
        setGain(target, ramp) {
          if (rec.closed) return;
          if (graph !== null && rec.node !== null) applyGain(graph.ctx, rec, target, ramp);
          else rec.pending = { target, ramp };
        },
        currentGain() {
          if (rec.closed || graph === null || rec.node === null) return 0;
          return valueAt(rec.sched, graph.ctx.currentTime);
        },
        inFlight() {
          if (rec.closed || graph === null || rec.node === null) return null;
          if (!(graph.ctx.currentTime < rec.sched.endTime)) return null;
          return { target: rec.sched.target, endSec: rec.sched.endTime };
        },
        close() {
          if (rec.closed) return;
          rec.closed = true;
          rec.waiters.clear();
          rec.pending = null;
          channels.delete(rec);
          if (rec.node !== null && graph !== null) {
            try {
              rec.node.disconnect(graph.master);
            } catch {
              // Already disconnected: nothing to undo.
            }
          }
          rec.node = null;
          rec.restricted = null;
        },
      };
    },
    unlock,
    isReady: () => ready,
    now: () => (graph === null ? 0 : graph.ctx.currentTime),
    onReadyChange(cb) {
      readyListeners.add(cb);
      return () => void readyListeners.delete(cb);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      disarm();
      readyListeners.clear();
      for (const rec of [...channels]) rec.waiters.clear();
      if (graph !== null) {
        graph.ctx.removeEventListener('statechange', checkState);
        graph.compressor.disconnect();
        graph.master.disconnect();
        if (graph.ctx.state !== 'closed') graph.ctx.close().catch(() => {});
      }
      ready = false;
    },
  };
}
