/**
 * Feature: attention-signal, Property 13: Pause suppresses away, and resume
 * resets the accumulator
 *
 * Drives the REAL controller (Fallback_Mode, fake ports, fake clock) through
 * random scripts and checks the outcome against an independent model of the
 * requirements (no knowledge of controller internals).
 *
 * **Validates: Requirements 8.1, 8.2, 8.4, 8.5, 8.9, 8.10**
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createAttention } from '../controller';
import { DEFAULT_DEBOUNCE_MS, MIN_IDLE_LIMIT_MS } from '../config';
import type { AttentionSignal } from '../types';
import { fakePorts } from './fakes';

const NUM_RUNS = 400;

type Op =
  | { kind: 'start' }
  | { kind: 'stop' }
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'sample'; input: boolean }
  | { kind: 'advance'; ms: number }
  | { kind: 'hide' }
  | { kind: 'show' };

const arbAdvance = fc.oneof(
  { weight: 6, arbitrary: fc.integer({ min: 0, max: 600 }) },
  { weight: 4, arbitrary: fc.integer({ min: 600, max: 5000 }) },
  { weight: 1, arbitrary: fc.integer({ min: 55_000, max: 130_000 }) },
);

const arbOp: fc.Arbitrary<Op> = fc.oneof(
  { weight: 2, arbitrary: fc.constant<Op>({ kind: 'start' }) },
  { weight: 1, arbitrary: fc.constant<Op>({ kind: 'stop' }) },
  { weight: 3, arbitrary: fc.constant<Op>({ kind: 'pause' }) },
  { weight: 3, arbitrary: fc.constant<Op>({ kind: 'resume' }) },
  { weight: 3, arbitrary: fc.boolean().map((input): Op => ({ kind: 'sample', input })) },
  { weight: 8, arbitrary: arbAdvance.map((ms): Op => ({ kind: 'advance', ms })) },
  { weight: 3, arbitrary: fc.constant<Op>({ kind: 'hide' }) },
  { weight: 3, arbitrary: fc.constant<Op>({ kind: 'show' }) },
);

const arbControllerScript: fc.Arbitrary<Op[]> = fc.array(arbOp, { minLength: 1, maxLength: 60 });

interface Record {
  readonly signal: AttentionSignal;
  /** Clock time at which the callback ran. */
  readonly at: number;
  readonly initial: boolean;
  readonly pausedAtPublish: boolean;
  /** Latest resume time in this running session, or null. */
  readonly resumeT: number | null;
  /** True if the tab was inactive at any moment since that resume. */
  readonly hiddenSinceResume: boolean;
  /** Time of the last input at publish time. */
  readonly lastInput: number;
  /** Position in the single ordered sequence of calls and emissions. */
  readonly seq: number;
}

/** Paused interval by order: from the `pause()` call to the matching `resume()`/`stop()` call. */
interface Interval {
  readonly fromSeq: number;
  toSeq: number | null;
}

interface Outcome {
  readonly records: Record[];
  readonly intervals: Interval[];
  readonly failures: string[];
}

const START_MS = 1_000_000;

function execute(script: readonly Op[], skipNoops: boolean): Outcome {
  const fp = fakePorts(START_MS);
  const att = createAttention(fp.ports);
  const records: Record[] = [];
  const intervals: Interval[] = [];
  const failures: string[] = [];

  let running = false;
  let paused = false;
  let resumeT: number | null = null;
  let hiddenSinceResume = false;
  let lastInput = START_MS;
  let tabActive = true;
  let subCount = 0;
  let seq = 0;

  const fail = (msg: string): void => {
    failures.push(`t=${fp.clock.now() - START_MS}: ${msg}`);
  };

  const subscribe = (): void => {
    let first = true;
    subCount += 1;
    att.subscribe((signal) => {
      records.push({
        signal,
        at: fp.clock.now(),
        initial: first,
        pausedAtPublish: paused,
        resumeT,
        hiddenSinceResume,
        lastInput,
        seq: ++seq,
      });
      first = false;
    });
  };

  const guarded = (label: string, fn: () => void): boolean => {
    try {
      fn();
      return true;
    } catch (e) {
      fail(`${label} threw: ${String(e)}`);
      return false;
    }
  };

  for (const op of script) {
    const now = fp.clock.now();
    switch (op.kind) {
      case 'start': {
        if (running) break;
        if (!guarded('start', () => att.start())) break;
        running = true;
        paused = false;
        resumeT = null;
        hiddenSinceResume = false;
        subscribe();
        break;
      }
      case 'stop': {
        seq += 1;
        if (!guarded('stop', () => att.stop())) break;
        if (running && paused) {
          const open = intervals[intervals.length - 1];
          if (open && open.toSeq === null) open.toSeq = seq;
        }
        running = false;
        paused = false;
        resumeT = null;
        if (att.getStatus().paused) fail('status.paused still true after stop');
        if (fp.clock.activeIntervals() !== 0) fail('timer still scheduled after stop');
        if (fp.page.listenerCount !== 0) fail('page listener left after stop');
        break;
      }
      case 'pause': {
        const applies = running && !paused;
        if (!applies && skipNoops) break;
        const before = records.length;
        const prior = records[records.length - 1]?.signal;
        seq += 1;
        const pauseSeq = seq;
        if (!guarded('pause', () => att.pause())) break;
        if (!applies) {
          if (records.length !== before) fail('no-op pause published a signal');
          break;
        }
        paused = true;
        intervals.push({ fromSeq: pauseSeq, toSeq: null });
        if (prior?.value === 'away') {
          const last = records[records.length - 1];
          if (records.length === before || last === undefined) {
            fail('pause while away published nothing');
          } else if (last.signal.value !== 'present' || last.at !== now) {
            fail(`pause while away did not publish present at once: ${JSON.stringify(last)}`);
          }
        }
        break;
      }
      case 'resume': {
        const applies = running && paused;
        if (!applies && skipNoops) break;
        const before = records.length;
        seq += 1;
        const resumeSeq = seq;
        if (!guarded('resume', () => att.resume())) break;
        if (!applies) {
          if (records.length !== before) fail('no-op resume published a signal');
          break;
        }
        paused = false;
        const open = intervals[intervals.length - 1];
        if (open) open.toSeq = resumeSeq;
        resumeT = now;
        hiddenSinceResume = !tabActive;
        break;
      }
      case 'sample': {
        if (op.input) {
          fp.page.setLastInputT(now);
          lastInput = now;
        } else {
          fp.page.fireChange();
        }
        break;
      }
      case 'advance':
        fp.advance(op.ms);
        break;
      case 'hide':
        tabActive = false;
        if (resumeT !== null) hiddenSinceResume = true;
        fp.page.setTabActive(false);
        break;
      case 'show':
        tabActive = true;
        fp.page.setTabActive(true);
        break;
    }
    if (running && att.getStatus().paused !== paused) {
      fail(`status.paused=${String(att.getStatus().paused)} but expected ${String(paused)} after ${op.kind}`);
    }
  }
  void subCount;
  return { records, intervals, failures };
}

