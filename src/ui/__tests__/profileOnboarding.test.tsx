// Example tests for the Profile and onboarding (library-v2, task 8.5).
// Real profileOps, Onboarding, ProfileSettings, useProfileActions, LibraryShell and LibraryScreen,
// with the in-memory store provided through context. No book is opened, so no EPUB timing waits.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DataStore, Result } from '../../library/localStore';
import { createMemoryStore } from '../../library/memoryStore';
import {
  CANDLE_COLOURS,
  EMPTY_DATA_MODEL,
  type DataModel,
  type Stats,
} from '../../library/model';
import { NAME_TOO_LONG_MESSAGE, recordPace, resetProfile, updateProfile } from '../../library/profileOps';
import { addBookEntry, savePosition } from '../../library/shelfOps';
import { COLOUR_NAMES } from '../colourNames';
import { DataStoreProvider } from '../dataStoreContext';
import { LIBRARY_MESSAGES } from '../libraryMessages';
import { LibraryShell } from '../LibraryShell';

const SLUG = 'bram-stoker/dracula';
const STATS: Stats = {
  paragraphsRead: 7,
  chaptersFinished: 1,
  activeReadingSeconds: 90,
  lookAwayCount: 2,
  sessionCount: 3,
  awaySeconds: 12,
  wordsRead: 340,
};

/** A model with a name, a book, a shelf entry, a position, per-book stats and daily stats. */
function richModel(onboardingCompleted: boolean): DataModel {
  let m = addBookEntry(EMPTY_DATA_MODEL, {
    bookId: SLUG,
    title: 'Dracula',
    author: 'Bram Stoker',
    fileName: 'dracula.epub',
    source: 'catalogue',
    format: 'epub',
    catalogueSlug: SLUG,
    addedAt: 1,
  });
  m = savePosition(m, SLUG, { chapterIndex: 0, paragraphIndex: 2, progress: 40, savedAt: 5 });
  return {
    ...m,
    profile: { ...m.profile, displayName: 'Mina', candleColour: 'rose', onboardingCompleted, averagePace: 300 },
    stats: { [SLUG]: STATS },
    daily: { '2026-01-02': STATS },
  };
}

async function storeWith(model?: DataModel) {
  const store = createMemoryStore();
  if (model) expect((await store.save(model)).ok).toBe(true);
  return store;
}

const saved = async (store: DataStore) => {
  const r = await store.load();
  if (!r.ok) throw new Error('load failed');
  return r.value;
};

const show = (store: DataStore) =>
  render(
    <DataStoreProvider store={store}>
      <LibraryShell />
    </DataStoreProvider>,
  );

afterEach(cleanup);

