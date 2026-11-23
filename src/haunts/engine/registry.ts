import { discovered } from './discover';
import type { Haunt } from './types';

import type { HauntMode } from './ghost/mode';
import { HAUNT_MODES } from './ghost/mode';
import type { ReturnEffect } from './returnTypes';

export interface RegistryResult {
  readonly haunts: readonly Haunt[];
  readonly effects: readonly ReturnEffect[];
  readonly warnings: readonly string[];
}

type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

function parseModes(raw: unknown): Parsed<readonly HauntMode[] | undefined> {
  if (raw === undefined) return { ok: true, value: undefined };
  const valid =
    Array.isArray(raw) &&
    raw.length > 0 &&
    raw.every((m) => typeof m === 'string' && (HAUNT_MODES as readonly string[]).includes(m));
  if (!valid) return { ok: false, reason: 'modes must be a non-empty list of gentle, classic or nightmare' };
  return { ok: true, value: raw as readonly HauntMode[] };
}

function asHaunt(m: Record<string, unknown>): Parsed<Haunt> | null {
  const { id, name, start, setLevel, stop, role, minLevel } = m;
  if (typeof id !== 'string' || id === '' || typeof name !== 'string') return null;
  if (typeof start !== 'function' || typeof setLevel !== 'function' || typeof stop !== 'function') return null;
  if (role !== undefined && role !== 'lead' && role !== 'layer') {
    return { ok: false, reason: 'role must be "lead" or "layer"' };
  }
  if (minLevel !== undefined && minLevel !== 1 && minLevel !== 2 && minLevel !== 3) {
    return { ok: false, reason: 'minLevel must be 1, 2 or 3' };
  }
  const modes = parseModes(m.modes);
  if (!modes.ok) return modes;
  const haunt = {
    id,
    name,
    start: start as Haunt['start'],
    setLevel: setLevel as Haunt['setLevel'],
    stop: stop as Haunt['stop'],
    ...(role !== undefined ? { role } : {}),
    ...(modes.value !== undefined ? { modes: modes.value } : {}),
    ...(minLevel !== undefined ? { minLevel } : {}),
  } as Haunt;
  return { ok: true, value: haunt };
}

function asEffect(m: Record<string, unknown>): Parsed<ReturnEffect> | null {
  const { id, name, span, begin, end, jumpSound } = m;
  if (typeof id !== 'string' || id === '' || typeof name !== 'string') return null;
  if (typeof span !== 'function' || typeof begin !== 'function' || typeof end !== 'function') return null;
  if (jumpSound !== undefined && typeof jumpSound !== 'boolean') {
    return { ok: false, reason: 'jumpSound must be true or false' };
  }
  const modes = parseModes(m.modes);
  if (!modes.ok) return modes;
  const effect = {
    id,
    name,
    span: span as ReturnEffect['span'],
    begin: begin as ReturnEffect['begin'],
    end: end as ReturnEffect['end'],
    ...(modes.value !== undefined ? { modes: modes.value } : {}),
    ...(jumpSound !== undefined ? { jumpSound } : {}),
  } as ReturnEffect;
  return { ok: true, value: effect };
}

/** Pure. `modules` maps file path to module namespace (unknown shape). */
export function buildRegistry(modules: Readonly<Record<string, unknown>>): RegistryResult {
  // Plain code-unit order, independent of the order the record was built in.
  const paths = Object.keys(modules).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const haunts: Haunt[] = [];
  const effects: ReturnEffect[] = [];
  const warnings: string[] = [];
  const pathById = new Map<string, string>();

  for (const path of paths) {
    const mod = modules[path];
    const isObj = mod !== null && (typeof mod === 'object' || typeof mod === 'function');
    const m = isObj ? (mod as Record<string, unknown>) : {};
    const h = asHaunt(m);
    const e = asEffect(m);
    const bad = [h, e].find((r) => r !== null && !r.ok);
    if (bad && !bad.ok) {
      warnings.push(`File ${path} was skipped: ${bad.reason}.`);
      continue;
    }
    if (h === null && e === null) {
      warnings.push(
        `File ${path} was skipped: it is neither a haunt (id, name, start, setLevel, stop) nor a return effect (id, name, span, begin, end).`,
      );
      continue;
    }
    const id = (m as { id: string }).id;
    const firstPath = pathById.get(id);
    if (firstPath !== undefined) {
      warnings.push(`File ${path} was skipped: its id "${id}" is already used by ${firstPath}.`);
      continue;
    }
    pathById.set(id, path);
    if (h?.ok) haunts.push(h.value);
    if (e?.ok) effects.push(e.value);
  }
  return { haunts, effects, warnings };
}

export function loadHaunts(warn?: (msg: string) => void): readonly Haunt[] {
  const { haunts, warnings } = buildRegistry(discovered);
  if (warn) for (const w of warnings) warn(w);
  return haunts;
}

export function loadRegistry(warn?: (msg: string) => void): {
  readonly haunts: readonly Haunt[];
  readonly effects: readonly ReturnEffect[];
} {
  const { haunts, effects, warnings } = buildRegistry(discovered);
  if (warn) for (const w of warnings) warn(w);
  return { haunts, effects };
}