function checkProperty(script: readonly Op[]): string[] {
  const full = execute(script, false);
  const problems = [...full.failures];

  // Order check: no away between a pause() call and its matching resume()/stop() call.
  for (const r of full.records) {
    const ts = r.signal.timestamp;
    if (r.signal.value === 'away') {
      if (r.pausedAtPublish) problems.push(`away published while paused: ${JSON.stringify(r.signal)}`);
      for (const iv of full.intervals) {
        if (r.seq > iv.fromSeq && (iv.toSeq === null || r.seq < iv.toSeq)) {
          problems.push(
            `away (timestamp ${ts - START_MS}, seq ${r.seq}) emitted after pause() call (seq ${iv.fromSeq}) and before resume()/stop() (seq ${iv.toSeq === null ? 'none' : iv.toSeq})`,
          );
        }
      }
      if (r.resumeT !== null) {
        if (ts <= r.resumeT + DEFAULT_DEBOUNCE_MS) {
          problems.push(`away at ${ts - START_MS} not more than debounce after resume ${r.resumeT - START_MS}`);
        }
        if (!r.hiddenSinceResume && ts - Math.max(r.resumeT, r.lastInput) <= MIN_IDLE_LIMIT_MS) {
          problems.push(
            `idle away at ${ts - START_MS} before idle limit elapsed since max(resume ${r.resumeT - START_MS}, input ${r.lastInput - START_MS})`,
          );
        }
      }
    }
  }

  // Published timestamps never decrease.
  for (let i = 1; i < full.records.length; i++) {
    const prev = full.records[i - 1];
    const cur = full.records[i];
    if (prev && cur && cur.signal.timestamp < prev.signal.timestamp) {
      problems.push(`timestamp decreased: ${prev.signal.timestamp - START_MS} -> ${cur.signal.timestamp - START_MS}`);
    }
  }

  // Calls that do not apply change nothing: same signals as a run without them.
  const lean = execute(script, true);
  const key = (o: Outcome): string[] =>
    o.records.map((r) => `${r.signal.value}@${r.signal.timestamp}/${r.initial ? 'i' : 'p'}`);
  if (JSON.stringify(key(full)) !== JSON.stringify(key(lean))) {
    problems.push(`no-op calls changed the published signals: ${JSON.stringify(key(full))} vs ${JSON.stringify(key(lean))}`);
  }
  return problems;
}

describe('Property 13: Pause suppresses away, and resume resets the accumulator', () => {
  it('holds for any start/stop/pause/resume/sample/advance/hide/show script', () => {
    fc.assert(
      fc.property(arbControllerScript, (script) => {
        const problems = checkProperty(script);
        expect(problems).toEqual([]);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('stop from Paused_State shuts down and later signals are not delivered', () => {
    const fp = fakePorts(START_MS);
    const att = createAttention(fp.ports);
    const seen: AttentionSignal[] = [];
    att.start();
    att.subscribe((s) => seen.push(s));
    att.pause();
    expect(att.getStatus().paused).toBe(true);
    att.stop();
    expect(att.getStatus().paused).toBe(false);
    expect(fp.clock.activeIntervals()).toBe(0);
    expect(fp.page.disposed).toBe(true);
    const n = seen.length;
    fp.page.setTabActive(false);
    fp.advance(200_000);
    expect(seen.length).toBe(n);
    expect(() => {
      att.pause();
      att.resume();
    }).not.toThrow();
    expect(seen.length).toBe(n);
  });
});
