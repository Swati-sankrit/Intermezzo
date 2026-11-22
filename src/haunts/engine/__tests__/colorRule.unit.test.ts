/**
 * Colour rule and column isolation (task 6.8; Req 6.11, 6.12, 12.5, 16.4).
 *
 * Runtime side: render the real `HauntStage` beside a column with known inline colours, drive every
 * real haunt from `loadHaunts()` (alone, and every ordered pair as lead + companion) through the
 * real gate at levels 1 to 3, fade-out, stop and close, with reduced motion on and off. Record
 * `getComputedStyle` of the column and a text element before and after, and watch the whole document
 * with a MutationObserver.
 *
 * What this proves in jsdom: no haunt, through the real gate and visual adapter, changes the column's
 * or its text's computed colour, and every DOM mutation made while haunts run lands inside the stage
 * overlay root.
 * What it cannot prove: jsdom does not load HauntStage.css here (Vitest does not process CSS imports
 * by default), so no stylesheet rule is applied. The runtime check covers inline styles, attributes
 * and DOM structure only. Stylesheet content is checked statically in the second block, as text.
 * That static check cannot see a rule added to some other stylesheet. A real browser is needed to
 * confirm the painted result.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { HauntStage } from '../../../ui/HauntStage';
import { createGate } from '../gate/gate';
import { createReducedMotion } from '../gate/reducedMotion';
import type { VisualHosts } from '../gate/visualAdapter';
import { loadHaunts } from '../registry';
import { KEYS } from '../settings';
import type { GatePort, Haunt, HauntLevel } from '../types';
import { createFakeAudioContextFactory, createFakeMatchMedia, createFakeStorage, createFakeTime } from './fakes';

const COLUMN_COLOR = 'rgb(232, 220, 196)';
const COLUMN_BG = 'rgb(20, 17, 15)';
const LEVELS: readonly HauntLevel[] = [1, 2, 3];

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

interface Colors {
  readonly column: { color: string; background: string };
  readonly text: { color: string; background: string };
}

function readColors(column: HTMLElement, text: HTMLElement): Colors {
  const c = getComputedStyle(column);
  const t = getComputedStyle(text);
  return {
    column: { color: c.color, background: c.backgroundColor },
    text: { color: t.color, background: t.backgroundColor },
  };
}

interface Scene {
  readonly column: HTMLElement;
  readonly text: HTMLElement;
  readonly hosts: VisualHosts;
  readonly gate: ReturnType<typeof createGate>;
  readonly observer: MutationObserver;
  readonly records: MutationRecord[];
  /** Pulls any records still queued into `records`. */
  drain(): void;
}

/** Renders the stage next to the column, builds the real gate, and installs the observer last. */
async function makeScene(reduced: boolean): Promise<Scene> {
  const column = document.createElement('div');
  column.setAttribute('data-reading-column', '');
  column.style.color = COLUMN_COLOR;
  column.style.backgroundColor = COLUMN_BG;
  const text = document.createElement('p');
  text.textContent = 'The candle burned low.';
  column.append(text);
  document.body.append(column);

  let hosts: VisualHosts | null = null;
  render(createElement(HauntStage, { hostsRef: (h: VisualHosts | null) => { if (h !== null) hosts = h; } }));
  if (hosts === null) throw new Error('HauntStage did not expose its hosts');
  const stageHosts: VisualHosts = hosts;

  const { clock } = createFakeTime();
  const factory = createFakeAudioContextFactory(clock);
  const unlock = new EventTarget();
  const gate = createGate({
    audio: { createAudioContext: factory.create, eventTarget: unlock },
    hosts: stageHosts,
    storage: createFakeStorage({ [KEYS.volumeCap]: '1' }),
    storageEvents: null,
    reducedMotion: createReducedMotion(createFakeMatchMedia(reduced).matchMedia),
  });
  unlock.dispatchEvent(new Event('pointerdown'));
  await flush();

  const records: MutationRecord[] = [];
  const observer = new MutationObserver((batch) => void records.push(...batch));
  observer.observe(document.documentElement, {
    attributes: true,
    attributeOldValue: true,
    characterData: true,
    childList: true,
    subtree: true,
  });
  return { column, text, hosts: stageHosts, gate, observer, records, drain: () => void records.push(...observer.takeRecords()) };
}

function teardown(scene: Scene): void {
  scene.observer.disconnect();
  scene.gate.dispose();
  cleanup();
  scene.column.remove();
}

/** Runs one scenario with the given haunts as simultaneous lead + companion. Returns the ports used. */
function runHaunts(scene: Scene, haunts: readonly Haunt[]): void {
  const ports: GatePort[] = [];
  for (const h of haunts) {
    const port = scene.gate.open(h.id);
    ports.push(port);
    h.start(1, port.audio, port.visual);
  }
  for (const level of [2, 3, 1, 3] as const) {
    for (const h of haunts) h.setLevel(level);
  }
  for (const port of ports) port.fadeOut(400);
  for (const h of haunts) h.stop();
  for (const port of ports) port.close();
}

