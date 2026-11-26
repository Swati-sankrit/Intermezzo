/**
 * The Image_Layer's picture: one bundled Ghost_Image shown by the gate. The URL comes only from
 * `assetUrl('ghost', name)`, so a name outside GHOST_ASSETS makes no request. It is a same-origin
 * path with no query, no `crossorigin`, and no markup parsing (`parseSvgMarkup` is not involved).
 * The size is set once from `imageBox`, so the picture never moves or scales after it is shown;
 * opacity fades stay with the layer. A load error removes the picture and shows nothing.
 */
import { assetUrl } from '../ghost/assets';
import { imageBox, type ImageFit } from '../ghost/imageFit';

export type PictureAnchor = 'bottom' | 'center';

/**
 * A box holding the visible part of the image, or null when the name is not allowlisted or the
 * region is too small. Appending it is the caller's job; the box removes itself on an image error.
 */
export function buildGhostPicture(
  doc: Document,
  name: string,
  fit: ImageFit,
  region: { width: number; height: number },
  anchor: PictureAnchor,
): HTMLElement | null {
  const url = assetUrl('ghost', name);
  if (url === null) return null;
  const box = imageBox(fit.step, fit.visible, region);
  if (box === null) return null;
  const scale = box.width / fit.visible.w;
  const naturalW = fit.natural.w * scale;
  const naturalH = fit.natural.h * scale;
  if (!Number.isFinite(naturalW) || !Number.isFinite(naturalH) || naturalW <= 0 || naturalH <= 0) return null;

  const frame = doc.createElement('div');
  frame.className = 'haunt-picture';
  const s = frame.style;
  s.position = 'absolute';
  s.overflow = 'hidden';
  s.pointerEvents = 'none';
  s.width = `${box.width}px`;
  s.height = `${box.height}px`;
  s.left = `calc(50% - ${box.width / 2}px)`;
  if (anchor === 'bottom') s.bottom = '0';
  else s.top = `calc(50% - ${box.height / 2}px)`;

  const img = doc.createElement('img');
  img.alt = '';
  img.decoding = 'async';
  img.draggable = false;
  img.setAttribute('aria-hidden', 'true');
  img.tabIndex = -1;
  img.style.position = 'absolute';
  img.style.maxWidth = 'none';
  img.style.width = `${naturalW}px`;
  img.style.height = `${naturalH}px`;
  img.style.left = `${-fit.visible.x * scale}px`;
  img.style.top = `${-fit.visible.y * scale}px`;
  img.addEventListener('error', () => frame.remove());
  img.src = url;
  frame.appendChild(img);
  return frame;
}
