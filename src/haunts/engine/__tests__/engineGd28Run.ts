/**
 * Runner for Property 28 (engine.gd28.prop.test.ts).
 *
 * It drives the REAL `createHauntEngine` and the REAL Return controller (`returnMoment.ts`) with fake
 * lead haunts, fake layers, fake return effects, the fake gate, the fake scheduler, and the fake
 * reading, evidence and spoiler hosts from fakes.ts. The fake gate is used instead of the real one
 * because the real gate ends a Return_Moment itself at 3000 ms, which would hide a controller that
 * fails to end it. With the fake gate only the controller's own timers end the moment.
 *
 * The reference model below is written from the requirements and keeps its own state (signal, mode,
 * look-away start, chapter count). It reads the engine only through `getState()` and the fakes' records.
 */
import { createHauntEngine } from '../engine';
import { createSettingsStore } from '../settings';
import type { ReadingContext, ReturnEffect, ReturnPlan } from '../returnTypes';
import type { AttentionSignalLike, Haunt, HauntLevel, HauntMode, StartInfo } from '../types';
import { createFakeEvidenceHost, createFakeGate, createFakeReading, createFakeSpoilerHost, createFakeTime } from './fakes';
import { MODES, modesAllow } from './engineGd28Script';
import type { ModesSpec, Op, Script } from './engineGd28Script';

const START = 1_000_000;
/** Req 8.10 and 3.3: nothing excluded by a mode change, and no ambient effect, outlasts this. */
const FADE_WINDOW_MS = 800;
/** The longest end fade the gate may be asked for (Req 3.7: within 100 ms). */
const END_SLACK_MS = 100;
const HARD_END_MS = 3000;
/** Designed ambient fade requests at `present`: the plain return, the jump return, and the engine's own fade. */
const DESIGNED_FADES = [300, 600];

export interface Gd28Stats {
  momentStarted: boolean;
  abortedByAway: boolean;
  abortedByGentle: boolean;
  modeChangeMidMoment: boolean;
  minLevel3LayerStarted: boolean;
  cnLayerSkippedInGentle: boolean;
  chapterWithCallback: boolean;
  chapterWithoutCallback: boolean;
  returnToEarlierChapter: boolean;
  reducedDuringMoment: boolean;
  stopMidMoment: boolean;
}

interface Instance {
  readonly startedAt: number;
  readonly level: HauntLevel;
  readonly info: StartInfo | undefined;
  readonly epoch: number;
  stoppedAt: number | null;
  /** Time by which this instance must be stopped, set when it first runs against the rules. */
  deadline: number | null;
}
interface Rec {
  readonly haunt: Haunt;
  readonly spec: ModesSpec;
  readonly layer: boolean;
  readonly minLevel: 1 | 2 | 3;
  readonly instances: Instance[];
}
interface FxEvent {
  readonly kind: 'span' | 'begin' | 'end';
  readonly fx: number;
  readonly t: number;
  readonly active: boolean;
  readonly moment: number;
  readonly plan?: ReturnPlan;
  readonly span?: { startMs: number; endMs: number } | null;
}
interface FxState {
  span: { startMs: number; endMs: number } | null;
  begin: number | null;
  end: number | null;
}
interface Moment {
  readonly idx: number;
  readonly begin: number;
  readonly mode: HauntMode;
  readonly reduced: boolean;
  readonly count: number;
  plan: ReturnPlan | null;
  endT: number | null;
  readonly fx: Map<number, FxState>;
}

type Kind = 'init' | 'present' | 'away' | 'timer' | 'mode' | 'chapter' | 'reduced' | 'arm' | 'stop' | 'idle';
interface Ctx {
  valueChanged?: boolean;
  expectBegin?: boolean;
  from?: HauntMode;
  to?: HauntMode;
}

function ok(cond: boolean, msg: () => string): asserts cond {
  if (!cond) throw new Error(`Property 28 violated: ${msg()}`);
}

