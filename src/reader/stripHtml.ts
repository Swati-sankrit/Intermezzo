/**
 * stripHtml.ts — Converts an HTML string to plain text using the browser DOM.
 *
 * Paragraph-level elements become blank-line boundaries so the splitter can
 * recover paragraphs. <script>, <style> and similar non-content elements are
 * dropped with their contents.
 */

const BLOCK_SELECTOR =
  'p,div,h1,h2,h3,h4,h5,h6,li,blockquote,pre,tr,section,article,br,hr';
const DROP_SELECTOR = 'script,style,head,noscript,template';

export function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  doc.querySelectorAll(DROP_SELECTOR).forEach((el) => el.remove());

  doc.querySelectorAll(BLOCK_SELECTOR).forEach((el) => {
    el.after(doc.createTextNode('\n\n'));
  });

  const text = doc.body?.textContent ?? '';

  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
