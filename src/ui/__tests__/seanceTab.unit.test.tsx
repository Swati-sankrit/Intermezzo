// Example tests for the Séance tab (haunted-shell, task 8.2). Requirements 12.4 and 2.x.
// Real ShellFrame, SeanceTab, HauntControl, LibraryShell, useProfileActions and the in-memory store.
// Nothing under test is mocked.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CHOICE_KEY, loadChoice } from '../../attention/storage';
import { getHauntSettingsStore } from '../hauntSettingsStore';
import { createMemoryStore } from '../../library/memoryStore';
import type { DataStore } from '../../library/localStore';
import { CANDLE_COLOURS, EMPTY_DATA_MODEL, type DataModel, type Profile } from '../../library/model';
import { NAME_TOO_LONG_MESSAGE } from '../../library/profileOps';
import { DataStoreProvider } from '../dataStoreContext';
import { HauntControl } from '../HauntControl';
import { LibraryShell } from '../LibraryShell';
import { SeanceHaunt } from '../shell/SeanceHaunt';
import { SeanceTab } from '../shell/SeanceTab';
import { ShellFrame } from '../shell/ShellFrame';
import { COLOUR_NAMES } from '../colourNames';
import { LIBRARY_MESSAGES } from '../libraryMessages';

const VOLUME = 'rod_volume_cap';
const GOAL = 'rod_daily_goal';
const TAB = 'rod_shell_tab';

const profile = (over: Partial<Profile> = {}): Profile => ({
  ...EMPTY_DATA_MODEL.profile,
  displayName: 'Mina',
  candleColour: 'rose',
  onboardingCompleted: true,
  ...over,
});

function readyModel(over: Partial<Profile> = {}): DataModel {
  return { ...EMPTY_DATA_MODEL, profile: profile(over) };
}

