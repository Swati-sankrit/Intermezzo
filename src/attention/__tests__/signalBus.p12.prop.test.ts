/**
 * Feature: attention-signal, Property 12: Signal bus delivery rules
 *
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.8, 5.10, 5.11**
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createSignalBus } from '../signalBus';
import type { AttentionSignal, AttentionValue } from '../types';

const NUM_RUNS = 500;

const arbValue: fc.Arbitrary<AttentionValue> = fc.constantFrom('present', 'away');
const arbTs = fc.oneof(
  { weight: 8, arbitrary: fc.integer({ min: 0, max: 1000 }) },
  { weight: 1, arbitrary: fc.constant(Number.NaN) },
);
const arbSignal: fc.Arbitrary<AttentionSignal> = fc.record({ value: arbValue, timestamp: arbTs });
const arbInitial: fc.Arbitrary<AttentionSignal> = fc.record({
  value: arbValue,
  timestamp: fc.integer({ min: 0, max: 1000 }),
});

/** Reference model of the publish rule. */
function modelNext(cur: AttentionSignal, next: AttentionSignal): AttentionSignal | null {
  if (next.value === cur.value) return null;
  return { value: next.value, timestamp: next.timestamp >= cur.timestamp ? next.timestamp : cur.timestamp };
}

type Op =
  | { kind: 'publish'; signal: AttentionSignal }
  | { kind: 'subscribe'; throws: boolean }
  | { kind: 'unsubscribe'; pick: number }
  | { kind: 'clear' };

const arbOp: fc.Arbitrary<Op> = fc.oneof(
  { weight: 6, arbitrary: arbSignal.map((signal): Op => ({ kind: 'publish', signal })) },
  { weight: 3, arbitrary: fc.boolean().map((throws): Op => ({ kind: 'subscribe', throws })) },
  { weight: 2, arbitrary: fc.nat(20).map((pick): Op => ({ kind: 'unsubscribe', pick })) },
  { weight: 1, arbitrary: fc.constant<Op>({ kind: 'clear' }) },
);

interface Sub {
  id: number;
  throws: boolean;
  received: AttentionSignal[];
  unsub: () => void;
  active: boolean;
}