export function runScript(script: Script): Gd28Stats {
  const { clock, scheduler } = createFakeTime(START);
  const init = script.initial;
  const store = createSettingsStore(null);
  store.set({ mode: init.mode, noticeSeen: init.armed });
  let settingsSubs = 0;
  const settings = {
    get: store.get,
    set: store.set,
    subscribe(cb: () => void) {
      settingsSubs++;
      const off = store.subscribe(cb);
      let done = false;
      return () => {
        if (done) return;
        done = true;
        settingsSubs--;
        off();
      };
    },
  };
  const listeners = new Set<(s: AttentionSignalLike) => void>();
  const chapterListeners = new Set<() => void>();
  const gate = createFakeGate();
  const evidence = createFakeEvidenceHost();
  const spoiler = createFakeSpoilerHost();
  const base = createFakeReading({ chapterKey: init.chapter, activeParagraph: 'The candle burned low in the quiet hall.' });
  const reading: ReadingContext = script.chapterCallback
    ? {
        ...base,
        subscribeChapter(cb) {
          chapterListeners.add(cb);
          return () => void chapterListeners.delete(cb);
        },
      }
    : base;

  // ------------------------------------------------------------ model
  const m = {
    stopped: false,
    armed: init.armed,
    mode: init.mode,
    reduced: init.reduced,
    signal: null as 'present' | 'away' | null,
    awayStart: null as number | null,
    /** Reader's current chapter, and the chapter the engine last saw. */
    key: init.chapter,
    obsKey: init.chapter,
    count: 0,
    step: 0,
    epoch: 0,
  };
  const seenKeys = new Set([init.chapter]);
  const stats: Gd28Stats = {
    momentStarted: false,
    abortedByAway: false,
    abortedByGentle: false,
    modeChangeMidMoment: false,
    minLevel3LayerStarted: false,
    cnLayerSkippedInGentle: false,
    chapterWithCallback: false,
    chapterWithoutCallback: false,
    returnToEarlierChapter: false,
    reducedDuringMoment: false,
    stopMidMoment: false,
  };
  const leadsAllowed = (mode: HauntMode): boolean => script.leads.some((s) => modesAllow(s, mode));
  /** Level the engine may have reached (lower) and may not exceed (upper). Timers fire one at a time, so the lower bound is strict. */
  function levelBounds(now: number): [number, number] {
    if (!m.armed || m.signal !== 'away' || m.awayStart === null || !leadsAllowed(m.mode)) return [0, 0];
    if (m.mode === 'gentle') return [1, 1];
    const e = now - m.awayStart;
    return [e > 12_000 ? 3 : e > 5000 ? 2 : 1, e >= 12_000 ? 3 : e >= 5000 ? 2 : 1];
  }
  const syncKey = (): void => {
    if (m.key !== m.obsKey) {
      m.obsKey = m.key;
      m.count = 0;
    }
  };
  const startLookAway = (startedAt: number): void => {
    syncKey();
    m.step = Math.min(4, m.count);
    m.count += 1;
    m.awayStart = startedAt;
    m.epoch += 1;
  };

  // ------------------------------------------------------------ fakes
  const recs: Rec[] = [];
  const recFor = (id: string, spec: ModesSpec, layer: boolean, minLevel: 1 | 2 | 3): Rec => {
    const rec: Rec = {
      spec,
      layer,
      minLevel,
      instances: [],
      haunt: {
        id,
        name: id,
        role: layer ? 'layer' : undefined,
        modes: MODES[spec],
        minLevel: layer ? minLevel : undefined,
        start: (level, _audio, _visual, info) =>
          void rec.instances.push({ startedAt: clock.now(), level, info, epoch: m.epoch, stoppedAt: null, deadline: null }),
        setLevel: () => undefined,
        stop: () => {
          const open = rec.instances[rec.instances.length - 1];
          ok(open !== undefined && open.stoppedAt === null, () => `${id} stopped while not started`);
          open.stoppedAt = clock.now();
        },
      },
    };
    recs.push(rec);
    return rec;
  };
  script.leads.forEach((spec, i) => recFor(`lead${i}`, spec, false, 1));
  script.layers.forEach((spec, i) => recFor(`layer${i}`, spec.modes, true, spec.minLevel));

  const fxLog: FxEvent[] = [];
  const momentCount = (): number => gate.calls.filter((c) => c.type === 'beginReturnMoment').length;
  const effects: ReturnEffect[] = script.effects.map((spec, i) => {
    const log = (kind: FxEvent['kind'], extra: Partial<FxEvent> = {}): void =>
      void fxLog.push({ kind, fx: i, t: clock.now(), active: gate.returnActive, moment: momentCount(), ...extra });
    return {
      id: `fx${i}`,
      name: `fx${i}`,
      modes: MODES[spec.modes],
      span(plan) {
        const s = spec.span;
        const span = s.kind === 'full' ? { startMs: 0, endMs: plan.durationMs } : s.kind === 'none' ? null : { startMs: s.start, endMs: s.end };
        log('span', { plan, span });
        return span;
      },
      begin: () => log('begin'),
      end: () => log('end'),
    };
  });

  let rIdx = 0;
  let eIdx = 0;
  const engine = createHauntEngine({
    subscribeSignal(cb) {
      listeners.add(cb);
      if (init.signal !== null) cb({ value: init.signal, timestamp: clock.now() - init.ageMs });
      return () => void listeners.delete(cb);
    },
    haunts: recs.map((r) => r.haunt),
    gate,
    settings,
    clock,
    scheduler,
    random: () => script.random[rIdx++ % script.random.length],
    extraRandom: () => script.extra[eIdx++ % script.extra.length],
    warn: (msg) => {
      throw new Error(`unexpected warning: ${msg}`);
    },
    reading,
    evidence,
    spoiler,
    reducedMotion: () => m.reduced,
    effects,
  });

  // ------------------------------------------------------------ step bookkeeping
  const moments: Moment[] = [];
  let cur: Moment | null = null;
  const startsInEpoch = new Map<string, number>();
  const openOf = (r: Rec): Instance | null => {
    const last = r.instances[r.instances.length - 1];
    return last !== undefined && last.stoppedAt === null ? last : null;
  };
  const portsOf = (r: Rec) => gate.ports.filter((p) => p.hauntId === r.haunt.id);
  /** The rules say this haunt may keep running now. A layer also needs a lead and a mode other than Gentle. */
  const wanted = (r: Rec): boolean =>
    m.armed && m.signal === 'away' && modesAllow(r.spec, m.mode) && (!r.layer || (m.mode !== 'gentle' && leadsAllowed(m.mode)));

  interface Snap {
    stopped: boolean;
    active: boolean;
    cur: Moment | null;
    gateLen: number;
    fxLen: number;
    evShown: number;
    spCards: number;
    counts: number[];
    faded: Set<string>;
  }
  function snap(): Snap {
    const faded = new Set<string>();
    for (const r of recs) {
      const open = openOf(r);
      if (open !== null && (portsOf(r)[r.instances.length - 1]?.fadeOuts.length ?? 0) > 0) faded.add(`${r.haunt.id}#${r.instances.length - 1}`);
    }
    return {
      stopped: m.stopped,
      active: gate.returnActive,
      cur,
      gateLen: gate.calls.length,
      fxLen: fxLog.length,
      evShown: evidence.shown.length,
      spCards: spoiler.cards.length,
      counts: recs.map((r) => r.instances.length),
      faded,
    };
  }

  function checkStopped(pre: Snap): void {
    const st = engine.getState();
    ok(st.level === 0 && st.leadId === null && st.companionId === null && st.running.length === 0, () => 'engine not calm after stop()');
    ok(recs.every((r) => openOf(r) === null), () => 'a haunt still runs after stop()');
    ok(gate.openPorts().length === 0, () => 'a port is still open after stop()');
    ok(!gate.returnActive && cur === null, () => 'a Return_Moment still runs after stop()');
    ok(scheduler.pendingCount === 0, () => `${scheduler.pendingCount} timer(s) pending after stop()`);
    ok(listeners.size === 0 && settingsSubs === 0 && chapterListeners.size === 0, () => 'a subscription remains after stop()');
    if (!pre.stopped) return;
    ok(gate.calls.length === pre.gateLen, () => 'the gate was called after stop()');
    ok(fxLog.length === pre.fxLen, () => 'an effect ran after stop()');
    ok(recs.every((r, i) => r.instances.length === pre.counts[i]), () => 'a haunt started after stop()');
  }

  function finishMoment(mo: Moment, kind: Kind, ctx: Ctx, now: number, endCall: { fadeMs: number | undefined }): void {
    mo.endT = now;
    const d = mo.plan?.durationMs ?? 0;
    let reason: 'away' | 'gentle' | 'stop' | 'natural';
    if (kind === 'away' && ctx.valueChanged === true) reason = 'away';
    else if (kind === 'mode' && ctx.to === 'gentle' && ctx.from !== 'gentle') reason = 'gentle';
    else if (kind === 'stop') reason = 'stop';
    else if (kind === 'timer') reason = 'natural';
    else throw new Error(`Property 28 violated: the Return_Moment began at t=${mo.begin - START} ended after ${kind} at t=${now - START}, which may not end it`);
    const at = `Return_Moment ${mo.idx} (began t=${mo.begin - START}) ended by ${reason} at t=${now - START}`;
    const fade = endCall.fadeMs;
    if (reason === 'natural') {
      ok(fade === undefined || fade <= END_SLACK_MS, () => `${at}: end fade ${fade}`);
      ok(now - mo.begin <= HARD_END_MS && now - mo.begin <= d && now - mo.begin >= d - END_SLACK_MS, () => `${at}: planned ${d} ms`);
    } else if (reason === 'away') {
      ok(fade !== undefined && fade <= END_SLACK_MS, () => `${at}: end fade ${fade} is over 100 ms (Req 3.7)`);
      stats.abortedByAway = true;
    } else if (reason === 'gentle') {
      ok(fade !== undefined && fade <= FADE_WINDOW_MS, () => `${at}: end fade ${fade} is over 800 ms (Req 8.10)`);
      stats.abortedByGentle = true;
    } else {
      ok(fade === undefined || fade <= END_SLACK_MS, () => `${at}: end fade ${fade}`);
      stats.stopMidMoment = true;
    }
    for (const [i, st] of mo.fx) {
      ok((st.begin === null) === (st.end === null), () => `${at}: effect fx${i} began ${st.begin} and ended ${st.end}`);
      ok(st.end === null || st.end <= now, () => `${at}: effect fx${i} ended after the moment`);
    }
    for (const [i, spec] of script.effects.entries()) {
      if (!modesAllow(spec.modes, mo.mode)) {
        ok(!mo.fx.has(i), () => `${at}: fx${i} is not allowed in ${mo.mode} but was given a span`);
        continue;
      }
      const st = mo.fx.get(i);
      ok(st !== undefined, () => `${at}: fx${i} is allowed in ${mo.mode} but its span was not asked for`);
      if (reason === 'natural') {
        ok((st.span !== null) === (st.begin !== null), () => `${at}: fx${i} span ${JSON.stringify(st.span)} but began ${st.begin}`);
      }
    }
    cur = null;
  }

  function processEffects(pre: Snap): void {
    for (const e of fxLog.slice(pre.fxLen)) {
      const mo = moments[e.moment - 1];
      ok(mo !== undefined && mo.endT === null && e.active, () => `effect fx${e.fx} ${e.kind} at t=${e.t - START} outside a running Return_Moment`);
      const spec = script.effects[e.fx];
      ok(modesAllow(spec.modes, mo.mode), () => `fx${e.fx} ${e.kind} in ${mo.mode}, which its modes exclude`);
      if (e.kind === 'span') {
        ok(!mo.fx.has(e.fx), () => `fx${e.fx} span asked twice in one moment`);
        mo.fx.set(e.fx, { span: e.span ?? null, begin: null, end: null });
        mo.plan ??= e.plan ?? null;
        continue;
      }
      const st = mo.fx.get(e.fx);
      ok(st !== undefined && st.span !== null, () => `fx${e.fx} ${e.kind} with no span`);
      const d = mo.plan?.durationMs ?? 0;
      const s = st.span.startMs;
      const at = `fx${e.fx} ${e.kind} at +${e.t - mo.begin} ms (span ${s}..${st.span.endMs}, plan ${d} ms)`;
      ok(e.t >= mo.begin && e.t <= mo.begin + HARD_END_MS && e.t <= mo.begin + d, () => at);
      if (e.kind === 'begin') {
        ok(st.begin === null, () => `${at}: began twice`);
        st.begin = e.t;
        ok(e.t >= mo.begin + Math.min(Math.max(s, 0), d - END_SLACK_MS), () => `${at}: began before its start`);
        if (s >= 0 && s <= d - END_SLACK_MS) ok(e.t === mo.begin + s, () => `${at}: began late`);
      } else {
        ok(st.begin !== null && st.end === null && e.t >= st.begin, () => `${at}: end without exactly one begin`);
        st.end = e.t;
        const endMs = st.span.endMs;
        if (endMs < d - END_SLACK_MS && s <= d - END_SLACK_MS) {
          ok(e.t <= mo.begin + Math.max(s, 0, endMs), () => `${at}: ended after its span end`);
        }
      }
    }
  }

  function checkPlan(mo: Moment): void {
    const p = mo.plan;
    ok(p !== null, () => `Return_Moment ${mo.idx}: the always-on effect never saw the plan`);
    const at = `Return_Moment ${mo.idx}`;
    ok(p.durationMs > 0 && p.durationMs <= HARD_END_MS, () => `${at}: duration ${p.durationMs}`);
    ok((p.fade !== null) === mo.reduced, () => `${at}: fade ${JSON.stringify(p.fade)} with reduced motion ${mo.reduced}`);
    if (p.jumpscare !== null) ok(p.jumpscare.render === (mo.reduced ? 'fade' : 'full'), () => `${at}: jumpscare render ${p.jumpscare?.render}`);
    const expected = Math.min(4, Math.max(0, mo.count - 1));
    ok(p.ghostStep === expected, () => `${at}: ghost step ${p.ghostStep}, expected ${expected}`);
  }

  function checkStarts(pre: Snap, now: number, at: string): void {
    recs.forEach((r, i) => {
      for (const inst of r.instances.slice(pre.counts[i])) {
        const id = r.haunt.id;
        ok(m.armed && m.signal === 'away', () => `${at}: ${id} started while armed=${m.armed}, signal=${m.signal} (Req 9.13)`);
        ok(modesAllow(r.spec, m.mode), () => `${at}: ${id} (modes ${r.spec}) started in ${m.mode}`);
        ok(inst.info !== undefined && inst.info.mode === m.mode, () => `${at}: ${id} start info mode ${inst.info?.mode}, expected ${m.mode}`);
        ok(inst.info?.ghostStep === m.step, () => `${at}: ${id} ghost step ${inst.info?.ghostStep}, expected ${m.step} (count ${m.count})`);
        ok(inst.info !== undefined && inst.info.roll >= 0 && inst.info.roll < 1, () => `${at}: ${id} roll ${inst.info?.roll}`);
        const [, upper] = levelBounds(now);
        ok(inst.level >= 1 && inst.level <= upper, () => `${at}: ${id} started at level ${inst.level}, model level at most ${upper}`);
        if (!r.layer) continue;
        ok(m.mode !== 'gentle', () => `${at}: layer ${id} started in Gentle (Req 1.14)`);
        ok(inst.level >= r.minLevel && upper >= r.minLevel, () => `${at}: layer ${id} (minLevel ${r.minLevel}) started at level ${inst.level}, model level at most ${upper}`);
        const key = `${id}@${inst.epoch}`;
        const n = (startsInEpoch.get(key) ?? 0) + 1;
        startsInEpoch.set(key, n);
        ok(n === 1, () => `${at}: layer ${id} started ${n} times in one look-away (Req 1.3)`);
        if (r.minLevel === 3) stats.minLevel3LayerStarted = true;
      }
    });
  }

  function checkRunning(pre: Snap, kind: Kind, ctx: Ctx, now: number, at: string, fadeAll: number[]): void {
    const [lower] = levelBounds(now);
    for (const r of recs) {
      const inst = openOf(r);
      if (inst === null) continue;
      const idx = r.instances.length - 1;
      if (inst.deadline === null && !wanted(r)) {
        let ms = FADE_WINDOW_MS;
        if (kind === 'present' && ctx.valueChanged === true && !pre.faded.has(`${r.haunt.id}#${idx}`)) {
          ok(fadeAll.length > 0, () => `${at}: ${r.haunt.id} was running at present but the gate was not asked to fade out`);
          ms = fadeAll[fadeAll.length - 1];
          ok(DESIGNED_FADES.includes(ms), () => `${at}: ambient fade ${ms} ms is not a designed fade (Req 3.3)`);
        }
        inst.deadline = now + ms;
      }
      ok(inst.deadline === null || now <= inst.deadline, () => `${at}: ${r.haunt.id} still runs ${now - inst.deadline!} ms past its fade deadline`);
    }
    // A layer that the rules require must be running: started in this look-away at the latest.
    for (const r of recs) {
      if (!r.layer || !wanted(r) || lower < r.minLevel) continue;
      ok((startsInEpoch.get(`${r.haunt.id}@${m.epoch}`) ?? 0) >= 1, () => `${at}: layer ${r.haunt.id} (modes ${r.spec}, minLevel ${r.minLevel}) never started, model level at least ${lower}`);
    }
  }

  function check(kind: Kind, ctx: Ctx, pre: Snap): void {
    const now = clock.now();
    const at = `after ${kind} at t=${now - START}`;
    if (pre.stopped) {
      checkStopped(pre);
      return;
    }
    const newCalls = gate.calls.slice(pre.gateLen);
    const begins = newCalls.filter((c) => c.type === 'beginReturnMoment').length;
    const endCalls = newCalls.filter((c) => c.type === 'endReturnMoment');
    const fadeAll = newCalls.flatMap((c) => (c.type === 'fadeOutAll' ? [c.requestedMs] : []));
    ok(begins === (ctx.expectBegin === true ? 1 : 0), () => `${at}: ${begins} Return_Moment(s) began, expected ${ctx.expectBegin === true ? 1 : 0} (armed=${m.armed}, mode=${m.mode})`);
    ok(endCalls.length <= 1, () => `${at}: the Return_Moment ended ${endCalls.length} times`);
    ok(pre.cur === null || begins === 0, () => `${at}: a Return_Moment began while another was running`);
    if (begins === 1) {
      cur = { idx: momentCount(), begin: now, mode: m.mode, reduced: m.reduced, count: m.count, plan: null, endT: null, fx: new Map() };
      moments.push(cur);
      stats.momentStarted = true;
    }
    processEffects(pre);
    if (begins === 1) checkPlan(moments[moments.length - 1]);
    const ended = pre.cur !== null && !gate.returnActive;
    const mustEnd =
      (kind === 'away' && ctx.valueChanged === true) || (kind === 'mode' && ctx.to === 'gentle' && ctx.from !== 'gentle') || kind === 'stop';
    ok(pre.cur === null || !mustEnd || ended, () => `${at}: the Return_Moment from t=${pre.cur!.begin - START} still runs after ${kind === 'mode' ? 'a switch to Gentle' : kind}`);
    ok(endCalls.length === (ended ? 1 : 0), () => `${at}: gate.endReturnMoment called ${endCalls.length} time(s), Return_Moment ended: ${ended}`);
    ok(gate.returnActive === (cur !== null && !ended), () => `${at}: gate return state ${gate.returnActive} disagrees with the controller`);
    if (ended && pre.cur !== null) {
      const last = endCalls[0];
      finishMoment(pre.cur, kind, ctx, now, { fadeMs: last?.type === 'endReturnMoment' ? last.fadeMs : undefined });
    }
    if (cur !== null) {
      ok(now < cur.begin + HARD_END_MS, () => `${at}: the Return_Moment from t=${cur!.begin - START} still runs 3000 ms later`);
      if (m.reduced) stats.reducedDuringMoment = true;
      if (kind === 'mode' && ctx.from !== ctx.to && ctx.to !== 'gentle' && pre.cur !== null) stats.modeChangeMidMoment = true;
    }
    ok(evidence.shown.length === pre.evShown || gate.returnActive || pre.active, () => `${at}: the evidence host showed text outside a Return_Moment`);
    ok(spoiler.cards.length === pre.spCards || gate.returnActive || pre.active, () => `${at}: the spoiler host showed a card outside a Return_Moment`);
    if (ended) {
      ok(evidence.shown.length <= evidence.clears, () => `${at}: the evidence host was left showing text after the Return_Moment`);
      ok(spoiler.cards.length <= spoiler.hides, () => `${at}: the spoiler card was left showing after the Return_Moment`);
    }
    if (m.stopped) {
      checkStopped(pre);
      return;
    }

    checkStarts(pre, now, at);
    checkRunning(pre, kind, ctx, now, at, fadeAll);

    const st = engine.getState();
    const [lower, upper] = levelBounds(now);
    ok(st.level >= lower && st.level <= upper, () => `${at}: engine level ${st.level}, model ${lower}..${upper}`);
    ok(st.level > 0 || (st.leadId === null && st.companionId === null), () => `${at}: level 0 with a lead or companion`);
    ok(m.signal !== 'present' || st.level === 0, () => `${at}: level ${st.level} while present (Req 3.6)`);
    const open = recs.filter((r) => openOf(r) !== null).map((r) => r.haunt.id).sort();
    ok(JSON.stringify([...st.running].sort()) === JSON.stringify(open), () => `${at}: running ${st.running} vs started ${open}`);
    ok(m.armed || (st.running.length === 0 && cur === null), () => `${at}: not armed but running ${st.running} (Req 9.13)`);
    if (m.mode === 'gentle' && m.armed && m.signal === 'away' && leadsAllowed('gentle') && st.level > 0) {
      const limited = recs.some((r) => r.layer && r.spec === 'cn' && r.instances.every((x) => x.epoch !== m.epoch));
      if (limited) stats.cnLayerSkippedInGentle = true;
    }
  }

  function step(kind: Kind, act: () => void, ctx: Ctx = {}): void {
    const pre = snap();
    act();
    check(kind, ctx, pre);
  }

  function advanceChecked(ms: number): void {
    const target = clock.now() + Math.max(0, ms);
    for (let due = scheduler.pendingDueTimes()[0]; due !== undefined && due <= target; due = scheduler.pendingDueTimes()[0]) {
      step('timer', () => void scheduler.fireNext());
    }
    step('timer', () => scheduler.advance(target - clock.now()));
  }

  function deliver(value: 'present' | 'away'): void {
    let ctx: Ctx = {};
    if (!m.stopped && m.signal !== value) {
      const wasAway = m.signal === 'away';
      m.signal = value;
      if (value === 'away') startLookAway(clock.now());
      else m.awayStart = null;
      ctx = { valueChanged: true, expectBegin: value === 'present' && m.armed && wasAway && m.mode !== 'gentle' };
    }
    step(value, () => {
      for (const cb of [...listeners]) cb({ value, timestamp: clock.now() });
    }, ctx);
  }

  function apply(op: Op): void {
    switch (op.k) {
      case 'present':
      case 'away':
        deliver(op.k);
        break;
      case 'advance':
        advanceChecked(op.ms);
        break;
      case 'fire':
        step('timer', () => void scheduler.fireNext());
        break;
      case 'mode': {
        const ctx: Ctx = { from: m.mode, to: op.mode };
        if (!m.stopped) m.mode = op.mode;
        step('mode', () => void store.set({ mode: op.mode }), ctx);
        break;
      }
      case 'chapter': {
        const changed = op.key !== m.key;
        const live = script.chapterCallback && op.notify && !m.stopped;
        if (changed && !m.stopped) {
          if (seenKeys.has(op.key)) stats.returnToEarlierChapter = true;
          seenKeys.add(op.key);
          if (live) stats.chapterWithCallback = true;
          else stats.chapterWithoutCallback = true;
        }
        if (!m.stopped) m.key = op.key;
        if (live) syncKey();
        step('chapter', () => {
          base.options.chapterKey = op.key;
          if (script.chapterCallback && op.notify) for (const cb of [...chapterListeners]) cb();
        });
        break;
      }
      case 'reduced':
        if (!m.stopped) m.reduced = op.on;
        step('reduced', () => undefined);
        break;
      case 'arm':
        if (!m.stopped && !m.armed && m.signal === 'away') m.awayStart = clock.now();
        if (!m.stopped) m.armed = true;
        step('arm', () => void store.set({ noticeSeen: true }));
        break;
      case 'stop':
        step('stop', () => {
          engine.stop();
          m.stopped = true;
        });
        break;
    }
  }

  // ------------------------------------------------------------ run
  if (init.signal !== null) {
    m.signal = init.signal;
    if (init.signal === 'away') startLookAway(clock.now() - init.ageMs);
  }
  const zero = snap();
  engine.start();
  check('init', {}, zero);
  ok(listeners.size === 1 && settingsSubs === 1 && chapterListeners.size === (script.chapterCallback ? 1 : 0), () => 'engine did not subscribe once to each source');

  for (const op of script.ops) apply(op);
  if (!m.stopped) advanceChecked(3500);
  if (!m.stopped) apply({ k: 'stop' });
  ok(gate.ports.every((p) => p.closed), () => 'a port was never closed');
  ok(recs.every((r) => r.instances.every((x) => x.stoppedAt !== null)), () => 'a haunt was started and never stopped');
  return stats;
}
