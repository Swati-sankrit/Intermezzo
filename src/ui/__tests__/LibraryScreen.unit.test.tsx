import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LibraryScreen } from '../LibraryScreen';
import { LIBRARY } from '../../reader/library';

describe('LibraryScreen', () => {
  it('lists every library book with title and author', () => {
    render(<LibraryScreen onSelectFile={vi.fn()} onSelectLibraryBook={vi.fn()} />);
    for (const entry of LIBRARY) {
      expect(screen.getByText(entry.title)).toBeTruthy();
      expect(screen.getAllByText(entry.author).length).toBeGreaterThan(0);
    }
  });

  it('calls onSelectLibraryBook with the clicked entry', () => {
    const onSelectLibraryBook = vi.fn();
    render(<LibraryScreen onSelectFile={vi.fn()} onSelectLibraryBook={onSelectLibraryBook} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(LIBRARY[0].title) }));
    expect(onSelectLibraryBook).toHaveBeenCalledWith(LIBRARY[0]);
  });

  it('has a labelled file input accepting .txt and .epub and reports the chosen file', () => {
    const onSelectFile = vi.fn();
    render(<LibraryScreen onSelectFile={onSelectFile} onSelectLibraryBook={vi.fn()} />);
    const input = screen.getByLabelText('Open your own book') as HTMLInputElement;
    expect(input.getAttribute('accept')).toBe('.txt,.epub');
    const file = new File(['hello'], 'a.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onSelectFile).toHaveBeenCalledWith(file);
  });
});
