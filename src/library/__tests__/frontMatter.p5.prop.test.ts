import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { findStoryRange, findStoryStart, type ChapterInfo, type LandmarkData } from '../frontMatter';

/**
 * Feature: library-v2, Property 5: Front-matter detection never skips the story and is conservative
 * without markers
 * **Validates: Requirements 9.3, 9.4, 9.9, 23.2**
 */

const NUM_RUNS = 200;

const FRONT_TOKENS = [
  'titlepage',
  'halftitlepage',
  'halftitle',
  'frontmatter',
  'toc',
  'epigraph',
  'dedication',
  'copyright-page',
  'imprint',
];
const BACK_TOKENS = ['colophon', 'uncopyright', 'copyright-page'];
const FRONT_FILE_NAMES = ['imprint', 'titlepage', 'halftitlepage', 'halftitle', 'toc', 'dedication', 'epigraph', 'frontmatter'];
const BACK_FILE_NAMES = ['colophon', 'uncopyright'];
const MATTER_TEXTS = new Set(['imprint', 'contents', 'table of contents', 'colophon', 'uncopyright']);

const normText = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');
const isMatterText = (s: string): boolean => MATTER_TEXTS.has(normText(s));

type Role = 'front' | 'story' | 'extra' | 'back';
interface Book {
  landmarks: LandmarkData;
  chapters: ChapterInfo[];
  roles: Role[];
  storyFirst: number;
  hasLandmark: boolean;
}

const slug = fc.stringMatching(/^[a-z0-9_-]{1,10}$/);
// Titles are arbitrary text, but never an exact matter word (those are what the detector may hide).
const plainTitle = fc.option(fc.string({ maxLength: 24 }).filter((t) => !isMatterText(t)), { nil: undefined });
const wordCount = fc.option(fc.integer({ min: 0, max: 5000 }), { nil: undefined });
const smallWordCount = fc.option(fc.integer({ min: 0, max: 400 }), { nil: undefined });
const keyVariant = fc.constantFrom('plain', 'fragment', 'prefix', 'dot');

function keyFor(href: string, variant: string): string {
  if (variant === 'fragment') return href + '#sec1';
  if (variant === 'prefix') return 'OEBPS/' + href;
  if (variant === 'dot') return './' + href;
  return href;
}

const frontSpec = fc.record({
  typed: fc.boolean(),
  token: fc.constantFrom(...FRONT_TOKENS),
  name: fc.constantFrom(...FRONT_FILE_NAMES),
  textTitle: fc.constantFrom('Contents', '  TABLE of   Contents ', 'Imprint'),
  viaHeading: fc.boolean(),
  words: smallWordCount,
  variant: keyVariant,
});
const backSpec = fc.record({
  typed: fc.boolean(),
  token: fc.constantFrom(...BACK_TOKENS),
  name: fc.constantFrom(...BACK_FILE_NAMES),
  textTitle: fc.constantFrom('Colophon', 'UNCOPYRIGHT', ' colophon '),
  viaHeading: fc.boolean(),
  words: smallWordCount,
  variant: keyVariant,
});
const storySpec = fc.record({
  name: slug,
  tokens: fc.constantFrom(undefined, ['chapter'], ['bodymatter'], ['part'], ['bodymatter chapter'], ['prologue']),
  title: plainTitle,
  heading: plainTitle,
  words: wordCount,
  variant: keyVariant,
});
const extraSpec = fc.record({
  kind: fc.constantFrom('endnotes', 'afterword', 'appendix'),
  words: wordCount,
});

const bookArb = (landmark: boolean | undefined): fc.Arbitrary<Book> =>
  fc
    .record({
      textMode: fc.boolean(),
      fronts: fc.array(frontSpec, { maxLength: 5 }),
      stories: fc.array(storySpec, { minLength: 1, maxLength: 6 }),
      extras: fc.array(extraSpec, { maxLength: 3 }),
      backs: fc.array(backSpec, { maxLength: 4 }),
      withLandmark: landmark === undefined ? fc.boolean() : fc.constant(landmark),
      landmarkVariant: keyVariant,
    })
    .map((g): Book => {
      const chapters: ChapterInfo[] = [];
      const roles: Role[] = [];
      const chapterTypes: Record<string, string[]> = {};
      // Heading-text detection is only the last resort, so it is generated in its own mode where
      // no landmark, epub:type or marker file name exists in the book.
      const textMode = g.textMode && !g.withLandmark;
      const add = (role: Role, ch: Omit<ChapterInfo, 'href'>, file: string, types?: string[], variant = 'plain') => {
        const href = `d${chapters.length}/${file}.xhtml`;
        chapters.push({ href, ...ch });
        roles.push(role);
        if (types) chapterTypes[keyFor(href, variant)] = types;
      };
      const matter = (
        role: 'front' | 'back',
        s: (typeof g.fronts)[number] | (typeof g.backs)[number],
        i: number,
      ) => {
        if (textMode) {
          const label = s.viaHeading ? { heading: s.textTitle } : { title: s.textTitle };
          add(role, { ...label, wordCount: s.words }, `x${i}`);
        } else if (s.typed) {
          add(role, { title: 'whatever' }, `m${i}`, [s.token], s.variant);
        } else {
          add(role, { title: 'whatever' }, s.name);
        }
      };
      g.fronts.forEach((s, i) => matter('front', s, i));
      const storyFirst = chapters.length;
      g.stories.forEach((s, i) => {
        const types = textMode || !s.tokens ? undefined : [...s.tokens];
        add('story', { title: s.title, heading: s.heading, wordCount: s.words }, `s${s.name}${i}`, types, s.variant);
      });
      g.extras.forEach((s) => add('extra', { title: s.kind, wordCount: s.words }, s.kind));
      g.backs.forEach((s, i) => matter('back', s, i));
      const hasLandmark = g.withLandmark;
      const bodymatterHref = hasLandmark ? keyFor(chapters[storyFirst].href, g.landmarkVariant) : undefined;
      return { landmarks: { bodymatterHref, chapterTypes }, chapters, roles, storyFirst, hasLandmark };
    });

