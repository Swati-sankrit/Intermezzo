// @vitest-environment node
// Validates: Requirements 1.1, 1.2, 1.3, 1.8, 1.12, 23.5
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CATALOGUE } from '../catalogueData'

const ROOT = process.cwd()
const PUBLIC = resolve(ROOT, 'public')
const MAX_COVER_BYTES = 100 * 1024 + 1024 // "~100 KB"

/** Exact-case existence check, one segment at a time (Vercel/Linux behaviour). */
function existsExactCase(urlPath: string): boolean {
  let dir = PUBLIC
  for (const name of urlPath.split('/').filter(Boolean)) {
    if (!readdirSync(dir).includes(name)) return false
    dir = resolve(dir, name)
  }
  return true
}

function sentenceCount(text: string): number {
  return text.trim().split(/(?<=[.!?])\s+/).filter(Boolean).length
}

describe('catalogue data', () => {
  it('has exactly 16 entries with unique slugs', () => {
    expect(CATALOGUE).toHaveLength(16)
    expect(new Set(CATALOGUE.map((e) => e.slug)).size).toBe(16)
  })

  it('includes The Invisible Man and no Alice entry or file', () => {
    const inv = CATALOGUE.find((e) => e.slug === 'h-g-wells/the-invisible-man')
    expect(inv?.title).toBe('The Invisible Man')
    expect(inv?.author).toBe('H. G. Wells')
    expect(inv?.epubPath).toBe('/books/the-invisible-man.epub')
    expect(inv?.coverPath).toBe('/covers/the-invisible-man.webp')
    expect(JSON.stringify(CATALOGUE)).not.toMatch(/alice|wonderland|tenniel/i)
    expect(existsExactCase('/books/alices-adventures-in-wonderland.epub')).toBe(false)
    expect(existsExactCase('/covers/alices-adventures-in-wonderland.webp')).toBe(false)
  })

  it('titles the Poe entry "Short Stories" and spells the Dracula path in lower case', () => {
    const poe = CATALOGUE.find((e) => e.slug === 'edgar-allan-poe/short-fiction')
    expect(poe?.title).toBe('Short Stories')
    expect(poe?.author).toBe('Edgar Allan Poe')
    expect(poe?.epubPath).toBe('/books/short-fiction.epub')
    const dracula = CATALOGUE.find((e) => e.slug === 'bram-stoker/dracula')
    expect(dracula?.epubPath).toBe('/books/dracula.epub')
    expect(readdirSync(join(PUBLIC, 'books'))).not.toContain('Dracula.epub')
  })
  it('has a two-sentence description for every entry', () => {
    for (const e of CATALOGUE) {
      expect(e.description.trim().endsWith('.'), e.slug).toBe(true)
      expect(sentenceCount(e.description), e.slug).toBe(2)
    }
  })

  it('has one or two non-empty mood tags per entry', () => {
    for (const e of CATALOGUE) {
      expect(e.moodTags.length, e.slug).toBeGreaterThanOrEqual(1)
      expect(e.moodTags.length, e.slug).toBeLessThanOrEqual(2)
      for (const t of e.moodTags) expect(t.trim(), e.slug).not.toBe('')
    }
  })

  it('points every cover and EPUB at a file that exists with exact case', () => {
    for (const e of CATALOGUE) {
      expect(existsExactCase(e.coverPath), e.coverPath).toBe(true)
      expect(existsExactCase(e.epubPath), e.epubPath).toBe(true)
    }
  })

  it('uses a .webp cover of about 100 KB or less', () => {
    for (const e of CATALOGUE) {
      expect(e.coverPath.endsWith('.webp'), e.coverPath).toBe(true)
      const size = statSync(join(PUBLIC, e.coverPath)).size
      expect(size, `${e.coverPath} is ${size} bytes`).toBeLessThanOrEqual(MAX_COVER_BYTES)
    }
  })

  it('bundles only catalogue files: no Internet Archive copy, no Yellow Wallpaper', () => {
    const wanted = {
      books: CATALOGUE.map((e) => e.epubPath.split('/').pop()!).sort(),
      covers: CATALOGUE.map((e) => e.coverPath.split('/').pop()!).sort(),
    }
    const onDisk = (d: string) => readdirSync(join(PUBLIC, d)).filter((n) => !n.startsWith('.')).sort()
    expect(onDisk('books')).toEqual(wanted.books)
    expect(onDisk('covers')).toEqual(wanted.covers)

    expect(CATALOGUE.some((e) => /yellow-wallpaper/i.test(JSON.stringify(e)))).toBe(false)
    expect(JSON.stringify(CATALOGUE)).not.toMatch(/archive\.org/i)
    expect(readdirSync(PUBLIC).some((n) => /yellow-wallpaper/i.test(n))).toBe(false)
  })
})

describe('README lists bundled books and covers', () => {
  const text = readFileSync(join(ROOT, 'README.md'), 'utf8')
  const rows = new Map<string, { source: string; licence: string }>()
  for (const line of text.split('\n')) {
    const c = line.split('|').map((x) => x.trim())
    const m = /^`(public\/(?:books|covers)\/[^`]+)`$/.exec(c[1] ?? '')
    if (c.length >= 5 && m) rows.set(m[1], { source: c[2], licence: c[3] })
  }

  it('has a row with source and licence for every catalogue EPUB and cover', () => {
    for (const e of CATALOGUE) {
      for (const p of [e.epubPath, e.coverPath]) {
        const row = rows.get(`public${p}`)
        expect(row, `README has no row for public${p}`).toBeDefined()
        expect(row!.source, `empty source for ${p}`).not.toBe('')
        expect(row!.licence, `empty licence for ${p}`).not.toBe('')
      }
    }
  })

  it('has Invisible Man rows and no Alice rows', () => {
    expect(rows.has('public/books/the-invisible-man.epub')).toBe(true)
    expect(rows.has('public/covers/the-invisible-man.webp')).toBe(true)
    expect(text).not.toMatch(/alices-adventures|18\.6 MB/i)
  })

  it('lists no extra book or cover rows and no Internet Archive or Yellow Wallpaper source', () => {
    expect(rows.size).toBe(CATALOGUE.length * 2)
    for (const [file, r] of rows) {
      expect(`${file} ${r.source}`).not.toMatch(/archive\.org|yellow-wallpaper/i)
    }
  })
})
