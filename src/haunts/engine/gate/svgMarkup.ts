/**
 * Turns a haunt's SVG string into DOM nodes without `innerHTML`.
 *
 * Choice: parse with DOMParser as `image/svg+xml` (no HTML parsing, no script execution on
 * parse), then copy only an allow-listed set of elements and attributes into the target
 * document. Haunts are local code, but a bad string still cannot add scripts, event handlers,
 * external references or document-wide `<style>` rules. A rejected string yields `null`.
 *
 * Namespace: an XML parser puts an `<svg>` with no `xmlns` in no namespace, and the checks below
 * would reject it. `withRootNamespace` adds the SVG namespace to the root start tag only, and
 * only when that tag has no `xmlns` attribute. A root with another `xmlns` is left alone and is
 * rejected by the namespace check. Nested elements inherit the root namespace from the parser.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

const ALLOWED_ELEMENTS: ReadonlySet<string> = new Set([
  'svg', 'g', 'defs', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon',
  'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'filter',
  'feGaussianBlur', 'feOffset', 'feColorMatrix', 'feBlend', 'feMerge', 'feMergeNode',
  'feComposite', 'feFlood', 'feTurbulence', 'feDisplacementMap', 'title', 'desc',
]);

/** Attribute values that may reference something outside the document. */
const EXTERNAL_REFERENCE = /(?:^|[\s(])(?:https?:|data:|javascript:|\/\/)/i;

/** Root start tag: optional prolog (declaration, comments, doctype), then `<svg` and its attributes. */
const ROOT_START = /^(\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE[^>]*>\s*)?<svg)(?=[\s/>])((?:"[^"]*"|'[^']*'|[^>"'])*>)/;
const ATTR_NAME = /([^\s=/<>"']+)\s*=\s*(?:"[^"]*"|'[^']*')/g;
/** Adds `xmlns` to the root `<svg>` start tag when it has none. Touches nothing else. */
function withRootNamespace(svg: string): string {
  const match = ROOT_START.exec(svg);
  if (match === null) return svg;
  const [whole, head, rest] = match;
  for (const attr of rest.matchAll(ATTR_NAME)) if (attr[1] === 'xmlns') return svg;
  return `${head} xmlns="${SVG_NS}"${rest}${svg.slice(whole.length)}`;
}
function isAllowedAttribute(name: string, value: string): boolean {
  const lower = name.toLowerCase();
  if (lower.startsWith('on')) return false;
  if (lower === 'href' || lower === 'xlink:href') return value.startsWith('#');
  return !EXTERNAL_REFERENCE.test(value);
}

function copyNode(source: Element, doc: Document): Element | null {
  if (source.namespaceURI !== SVG_NS || !ALLOWED_ELEMENTS.has(source.localName)) return null;
  const copy = doc.createElementNS(SVG_NS, source.localName);
  for (const attr of Array.from(source.attributes)) {
    if (attr.namespaceURI === 'http://www.w3.org/2000/xmlns/') continue;
    if (!isAllowedAttribute(attr.name, attr.value)) continue;
    copy.setAttribute(attr.name, attr.value);
  }
  for (const child of Array.from(source.childNodes)) {
    if (child.nodeType === 1) {
      const kept = copyNode(child as Element, doc);
      if (kept !== null) copy.appendChild(kept);
    } else if (child.nodeType === 3 && (source.localName === 'title' || source.localName === 'desc')) {
      copy.appendChild(doc.createTextNode(child.textContent ?? ''));
    }
  }
  return copy;
}

/** Returns a sanitised `<svg>` element owned by `doc`, or null if the string is not usable SVG. */
export function parseSvgMarkup(svg: string, doc: Document): Element | null {
  if (typeof svg !== 'string' || svg.trim() === '') return null;
  let parsed: Document;
  try {
    parsed = new DOMParser().parseFromString(withRootNamespace(svg), 'image/svg+xml');
  } catch {
    return null;
  }
  const root = parsed.documentElement;
  if (root === null || root.localName !== 'svg' || parsed.getElementsByTagName('parsererror').length > 0) {
    return null;
  }
  return copyNode(root, doc);
}
