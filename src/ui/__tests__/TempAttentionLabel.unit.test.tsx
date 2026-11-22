import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createAttention } from '../../attention';
import { fakePorts } from '../../attention/__tests__/fakes';
import { TempAttentionLabel } from '../TempAttentionLabel';
import { resetAttention, setAttentionForTests, useAttention } from '../useAttention';

function Host() {
  const { subscribeSignal } = useAttention();
  return <TempAttentionLabel subscribeSignal={subscribeSignal} />;
}

afterEach(() => resetAttention());

describe('TempAttentionLabel', () => {
  it('follows present, away, present from a real controller', async () => {
    const fake = fakePorts();
    fake.store.saveChoice('no-camera');
    setAttentionForTests(createAttention(fake.ports));
    render(<Host />);

    const label = screen.getByTestId('temp-attention-label');
    expect(label.textContent).toBe('Attention: present');
    await waitFor(() => expect(fake.clock.activeIntervals()).toBe(1));

    // Tab hidden for longer than the 1500 ms debounce.
    act(() => {
      fake.page.setTabActive(false);
      fake.advance(2000);
    });
    expect(label.textContent).toBe('Attention: away');

    act(() => fake.page.setTabActive(true));
    expect(label.textContent).toBe('Attention: present');
  });

  it('is inert: not focusable, hidden from assistive tech, no live region', () => {
    const fake = fakePorts();
    setAttentionForTests(createAttention(fake.ports));
    render(<Host />);
    const label = screen.getByTestId('temp-attention-label');
    expect(label.getAttribute('aria-hidden')).toBe('true');
    expect(label.hasAttribute('tabindex')).toBe(false);
    expect(label.hasAttribute('aria-live')).toBe(false);
    expect(label.tagName).toBe('DIV');
  });
});
