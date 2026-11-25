// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const ASSET_DIRS = ['public/ghosts', 'public/sounds']

interface Row {
  file: string
  source: string
  licence: string
}

/** Parses rows of the form "| `path` | source | licence |" from the README. */
function readRows(): Row[] {
  const text = readFileSync(join(ROOT, 'README.md'), 'utf8')
  const rows: Row[] = []
  for (const line of text.split('\n')) {
    const cells = line.split('|').map((c) => c.trim())
    // cells: ['', file, source, licence, '']
    const m = /^`(public\/(?:ghosts|sounds)\/[^`]+)`$/.exec(cells[1] ?? '')
    if (cells.length >= 5 && m) {
      rows.push({ file: m[1], source: cells[2], licence: cells[3] })
    }
  }
  return rows
}

function presentFiles(): string[] {
  const out: string[] = []
  for (const dir of ASSET_DIRS) {
    const abs = join(ROOT, dir)
    if (!existsSync(abs)) continue
    for (const name of readdirSync(abs)) {
      if (name.startsWith('.')) continue
      out.push(`${dir}/${name}`)
    }
  }
  return out
}

describe('README asset table', () => {
  const rows = readRows()

  it('has a row with non-empty source and licence for every bundled file', () => {
    const files = presentFiles()
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const row = rows.find((r) => r.file === file)
      expect(row, `README has no row for ${file}`).toBeDefined()
      expect(row!.source, `empty source for ${file}`).not.toBe('')
      expect(row!.licence, `empty licence for ${file}`).not.toBe('')
    }
  })

  it('names only files that exist', () => {
    for (const row of rows) {
      expect(existsSync(join(ROOT, row.file)), `${row.file} is listed but missing`).toBe(true)
    }
  })

  it('has no duplicate rows', () => {
    const names = rows.map((r) => r.file)
    expect(new Set(names).size).toBe(names.length)
  })

  it('ignores dotfiles such as .DS_Store', () => {
    expect(presentFiles().some((f) => f.split('/').pop()!.startsWith('.'))).toBe(false)
  })
})
