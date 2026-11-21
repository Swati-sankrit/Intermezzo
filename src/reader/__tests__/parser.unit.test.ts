import JSZip from 'jszip';
import { buildEpubBook, buildTxtBook } from '../parser';
import { stripHtml } from '../stripHtml';

describe('buildTxtBook — empty chapter filtering', () => {
  it('drops contents-list headings that have no body, keeping only real chapters', () => {
    const text = [
      'CHAPTER I.',
      'CHAPTER II.',
      'CHAPTER III.',
      '',
      'CHAPTER I.',
      'It was a dark night.',
      '',
      'CHAPTER II.',
      'Morning came slowly.',
      '',
      'CHAPTER III.',
      'The end arrived.',
    ].join('\n');

    const result = buildTxtBook('t.txt', text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const chapters = result.book.chapters;
    expect(chapters.map((c) => c.title)).toEqual(['CHAPTER I.', 'CHAPTER II.', 'CHAPTER III.']);
    expect(chapters[0].text).toContain('It was a dark night.');
    expect(chapters[1].text).toContain('Morning came slowly.');
    expect(chapters[2].text).toContain('The end arrived.');
  });
});

// ---------------------------------------------------------------------------
// EPUB fixture (real epub.js, real stripHtml, no mocks)
// ---------------------------------------------------------------------------
const xhtml = (body: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title></head><body>${body}</body></html>`;

async function makeEpub(opts: { title?: string } = {}): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`
  );
  // Manifest order: c2, c3, empty, c1, nav.  Spine order: c1, empty, c2, c3.
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">test-book</dc:identifier>
    <dc:title>${opts.title ?? 'Test'}</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="c2" href="c2.xhtml" media-type="application/xhtml+xml"/>
    <item id="c3" href="c3.xhtml" media-type="application/xhtml+xml"/>
    <item id="empty" href="empty.xhtml" media-type="application/xhtml+xml"/>
    <item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  </manifest>
  <spine>
    <itemref idref="c1"/>
    <itemref idref="empty"/>
    <itemref idref="c2"/>
    <itemref idref="c3"/>
  </spine>
</package>`
  );
  // Nested TOC: "Part One" (c1) has child "Section One-One" (c2). c3 has no entry.
  zip.file(
    'OEBPS/nav.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Nav</title></head>
<body><nav epub:type="toc"><ol>
  <li><a href="c1.xhtml">Part One</a>
    <ol><li><a href="c2.xhtml">Section One-One</a></li></ol>
  </li>
</ol></nav></body></html>`
  );
  zip.file('OEBPS/c1.xhtml', xhtml('<p>Alpha text of the first chapter.</p>'));
  zip.file('OEBPS/c2.xhtml', xhtml('<p>Bravo text of the second chapter.</p>'));
  zip.file('OEBPS/c3.xhtml', xhtml('<p>Charlie text of the untitled chapter.</p>'));
  zip.file('OEBPS/empty.xhtml', xhtml(''));
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('buildEpubBook', () => {
  it('uses TOC titles (including nested), falls back to "Chapter N", keeps spine order, skips empty sections', async () => {
    const result = await buildEpubBook('t.epub', await makeEpub(), stripHtml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { chapters } = result.book;
    // Spine order (c1, c2, c3) differs from manifest order (c2, c3, c1);
    // the empty section is dropped.
    expect(chapters.map((c) => c.text)).toEqual([
      'Alpha text of the first chapter.',
      'Bravo text of the second chapter.',
      'Charlie text of the untitled chapter.',
    ]);
    // c3 is the 3rd KEPT chapter; the skipped empty section must not consume a number.
    expect(chapters.map((c) => c.title)).toEqual([
      'Part One',
      'Section One-One',
      'Chapter 3',
    ]);
  });

  it('takes the book title from the EPUB metadata (dc:title)', async () => {
    const result = await buildEpubBook('t.epub', await makeEpub(), stripHtml);
    expect(result.ok && result.book.title).toBe('Test');
  });

  it('falls back to the file name without extension when the EPUB title is blank', async () => {
    const blank = await makeEpub({ title: '   ' });
    const result = await buildEpubBook('my-novel.epub', blank, stripHtml);
    expect(result.ok && result.book.title).toBe('my-novel');
  });

  it('returns ok:false with a message of at most 200 chars for a corrupt buffer', async () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer;
    const result = await buildEpubBook('bad.epub', garbage, stripHtml);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.length).toBeGreaterThan(0);
    expect(result.error.length).toBeLessThanOrEqual(200);
  });
});