describe('Property 12: Signal bus delivery rules', () => {
  it('matches a reference model for any interleaving of subscribe, unsubscribe, publish, clear and throwing subscribers', () => {
    fc.assert(
      fc.property(arbInitial, fc.array(arbOp, { maxLength: 60 }), (initial, ops) => {
        const bus = createSignalBus(initial);
        let model = initial;
        const subs: Sub[] = [];
        const order: number[] = []; // ids of active subscribers, in subscription order
        const expected = new Map<number, AttentionSignal[]>();

        for (const op of ops) {
          if (op.kind === 'subscribe') {
            const sub: Sub = { id: subs.length, throws: op.throws, received: [], unsub: () => {}, active: true };
            sub.unsub = bus.subscribe((s) => {
              sub.received.push(s);
              if (sub.throws) throw new Error('boom');
            });
            subs.push(sub);
            order.push(sub.id);
            expected.set(sub.id, [model]); // current signal delivered once, to this subscriber only
          } else if (op.kind === 'unsubscribe') {
            const live = subs.filter((s) => s.active);
            if (live.length > 0) {
              const target = live[op.pick % live.length];
              target.unsub();
              target.active = false;
              order.splice(order.indexOf(target.id), 1);
            }
          } else if (op.kind === 'clear') {
            bus.clear();
            for (const s of subs) s.active = false;
            order.length = 0;
          } else {
            const next = modelNext(model, op.signal);
            bus.publish(op.signal);
            if (next) {
              model = next;
              for (const id of order) expected.get(id)!.push(next);
            }
          }
          expect(bus.current()).toEqual(model);
        }

        for (const s of subs) {
          expect(s.received).toEqual(expected.get(s.id));
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('subscribe delivers the current signal exactly once, to that subscriber only', () => {
    fc.assert(
      fc.property(arbInitial, fc.array(arbSignal, { maxLength: 20 }), (initial, pubs) => {
        const bus = createSignalBus(initial);
        const first: AttentionSignal[] = [];
        bus.subscribe((s) => first.push(s));
        for (const p of pubs) bus.publish(p);
        const firstCount = first.length;
        const cur = bus.current();
        const second: AttentionSignal[] = [];
        bus.subscribe((s) => second.push(s));
        expect(second).toEqual([cur]);
        expect(first.length).toBe(firstCount);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('publishing an unchanged value is a no-op: no notification and the timestamp is unchanged', () => {
    fc.assert(
      fc.property(arbInitial, arbTs, (initial, ts) => {
        const bus = createSignalBus(initial);
        const got: AttentionSignal[] = [];
        bus.subscribe((s) => got.push(s));
        bus.publish({ value: initial.value, timestamp: ts });
        expect(got).toEqual([initial]);
        expect(bus.current()).toEqual(initial);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('a changed value notifies each subscriber exactly once, in subscription order', () => {
    fc.assert(
      fc.property(arbInitial, fc.integer({ min: 1, max: 8 }), arbTs, (initial, n, ts) => {
        const bus = createSignalBus(initial);
        const log: number[] = [];
        for (let i = 0; i < n; i++) {
          bus.subscribe((s) => {
            if (s.value !== initial.value) log.push(i);
          });
        }
        bus.publish({ value: initial.value === 'present' ? 'away' : 'present', timestamp: ts });
        expect(log).toEqual(Array.from({ length: n }, (_, i) => i));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('timestamps never decrease, notifications alternate values, and the same callback subscribed twice is notified twice', () => {
    fc.assert(
      fc.property(arbInitial, fc.array(arbSignal, { maxLength: 40 }), (initial, pubs) => {
        const bus = createSignalBus(initial);
        const got: AttentionSignal[] = [];
        const cb = (s: AttentionSignal) => got.push(s);
        bus.subscribe(cb);
        bus.subscribe(cb);
        let last = bus.current().timestamp;
        for (const p of pubs) {
          bus.publish(p);
          const t = bus.current().timestamp;
          expect(t).toBeGreaterThanOrEqual(last);
          last = t;
        }
        // Two subscriptions: every notification appears twice in a row.
        expect(got.length % 2).toBe(0);
        const distinct = got.filter((_, i) => i % 2 === 0);
        expect(got.filter((_, i) => i % 2 === 1)).toEqual(distinct);
        for (let i = 1; i < distinct.length; i++) {
          expect(distinct[i].value).not.toBe(distinct[i - 1].value);
          expect(distinct[i].timestamp).toBeGreaterThanOrEqual(distinct[i - 1].timestamp);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('a throwing subscriber does not stop later subscribers or change the current value', () => {
    fc.assert(
      fc.property(
        arbInitial,
        fc.array(arbSignal, { maxLength: 20 }),
        fc.array(fc.boolean(), { minLength: 1, maxLength: 6 }),
        (initial, pubs, throwFlags) => {
          const bus = createSignalBus(initial);
          const plain = createSignalBus(initial);
          const logs: AttentionSignal[][] = throwFlags.map(() => []);
          throwFlags.forEach((throws, i) => {
            bus.subscribe((s) => {
              logs[i].push(s);
              if (throws) throw new Error('boom');
            });
          });
          for (const p of pubs) {
            bus.publish(p);
            plain.publish(p);
            expect(bus.current()).toEqual(plain.current());
          }
          for (const log of logs) expect(log).toEqual(logs[0]);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('clear() removes every subscriber and unsubscribe stops delivery', () => {
    fc.assert(
      fc.property(arbInitial, fc.array(arbSignal, { minLength: 1, maxLength: 20 }), (initial, pubs) => {
        const bus = createSignalBus(initial);
        const cleared: AttentionSignal[] = [];
        const dropped: AttentionSignal[] = [];
        bus.subscribe((s) => cleared.push(s));
        const unsub = bus.subscribe((s) => dropped.push(s));
        unsub();
        bus.clear();
        for (const p of pubs) bus.publish(p);
        expect(cleared).toEqual([initial]);
        expect(dropped).toEqual([initial]);
        // Calling unsubscribe after clear is harmless.
        expect(() => unsub()).not.toThrow();
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('a reentrant publish does not reorder delivery: every subscriber sees the same sequence', () => {
    fc.assert(
      fc.property(
        arbInitial,
        fc.array(arbSignal, { minLength: 1, maxLength: 15 }),
        fc.array(arbSignal, { maxLength: 6 }),
        fc.integer({ min: 2, max: 5 }),
        fc.nat(4),
        (initial, outer, inner, n, reenterAt) => {
          const bus = createSignalBus(initial);
          const logs: AttentionSignal[][] = Array.from({ length: n }, () => []);
          const who = reenterAt % n;
          let pending = [...inner];
          let subscribing = true;
          logs.forEach((log, i) => {
            bus.subscribe((s) => {
              log.push(s);
              // Publish from inside a callback (not during the initial delivery).
              if (!subscribing && i === who && pending.length > 0) {
                const p = pending.shift() as AttentionSignal;
                bus.publish(p);
              }
            });
          });
          subscribing = false;
          for (const p of outer) bus.publish(p);

          for (const log of logs) expect(log).toEqual(logs[0]);
          const seq = logs[0];
          expect(seq[0]).toEqual(initial);
          for (let i = 1; i < seq.length; i++) {
            expect(seq[i].value).not.toBe(seq[i - 1].value);
            expect(seq[i].timestamp).toBeGreaterThanOrEqual(seq[i - 1].timestamp);
          }
          expect(seq[seq.length - 1]).toEqual(bus.current());
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
