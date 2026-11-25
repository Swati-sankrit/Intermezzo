// Validates: Requirements 8.2, 8.4
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { LIBRARY } from '../library';

describe('LIBRARY', () => {
  it('contains at least one entry', () => {
    expect(LIBRARY.length).toBeGreaterThan(0);
  });

  it('every filePath starts with "/books/" and never "public/"', () => {
    for (const entry of LIBRARY) {
      expect(entry.filePath.startsWith('/books/')).toBe(true);
      expect(entry.filePath).not.toContain('public/');
    }
  });

  it('every format is "txt" or "epub"', () => {
    for (const entry of LIBRARY) {
      expect(['txt', 'epub']).toContain(entry.format);
    }
  });

  it('every entry has a title and author', () => {
    for (const entry of LIBRARY) {
      expect(entry.title.trim()).not.toBe('');
      expect(entry.author.trim()).not.toBe('');
    }
  });

  it('ships Dracula by Bram Stoker as epub', () => {
    expect(LIBRARY).toContainEqual({
      title: 'Dracula',
      author: 'Bram Stoker',
      filePath: '/books/Dracula.epub',
      format: 'epub',
    });
  });

  it('ships Pride and Prejudice by Jane Austen as epub', () => {
    expect(LIBRARY).toContainEqual({
      title: 'Pride and Prejudice',
      author: 'Jane Austen',
      filePath: '/books/prideprejudice.epub',
      format: 'epub',
    });
  });

  it('format matches the filePath extension', () => {
    for (const entry of LIBRARY) {
      expect(entry.filePath.endsWith(`.${entry.format}`)).toBe(true);
    }
  });

  it('every filePath maps to an existing file under public/', () => {
    // existsSync is case-insensitive on macOS, so compare exact names from
    // readdirSync, one path segment at a time (the Vercel/Linux behavior).
    for (const entry of LIBRARY) {
      const segments = entry.filePath.split('/').filter(Boolean);
      let dir = resolve(process.cwd(), 'public');
      for (const name of segments) {
        expect(readdirSync(dir).includes(name), `${name} in ${dir}`).toBe(true);
        dir = resolve(dir, name);
      }
    }
  });
});
