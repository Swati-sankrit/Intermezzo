// One-off maintainer script: downloads the 16 catalogue EPUBs from Standard
// Ebooks (CC0) and extracts a small WebP cover from each. The app never runs it.
//
// Setup: sharp is not in package.json (it broke `npm install` on Vercel).
// Run `npm install --no-save sharp` once before running this script.
//
//   node scripts/fetch-catalogue.mjs                 (all 16)
//   node scripts/fetch-catalogue.mjs h-g-wells/the-invisible-man   (one book)
//
// Naming rule (see scripts/catalogue-slugs.mjs):
//   stem  = second path segment of the slug
//   EPUB  = public/books/<stem>.epub
//   cover = public/covers/<stem>.webp
//
// Politeness: waits >= 1000 ms before every request, sends a descriptive
// User-Agent, and stops at once on HTTP 403 or 429 (files already saved stay).
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, posix } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import JSZip from 'jszip'
import { CATALOGUE_SLUGS, slugToFileStem } from './catalogue-slugs.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BOOKS_DIR = join(ROOT, 'public', 'books')
const COVERS_DIR = join(ROOT, 'public', 'covers')

export const USER_AGENT =
  'ReadOrDread-catalogue-script/1.0 (one-off download of 16 CC0 books for a hackathon reading app; see project README)'
export const MIN_DELAY_MS = 1000
export const MAX_COVER_WIDTH = 400
export const MAX_COVER_BYTES = 100 * 1024
export const QUALITY_STEPS = [80, 70, 60, 50, 40]

/** Download URL, e.g. .../ebooks/bram-stoker/dracula/downloads/bram-stoker_dracula.epub?source=download */
export function downloadUrl(slug) {
  return `https://standardebooks.org/ebooks/${slug}/downloads/${slug.replaceAll('/', '_')}.epub?source=download`
}

/** Path of the OPF package file, read from META-INF/container.xml. */
export function findOpfPath(containerXml) {
  const m = /<rootfile\b[^>]*\bfull-path\s*=\s*["']([^"']+)["']/i.exec(containerXml)
  return m ? m[1] : null
}

/** Zip path of the item with properties="cover-image" in an OPF, or null. */
export function findCoverPath(opfXml, opfPath) {
  for (const tag of opfXml.match(/<item\b[^>]*>/gi) ?? []) {
    const props = /\bproperties\s*=\s*["']([^"']*)["']/i.exec(tag)
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)
    if (props && href && props[1].split(/\s+/).includes('cover-image')) {
      return posix.normalize(posix.join(posix.dirname(opfPath), decodeURI(href[1])))
    }
  }
  return null
}

/** Pull the cover image bytes out of an EPUB buffer. Throws a readable Error. */
export async function extractCover(epubBytes) {
  const zip = await JSZip.loadAsync(epubBytes)
  const container = zip.file('META-INF/container.xml')
  if (!container) throw new Error('no META-INF/container.xml')
  const opfPath = findOpfPath(await container.async('string'))
  if (!opfPath) throw new Error('no rootfile in container.xml')
  const opf = zip.file(opfPath)
  if (!opf) throw new Error(`OPF not found at ${opfPath}`)
  const coverPath = findCoverPath(await opf.async('string'), opfPath)
  if (!coverPath) throw new Error('no cover-image item in OPF')
  const cover = zip.file(coverPath)
  if (!cover) throw new Error(`cover file not found at ${coverPath}`)
  return cover.async('uint8array')
}

export const SHARP_MISSING_MESSAGE =
  'Could not import sharp. Run `npm install --no-save sharp` and then run this script again.'
async function loadSharp() {
  try {
    return (await import('sharp')).default
  } catch (err) {
    throw new Error(SHARP_MISSING_MESSAGE, { cause: err })
  }
}
/** Resize to <= 400 px wide and encode WebP, lowering quality until it fits. */
export async function makeCoverWebp(coverBytes) {
  const sharp = await loadSharp()
  let last = null
  for (const quality of QUALITY_STEPS) {
    const data = await sharp(coverBytes)
      .resize({ width: MAX_COVER_WIDTH, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer()
    last = { data, quality }
    if (data.length <= MAX_COVER_BYTES) return { ...last, fits: true }
  }
  return { ...last, fits: false }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  await mkdir(BOOKS_DIR, { recursive: true })
  await mkdir(COVERS_DIR, { recursive: true })
  const problems = []
  let saved = 0

  // Optional single-slug argument: only fetch that catalogue book.
  const only = process.argv[2]
  if (only && !CATALOGUE_SLUGS.includes(only)) {
    console.error(`Unknown slug "${only}". It must be one of the entries in scripts/catalogue-slugs.mjs.`)
    process.exit(1)
  }
  const slugs = only ? [only] : CATALOGUE_SLUGS

  for (const slug of slugs) {
    const stem = slugToFileStem(slug)
    await sleep(MIN_DELAY_MS) // before every request, including the first
    let res
    try {
      res = await fetch(downloadUrl(slug), { headers: { 'User-Agent': USER_AGENT } })
    } catch (err) {
      problems.push(`${slug}: request failed (${err.message})`)
      continue
    }
    if (res.status === 403 || res.status === 429) {
      console.error(`Stopped: HTTP ${res.status} while fetching "${slug}". Files already saved are unchanged.`)
      process.exit(1)
    }
    if (!res.ok) {
      problems.push(`${slug}: HTTP ${res.status}`)
      continue
    }
    const type = res.headers.get('content-type') ?? ''
    if (!type.includes('application/epub+zip')) {
      problems.push(`${slug}: unexpected content-type "${type}" (not written)`)
      continue
    }
    const epub = Buffer.from(await res.arrayBuffer())
    await writeFile(join(BOOKS_DIR, `${stem}.epub`), epub)
    saved += 1
    console.log(`saved public/books/${stem}.epub (${epub.length} bytes)`)

    try {
      const cover = await makeCoverWebp(await extractCover(epub))
      await writeFile(join(COVERS_DIR, `${stem}.webp`), cover.data)
      console.log(`saved public/covers/${stem}.webp (${cover.data.length} bytes, quality ${cover.quality})`)
      if (!cover.fits) {
        problems.push(`${slug}: cover is ${cover.data.length} bytes at quality 40, over the ~100 KB target`)
      }
    } catch (err) {
      problems.push(`${slug}: cover not extracted (${err.message})`)
    }
  }

  console.log(`\nDone. ${saved} of ${slugs.length} EPUBs saved.`)
  if (problems.length) {
    console.log('Problems to review:')
    for (const p of problems) console.log(`  - ${p}`)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
