/**
 * Text generators for the ghost-dread property tests: paragraphs, evidence message pools and
 * chapter sentence lists. Pure data only.
 */
import fc from 'fast-check';

/** A word is a maximal run of non-whitespace, so words here contain no whitespace. */
export const wordArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 6, arbitrary: fc.stringMatching(/^[A-Za-z]{1,10}$/) },
  { weight: 2, arbitrary: fc.stringMatching(/^[A-Za-z]{1,6}[.,;:!?"'’—-]{1,2}$/) },
  { weight: 1, arbitrary: fc.stringMatching(/^[A-Z][a-z]{2,8}$/) },
);

/** Irregular separators: single and double spaces, tabs, newlines, mixed runs. */
const separatorArb = fc.constantFrom(' ', ' ', ' ', '  ', '   ', '\t', '\n', '\r\n', ' \n ', '\n\n', ' \t');
const edgeSpaceArb = fc.constantFrom('', '', ' ', '\n', '\t', '  ');

/** Words joined by irregular whitespace, with optional leading and trailing whitespace. */
export function spacedText(words: readonly string[], seps: readonly string[], lead: string, trail: string): string {
  if (words.length === 0) return lead + trail;
  let out = lead + words[0];
  for (let i = 1; i < words.length; i++) out += seps[(i - 1) % seps.length] + words[i];
  return out + trail;
}

/** A paragraph of 0 to 40 words with irregular whitespace. Zero words gives blank or empty text. */
export const paragraphArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.oneof(
      { weight: 3, arbitrary: fc.array(wordArb, { minLength: 0, maxLength: 40 }) },
      // fast-check biases array length low; this branch reaches the 25 to 40 word range.
      { weight: 1, arbitrary: fc.array(wordArb, { minLength: 25, maxLength: 40 }) },
    ),
    fc.array(separatorArb, { minLength: 1, maxLength: 8 }),
    edgeSpaceArb,
    edgeSpaceArb,
  )
  .map(([words, seps, lead, trail]) => spacedText(words, seps, lead, trail));

/** Number of words in a text: maximal runs of non-whitespace. */
export function countWords(text: string): number {
  const m = text.match(/\S+/g);
  return m === null ? 0 : m.length;
}

const joinWords = (words: readonly string[]): string => words.join(' ');

/** An evidence message of 1 to 6 words, like the fixed list. */
export const shortMessageArb: fc.Arbitrary<string> = fc
  .array(wordArb, { minLength: 1, maxLength: 6 })
  .map(joinWords);

/** A message of 7 to 60 words: longer than most paragraphs. */
export const longMessageArb: fc.Arbitrary<string> = fc
  .array(wordArb, { minLength: 7, maxLength: 60 })
  .map(joinWords);

/** A message pool of 0 to 8 messages, mostly short, some long. Empty pools occur. */
export const messagePoolArb: fc.Arbitrary<string[]> = fc.array(
  fc.oneof({ weight: 4, arbitrary: shortMessageArb }, { weight: 1, arbitrary: longMessageArb }),
  { minLength: 0, maxLength: 8 },
);

/** A paragraph with a pool that always holds a message longer than the paragraph. */
export const paragraphWithLongMessageArb: fc.Arbitrary<{ paragraph: string; messages: string[] }> = fc
  .tuple(paragraphArb, messagePoolArb, fc.nat({ max: 8 }))
  .map(([paragraph, pool, extra]) => {
    const n = countWords(paragraph) + 1 + extra;
    const longer = Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
    return { paragraph, messages: [...pool, longer] };
  });

function sentenceOf(words: readonly string[]): string {
  return `${words.join(' ')}.`;
}

const plainWordArb = fc.stringMatching(/^[a-z]{2,9}$/);

/** A sentence of 1 to 4 words, below the 5-word minimum. */
export const shortSentenceArb: fc.Arbitrary<string> = fc
  .array(plainWordArb, { minLength: 1, maxLength: 4 })
  .map(sentenceOf);

/** A sentence of 5 to 25 words. */
export const fitSentenceArb: fc.Arbitrary<string> = fc
  .array(plainWordArb, { minLength: 5, maxLength: 25 })
  .map(sentenceOf);

/** A sentence of 26 to 45 words, above the 25-word maximum. */
export const longSentenceArb: fc.Arbitrary<string> = fc
  .array(plainWordArb, { minLength: 26, maxLength: 45 })
  .map(sentenceOf);

const anySentenceArb = fc.oneof(
  { weight: 1, arbitrary: shortSentenceArb },
  { weight: 4, arbitrary: fitSentenceArb },
  { weight: 1, arbitrary: longSentenceArb },
);

/**
 * A chapter sentence list of 0 to 12 sentences: short, fitting and long ones, with duplicates
 * (entries are drawn again from the same distinct set).
 */
export const sentenceListArb: fc.Arbitrary<string[]> = fc
  .array(anySentenceArb, { minLength: 0, maxLength: 6 })
  .chain((distinct) =>
    distinct.length === 0
      ? fc.constant<string[]>([])
      : fc.array(fc.constantFrom(...distinct), { minLength: 0, maxLength: 6 }).map((dups) => [...distinct, ...dups]),
  );

/** Final and other chapter sentence lists that share some sentences. */
export const spoilerSourceArb: fc.Arbitrary<{
  finalChapterSentences: string[];
  otherChapterSentences: string[];
}> = fc.tuple(sentenceListArb, sentenceListArb).chain(([finalList, others]) =>
  fc.array(fc.boolean(), { minLength: finalList.length, maxLength: finalList.length }).map((share) => ({
    finalChapterSentences: finalList,
    otherChapterSentences: [...others, ...finalList.filter((_, i) => share[i])],
  })),
);
