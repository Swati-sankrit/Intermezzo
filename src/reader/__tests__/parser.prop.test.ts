// Feature: reader-core, Property 4 / 4b: No body text is lost; kept chapters are well-formed
// Feature: reader-core, Property 5: No chapter headings means exactly one chapter

import * as fc from 'fast-check';
import { buildTxtBook, isChapterHeading } from '../parser';
import { stripHtml } from '../stripHtml';

/** Run count and optional seed can be raised for one-off deep runs. */
const NUM_RUNS = Number(process.env.PBT_RUNS) || 100;
const SEED = process.env.PBT_SEED ? Number(process.env.PBT_SEED) : undefined;
const runOpts = { numRuns: NUM_RUNS, ...(SEED !== undefined ? { seed: SEED } : {}) };

const noWs = (s: string): string => s.replace(/\s/g, '');

/** Lines that are sometimes real chapter headings, sometimes arbitrary text. */
const headingLine = fc
  .tuple(
    fc.constantFrom('Chapter', 'CHAPTER', '  chapter'),
    fc.constantFrom('1', '12', 'IV', 'one', 'twenty-one'),
    fc.constantFrom('', '.', ':', ' - x'),
  )
  .map(([w, n, t]) => `${w} ${n}${t}`);
const textInput = fc
  .array(fc.oneof(fc.string(), headingLine, fc.constant('')), { maxLength: 12 })
  .map((lines) => lines.join('\n'));

describe('buildTxtBook — property tests', () => {
  it('Property 4: no body text is lost (non-heading lines appear in chapter bodies, in order)', () => {
    // Validates: Requirements 1.2, 1.3, 1.4
    fc.assert(
      fc.property(textInput, (input) => {
        const result = buildTxtBook('test.txt', input);
        const bodyLines = input.split('\n').filter((l) => !isChapterHeading(l));
        const expected = noWs(bodyLines.join('\n'));

        if (!result.ok) {
          // Only legitimate when there was nothing but whitespace/headings.
          expect(expected).toBe('');
          return;
        }
        const actual = noWs(result.book.chapters.map((c) => c.text).join('\n'));
        expect(actual).toBe(expected);
      }),
      runOpts,
    );
  });

  it('Property 4b: every kept chapter has a non-empty body and any title is a heading line from the input', () => {
    // Validates: Requirements 1.2, 1.3, 1.4
    fc.assert(
      fc.property(textInput, (input) => {
        const result = buildTxtBook('test.txt', input);
        if (!result.ok) return;
        const headings = new Set(
          input.split('\n').filter((l) => isChapterHeading(l)).map((l) => l.trim()),
        );
        for (const ch of result.book.chapters) {
          expect(ch.text.trim().length).toBeGreaterThan(0);
          if (ch.title !== '') expect(headings.has(ch.title)).toBe(true);
        }
      }),
      runOpts,
    );
  });

  it('Property 5: a string with no chapter heading lines produces exactly one chapter', () => {
    // Validates: Requirements 1.3, 1.4
    fc.assert(
      fc.property(
        fc
          .string()
          // Keep only strings where no line is a chapter heading.
          .filter((text) => !text.split('\n').some((line) => isChapterHeading(line)))
          // Keep only strings with at least one non-whitespace character
          // so buildTxtBook returns ok: true.
          .filter((text) => /\S/.test(text)),
        (input) => {
          const result = buildTxtBook('test.txt', input);
          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.book.chapters).toHaveLength(1);
          }
        },
      ),
      runOpts,
    );
  });
});


// Feature: reader-core, Property 6: stripHtml round-trips entity-escaped text

/*
 * Model of expected output (independent of the DOM and of stripHtml):
 *
 * Each generated node tree is flattened into a token stream of TEXT(s) and
 * BREAK tokens. A block element (p, div) emits a BREAK after its children;
 * <br> emits a BREAK; inline elements (b, i, span) and <img> emit only their
 * children's tokens (img: none). Expected output = TEXT tokens concatenated,
 * with each run of one or more consecutive BREAKs becoming "\n\n", and with
 * leading/trailing BREAKs dropped (stripHtml trims the result).
 *
 * Generator constraints:
 * - Segments are non-empty, have no leading/trailing whitespace and use only
 *   single ASCII spaces inside, so the `[ \t]+\n` cleanup and trim() cannot
 *   change them. Their alphabet includes < > & " ' ; and the letters l, t, g,
 *   a, m, p, so literal text like "&lt;" appears and must survive decoding.
 * - <p> holds only inline content, because the HTML parser implicitly closes a
 *   <p> when a block starts inside it, which would move the BREAK. <div> may
 *   hold anything.
 * - Segments are always escaped as entities (& < > " ') before insertion.
 */