async function storeWith(model: DataModel): Promise<DataStore> {
  const store = createMemoryStore();
  expect((await store.save(model)).ok).toBe(true);
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

/** Opens the Séance tab of a mounted LibraryShell. */
async function openSeance() {
  await screen.findByRole('tab', { name: 'The Séance' });
  fireEvent.click(screen.getByRole('tab', { name: 'The Séance' }));
  return screen.getByRole('heading', { name: 'The Séance' });
}

/** A ShellFrame on the Séance tab with simple profile actions that record their calls. */
function mountFrame(onClearData: () => Promise<boolean> = async () => true) {
  const calls: string[] = [];
  const actions = {
    changeName: (n: string) => {
      calls.push(`name:${n}`);
      return n.length > 40 ? NAME_TOO_LONG_MESSAGE : null;
    },
    changeColour: (c: string) => void calls.push(`colour:${c}`),
    changePaceGuide: (b: boolean) => void calls.push(`pace:${b}`),
    deleteProfile: () => void calls.push('delete'),
  };
  render(
    <ShellFrame
      library={<p>Library content</p>}
      initialTab="seance"
      seance={{ profile: profile(), actions, message: null, loading: false, onClearData }}
    />,
  );
  return calls;
}

beforeEach(() => {
  localStorage.clear();
  getHauntSettingsStore().set({ mode: 'classic' });
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('Haunt_Mode (Req 2.x, 12.4)', () => {
  it('writes each mode through the haunt settings store and localStorage', () => {
    render(<SeanceHaunt />);
    for (const [label, mode] of [['Gentle', 'gentle'], ['Nightmare', 'nightmare'], ['Classic', 'classic']] as const) {
      fireEvent.click(screen.getByRole('radio', { name: new RegExp(label) }));
      expect(getHauntSettingsStore().get().mode).toBe(mode);
      expect(localStorage.getItem('rod_haunt_mode')).toBe(mode);
      expect((screen.getByRole('radio', { name: new RegExp(label) }) as HTMLInputElement).checked).toBe(true);
    }
  });

  it('has three options with descriptions of at most 120 characters, Classic first selected', () => {
    render(<SeanceHaunt />);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect((screen.getByRole('radio', { name: /Classic/ }) as HTMLInputElement).checked).toBe(true);
    for (const r of screen.getAllByRole('radio')) {
      const text = r.closest('label')?.querySelector('.seance__option-text')?.textContent ?? '';
      expect(text.length).toBeGreaterThan(0);
      expect(text.length).toBeLessThanOrEqual(120);
    }
  });

  it('stays in sync with the top-bar control in both directions', () => {
    render(
      <>
        <HauntControl />
        <SeanceHaunt />
      </>,
    );
    const gentleToggle = screen.getByRole('button', { name: /Gentle mode/ });
    fireEvent.click(gentleToggle);
    expect((screen.getByRole('radio', { name: /Gentle/ }) as HTMLInputElement).checked).toBe(true);
    expect(gentleToggle.textContent).toBe('Gentle mode: on');

    fireEvent.click(screen.getByRole('radio', { name: /Nightmare/ }));
    expect(gentleToggle.textContent).toBe('Gentle mode: off');
    fireEvent.click(screen.getByRole('radio', { name: /Gentle/ }));
    expect(gentleToggle.textContent).toBe('Gentle mode: on');
  });
});

describe('Camera choice (Req 2.x, 12.4)', () => {
  it('shows neither option selected when unanswered, with the privacy note', () => {
    mountFrame();
    expect(loadChoice()).toBeNull();
    expect((screen.getByRole('radio', { name: 'Camera on' }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('radio', { name: 'Camera off' }) as HTMLInputElement).checked).toBe(false);
    expect(
      screen.getByText(/The camera feed is processed on your device\. No frame is stored or sent anywhere\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/browser's camera question is asked when the next book opens/)).toBeInTheDocument();
  });

  it('writes the choice through saveChoice and selects it', () => {
    mountFrame();
    fireEvent.click(screen.getByRole('radio', { name: 'Camera on' }));
    expect(localStorage.getItem(CHOICE_KEY)).toBe('camera');
    expect(loadChoice()).toBe('camera');
    expect((screen.getByRole('radio', { name: 'Camera on' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/Your browser asks for permission when the next book opens\./)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Camera off' }));
    expect(loadChoice()).toBe('no-camera');
    expect((screen.getByRole('radio', { name: 'Camera on' }) as HTMLInputElement).checked).toBe(false);
  });

  it('shows the saved choice on mount', () => {
    localStorage.setItem(CHOICE_KEY, 'no-camera');
    mountFrame();
    expect((screen.getByRole('radio', { name: 'Camera off' }) as HTMLInputElement).checked).toBe(true);
  });
});

describe('Volume_Cap (Req 2.x, 12.4)', () => {
  const slider = () => screen.getByRole('slider', { name: 'Haunt volume cap' }) as HTMLInputElement;

  it('is a 0 to 100 slider in steps of 5, starting at 40% with no saved value', () => {
    mountFrame();
    expect(slider().min).toBe('0');
    expect(slider().max).toBe('100');
    expect(slider().step).toBe('5');
    expect(slider().value).toBe('40');
    expect(screen.queryByText(/used from the next time a book opens/)).toBeNull();
  });

  it('writes 0 to 1 to rod_volume_cap and shows the next-time wording', () => {
    mountFrame();
    fireEvent.change(slider(), { target: { value: '55' } });
    expect(localStorage.getItem(VOLUME)).toBe('0.55');
    expect(screen.getByText(/used from the next time a book opens/)).toBeInTheDocument();
    fireEvent.change(slider(), { target: { value: '0' } });
    expect(localStorage.getItem(VOLUME)).toBe('0');
    fireEvent.change(slider(), { target: { value: '100' } });
    expect(localStorage.getItem(VOLUME)).toBe('1');
  });

  it('shows a saved value on mount', () => {
    localStorage.setItem(VOLUME, '0.75');
    mountFrame();
    expect(slider().value).toBe('75');
  });

  it.each(['abc', '', '2', '-0.5', 'NaN', '1e0x', '0.5.5'])('falls back to 40% for the stored value %j', (raw) => {
    localStorage.setItem(VOLUME, raw);
    mountFrame();
    expect(slider().value).toBe('40');
  });
});

describe('Profile controls through the actions (Req 2.x, 12.4)', () => {
  it('limits the name to 40 characters, with the hint', () => {
    const calls = mountFrame();
    expect(screen.getByText('Up to 40 characters.')).toBeInTheDocument();
    const input = screen.getByRole('textbox', { name: /your name/i });
    fireEvent.change(input, { target: { value: 'x'.repeat(41) } });
    expect(calls).toContain(`name:${'x'.repeat(41)}`);
    expect(screen.getByRole('alert').textContent).toBe(NAME_TOO_LONG_MESSAGE);
    fireEvent.change(input, { target: { value: 'Ada' } });
    expect(calls).toContain('name:Ada');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('offers the six colours and sends the chosen one', () => {
    const calls = mountFrame();
    expect(CANDLE_COLOURS).toHaveLength(6);
    expect(screen.getAllByRole('radio', { name: new RegExp(Object.values(COLOUR_NAMES).join('|')) }).length).toBe(6);
    const other = CANDLE_COLOURS.find((c) => c !== 'rose')!;
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(COLOUR_NAMES[other]) }));
    expect(calls).toContain(`colour:${other}`);
  });

  it('sends the pace guide toggle', () => {
    const calls = mountFrame();
    const box = screen.getByRole('checkbox', { name: /pace guide/i });
    fireEvent.click(box);
    expect(calls).toContain(`pace:${!profile().paceGuideEnabled}`);
  });
});

describe('Delete my profile and Clear my data confirmations (Req 2.x, 12.4)', () => {
  it('Cancel on "Delete my profile?" returns to the form without deleting', () => {
    const calls = mountFrame();
    fireEvent.click(screen.getByRole('button', { name: 'Delete my profile' }));
    expect(screen.getByRole('heading', { name: 'Delete my profile?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('heading', { name: 'Delete my profile?' })).toBeNull();
    expect(calls).not.toContain('delete');
  });

  it('Escape cancels "Delete my profile?" and focus returns to its button', () => {
    const calls = mountFrame();
    fireEvent.click(screen.getByRole('button', { name: 'Delete my profile' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('heading', { name: 'Delete my profile?' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete my profile' }));
    expect(calls).not.toContain('delete');
  });

  it('confirming "Delete my profile?" calls the delete action', () => {
    const calls = mountFrame();
    fireEvent.click(screen.getByRole('button', { name: 'Delete my profile' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(within(screen.getByRole('tabpanel')).getAllByRole('button', { name: 'Delete my profile' })[0]);
    expect(calls).toContain('delete');
  });

  it('Cancel and Escape on "Clear my data?" do not clear anything', () => {
    let cleared = 0;
    mountFrame(async () => {
      cleared += 1;
      return true;
    });
    for (const close of [
      () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })),
      () => fireEvent.keyDown(document, { key: 'Escape' }),
    ]) {
      fireEvent.click(screen.getByRole('button', { name: 'Clear my data' }));
      expect(screen.getByRole('heading', { name: 'Clear my data?' })).toBeInTheDocument();
      close();
      expect(screen.queryByRole('heading', { name: 'Clear my data?' })).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Clear my data' }));
    }
    expect(cleared).toBe(0);
  });

  it('a failed clear shows the error, keeps the shell keys and offers "Try again"', async () => {
    localStorage.setItem(GOAL, '30');
    mountFrame(async () => false);
    fireEvent.click(screen.getByRole('button', { name: 'Clear my data' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear my data' }).at(-1)!);
    expect((await screen.findByRole('alert')).textContent).toBe(LIBRARY_MESSAGES.clearFailed);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(localStorage.getItem(GOAL)).toBe('30');
  });

  it('a successful clear removes the three shell keys, keeps others, and the tab shows defaults', async () => {
    mountFrame();
    // Volume slider moved and a choice made, then everything else is set directly.
    fireEvent.change(screen.getByRole('slider', { name: 'Haunt volume cap' }), { target: { value: '80' } });
    localStorage.setItem(GOAL, '45');
    localStorage.setItem(TAB, 'seance');
    localStorage.setItem(CHOICE_KEY, 'camera');
    expect(localStorage.getItem(VOLUME)).toBe('0.8');

    fireEvent.click(screen.getByRole('button', { name: 'Clear my data' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear my data' }).at(-1)!);

    await waitFor(() => expect(localStorage.getItem(VOLUME)).toBeNull());
    expect(localStorage.getItem(GOAL)).toBeNull();
    expect(localStorage.getItem(TAB)).toBeNull();
    // Not a shell key: the camera choice has its own meaning and is left alone.
    expect(localStorage.getItem(CHOICE_KEY)).toBe('camera');
    // The tab remounted showing defaults.
    expect((screen.getByRole('slider', { name: 'Haunt volume cap' }) as HTMLInputElement).value).toBe('40');
    expect(screen.queryByRole('heading', { name: 'Clear my data?' })).toBeNull();
  });
});

describe('Clear my data through the real shell (Req 2.x, 12.4)', () => {
  async function clearThroughShell() {
    const store = await storeWith(readyModel());
    show(store);
    await openSeance();
    localStorage.setItem(GOAL, '45');
    fireEvent.change(screen.getByRole('slider', { name: 'Haunt volume cap' }), { target: { value: '80' } });
    expect(localStorage.getItem(TAB)).toBe('seance');
    fireEvent.click(screen.getByRole('button', { name: 'Clear my data' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear my data' }).at(-1)!);
    await screen.findByRole('region', { name: /your name and candle/i }); // onboarding is back
    await waitFor(() => expect(localStorage.getItem(TAB)).toBeNull());
    return store;
  }

  it('empties the store and removes rod_daily_goal, rod_shell_tab and rod_volume_cap', async () => {
    const store = await clearThroughShell();
    expect(localStorage.getItem(GOAL)).toBeNull();
    expect(localStorage.getItem(VOLUME)).toBeNull();
    expect((await saved(store)).profile).toEqual(EMPTY_DATA_MODEL.profile);
  });

  it('lastTab: the saved key is gone, but the in-memory ref still reopens the Séance after onboarding', async () => {
    await clearThroughShell();
    fireEvent.click(await screen.findByRole('button', { name: 'Skip introduction' }));
    await screen.findByRole('tab', { name: 'The Séance' });
    // Recorded behaviour, not a requirement: LibraryShell's lastTab ref survives the clear.
    expect(screen.getByRole('tab', { name: 'The Séance' }).getAttribute('aria-selected')).toBe('true');
    // The shell does not write the key again just by reopening on the Séance.
    expect(localStorage.getItem(TAB)).toBeNull();
    // After a defaults reset, the volume slider is back at 40%.
    expect((screen.getByRole('slider', { name: 'Haunt volume cap' }) as HTMLInputElement).value).toBe('40');
  });
});

describe('Profile writes through the real library actions (Req 2.x, 12.4)', () => {
  it('name, colour and pace guide changes reach the store', async () => {
    const store = await storeWith(readyModel({ paceGuideEnabled: true }));
    show(store);
    await openSeance();
    fireEvent.change(screen.getByRole('textbox', { name: /your name/i }), { target: { value: 'Ada' } });
    const other = CANDLE_COLOURS.find((c) => c !== 'rose')!;
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(COLOUR_NAMES[other]) }));
    fireEvent.click(screen.getByRole('checkbox', { name: /pace guide/i }));
    await waitFor(async () => {
      const p = (await saved(store)).profile;
      expect(p.displayName).toBe('Ada');
      expect(p.candleColour).toBe(other);
      expect(p.paceGuideEnabled).toBe(false);
    });
  });

  it('does not change the name past 40 characters', async () => {
    const store = await storeWith(readyModel());
    show(store);
    await openSeance();
    fireEvent.change(screen.getByRole('textbox', { name: /your name/i }), { target: { value: 'x'.repeat(41) } });
    expect((await screen.findByRole('alert')).textContent).toBe(NAME_TOO_LONG_MESSAGE);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600)); // past the 400 ms save delay
    });
    expect((await saved(store)).profile.displayName).toBe('Mina');
  });
});

describe('The library tab no longer has the gear (Req 2.x, 12.4)', () => {
  it('has no settings button and no dialog on the Library tab', async () => {
    const store = await storeWith(readyModel());
    show(store);
    await screen.findByRole('heading', { name: 'Welcome back, Mina' });
    expect(screen.queryByRole('button', { name: /settings/i })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: /profile/i })).toBeNull();
  });

  it('the Séance panel is a tab panel, not a dialog', async () => {
    const store = await storeWith(readyModel());
    show(store);
    await openSeance();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('tabpanel', { name: 'The Séance' })).toBeInTheDocument();
  });
});

describe('Disabled while loading (Req 2.x)', () => {
  it('disables the profile controls while the store loads', () => {
    render(
      <SeanceTab
        profile={profile()}
        actions={{ changeName: () => null, changeColour: () => undefined, changePaceGuide: () => undefined, deleteProfile: () => undefined }}
        message={null}
        loading
        onClearData={async () => true}
      />,
    );
    expect((screen.getByRole('textbox', { name: /your name/i }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Clear my data' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Delete my profile' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('The Séance imports no camera code (Req 2.x)', () => {
  const sources = import.meta.glob(['../shell/Seance*.tsx', '../shell/volumeCap.ts'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;

  it('finds the Séance source files', () => {
    expect(Object.keys(sources).length).toBeGreaterThanOrEqual(6);
  });

  it('imports nothing from camera, detector or video modules', () => {
    for (const [file, text] of Object.entries(sources)) {
      const specs = [...text.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const spec of specs) {
        if (/^\.\/Seance[A-Z]\w*$/.test(spec)) continue; // sibling Séance files are checked on their own
        // The only attention module allowed is the choice storage.
        if (spec.includes('attention')) expect(spec, file).toMatch(/attention\/storage$/);
        expect(spec, file).not.toMatch(/mediapipe|detector|camera|video|tasks-vision/i);
      }
      expect(text, file).not.toMatch(/getUserMedia/);
    }
  });
});
