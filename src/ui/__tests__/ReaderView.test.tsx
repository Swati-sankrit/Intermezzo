import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createOnboardedStore } from './onboardedStore';
import { DataStoreProvider } from '../dataStoreContext';
import { LibraryShell } from '../LibraryShell';

describe('LibraryShell', () => {
  it('shows the library, with no reading controls, when no book is open', async () => {
    render(
      <DataStoreProvider store={createOnboardedStore()}>
        <LibraryShell />
      </DataStoreProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy();
    expect(screen.getByLabelText('Open your own book')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back to library' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Pace Guide/ })).toBeNull();
  });
});
