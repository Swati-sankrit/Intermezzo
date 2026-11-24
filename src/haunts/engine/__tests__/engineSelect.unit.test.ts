/**
 * Task 5.8: `selectByMode` and `layersToRun`, the pure selection of leads and layers.
 */
import { describe, expect, it } from 'vitest';
import { layersToRun, selectByMode } from '../engineSelect';
import type { Haunt } from '../types';
import { recordingHaunt } from './wiringWorld';
const BOTH = ['classic', 'nightmare'] as const;
const stub = (id: string, extra: Pick<Haunt, 'role' | 'modes' | 'minLevel'> = {}): Haunt =>
  recordingHaunt(id, () => 0, extra);
describe('selectByMode and layersToRun', () => {
  const all = [
    stub('a'),
    stub('b', { role: 'lead', modes: ['gentle', 'classic'] }),
    stub('c', { modes: [...BOTH] }),
    stub('l1', { role: 'layer', modes: [...BOTH] }),
    stub('l3', { role: 'layer', modes: [...BOTH], minLevel: 3 }),
    stub('lN', { role: 'layer', modes: ['nightmare'] }),
    stub('lG', { role: 'layer', modes: ['gentle', 'classic'] }),
  ];
  it('splits leads and layers and honours modes (a missing role is a lead, missing modes is all)', () => {
    const ids = (hs: Haunt[]): string[] => hs.map((h) => h.id);
    const g = selectByMode(all, 'gentle');
    expect([ids(g.leads), ids(g.layers)]).toEqual([['a', 'b'], ['lG']]);
    const c = selectByMode(all, 'classic');
    expect([ids(c.leads), ids(c.layers)]).toEqual([['a', 'b', 'c'], ['l1', 'l3', 'lG']]);
    const n = selectByMode(all, 'nightmare');
    expect([ids(n.leads), ids(n.layers)]).toEqual([['a', 'c'], ['l1', 'l3', 'lN']]);
  });
  it('runs a layer when its modes include the mode and the level reaches minLevel; none at level 0 or in Gentle', () => {
    const layers = all.filter((h) => h.role === 'layer');
    expect(layersToRun(layers, 0, 'classic')).toEqual([]);
    expect(layersToRun(layers, 1, 'classic')).toEqual(['l1', 'lG']);
    expect(layersToRun(layers, 2, 'nightmare')).toEqual(['l1', 'lN']);
    expect(layersToRun(layers, 3, 'classic')).toEqual(['l1', 'l3', 'lG']);
    expect(layersToRun(layers, 3, 'gentle')).toEqual([]);
  });
});
