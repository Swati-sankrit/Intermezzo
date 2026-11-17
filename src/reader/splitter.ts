import type { Paragraph } from './types';

/**
 * Splits chapter text into paragraphs.
 *
 * A paragraph boundary is one or more consecutive lines that contain only
 * whitespace (spaces, tabs, carriage returns). Each resulting segment is
 * trimmed; segments that are entirely whitespace after trimming are excluded.
 */
export function splitIntoParagraphs(text: string): Paragraph[] {
  // Split on one or more consecutive blank lines.
  // A "blank line" is a line containing only whitespace characters.
  const segments = text.split(/(?:\r?\n[ \t]*){2,}|\r{2,}/);

  const paragraphs: Paragraph[] = [];
  for (const segment of segments) {
    const trimmed = segment.trim();
    if (trimmed.length > 0) {
      paragraphs.push({ text: trimmed });
    }
  }
  return paragraphs;
}

/**
 * Joins an array of paragraphs back into a single string with blank-line
 * separators (two newlines between each paragraph). Used by round-trip tests.
 */
export function joinParagraphs(paragraphs: Paragraph[]): string {
  return paragraphs.map((p) => p.text).join('\n\n');
}
