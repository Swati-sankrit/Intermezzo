import {
  CANDLE_COLOURS,
  MAX_AVERAGE_PACE,
  MAX_DISPLAY_NAME,
  MIN_AVERAGE_PACE,
  SCHEMA_VERSION,
  SHELF_NAMES,
  STATS_FIELDS,
  type DataModel,
} from './model';

export type ValidationResult =
  | { ok: true; value: DataModel }
  | { ok: false; problems: string[] };

type Rec = Record<string, unknown>;

function isRecord(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isIndex(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Reports any key not in `allowed`; this also keeps book text out of the model (16.2). */
function checkKeys(obj: Rec, allowed: readonly string[], where: string, problems: string[]): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) problems.push(`${where}: unexpected field "${key}"`);
  }
}

const PROFILE_KEYS = ['displayName', 'candleColour', 'onboardingCompleted', 'paceGuideEnabled', 'averagePace'];
const BOOK_KEYS = [
  'bookId', 'title', 'author', 'fileName', 'source', 'format', 'catalogueSlug', 'addedAt',
];
const POSITION_KEYS = ['chapterIndex', 'paragraphIndex', 'savedAt', 'progress'];
const TOP_KEYS = ['schemaVersion', 'profile', 'shelves', 'books', 'positions', 'stats', 'daily'];

function checkProfile(v: unknown, problems: string[]): void {
  if (!isRecord(v)) {
    problems.push('profile: missing or not an object');
    return;
  }
  checkKeys(v, PROFILE_KEYS, 'profile', problems);
  if (typeof v.displayName !== 'string') {
    problems.push('profile.displayName: must be a string');
  } else if (v.displayName.length > MAX_DISPLAY_NAME) {
    problems.push(`profile.displayName: longer than ${MAX_DISPLAY_NAME} characters`);
  }
  if (typeof v.candleColour !== 'string' || !(CANDLE_COLOURS as readonly string[]).includes(v.candleColour)) {
    problems.push('profile.candleColour: not one of the allowed colours');
  }
  if (typeof v.onboardingCompleted !== 'boolean') {
    problems.push('profile.onboardingCompleted: must be true or false');
  }
  if (typeof v.paceGuideEnabled !== 'boolean') {
    problems.push('profile.paceGuideEnabled: must be true or false');
  }
  if (!isFiniteNumber(v.averagePace) || v.averagePace < MIN_AVERAGE_PACE || v.averagePace > MAX_AVERAGE_PACE) {
    problems.push(`profile.averagePace: must be a number from ${MIN_AVERAGE_PACE} to ${MAX_AVERAGE_PACE}`);
  }
}

function checkBooks(v: unknown, problems: string[]): Set<string> {
  const ids = new Set<string>();
  if (!isRecord(v)) {
    problems.push('books: missing or not an object');
    return ids;
  }
  for (const [id, entry] of Object.entries(v)) {
    ids.add(id);
    const where = `books[${id}]`;
    if (!isRecord(entry)) {
      problems.push(`${where}: not an object`);
      continue;
    }
    checkKeys(entry, BOOK_KEYS, where, problems);
    if (entry.bookId !== id) problems.push(`${where}.bookId: does not match its key`);
    for (const f of ['title', 'author', 'fileName'] as const) {
      if (typeof entry[f] !== 'string') problems.push(`${where}.${f}: must be a string`);
    }
    if (entry.source !== 'catalogue' && entry.source !== 'upload') {
      problems.push(`${where}.source: must be "catalogue" or "upload"`);
    }
    if (entry.format !== 'txt' && entry.format !== 'epub') {
      problems.push(`${where}.format: must be "txt" or "epub"`);
    }
    if (entry.catalogueSlug !== undefined && typeof entry.catalogueSlug !== 'string') {
      problems.push(`${where}.catalogueSlug: must be a string`);
    }
    if (!isFiniteNumber(entry.addedAt)) problems.push(`${where}.addedAt: must be a finite number`);
  }
  return ids;
}

