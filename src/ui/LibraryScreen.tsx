import type { ChangeEvent } from 'react';
import { LIBRARY } from '../reader/library';
import type { LibraryEntry } from '../reader/library';
import './theme.css';
import './LibraryScreen.css';

export interface LibraryScreenProps {
  onSelectFile: (file: File) => void;
  onSelectLibraryBook: (entry: LibraryEntry) => void;
}

export function LibraryScreen({ onSelectFile, onSelectLibraryBook }: LibraryScreenProps) {
  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (file) onSelectFile(file);
    // Allow choosing the same file again after an error.
    input.value = '';
  };

  return (
    <main className="library">
      <h1 className="library__title">Your library</h1>
      <p className="library__intro">Pick a book from the shelf, or bring your own.</p>

      <ul className="library__shelf" aria-label="Library books">
        {LIBRARY.map((entry) => (
          <li key={entry.filePath}>
            <button
              type="button"
              className="library__card"
              onClick={() => onSelectLibraryBook(entry)}
            >
              <span className="library__book-title">{entry.title}</span>
              <span className="library__book-author">{entry.author}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="library__upload">
        <label className="library__upload-label" htmlFor="library-file-input">
          Open your own book
        </label>
        <input
          id="library-file-input"
          className="library__upload-input"
          type="file"
          accept=".txt,.epub"
          onChange={handleFile}
        />
      </div>
    </main>
  );
}

export default LibraryScreen;
