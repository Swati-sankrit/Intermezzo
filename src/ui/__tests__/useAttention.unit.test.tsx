import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { createAttention } from '../../attention';
import { fakePorts } from '../../attention/__tests__/fakes';
import { resetAttention, setAttentionForTests, useAttention } from '../useAttention';

let latest: ReturnType<typeof useAttention> | null = null;

function Probe() {
  const api = useAttention();
  useEffect(() => {
    latest = api;
  });
  return <p>choice: {api.status.choice}</p>;
}

afterEach(() => {
  resetAttention();
  latest = null;
});

describe('useAttention lifecycle', () => {
  it('starts after first paint, not during render, and stops on unmount', async () => {
    const fake = fakePorts();
    fake.store.saveChoice('no-camera');
    setAttentionForTests(createAttention(fake.ports));

    const view = render(<Probe />);
    // Not started yet: the recorded choice has not been read.
    expect(screen.getByText('choice: unanswered')).toBeTruthy();
    expect(fake.clock.activeIntervals()).toBe(0);

    await waitFor(() => expect(screen.getByText('choice: no-camera')).toBeTruthy());
    expect(fake.clock.activeIntervals()).toBe(1);

    view.unmount();
    expect(fake.clock.activeIntervals()).toBe(0);
    expect(fake.page.disposed).toBe(true);
  });

  it('does not start if unmounted before the deferred start runs', async () => {
    const fake = fakePorts();
    setAttentionForTests(createAttention(fake.ports));
    render(<Probe />).unmount();
    await new Promise((r) => setTimeout(r, 50));
    expect(fake.clock.activeIntervals()).toBe(0);
  });

  it('re-renders when status changes through a command', async () => {
    const fake = fakePorts();
    setAttentionForTests(createAttention(fake.ports));
    render(<Probe />);
    await waitFor(() => expect(fake.clock.activeIntervals()).toBe(1));

    act(() => latest?.chooseCamera(false));
    expect(screen.getByText('choice: no-camera')).toBeTruthy();
    expect(fake.camera.openCalls).toBe(0);
  });

  it('delivers signals through subscribeSignal', async () => {
    const fake = fakePorts();
    setAttentionForTests(createAttention(fake.ports));
    render(<Probe />);
    await waitFor(() => expect(fake.clock.activeIntervals()).toBe(1));

    const seen: string[] = [];
    const off = latest?.subscribeSignal((s) => seen.push(s.value));
    expect(seen).toEqual(['present']);
    off?.();
  });
});
