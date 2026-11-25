// The 16 Standard Ebooks catalogue slugs (library-v2 requirement 1.11).
// Each path follows https://standardebooks.org/ebooks/<slug>.
// Task 3.2 (src/library/catalogueData.ts) mirrors this list.
//
// File naming rule (shared with fetch-catalogue.mjs):
//   stem = the SECOND path segment of the slug (the title segment).
//   EPUB  -> public/books/<stem>.epub
//   cover -> public/covers/<stem>.webp
// Examples: bram-stoker/dracula -> dracula;
//   h-g-wells/the-invisible-man -> the-invisible-man.
// A slug with extra segments (e.g. an illustrator) still uses the second one.
// All 16 stems are unique.

export const CATALOGUE_SLUGS = [
  'bram-stoker/dracula',
  'mary-shelley/frankenstein',
  'robert-louis-stevenson/the-strange-case-of-dr-jekyll-and-mr-hyde',
  'oscar-wilde/the-picture-of-dorian-gray',
  'john-william-polidori/the-vampire',
  'henry-james/the-turn-of-the-screw',
  'arthur-conan-doyle/the-hound-of-the-baskervilles',
  'edgar-allan-poe/short-fiction',
  'jane-austen/pride-and-prejudice',
  'charlotte-bronte/jane-eyre',
  'emily-bronte/wuthering-heights',
  'charles-dickens/a-christmas-carol',
  'robert-louis-stevenson/treasure-island',
  'h-g-wells/the-time-machine',
  'h-g-wells/the-invisible-man',
  'arthur-conan-doyle/the-adventures-of-sherlock-holmes',
]

/** File stem for a slug: its second path segment. */
export function slugToFileStem(slug) {
  const parts = slug.split('/')
  if (parts.length < 2 || !parts[1]) throw new Error(`Bad catalogue slug: ${slug}`)
  return parts[1]
}
