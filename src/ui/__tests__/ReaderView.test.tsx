import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReaderView } from '../ReaderView';

describe('ReaderView', () => {
  it('shows the library, with no reading controls, when no book is loaded', () => {
    render(<ReaderView />);
    expect(screen.getByRole('heading', { name: 'Your library' })).toBeTruthy();
    expect(screen.getByLabelText('Open your own book')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back to library' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Pace Guide/ })).toBeNull();
  });
});
