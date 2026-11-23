/** Runs one Property 23 script against the real gate and returns which shapes it produced. */
import { verify } from './gateCapChecks';
import type { Scenario } from './gateCapScript';
import { World, type FlagName } from './gateCapWorld';

export async function runScenario(s: Scenario): Promise<ReadonlySet<FlagName>> {
  const w = new World(s);
  try {
    if (!s.soundOn) w.gate.setSoundEnabled(false);
    if (s.unlockAtStart) {
      w.unlockTarget.dispatchEvent(new Event('pointerdown'));
      for (let i = 0; i < 8; i++) await Promise.resolve();
    }
    verify(w);
    for (const step of s.steps) {
      await w.perform(step.a);
      verify(w);
      await w.advance(step.dt, () => verify(w));
    }
    return w.flags;
  } finally {
    w.dispose();
  }
}
