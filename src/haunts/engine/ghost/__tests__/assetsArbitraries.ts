import fc from 'fast-check';

/**
 * Independent reference allowlist for Property 29. Spelled out here on purpose:
 * the lists under test are never used as the expected values.
 */
export const REF_GHOSTS: readonly string[] = ['ghost-standing.png', 'ghost-face.png'];
export const REF_SOUNDS: readonly string[] = [
  'footsteps.mp3',
  'breathing.mp3',
  'heartbeat.mp3',
  'creak.mp3',
  'knock.mp3',
  'scream.mp3',
  'drone.mp3',
];

export type Kind = 'ghost' | 'sound';

export const refList = (kind: Kind): readonly string[] => (kind === 'ghost' ? REF_GHOSTS : REF_SOUNDS);
export const refFolder = (kind: Kind): string => (kind === 'ghost' ? '/ghosts/' : '/sounds/');

export type Shape =
  | 'valid'
  | 'random'
  | 'case'
  | 'whitespace'
  | 'traversal'
  | 'slash'
  | 'querystring'
  | 'encoded'
  | 'url'
  | 'crossKind'
  | 'empty'
  | 'lookalike'
  | 'extraExtension'
  | 'prefixSuffix';

export const NEAR_MISS_SHAPES: readonly Shape[] = [
  'case',
  'whitespace',
  'traversal',
  'slash',
  'querystring',
  'encoded',
  'url',
  'crossKind',
  'empty',
  'lookalike',
  'extraExtension',
  'prefixSuffix',
];

export interface AssetInput {
  shape: Shape;
  kind: Kind;
  name: string;
}

const ALL_NAMES: readonly string[] = [...REF_GHOSTS, ...REF_SOUNDS];
const kindArb = fc.constantFrom<Kind>('ghost', 'sound');
const anyNameArb = fc.constantFrom(...ALL_NAMES);

const LOOKALIKES: Record<string, string> = {
  a: '\u0430', // Cyrillic a
  e: '\u0435', // Cyrillic e
  o: '\u043e', // Cyrillic o
  p: '\u0440', // Cyrillic er
  c: '\u0441', // Cyrillic es
  i: '\u0456', // Cyrillic i
  s: '\u0455', // Cyrillic dze
  g: '\u0261', // Latin script g
  '.': '\uff0e', // fullwidth full stop
  '-': '\u2010', // hyphen
};

const WHITESPACE = [' ', '\t', '\n', '\r', '\u00a0', '\u3000', '\u200b', '\ufeff'];

const pct = (s: string): string =>
  [...s].map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('');

function build(shape: Shape, make: (n: string) => fc.Arbitrary<string>): fc.Arbitrary<AssetInput> {
  return fc
    .tuple(kindArb, anyNameArb)
    .chain(([kind, base]) => make(base).map((name) => ({ shape, kind, name })))
    .filter((v) => !refList(v.kind).includes(v.name));
}

const caseArb = build('case', (n) =>
  fc.oneof(
    fc.constant(n.toUpperCase()),
    fc.constant(n[0].toUpperCase() + n.slice(1)),
    fc
      .array(fc.boolean(), { minLength: n.length, maxLength: n.length })
      .map((flags) => [...n].map((c, i) => (flags[i] ? c.toUpperCase() : c)).join('')),
  ),
);

const whitespaceArb = build('whitespace', (n) =>
  fc.tuple(fc.constantFrom(...WHITESPACE), fc.constantFrom('lead', 'trail', 'both', 'inside')).map(([w, where]) => {
    if (where === 'lead') return w + n;
    if (where === 'trail') return n + w;
    if (where === 'both') return w + n + w;
    return n.slice(0, 3) + w + n.slice(3);
  }),
);

const traversalArb = build('traversal', (n) =>
  fc.constantFrom(
    `../${n}`,
    `../../${n}`,
    `..\\${n}`,
    `./${n}`,
    `ghosts/../${n}`,
    `${n}/..`,
    `../../etc/passwd`,
    `..`,
    `../ghosts/${n}`,
    `..%2f${n}`,
  ),
);

const slashArb = build('slash', (n) =>
  fc.constantFrom(`/${n}`, `${n}/`, `a/${n}`, `${n}/x`, `\\${n}`, `${n}\\`, `//${n}`, `x/y/${n}`),
);

