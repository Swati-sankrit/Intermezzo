/**
 * gutenberg.ts — Strip Project Gutenberg licence boilerplate. Pure function.
 */

const START_RE = /^\*\*\* START OF (THE|THIS) PROJECT GUTENBERG EBOOK/;
const END_RE = /^\*\*\* END OF (THE|THIS) PROJECT GUTENBERG EBOOK/;

/**
 * If `text` has a line starting "*** START OF THE|THIS PROJECT GUTENBERG EBOOK",
 * returns only the text between that line and the next line starting
 * "*** END OF THE|THIS PROJECT GUTENBERG EBOOK" (or the end of the text when
 * there is no END line). Otherwise returns `text` unchanged.
 *
 * Lines are separated by '\n' only. The '\n' that ends the START line and the
 * '\n' that precedes the END line are removed, so for
 * `prefix + START + "\n" + middle + "\n" + END + suffix` the result is exactly
 * `middle`. A '\r' before a '\n' is part of the line content and is kept.
 */
export function stripGutenbergBoilerplate(text: string): string {
  let pos = 0;
  let contentStart = -1;

  while (pos <= text.length) {
    const nl = text.indexOf('\n', pos);
    const lineEnd = nl === -1 ? text.length : nl;
    const line = text.slice(pos, lineEnd);

    if (contentStart === -1) {
      if (START_RE.test(line)) {
        // Content begins after the START line's newline (or is empty at EOF).
        contentStart = nl === -1 ? text.length : nl + 1;
      }
    } else if (END_RE.test(line)) {
      // Drop the newline just before the END line (if it is not the START
      // line's own newline, which has already been skipped).
      const contentEnd = Math.max(contentStart, pos - 1);
      return text.slice(contentStart, contentEnd);
    }

    if (nl === -1) break;
    pos = nl + 1;
  }

  return contentStart === -1 ? text : text.slice(contentStart);
}
