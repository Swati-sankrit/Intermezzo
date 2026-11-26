import { useEffect, useRef } from 'react';
import {
  burnProgress,
  burnValue,
  fitImage,
  makeNoise,
  makeRandom,
  pixelBurn,
  rimEnvelope,
  sampleNoise,
  stepSparks,
  type Spark,
} from './burnMask';
import type { BurnSource } from './coverCapture';
import './BurnOverlay.css';

/** Room around the cover for sparks that rise past its edge. */
const PAD = 48;
const MAX_PIXELS = 160_000;

export interface BurnOverlayProps {
  source: BurnSource;
  burnMs: number;
  maxSparks: number;
  /** The burn ran its full length. */
  onDone: () => void;
  /** The burn cannot be drawn: skip it. */
  onFail: () => void;
}

/** Reads `--accent` from theme.css as r, g, b. Throws if it is not a hex colour. */
function emberColour(): [number, number, number] {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const m = /^#([0-9a-f]{6})$/i.exec(raw);
  if (!m) throw new Error('no accent colour');
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * The chosen cover burns from its edges: a noise mask erases it, a glowing ember rim follows the
 * front, and a few sparks rise. Decorative and silent. It takes no pointer events and no focus;
 * the real card is hidden while it plays and shown again when it ends. The glow swells and fades
 * once, so brightness never changes more than 3 times a second, and it stays on the cover.
 */
export function BurnOverlay({ source, burnMs, maxSparks, onDone, onFail }: BurnOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const done = useRef(onDone);
  const fail = useRef(onFail);
  useEffect(() => {
    done.current = onDone;
    fail.current = onFail;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    let frame = 0;
    let timer = 0;
    let stopped = false;
    const { rect, image, fit, hide } = source;
    const previous = hide.style.visibility;
    try {
      const ctx = canvas?.getContext('2d', { willReadFrequently: true });
      if (!canvas || !ctx) throw new Error('no canvas');
      const [er, eg, eb] = emberColour();
      const scale = Math.min(1, Math.sqrt(MAX_PIXELS / (rect.width * rect.height)));
      const w = Math.max(1, Math.round(rect.width * scale));
      const h = Math.max(1, Math.round(rect.height * scale));
      const pad = Math.round(PAD * scale);
      canvas.width = w + pad * 2;
      canvas.height = h + pad * 2;

      // The cover, drawn once the way the page draws it, then read back pixel by pixel.
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const f = fitImage(image.naturalWidth, image.naturalHeight, w, h, fit);
      ctx.drawImage(image, f.sx, f.sy, f.sw, f.sh, pad + f.dx, pad + f.dy, f.dw, f.dh);
      const original = ctx.getImageData(pad, pad, w, h);
      const frameData = ctx.createImageData(w, h);
      const rand = makeRandom(7);
      const noise = makeNoise(9, 12, rand);
      const values = new Float32Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const u = x / (w - 1 || 1);
          const v = y / (h - 1 || 1);
          values[y * w + x] = burnValue(u, v, sampleNoise(noise, u, v));
        }
      }

      hide.style.visibility = 'hidden';
      const start = performance.now();
      let last = start;
      let sparks: Spark[] = [];

      const draw = (now: number) => {
        if (stopped) return;
        try {
          const t = burnProgress(now - start, burnMs);
          const env = rimEnvelope(t);
          const src = original.data;
          const out = frameData.data;
          let sparkSource: { x: number; y: number } | null = null;
          for (let i = 0; i < values.length; i++) {
            const k = i * 4;
            const p = pixelBurn(values[i], t);
            if (p.gone || src[k + 3] === 0) {
              out[k + 3] = 0;
              continue;
            }
            const mix = Math.sqrt(p.rim) * env;
            out[k] = src[k] + (er - src[k]) * mix;
            out[k + 1] = src[k + 1] + (eg - src[k + 1]) * mix;
            out[k + 2] = src[k + 2] + (eb - src[k + 2]) * mix;
            out[k + 3] = src[k + 3];
            if (p.rim > 0.6 && Math.random() < 0.002) sparkSource = { x: i % w, y: Math.floor(i / w) };
          }
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.putImageData(frameData, pad, pad);
          sparks = stepSparks(sparks, now - last, sparkSource, maxSparks, rand);
          last = now;
          ctx.fillStyle = `rgb(${er}, ${eg}, ${eb})`;
          for (const s of sparks) {
            ctx.globalAlpha = Math.max(0, 1 - s.age / s.life);
            ctx.fillRect(pad + s.x - 1, pad + s.y - 1, 2.5, 2.5);
          }
          ctx.globalAlpha = 1;
          frame = requestAnimationFrame(draw);
        } catch {
          fail.current();
        }
      };
      frame = requestAnimationFrame(draw);
      timer = window.setTimeout(() => done.current(), burnMs);
    } catch {
      hide.style.visibility = previous;
      // Reported after mount, so the owner is not updated while it renders.
      timer = window.setTimeout(() => fail.current(), 0);
    }
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      hide.style.visibility = previous;
    };
  }, [source, burnMs, maxSparks]);

  const { rect } = source;
  return (
    <canvas
      ref={canvasRef}
      className="burn-overlay"
      aria-hidden="true"
      style={{
        left: rect.left - PAD,
        top: rect.top - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }}
    />
  );
}
