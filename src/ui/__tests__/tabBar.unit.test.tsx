import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShellFrame } from '../shell/ShellFrame';
import { TAB_STORAGE_KEY } from '../shell/tabStorage';

function mount() {
  return render(
    <>
      <ShellFrame library={<p>Library content</p>} />
      <button type="button">After the shell</button>
    </>,
  );
}

const tabs = () => screen.getAllByRole('tab');
const selectedName = () => tabs().find((t) => t.getAttribute('aria-selected') === 'true')?.textContent;

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('Tab_Bar ARIA', () => {
  it('exposes a tablist with three tabs and one tabpanel each, wired by id', () => {
    mount();
    expect(screen.getByRole('tablist')).toBeTruthy();
    expect(tabs().map((t) => t.textContent)).toEqual(['Library', 'The Ledger', 'The Séance']);
    for (const tab of tabs()) {
      const panel = document.getElementById(tab.getAttribute('aria-controls')!);
      expect(panel).not.toBeNull();
      expect(panel!.getAttribute('role')).toBe('tabpanel');
      expect(panel!.getAttribute('aria-labelledby')).toBe(tab.id);
    }
  });

  it('marks only the active tab selected and shows only its panel', () => {
    mount();
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(screen.getByText('Library content')).toBeTruthy();
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });

  it('switches the selected tab and panel on click', async () => {
    mount();
    await userEvent.click(screen.getByRole('tab', { name: 'The Ledger' }));
    expect(selectedName()).toBe('The Ledger');
    expect(screen.getByRole('tabpanel').id).toBe('shell-panel-ledger');
  });
});

describe('Tab_Bar keyboard', () => {
  it('has a single tab stop: Tab enters the active tab and the next Tab leaves the bar', async () => {
    mount();
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    await userEvent.tab();
    expect(document.activeElement).toBe(tabs()[0]);
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'After the shell' }));
  });

  it('moves the single tab stop to the newly active tab', async () => {
    mount();
    await userEvent.click(screen.getByRole('tab', { name: 'The Séance' }));
    expect(tabs().map((t) => t.tabIndex)).toEqual([-1, -1, 0]);
  });

  it('ArrowRight moves forward and wraps from the last tab to the first', async () => {
    mount();
    tabs()[0]!.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(selectedName()).toBe('The Ledger');
    expect(document.activeElement).toBe(tabs()[1]);
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(selectedName()).toBe('Library');
    expect(document.activeElement).toBe(tabs()[0]);
  });

  it('ArrowLeft moves back and wraps from the first tab to the last', async () => {
    mount();
    tabs()[0]!.focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(selectedName()).toBe('The Séance');
    expect(document.activeElement).toBe(tabs()[2]);
    await userEvent.keyboard('{ArrowLeft}');
    expect(selectedName()).toBe('The Ledger');
  });

  it('Home goes to the first tab and End to the last', async () => {
    mount();
    tabs()[0]!.focus();
    await userEvent.keyboard('{End}');
    expect(selectedName()).toBe('The Séance');
    expect(document.activeElement).toBe(tabs()[2]);
    await userEvent.keyboard('{Home}');
    expect(selectedName()).toBe('Library');
    expect(document.activeElement).toBe(tabs()[0]);
  });
});

describe('rod_shell_tab persistence', () => {
  it('writes the chosen tab to rod_shell_tab', async () => {
    mount();
    await userEvent.click(screen.getByRole('tab', { name: 'The Ledger' }));
    expect(localStorage.getItem(TAB_STORAGE_KEY)).toBe('ledger');
  });

  it('remembers the tab across a reload (write, unmount, re-mount)', async () => {
    const first = mount();
    await userEvent.click(screen.getByRole('tab', { name: 'The Séance' }));
    expect(localStorage.getItem('rod_shell_tab')).toBe('seance');
    first.unmount();

    mount();
    expect(selectedName()).toBe('The Séance');
    expect(screen.getByRole('tabpanel').id).toBe('shell-panel-seance');
  });

  it('opens on the saved tab when rod_shell_tab was set directly', () => {
    localStorage.setItem('rod_shell_tab', 'ledger');
    mount();
    expect(selectedName()).toBe('The Ledger');
  });

  it('falls back to Library when the saved value is not a tab name', () => {
    localStorage.setItem('rod_shell_tab', 'dungeon');
    mount();
    expect(selectedName()).toBe('Library');
    expect(screen.getByText('Library content')).toBeTruthy();
  });

  it('falls back to Library when nothing is saved', () => {
    mount();
    expect(selectedName()).toBe('Library');
  });
});