function assertProp(arb: fc.Arbitrary<Book>, check: (b: Book) => void): number {
  let cases = 0;
  fc.assert(
    fc.property(arb, (b) => {
      cases++;
      check(b);
    }),
    { numRuns: NUM_RUNS },
  );
  return cases;
}

describe('Property 5: front-matter detection (library-v2)', () => {
  it('never drops a story, endnotes, afterword or appendix chapter', () => {
    const cases = assertProp(bookArb(undefined), (b) => {
      const { start, end } = findStoryRange(b.landmarks, b.chapters);
      b.roles.forEach((r, i) => {
        if (r === 'story' || r === 'extra') {
          expect(i).toBeGreaterThanOrEqual(start);
          expect(i).toBeLessThanOrEqual(end);
        }
      });
    });
    expect(cases).toBeGreaterThanOrEqual(100);
  });

  it('returns a valid range and never reorders or mutates its input', () => {
    const cases = assertProp(bookArb(undefined), (b) => {
      const before = structuredClone({ l: b.landmarks, c: b.chapters });
      const { start, end } = findStoryRange(b.landmarks, b.chapters);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(start).toBeLessThanOrEqual(end);
      expect(end).toBeLessThan(b.chapters.length);
      expect(findStoryStart(b.landmarks, b.chapters).chapterIndex).toBe(start);
      expect({ l: b.landmarks, c: b.chapters }).toEqual(before);
    });
    expect(cases).toBeGreaterThanOrEqual(100);
  });

  it('only front matter lies before the range and only back matter after it', () => {
    const cases = assertProp(bookArb(undefined), (b) => {
      const { start, end } = findStoryRange(b.landmarks, b.chapters);
      for (let i = 0; i < start; i++) expect(b.roles[i]).toBe('front');
      for (let i = end + 1; i < b.chapters.length; i++) expect(b.roles[i]).toBe('back');
    });
    expect(cases).toBeGreaterThanOrEqual(100);
  });

  it('returns the whole book when nothing marks any matter', () => {
    const neutral = fc
      .record({
        stories: fc.array(storySpec, { minLength: 1, maxLength: 8 }),
        extras: fc.array(extraSpec, { maxLength: 3 }),
        // Matter words are harmless when the chapter is long enough to be a real chapter.
        longMatter: fc.array(fc.tuple(fc.constantFrom('Contents', 'Colophon', 'Imprint'), fc.integer({ min: 401, max: 5000 })), {
          maxLength: 2,
        }),
      })
      .map((g): Book => {
        const chapters: ChapterInfo[] = [];
        g.stories.forEach((s, i) =>
          chapters.push({ href: `d${i}/s${s.name}.xhtml`, title: s.title, heading: s.heading, wordCount: s.words }),
        );
        g.extras.forEach((s) => chapters.push({ href: `d${chapters.length}/${s.kind}.xhtml`, title: s.kind, wordCount: s.words }));
        g.longMatter.forEach(([t, w]) => chapters.push({ href: `d${chapters.length}/z.xhtml`, title: t, wordCount: w }));
        return {
          landmarks: { chapterTypes: {} },
          chapters,
          roles: chapters.map(() => 'story' as Role),
          storyFirst: 0,
          hasLandmark: false,
        };
      });
    const cases = assertProp(neutral, (b) => {
      expect(findStoryRange(b.landmarks, b.chapters)).toEqual({ start: 0, end: b.chapters.length - 1 });
    });
    expect(cases).toBeGreaterThanOrEqual(100);
  });

  it('never starts after the designated story chapter when a bodymatter landmark is given', () => {
    const cases = assertProp(bookArb(true), (b) => {
      expect(b.hasLandmark).toBe(true);
      const { start } = findStoryRange(b.landmarks, b.chapters);
      expect(start).toBeLessThanOrEqual(b.storyFirst);
      expect(findStoryStart(b.landmarks, b.chapters).chapterIndex).toBeLessThanOrEqual(b.storyFirst);
    });
    expect(cases).toBeGreaterThanOrEqual(100);
  });
});