interface Case {
  readonly label: string;
  readonly haunts: readonly Haunt[];
}

function buildCases(all: readonly Haunt[]): Case[] {
  const cases: Case[] = all.map((h) => ({ label: h.id, haunts: [h] }));
  for (const lead of all) {
    for (const companion of all) {
      if (lead.id !== companion.id) cases.push({ label: `${lead.id}+${companion.id}`, haunts: [lead, companion] });
    }
  }
  return cases;
}

const insideStage = (scene: Scene, node: Node): boolean => scene.hosts.root.contains(node);

afterEach(() => cleanup());

describe('colour rule and column isolation (runtime, jsdom)', () => {
  const haunts = loadHaunts();

  it('the registry has at least the candle haunt', () => {
    expect(haunts.map((h) => h.id)).toContain('candle');
  });

  for (const reduced of [false, true]) {
    it(`leaves the column colours unchanged and mutates only inside the stage (reduced motion ${reduced ? 'on' : 'off'})`, async () => {
      const cases = buildCases(haunts);
      let totalInside = 0;
      for (const c of cases) {
        const scene = await makeScene(reduced);
        try {
          const before = readColors(scene.column, scene.text);
          // Guard: the known inline colours really are what getComputedStyle reports.
          expect(before.column).toEqual({ color: COLUMN_COLOR, background: COLUMN_BG });
          expect(before.text.color).toBe(COLUMN_COLOR);

          runHaunts(scene, c.haunts);
          scene.drain();

          const after = readColors(scene.column, scene.text);
          expect(after, `computed colours changed for ${c.label}`).toEqual(before);
          expect(scene.column.getAttribute('style'), `column style attribute changed for ${c.label}`).toBe(
            `color: ${COLUMN_COLOR}; background-color: ${COLUMN_BG};`,
          );

          const outside = scene.records.filter((r) => !insideStage(scene, r.target));
          expect(
            outside.map((r) => `${r.type}:${r.target.nodeName}:${r.attributeName ?? ''}`),
            `mutations outside the stage for ${c.label}`,
          ).toEqual([]);

          const inside = scene.records.filter((r) => insideStage(scene, r.target));
          totalInside += inside.length;
          // Guard against vacuity: a case containing the candle must have changed the stage root.
          if (c.haunts.some((h) => h.id === 'candle')) {
            expect(
              inside.some((r) => r.target === scene.hosts.root && r.attributeName === 'style'),
              `no stage-root style mutation recorded for ${c.label}`,
            ).toBe(true);
          }
        } finally {
          teardown(scene);
        }
      }
      expect(totalInside).toBeGreaterThan(0);
    });
  }

  it('the candle sets a glow dim of 0.7 on the stage root at level 3, so the run is not idle', async () => {
    const candle = haunts.find((h) => h.id === 'candle');
    if (candle === undefined) throw new Error('candle haunt missing');
    const scene = await makeScene(false);
    try {
      const port = scene.gate.open(candle.id);
      candle.start(1, port.audio, port.visual);
      for (const level of LEVELS) candle.setLevel(level);
      expect(scene.hosts.root.style.getPropertyValue('--glow-dim')).toBe('0.7');
    } finally {
      teardown(scene);
    }
  });

  it('detector self-check: the observer and colour reader do see a change to the column', async () => {
    const scene = await makeScene(false);
    try {
      const before = readColors(scene.column, scene.text);
      scene.column.style.color = 'rgb(1, 2, 3)';
      scene.drain();
      expect(readColors(scene.column, scene.text)).not.toEqual(before);
      expect(scene.records.some((r) => r.target === scene.column && !insideStage(scene, r.target))).toBe(true);
    } finally {
      teardown(scene);
    }
  });
});

describe('HauntStage.css colour rules (static text check)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(resolve(here, '../../../ui/HauntStage.css'), 'utf8');
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1].split(',').map((s) => s.trim()),
    body: m[2],
  }));
  const colorDecl = /(^|[;\s])(background-)?color\s*:/;

  it('the parser found the stylesheet rules (not vacuous)', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(8);
    expect(blocks.some((b) => b.selectors.includes('.haunt-stage'))).toBe(true);
    expect(blocks.some((b) => /var\(--glow\)/.test(b.body))).toBe(true);
  });

  it('declares color or background-color only in rules whose selectors all start with .haunt-stage', () => {
    for (const b of blocks) {
      if (!colorDecl.test(b.body)) continue;
      for (const s of b.selectors) expect(s, `colour declared outside the stage: ${s}`).toMatch(/^\.haunt-stage/);
    }
  });

  it('uses no colour literals; colours come from theme variables', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\b(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\s*\(/i);
    expect(css).not.toMatch(/\bcolor-mix\s*\(/);
  });
});