const querystringArb = build('querystring', (n) =>
  fc
    .tuple(fc.constantFrom('?', '#', '?v=1', '#frag', '?a=b&c=d', '?/', '#/'), fc.boolean())
    .map(([suffix, before]) => (before ? suffix + n : n + suffix)),
);

const encodedArb = build('encoded', (n) =>
  fc.constantFrom(
    pct(n),
    n.replace('.', '%2e'),
    n.replace('.', '%2E'),
    n.replace('-', '%2d'),
    `%2e%2e%2f${n}`,
    `%2Fghosts%2F${n}`,
    `%252e${n}`,
    encodeURIComponent(` ${n}`),
    n + '%00',
    n + '%0a',
  ),
);

const urlArb = build('url', (n) =>
  fc.constantFrom(
    `http://example.com/ghosts/${n}`,
    `https://evil.example/sounds/${n}`,
    `https://${n}`,
    `//cdn.example/${n}`,
    `/ghosts/${n}`,
    `/sounds/${n}`,
    `file:///${n}`,
    `data:text/plain,${n}`,
    `javascript:${n}`,
    `ftp://host/${n}`,
  ),
);

const crossKindArb: fc.Arbitrary<AssetInput> = fc
  .tuple(kindArb)
  .chain(([kind]) =>
    fc.constantFrom(...(kind === 'ghost' ? REF_SOUNDS : REF_GHOSTS)).map((name) => ({ shape: 'crossKind' as const, kind, name })),
  );

const emptyArb: fc.Arbitrary<AssetInput> = kindArb.map((kind) => ({ shape: 'empty' as const, kind, name: '' }));

const homoglyphArb = build('lookalike', (n) => {
  const idx = [...n].map((c, i) => (c in LOOKALIKES ? i : -1)).filter((i) => i >= 0);
  return fc.constantFrom(...idx).map((i) => n.slice(0, i) + LOOKALIKES[n[i]] + n.slice(i + 1));
});

const invisibleArb = build('lookalike', (n) =>
  fc.tuple(fc.integer({ min: 0, max: n.length }), fc.constantFrom('\u200b', '\u200d', '\u00ad', '\u0301')).map(
    ([i, z]) => n.slice(0, i) + z + n.slice(i),
  ),
);

const lookalikeArb = fc.oneof(homoglyphArb, invisibleArb);

const extraExtensionArb = build('extraExtension', (n) =>
  fc.constantFrom('.png', '.mp3', '.bak', '.exe', '.js', '.txt', '.', '.gz').map((ext) => n + ext),
);

const prefixSuffixArb = build('prefixSuffix', (n) =>
  fc.tuple(fc.integer({ min: 1, max: n.length - 1 }), fc.constantFrom('prefix', 'suffix', 'doubled', 'x-before', 'x-after')).map(
    ([k, how]) => {
      if (how === 'prefix') return n.slice(0, k);
      if (how === 'suffix') return n.slice(k);
      if (how === 'doubled') return n + n;
      if (how === 'x-before') return 'x' + n;
      return n + 'x';
    },
  ),
);

const validArb: fc.Arbitrary<AssetInput> = kindArb.chain((kind) =>
  fc.constantFrom(...refList(kind)).map((name) => ({ shape: 'valid' as const, kind, name })),
);

const randomArb: fc.Arbitrary<AssetInput> = fc
  .tuple(kindArb, fc.oneof(fc.string({ unit: 'binary' }), fc.string({ unit: 'grapheme' }), fc.string({ maxLength: 24 })))
  .map(([kind, name]) => ({ shape: 'random' as const, kind, name }))
  .filter((v) => !refList(v.kind).includes(v.name));

/** One arbitrary mixing accepted names, random strings and every near-miss shape. */
export const assetInputArb: fc.Arbitrary<AssetInput> = fc.oneof(
  validArb,
  randomArb,
  caseArb,
  whitespaceArb,
  traversalArb,
  slashArb,
  querystringArb,
  encodedArb,
  urlArb,
  crossKindArb,
  emptyArb,
  lookalikeArb,
  extraExtensionArb,
  prefixSuffixArb,
);
