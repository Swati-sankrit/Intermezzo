// Pure front/back-matter detection. No DOM access; plain data in, indices out.

export interface LandmarkData {
  bodymatterHref?: string; // from the EPUB landmarks nav, if present
  chapterTypes: Record<string, string[]>; // href -> epub:type tokens, if present
}

export interface ChapterInfo {
  href: string;
  title?: string;
  heading?: string;
  wordCount?: number;
}

export interface StoryRange {
  start: number; // first story chapter index (inclusive)
  end: number; // last story chapter index (inclusive)
}

const FRONT_TYPES = new Set([
  'titlepage',
  'halftitlepage',
  'halftitle',
  'frontmatter',
  'toc',
  'epigraph',
  'dedication',
  'copyright-page',
  'imprint',
]);
const BACK_TYPES = new Set(['colophon', 'uncopyright', 'copyright-page']);
// Tokens that mark a real story chapter; these always win over matter tokens.
const STORY_TYPES = new Set(['bodymatter', 'chapter', 'part', 'prologue', 'epilogue']);

const FRONT_NAMES = new Set([
  'imprint',
  'titlepage',
  'halftitlepage',
  'halftitle',
  'toc',
  'dedication',
  'epigraph',
  'frontmatter',
]);
const BACK_NAMES = new Set(['colophon', 'uncopyright']);

const FRONT_TEXTS = new Set(['imprint', 'contents', 'table of contents']);
const BACK_TEXTS = new Set(['colophon', 'uncopyright']);
const TEXT_MAX_WORDS = 400;

interface Kind {
  front: boolean;
  back: boolean;
}
const NONE: Kind = { front: false, back: false };

function stripFragment(href: string): string {
  const i = href.indexOf('#');
  return (i < 0 ? href : href.slice(0, i)).replace(/^\.\//, '');
}

function sameFile(a: string, b: string): boolean {
  const x = stripFragment(a);
  const y = stripFragment(b);
  if (x === '' || y === '') return false;
  return x === y || x.endsWith('/' + y) || y.endsWith('/' + x);
}

function baseName(href: string): string {
  const path = stripFragment(href);
  const file = path.slice(path.lastIndexOf('/') + 1);
  const dot = file.lastIndexOf('.');
  return (dot > 0 ? file.slice(0, dot) : file).toLowerCase();
}

function typesFor(landmarks: LandmarkData, href: string): string[] {
  const out: string[] = [];
  for (const key of Object.keys(landmarks.chapterTypes)) {
    if (sameFile(key, href)) out.push(...landmarks.chapterTypes[key]);
  }
  return out.flatMap((t) => t.toLowerCase().split(/\s+/)).filter(Boolean);
}

function kindFromTypes(tokens: string[]): Kind {
  if (tokens.some((t) => STORY_TYPES.has(t))) return NONE;
  return {
    front: tokens.some((t) => FRONT_TYPES.has(t)),
    back: tokens.some((t) => BACK_TYPES.has(t)),
  };
}

function kindFromName(href: string): Kind {
  const n = baseName(href);
  return { front: FRONT_NAMES.has(n), back: BACK_NAMES.has(n) };
}

function norm(s: string | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function kindFromText(ch: ChapterInfo): Kind {
  if (ch.wordCount !== undefined && ch.wordCount > TEXT_MAX_WORDS) return NONE;
  const labels = [norm(ch.title), norm(ch.heading)].filter((s) => s !== '');
  if (labels.length === 0) return NONE;
  return {
    front: labels.some((l) => FRONT_TEXTS.has(l)),
    back: labels.some((l) => BACK_TEXTS.has(l)),
  };
}

/**
 * Chapter indices (inclusive) of the story. Order of resolution: landmark,
 * epub:type, file name, then (only if nothing else marked anything) heading text.
 * Falls back to the whole book when nothing is found or everything looks like matter.
 */
export function findStoryRange(landmarks: LandmarkData, chapters: ChapterInfo[]): StoryRange {
  const last = chapters.length - 1;
  if (last < 0) return { start: 0, end: 0 };
  const whole: StoryRange = { start: 0, end: last };

  const byStructure: Kind[] = chapters.map((ch) => {
    const t = kindFromTypes(typesFor(landmarks, ch.href));
    if (t.front || t.back) return t;
    return kindFromName(ch.href);
  });
  const anyStructure = byStructure.some((k) => k.front || k.back);
  const landmarkIdx = landmarks.bodymatterHref
    ? chapters.findIndex((ch) => sameFile(ch.href, landmarks.bodymatterHref as string))
    : -1;
  const kinds =
    anyStructure || landmarkIdx >= 0 ? byStructure : chapters.map((ch) => kindFromText(ch));

  let start = landmarkIdx;
  if (start < 0) {
    start = kinds.findIndex((k) => !k.front);
    if (start < 0) return whole; // everything looks like front matter
  }

  let end = last;
  while (end > start && kinds[end].back) end--;
  return { start, end };
}

/** Thin wrapper kept for the spec's original API. */
export function findStoryStart(
  landmarks: LandmarkData,
  chapters: ChapterInfo[],
): { chapterIndex: number } {
  return { chapterIndex: findStoryRange(landmarks, chapters).start };
}
