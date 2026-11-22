import { discovered } from './discover';
import type { Haunt } from './types';

export interface RegistryResult {
  readonly haunts: readonly Haunt[];
  readonly warnings: readonly string[];
}

type Candidate = {
  readonly id: string;
  readonly name: string;
  readonly start: Haunt['start'];
  readonly setLevel: Haunt['setLevel'];
  readonly stop: Haunt['stop'];
};

function asCandidate(mod: unknown): Candidate | null {
  if (mod === null || (typeof mod !== 'object' && typeof mod !== 'function')) return null;
  const m = mod as Record<string, unknown>;
  const { id, name, start, setLevel, stop } = m;
  if (typeof id !== 'string' || id === '') return null;
  if (typeof name !== 'string') return null;
  if (typeof start !== 'function' || typeof setLevel !== 'function' || typeof stop !== 'function') return null;
  return {
    id,
    name,
    start: start as Haunt['start'],
    setLevel: setLevel as Haunt['setLevel'],
    stop: stop as Haunt['stop'],
  };
}

/** Pure. `modules` maps file path to module namespace (unknown shape). */
export function buildRegistry(modules: Readonly<Record<string, unknown>>): RegistryResult {
  // Plain code-unit order, independent of the order the record was built in.
  const paths = Object.keys(modules).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const haunts: Haunt[] = [];
  const warnings: string[] = [];
  const pathById = new Map<string, string>();

  for (const path of paths) {
    const candidate = asCandidate(modules[path]);
    if (candidate === null) {
      warnings.push(`Haunt file ${path} was skipped: it does not export id, name, start, setLevel and stop.`);
      continue;
    }
    const firstPath = pathById.get(candidate.id);
    if (firstPath !== undefined) {
      warnings.push(`Haunt file ${path} was skipped: its id "${candidate.id}" is already used by ${firstPath}.`);
      continue;
    }
    pathById.set(candidate.id, path);
    haunts.push(candidate);
  }
  return { haunts, warnings };
}

export function loadHaunts(warn?: (msg: string) => void): readonly Haunt[] {
  const { haunts, warnings } = buildRegistry(discovered);
  if (warn) for (const w of warnings) warn(w);
  return haunts;
}
