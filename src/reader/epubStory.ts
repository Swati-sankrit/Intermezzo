// Turns what epub.js exposes (navigation landmarks, parsed chapter documents) into the
// plain data the Front_Matter_Detector takes. Reads attributes only; no epub.js import.
import { findStoryRange, type ChapterInfo, type LandmarkData, type StoryRange } from '../library/frontMatter';

/** A landmarks-nav entry as epub.js `book.navigation.landmarks` returns it. */
export interface NavLandmark {
  href?: string;
  label?: string;
  type?: string;
}

/** What the loader read from one kept chapter. */
export interface ChapterFacts {
  href: string;
  types: string[]; // epub:type tokens from the body and its direct child elements
  title?: string;
  heading?: string;
  wordCount: number;
}

const OPS_NS = 'http://www.idpf.org/2007/ops';

/** Drops "./" and "../" prefixes so hrefs from the nav file and the spine compare by path. */
export function normalizeHref(href: string): string {
  return href.replace(/^(\.\.?\/)+/, '');
}

function typeOf(el: Element): string[] {
  const raw = el.getAttribute('epub:type') ?? el.getAttributeNS(OPS_NS, 'type') ?? '';
  return raw.toLowerCase().split(/\s+/).filter(Boolean);
}

/** epub:type tokens on the body and on its direct child elements (usually one <section>). */
export function readEpubTypes(body: Element | null | undefined): string[] {
  if (!body) return [];
  const out = typeOf(body);
  for (const child of Array.from(body.children)) out.push(...typeOf(child));
  return out;
}

/** Text of the first h1 to h3 in the chapter, whitespace collapsed; undefined if none. */
export function readFirstHeading(body: Element | null | undefined): string | undefined {
  const h = body?.querySelector('h1, h2, h3');
  const text = h?.textContent?.replace(/\s+/g, ' ').trim();
  return text ? text : undefined;
}

export function buildLandmarkData(navLandmarks: NavLandmark[], chapters: ChapterFacts[]): LandmarkData {
  const chapterTypes: Record<string, string[]> = {};
  const add = (href: string, tokens: string[]): void => {
    if (!href || tokens.length === 0) return;
    chapterTypes[href] = [...(chapterTypes[href] ?? []), ...tokens];
  };
  for (const ch of chapters) add(normalizeHref(ch.href), ch.types);
  let bodymatterHref: string | undefined;
  for (const lm of navLandmarks) {
    if (!lm.href || !lm.type) continue;
    const href = normalizeHref(lm.href);
    // Landmark types describe the file they point at, except bodymatter,
    // which only says where the story begins.
    if (lm.type.toLowerCase() === 'bodymatter') bodymatterHref ??= href;
    else add(href.split('#')[0], lm.type.toLowerCase().split(/\s+/));
  }
  return { bodymatterHref, chapterTypes };
}

/** Story range for the kept chapters, in the order they were loaded. */
export function detectStory(navLandmarks: NavLandmark[], chapters: ChapterFacts[]): StoryRange {
  const infos: ChapterInfo[] = chapters.map((c) => ({
    href: normalizeHref(c.href),
    title: c.title,
    heading: c.heading,
    wordCount: c.wordCount,
  }));
  return findStoryRange(buildLandmarkData(navLandmarks, chapters), infos);
}