describe('profileOps', () => {
  it('rejects a 41-character name with the message and keeps the previous name', () => {
    const base = updateProfile(EMPTY_DATA_MODEL, { displayName: 'Mina' });
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    const r = updateProfile(base.model, { displayName: 'x'.repeat(41) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toBe(NAME_TOO_LONG_MESSAGE);
    expect(r.model.profile.displayName).toBe('Mina');
  });

  it('accepts a 40-character name padded with spaces, stored trimmed', () => {
    const r = updateProfile(EMPTY_DATA_MODEL, { displayName: `  ${'x'.repeat(40)}  ` });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.model.profile.displayName).toBe('x'.repeat(40));
  });

  it('clamps the pace to 50 and 1000', () => {
    expect(recordPace(EMPTY_DATA_MODEL, 10).profile.averagePace).toBe(50);
    expect(recordPace(EMPTY_DATA_MODEL, 5000).profile.averagePace).toBe(1000);
    expect(recordPace(EMPTY_DATA_MODEL, 250).profile.averagePace).toBe(250);
  });

  it('resetProfile returns the first-visit profile and keeps books, shelves, positions, stats and daily', () => {
    const m = richModel(true);
    const r = resetProfile(m);
    expect(r.profile).toEqual(EMPTY_DATA_MODEL.profile);
    expect(r.books).toEqual(m.books);
    expect(r.shelves).toEqual(m.shelves);
    expect(r.positions).toEqual(m.positions);
    expect(r.stats).toEqual(m.stats);
    expect(r.daily).toEqual(m.daily);
  });
});

describe('Onboarding', () => {
  it('shows on a first visit with at most 3 steps, each of 40 words or fewer', async () => {
    show(await storeWith());
    expect(await screen.findByRole('region', { name: /your name and candle/i })).toBeTruthy();
    let steps = 0;
    for (;;) {
      steps += 1;
      const text = document.querySelector('.onboarding__text')?.textContent ?? '';
      expect(text.trim().split(/\s+/).length).toBeLessThanOrEqual(40);
      const next = screen.queryByRole('button', { name: 'Next' });
      if (!next) break;
      fireEvent.click(next);
    }
    expect(steps).toBeLessThanOrEqual(3);
    expect(screen.getByText(`Step ${steps} of ${steps}`)).toBeTruthy();
  });

  it('shows a text name beside every candle colour option', async () => {
    show(await storeWith());
    const group = await screen.findByRole('group', { name: 'Candle colour' });
    for (const c of CANDLE_COLOURS) {
      expect(within(group).getByRole('radio', { name: new RegExp(COLOUR_NAMES[c]) })).toBeTruthy();
      expect(within(group).getByText(COLOUR_NAMES[c])).toBeTruthy();
    }
  });

  it('"Skip introduction" shows the library, persists the flag, and onboarding is not shown on the next render', async () => {
    const store = await storeWith();
    const first = show(store);
    fireEvent.click(await screen.findByRole('button', { name: 'Skip introduction' }));
    expect(await screen.findByText(/shelf is quiet/i)).toBeTruthy();
    await waitFor(async () => expect((await saved(store)).profile.onboardingCompleted).toBe(true));
    first.unmount();

    show(store);
    expect(await screen.findByText(/shelf is quiet/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Skip introduction' })).toBeNull();
  });

  it('shows the library and the "will not be saved after the tab closes" message when the final save fails', async () => {
    const inner = await storeWith();
    const failing: DataStore = {
      ...inner,
      async save(): Promise<Result<void>> {
        return { ok: false, kind: 'unavailable' };
      },
    };
    show(failing);
    fireEvent.click(await screen.findByRole('button', { name: 'Skip introduction' }));
    expect(await screen.findByText(/shelf is quiet/i)).toBeTruthy();
    expect(await screen.findByText(LIBRARY_MESSAGES.onboardingNotSaved)).toBeTruthy();
    expect(LIBRARY_MESSAGES.onboardingNotSaved).toMatch(/will not be saved after the tab closes/);
    expect(screen.queryByRole('button', { name: 'Skip introduction' })).toBeNull();
  });
});

describe('Delete my profile', () => {
  const openConfirm = async () => {
    const store = await storeWith(richModel(true));
    show(store);
    expect(await screen.findByRole('heading', { name: 'Welcome back, Mina' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete my profile' }));
    expect(screen.getByRole('heading', { name: 'Delete my profile?' })).toBeTruthy();
    return store;
  };

  it('Cancel keeps the profile', async () => {
    const store = await openConfirm();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('heading', { name: 'Delete my profile?' })).toBeNull();
    expect((await saved(store)).profile.displayName).toBe('Mina');
    expect(screen.getByRole('heading', { name: 'Welcome back, Mina' })).toBeTruthy();
  });

  it('Escape cancels the confirmation, and keeps the profile', async () => {
    const store = await openConfirm();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('heading', { name: 'Delete my profile?' })).toBeNull();
    expect(screen.getByRole('dialog')).toBeTruthy(); // settings still open
    expect((await saved(store)).profile).toEqual(richModel(true).profile);
  });

  it('confirm shows onboarding again and keeps books, shelves, positions, stats and daily', async () => {
    const store = await openConfirm();
    const before = richModel(true);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete my profile' }));
    expect(await screen.findByRole('region', { name: /your name and candle/i })).toBeTruthy();
    await waitFor(async () => expect((await saved(store)).profile).toEqual(EMPTY_DATA_MODEL.profile));
    const after = await saved(store);
    expect(after.books).toEqual(before.books);
    expect(after.shelves).toEqual(before.shelves);
    expect(after.positions).toEqual(before.positions);
    expect(after.stats).toEqual(before.stats);
    expect(after.daily).toEqual(before.daily);
  });
});
