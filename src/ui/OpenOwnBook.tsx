import type { ChangeEvent } from 'react';
import './LibraryScreen.css';

export interface OpenOwnBookProps {
  onSelectFile: (file: File) => void;
}

/** The "Open your own book" file control (.txt or .epub). */
export function OpenOwnBook({ onSelectFile }: OpenOwnBookProps) {
  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (file) onSelectFile(file);
    // Allow choosing the same file again after an error.
    input.value = '';
  };

  return (
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
  );
}
