/**
 * Built-in library of public-domain books served from the app's own origin.
 * Pure data: no React or DOM imports.
 *
 * filePath is relative to the site root (Vite serves `public/` there),
 * so it starts with "/books/", never "public/books/".
 *
 * Library txt books go through stripGutenbergBoilerplate then buildTxtBook.
 * Library epub books are fetched as an ArrayBuffer and passed to
 * buildEpubBook. Both are wired in useReader.
 */

export interface LibraryEntry {
  title: string;
  author: string;
  filePath: string;
  format: 'txt' | 'epub';
}

export const LIBRARY: readonly LibraryEntry[] = [
  {
    title: 'Dracula',
    author: 'Bram Stoker',
    filePath: '/books/Dracula.epub',
    format: 'epub',
  },
  {
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    filePath: '/books/prideprejudice.epub',
    format: 'epub',
  },
];
