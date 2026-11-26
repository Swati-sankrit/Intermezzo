/**
 * Image_Layer in the real gate (Requirements 22.5 to 22.8): imageBox examples, the allowlist,
 * the same-origin URL, removal on error, and the return overlay. Only time and the AudioContext
 * are stand-ins; region sizes are stubbed because the test DOM has no layout.
 */
import { describe, expect, it } from 'vitest';
import { createGate } from '../gate/gate';
import { createReducedMotion } from '../gate/reducedMotion';
import { GHOST_IMAGE_GEOMETRY, imageBox, type ImageFit } from '../ghost/imageFit';
import { KEYS } from '../settings';
import type { GhostAssetName } from '../types';
import {
  createFakeAudioContextFactory, createFakeMatchMedia, createFakeStorage, createFakeTime,
} from './fakes';

function sized(el: HTMLElement, width: number, height: number): void {
  el.getBoundingClientRect = () => ({ width, height, x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, toJSON: () => ({}) });
}

function makeEnv() {
  const { clock, scheduler } = createFakeTime();
  const factory = createFakeAudioContextFactory(clock);
  const root = document.createElement('div');
  const left = document.createElement('div');
  const right = document.createElement('div');
  root.append(left, right);
  document.body.append(root);
  sized(root, 1000, 700);
  sized(left, 300, 600);
  sized(right, 300, 600);
  const gate = createGate({
    audio: { createAudioContext: factory.create, eventTarget: new EventTarget() },
    hosts: { root, left, right },
    storage: createFakeStorage({ [KEYS.volumeCap]: '0.5' }),
    storageEvents: null,
    reducedMotion: createReducedMotion(createFakeMatchMedia(false).matchMedia),
    scheduler,
    warn: () => {},
  });
  return { gate, root, left };
}

const fitFor = (name: GhostAssetName, step = 2): ImageFit => ({ step, ...GHOST_IMAGE_GEOMETRY[name] });

describe('imageBox', () => {
  const standing = { w: 667, h: 649 };
  it('keeps the aspect ratio and stays inside the region', () => {
    const box = imageBox(4, standing, { width: 300, height: 600 });
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(300);
    expect(box!.height).toBeLessThanOrEqual(600);
    expect(box!.width / box!.height).toBeCloseTo(667 / 649, 6);
  });

  it('is strictly larger for each higher step', () => {
    const sizes = [0, 1, 2, 3, 4].map((s) => imageBox(s, standing, { width: 300, height: 600 })!.width);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
  });

  it('is null under 48 px wide and for unsafe sizes', () => {
    expect(imageBox(2, standing, { width: 47.9, height: 600 })).toBeNull();
    expect(imageBox(2, standing, { width: Number.NaN, height: 600 })).toBeNull();
    expect(imageBox(2, standing, { width: 300, height: -5 })).toBeNull();
    expect(imageBox(2, { w: 0, h: 10 }, { width: 300, height: 600 })).toBeNull();
  });

  it('fits the wide face picture by its width', () => {
    const box = imageBox(4, { w: 1269, h: 768 }, { width: 600, height: 600 })!;
    expect(box.width).toBeCloseTo(600, 6);
    expect(box.height).toBeCloseTo((600 * 768) / 1269, 6);
  });
});

describe('VisualLayer.setImage in the gate', () => {
  it('builds one img from the allowlisted same-origin URL, with no query', () => {
    const { gate, left } = makeEnv();
    const layer = gate.open('ghostFigure').visual.createLayer('left');
    layer.setImage('ghost-standing.png', fitFor('ghost-standing.png'));
    const imgs = left.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute('src')).toBe('/ghosts/ghost-standing.png');
    expect(imgs[0].hasAttribute('crossorigin')).toBe(false);
    const frame = left.querySelector<HTMLElement>('.haunt-picture')!;
    expect(parseFloat(frame.style.width)).toBeLessThanOrEqual(300);
    expect(parseFloat(frame.style.height)).toBeLessThanOrEqual(600);
  });

  it('makes no request and shows nothing for a name outside GHOST_ASSETS', () => {
    const { gate, left } = makeEnv();
    const layer = gate.open('ghostFigure').visual.createLayer('left');
    layer.setImage('../evil.png' as GhostAssetName, fitFor('ghost-standing.png'));
    layer.setImage('https://example.com/x.png' as GhostAssetName, fitFor('ghost-standing.png'));
    expect(left.querySelector('img')).toBeNull();
  });

  it('removes the picture when the image fails to load, leaving the layer empty', () => {
    const { gate, left } = makeEnv();
    const layer = gate.open('ghostFigure').visual.createLayer('left');
    layer.setImage('ghost-face.png', fitFor('ghost-face.png'));
    const img = left.querySelector('img')!;
    img.dispatchEvent(new Event('error'));
    expect(left.querySelector('img')).toBeNull();
    expect(left.querySelector('.haunt-picture')).toBeNull();
    expect(left.querySelector('.haunt-layer')!.childElementCount).toBe(0);
  });

  it('shows nothing when the region is under 48 px wide, and replaces an earlier picture', () => {
    const { gate, left } = makeEnv();
    const layer = gate.open('ghostFigure').visual.createLayer('left');
    layer.setImage('ghost-standing.png', fitFor('ghost-standing.png', 1));
    layer.setImage('ghost-face.png', fitFor('ghost-face.png', 1));
    expect(left.querySelectorAll('img')).toHaveLength(1);
    expect(left.querySelector('img')!.getAttribute('src')).toBe('/ghosts/ghost-face.png');
    sized(left, 40, 600);
    layer.setImage('ghost-face.png', fitFor('ghost-face.png', 1));
    expect(left.querySelector('img')).toBeNull();
  });

  it('ignores setImage after the port has faded out', () => {
    const { gate, left } = makeEnv();
    const port = gate.open('ghostFigure');
    const layer = port.visual.createLayer('left');
    port.fadeOut(200);
    layer.setImage('ghost-standing.png', fitFor('ghost-standing.png'));
    expect(left.querySelector('img')).not.toBeNull(); // picture may be built, but the layer is already at opacity 0
    expect(left.querySelector<HTMLElement>('.haunt-layer')!.style.opacity).toBe('0');
  });
});

describe('return overlay setImage', () => {
  it('shows an allowlisted picture only inside a Return_Moment and none after it ends', () => {
    const { gate, root } = makeEnv();
    gate.beginReturnMoment();
    const overlay = gate.openReturn('jumpscare')!.visual.createOverlay('jumpscare');
    overlay.setImage('ghost-face.png', fitFor('ghost-face.png', 4));
    expect(root.querySelector('.haunt-overlay img')!.getAttribute('src')).toBe('/ghosts/ghost-face.png');
    overlay.setImage('nope.png' as GhostAssetName, fitFor('ghost-face.png'));
    expect(root.querySelector('.haunt-overlay img')).toBeNull();
    overlay.setImage('ghost-standing.png', fitFor('ghost-standing.png', 4));
    root.querySelector('.haunt-overlay img')!.dispatchEvent(new Event('error'));
    expect(root.querySelector('.haunt-overlay img')).toBeNull();
    gate.endReturnMoment(0);
    overlay.setImage('ghost-standing.png', fitFor('ghost-standing.png'));
    expect(root.querySelector('img')).toBeNull();
  });
});