function checkShelves(v: unknown, ids: Set<string>, problems: string[]): void {
  if (!isRecord(v)) {
    problems.push('shelves: missing or not an object');
    return;
  }
  checkKeys(v, SHELF_NAMES, 'shelves', problems);
  const seen = new Set<string>();
  const reported = new Set<string>();
  for (const name of SHELF_NAMES) {
    const list = v[name];
    if (!Array.isArray(list)) {
      problems.push(`shelves.${name}: missing or not a list`);
      continue;
    }
    for (const id of list) {
      if (typeof id !== 'string') {
        problems.push(`shelves.${name}: entry is not a Book_Id string`);
        continue;
      }
      if (!ids.has(id)) problems.push(`shelves.${name}: Book_Id "${id}" has no book entry`);
      if (seen.has(id) && !reported.has(id)) {
        reported.add(id);
        problems.push(`shelves: Book_Id "${id}" appears more than once`);
      }
      seen.add(id);
    }
  }
}

function checkPositions(v: unknown, ids: Set<string>, problems: string[]): void {
  if (!isRecord(v)) {
    problems.push('positions: missing or not an object');
    return;
  }
  for (const [id, p] of Object.entries(v)) {
    const where = `positions[${id}]`;
    if (!ids.has(id)) problems.push(`${where}: Book_Id "${id}" has no book entry`);
    if (!isRecord(p)) {
      problems.push(`${where}: not an object`);
      continue;
    }
    checkKeys(p, POSITION_KEYS, where, problems);
    if (!isIndex(p.chapterIndex)) problems.push(`${where}.chapterIndex: must be a whole number, 0 or more`);
    if (!isIndex(p.paragraphIndex)) problems.push(`${where}.paragraphIndex: must be a whole number, 0 or more`);
    if (!isFiniteNumber(p.savedAt)) problems.push(`${where}.savedAt: must be a finite number`);
    if (!isIndex(p.progress) || p.progress > 100) {
      problems.push(`${where}.progress: must be a whole number from 0 to 100`);
    }
  }
}

function isRealDate(key: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(2000, mo - 1, d));
  date.setUTCFullYear(y);
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

function checkDaily(v: unknown, problems: string[]): void {
  if (!isRecord(v)) {
    problems.push('daily: missing or not an object');
    return;
  }
  for (const [date, s] of Object.entries(v)) {
    const where = `daily[${date}]`;
    if (!isRealDate(date)) problems.push(`${where}: key is not a real YYYY-MM-DD date`);
    if (!isRecord(s)) {
      problems.push(`${where}: not an object`);
      continue;
    }
    checkKeys(s, STATS_FIELDS, where, problems);
    for (const f of STATS_FIELDS) {
      const n = s[f];
      if (!isFiniteNumber(n) || n < 0 || !Number.isInteger(n)) {
        problems.push(`${where}.${f}: must be a whole number, 0 or more`);
      }
    }
  }
}

function checkStats(v: unknown, ids: Set<string>, problems: string[]): void {
  if (!isRecord(v)) {
    problems.push('stats: missing or not an object');
    return;
  }
  for (const [id, s] of Object.entries(v)) {
    const where = `stats[${id}]`;
    if (!ids.has(id)) problems.push(`${where}: Book_Id "${id}" has no book entry`);
    if (!isRecord(s)) {
      problems.push(`${where}: not an object`);
      continue;
    }
    checkKeys(s, STATS_FIELDS, where, problems);
    for (const f of STATS_FIELDS) {
      const n = s[f];
      if (!isFiniteNumber(n) || n < 0 || !Number.isInteger(n)) {
        problems.push(`${where}.${f}: must be a whole number, 0 or more`);
      }
    }
  }
  for (const id of ids) {
    if (!Object.hasOwn(v, id)) problems.push(`stats[${id}]: missing stats for this book`);
  }
}

/** Checks unknown data against the current Data_Model shape (Requirement 16). Never throws. */
export function validate(input: unknown): ValidationResult {
  const problems: string[] = [];
  if (!isRecord(input)) return { ok: false, problems: ['data model: not an object'] };

  checkKeys(input, TOP_KEYS, 'data model', problems);
  if (input.schemaVersion !== SCHEMA_VERSION) {
    problems.push(`schemaVersion: must be ${SCHEMA_VERSION}`);
  }
  checkProfile(input.profile, problems);
  const ids = checkBooks(input.books, problems);
  checkShelves(input.shelves, ids, problems);
  checkPositions(input.positions, ids, problems);
  checkStats(input.stats, ids, problems);
  checkDaily(input.daily, problems);

  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, value: input as unknown as DataModel };
}
