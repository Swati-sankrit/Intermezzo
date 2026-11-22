/**
 * Signal bus: the single place that guarantees the delivery rules of
 * Requirement 5. Pure: no timers, no DOM, no clock. Delivery is synchronous.
 *
 * - subscribe delivers the current signal once, to that subscriber only.
 * - publish does nothing when the value is unchanged, and never lets the
 *   timestamp go backwards.
 * - a throwing subscriber neither stops the others nor changes the value.
 * - a publish made from inside a callback is queued, so every subscriber
 *   sees signals in the order they were accepted.
 */

import type { AttentionSignal, Unsubscribe } from './types';

export type { Unsubscribe };
type Subscriber = (s: AttentionSignal) => void;

export interface SignalBus {
  /** Delivers the current signal once to this subscriber only. */
  subscribe(cb: Subscriber): Unsubscribe;
  /** No-op if the value is unchanged; clamps the timestamp up to the current one. */
  publish(next: AttentionSignal): void;
  current(): AttentionSignal;
  /** Drops every subscriber. */
  clear(): void;
}

function safeCall(cb: Subscriber, signal: AttentionSignal): void {
  try {
    cb(signal);
  } catch {
    // A failing subscriber must not affect the others or the signal value.
  }
}

export function createSignalBus(initial: AttentionSignal): SignalBus {
  let signal: AttentionSignal = initial;
  // A Map keeps insertion order and gives each subscription its own identity,
  // even when the same callback function is subscribed twice.
  const subscribers = new Map<symbol, Subscriber>();
  const queue: AttentionSignal[] = [];
  let draining = false;

  function accept(next: AttentionSignal): void {
    if (next.value === signal.value) return;
    // `!(x >= y)` also catches NaN, which is clamped to the current timestamp.
    const timestamp = next.timestamp >= signal.timestamp ? next.timestamp : signal.timestamp;
    signal = { value: next.value, timestamp };

    const accepted = signal;
    const snapshot = Array.from(subscribers.entries());
    for (const [id, cb] of snapshot) {
      // Skip anyone who unsubscribed (or was cleared) while this round ran.
      if (subscribers.get(id) !== cb) continue;
      safeCall(cb, accepted);
    }
  }

  return {
    subscribe(cb) {
      const id = Symbol('subscriber');
      subscribers.set(id, cb);
      safeCall(cb, signal);
      return () => {
        subscribers.delete(id);
      };
    },
    publish(next) {
      queue.push(next);
      if (draining) return;
      draining = true;
      try {
        while (queue.length > 0) accept(queue.shift() as AttentionSignal);
      } finally {
        draining = false;
      }
    },
    current: () => signal,
    clear() {
      subscribers.clear();
    },
  };
}