type Inline =
  | { k: 'text'; s: string }
  | { k: 'br' }
  | { k: 'img'; alt: string; cls: string }
  | { k: 'inline'; tag: 'b' | 'i' | 'span'; cls: string; kids: Inline[] };
type Node = Inline | { k: 'block'; tag: 'p' | 'div'; kids: Node[] };

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const segment = fc
  .array(fc.constantFrom('a', 'b', 'Z', '1', '<', '>', '&', '"', "'", ';', 'l', 't', 'g', 'm', 'p', ' '), {
    minLength: 1,
    maxLength: 12,
  })
  .map((cs) => cs.join('').split(' ').filter(Boolean).join(' '))
  .filter((s) => s.length > 0);

const cls = fc.constantFrom('c', 'n x', 'a&b');

const inlineNode: fc.Arbitrary<Inline> = fc.letrec<{ node: Inline }>((tie) => ({
  node: fc.oneof(
    { depthSize: 'small', maxDepth: 3 },
    segment.map((s): Inline => ({ k: 'text', s })),
    fc.constant<Inline>({ k: 'br' }),
    fc.tuple(segment, cls).map(([alt, c]): Inline => ({ k: 'img', alt, cls: c })),
    fc
      .tuple(
        fc.constantFrom<'b' | 'i' | 'span'>('b', 'i', 'span'),
        cls,
        fc.array(tie('node') as fc.Arbitrary<Inline>, { maxLength: 3 }),
      )
      .map(([tag, c, kids]): Inline => ({ k: 'inline', tag, cls: c, kids })),
  ),
})).node;

const anyNode: fc.Arbitrary<Node> = fc.letrec<{ node: Node }>((tie) => ({
  node: fc.oneof(
    { depthSize: 'small', maxDepth: 2 },
    inlineNode,
    fc.array(inlineNode, { maxLength: 3 }).map((kids): Node => ({ k: 'block', tag: 'p', kids })),
    fc
      .array(tie('node') as fc.Arbitrary<Node>, { maxLength: 3 })
      .map((kids): Node => ({ k: 'block', tag: 'div', kids })),
  ),
})).node;

function render(n: Node): string {
  switch (n.k) {
    case 'text':
      return escapeHtml(n.s);
    case 'br':
      return '<br>';
    case 'img':
      return `<img src="a.png" class="${escapeHtml(n.cls)}" alt="${escapeHtml(n.alt)}">`;
    case 'inline':
      return `<${n.tag} class="${escapeHtml(n.cls)}">${n.kids.map(render).join('')}</${n.tag}>`;
    case 'block':
      return `<${n.tag} class="blk">${n.kids.map(render).join('')}</${n.tag}>`;
  }
}

type Token = string | null; // string = text, null = BREAK
function tokens(n: Node, out: Token[]): void {
  switch (n.k) {
    case 'text':
      out.push(n.s);
      return;
    case 'br':
      out.push(null);
      return;
    case 'img':
      return;
    case 'inline':
      n.kids.forEach((c) => tokens(c, out));
      return;
    case 'block':
      n.kids.forEach((c) => tokens(c, out));
      out.push(null);
  }
}

function expectedText(nodes: Node[]): string {
  const toks: Token[] = [];
  nodes.forEach((n) => tokens(n, toks));
  let out = '';
  let pendingBreak = false;
  for (const t of toks) {
    if (t === null) {
      pendingBreak = true;
    } else {
      if (pendingBreak && out !== '') out += '\n\n';
      pendingBreak = false;
      out += t;
    }
  }
  return out;
}

describe('stripHtml — property tests', () => {
  it('Property 6: entity-escaped text round-trips, with blank lines after block elements', () => {
    // Validates: Requirements 2.3
    fc.assert(
      fc.property(fc.array(anyNode, { maxLength: 6 }), (nodes) => {
        expect(stripHtml(nodes.map(render).join(''))).toBe(expectedText(nodes));
      }),
      runOpts,
    );
  });

  it('Property 6 (example): the former counterexample, with < and > escaped, keeps them as text', () => {
    const html =
      '<span class="c">&lt;</span><em class="n"><p style="color: red; font-size: 12px">A</p>' +
      '<p class="n"><p class="n">&gt;</p><img src="a.png" alt="x"></p></em>';
    expect(stripHtml(html)).toBe('<A\n\n>');
  });
});
