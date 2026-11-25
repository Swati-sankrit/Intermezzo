/**
 * Bundled catalogue of 16 public-domain classics (library-v2, Requirement 1).
 * Pure data, no DOM. Texts and covers come from Standard Ebooks (CC0).
 * Descriptions, reading times and mood tags are original editorial content.
 *
 * File naming matches scripts/catalogue-slugs.mjs: the file stem is the
 * SECOND path segment of the slug.
 */

export interface CatalogueEntry {
  slug: string
  title: string
  author: string
  /** Exactly two sentences, no spoilers. */
  description: string
  readingMinutes: number
  moodTags: [string] | [string, string]
  /** '/covers/<stem>.webp' */
  coverPath: string
  /** '/books/<stem>.epub' */
  epubPath: string
}

type EntrySource = Omit<CatalogueEntry, 'coverPath' | 'epubPath'>

function stemOf(slug: string): string {
  return slug.split('/')[1]
}

function withPaths(e: EntrySource): CatalogueEntry {
  const stem = stemOf(e.slug)
  return { ...e, coverPath: `/covers/${stem}.webp`, epubPath: `/books/${stem}.epub` }
}

const SOURCES: readonly EntrySource[] = [
  {
    slug: 'bram-stoker/dracula',
    title: 'Dracula',
    author: 'Bram Stoker',
    description:
      'A young solicitor travels to a remote castle in the Carpathians on business and finds his host stranger than expected. Told through letters, diaries and newspaper clippings, it is the book that shaped the modern vampire.',
    readingMinutes: 640,
    moodTags: ['gothic', 'horror'],
  },
  {
    slug: 'mary-shelley/frankenstein',
    title: 'Frankenstein',
    author: 'Mary Shelley',
    description:
      'A brilliant student of science pursues an experiment that no one before him has dared to try. The book asks what we owe to the things we make and to each other.',
    readingMinutes: 300,
    moodTags: ['gothic', 'tragic'],
  },
  {
    slug: 'robert-louis-stevenson/the-strange-case-of-dr-jekyll-and-mr-hyde',
    title: 'The Strange Case of Dr Jekyll and Mr Hyde',
    author: 'Robert Louis Stevenson',
    description:
      'A London lawyer grows uneasy about a respected friend and the sinister man who keeps appearing in his affairs. This short, fast novel is a study of the two natures that live inside a single person.',
    readingMinutes: 105,
    moodTags: ['eerie', 'mystery'],
  },
  {
    slug: 'oscar-wilde/the-picture-of-dorian-gray',
    title: 'The Picture of Dorian Gray',
    author: 'Oscar Wilde',
    description:
      'A strikingly handsome young man sits for a portrait and makes a wish he will come to regret. Sharp, witty and darkly beautiful, the novel follows what he does with his charmed life.',
    readingMinutes: 310,
    moodTags: ['gothic', 'decadent'],
  },
  {
    slug: 'john-william-polidori/the-vampire',
    title: 'The Vampire',
    author: 'John William Polidori',
    description:
      'A young gentleman travels across Europe with a magnetic and mysterious lord who seems to draw misfortune wherever he goes. Written during the same famous summer as Frankenstein, it is the story that first brought the elegant vampire into English fiction.',
    readingMinutes: 50,
    moodTags: ['gothic', 'short'],
  },
  {
    slug: 'henry-james/the-turn-of-the-screw',
    title: 'The Turn of the Screw',
    author: 'Henry James',
    description:
      'A young governess takes charge of two orphaned children at a quiet country house. Slowly she becomes certain that something unseen is watching over them, and the reader is left to decide how far to trust her.',
    readingMinutes: 170,
    moodTags: ['eerie', 'psychological'],
  },
  {
    slug: 'arthur-conan-doyle/the-hound-of-the-baskervilles',
    title: 'The Hound of the Baskervilles',
    author: 'Arthur Conan Doyle',
    description:
      'An old family curse and a ghostly animal on the moors draw Sherlock Holmes and Doctor Watson to a lonely estate in Devon. Fog, bogs and midnight howls make this the most atmospheric of all the Holmes adventures.',
    readingMinutes: 240,
    moodTags: ['mystery', 'atmospheric'],
  },
  {
    slug: 'edgar-allan-poe/short-fiction',
    title: 'Short Fiction',
    author: 'Edgar Allan Poe',
    description:
      'This collection gathers many of the master storyteller\'s best tales of dread, guilt and strange obsession. Each one is short enough to read in a single sitting by candlelight.',
    readingMinutes: 400,
    moodTags: ['macabre', 'short'],
  },
  {
    slug: 'jane-austen/pride-and-prejudice',
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    description:
      'In a country village, five sisters and their anxious mother hope for good marriages as a wealthy newcomer arrives in the neighbourhood. Quick wit, first impressions and second thoughts drive one of the best-loved romances in English.',
    readingMinutes: 490,
    moodTags: ['romance', 'witty'],
  },
  {
    slug: 'charlotte-bronte/jane-eyre',
    title: 'Jane Eyre',
    author: 'Charlotte Brontë',
    description:
      'An orphaned girl with a fierce sense of right and wrong makes her own way from a cruel childhood to a position at a grand and secretive house. Her clear voice carries a story of independence, love and strange noises in the night.',
    readingMinutes: 740,
    moodTags: ['gothic', 'romance'],
  },
  {
    slug: 'emily-bronte/wuthering-heights',
    title: 'Wuthering Heights',
    author: 'Emily Brontë',
    description:
      'On the wild Yorkshire moors, two households become bound together by a stubborn and destructive passion. The tale is told by those who watched it unfold, and it has haunted readers ever since.',
    readingMinutes: 430,
    moodTags: ['brooding', 'romance'],
  },
  {
    slug: 'charles-dickens/a-christmas-carol',
    title: 'A Christmas Carol',
    author: 'Charles Dickens',
    description:
      'A cold and miserly old man is visited on Christmas Eve by a series of unearthly guests. Warm, funny and a little spooky, it remains the most cherished ghost story of the winter season.',
    readingMinutes: 115,
    moodTags: ['ghostly', 'heartwarming'],
  },
  {
    slug: 'robert-louis-stevenson/treasure-island',
    title: 'Treasure Island',
    author: 'Robert Louis Stevenson',
    description:
      'A boy at a seaside inn comes across an old map and soon finds himself aboard a ship bound for a faraway island. Pirates, plots and one unforgettable cook make this the model for the grand sea adventure.',
    readingMinutes: 270,
    moodTags: ['adventure'],
  },
  {
    slug: 'h-g-wells/the-time-machine',
    title: 'The Time Machine',
    author: 'H. G. Wells',
    description:
      'At a dinner party in Victorian London, an inventor claims to have built a device that travels through time. His account of where it took him is a thoughtful and unsettling look at the future of humankind.',
    readingMinutes: 130,
    moodTags: ['futuristic', 'adventure'],
  },
  {
    slug: 'h-g-wells/the-invisible-man',
    title: 'The Invisible Man',
    author: 'H. G. Wells',
    description:
      'A bandaged stranger with dark glasses arrives at a quiet village inn on a snowy winter day and asks to be left entirely alone. As the villagers grow curious, his secret draws steadily closer to the surface.',
    readingMinutes: 210,
    moodTags: ['eerie', 'suspense'],
  },
  {
    slug: 'arthur-conan-doyle/the-adventures-of-sherlock-holmes',
    title: 'The Adventures of Sherlock Holmes',
    author: 'Arthur Conan Doyle',
    description:
      'Twelve self-contained cases bring the sharp-eyed detective and his loyal friend Doctor Watson through the fog-lit streets of London. Each story is a tidy puzzle that invites the reader to spot the clues first.',
    readingMinutes: 420,
    moodTags: ['mystery', 'classic'],
  },
]

export const CATALOGUE: readonly CatalogueEntry[] = SOURCES.map(withPaths)
