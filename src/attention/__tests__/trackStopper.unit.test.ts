/** createTrackStopper: stops every track, rethrows, and is safe to repeat. */
import { describe, expect, it } from 'vitest';
import { createTrackStopper } from '../cameraAdapter';

function track(failsUntil: { n: number }) {
  const t = { calls: 0, stop() {
    t.calls += 1;
    if (failsUntil.n > 0) {
      failsUntil.n -= 1;
      throw new Error('stop failed');
    }
  } };
  return t;
}

describe('createTrackStopper', () => {
  it('stops every track even when the first throws, then rethrows', () => {
    const a = track({ n: 1 });
    const b = track({ n: 0 });
    const stop = createTrackStopper([a, b] as unknown as MediaStreamTrack[]);
    expect(stop).toThrow('stop failed');
    expect(b.calls).toBe(1);
  });

  it('on retry skips tracks that stopped and retries the one that threw', () => {
    const a = track({ n: 1 });
    const b = track({ n: 0 });
    const stop = createTrackStopper([a, b] as unknown as MediaStreamTrack[]);
    expect(stop).toThrow();
    expect(stop).not.toThrow();
    expect(a.calls).toBe(2);
    expect(b.calls).toBe(1);
    stop();
    expect([a.calls, b.calls]).toEqual([2, 1]);
  });
});
