/**
 * Smoke tests for privacy and origin rules (source scan).
 * Validates: Requirements 5.6, 7.1, 7.3, 7.4
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

interface SourceFile {
  name: string
  text: string
}

const ATTENTION_DIR = resolve(__dirname, '..')

function loadSources(): SourceFile[] {
  return readdirSync(ATTENTION_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
    .map((e) => ({ name: e.name, text: readFileSync(join(ATTENTION_DIR, e.name), 'utf8') }))
}

const FORBIDDEN_LITERALS = [
  'cdn.jsdelivr.net',
  'storage.googleapis.com',
  'console.',
  'fetch(',
  'XMLHttpRequest',
  'sendBeacon',
]

/** Returns one message per violated rule. Empty array means clean. */
function scan(files: SourceFile[]): string[] {
  const out: string[] = []
  for (const { name, text } of files) {
    if (name !== 'cameraAdapter.ts' && text.includes('getUserMedia')) {
      out.push(`${name}: getUserMedia outside cameraAdapter.ts`)
    }
    // Static import/export-from of the vision package (including `import type`).
    const staticVision =
      /(?:import|export)\s[^;]*?from\s*['"]@mediapipe\/tasks-vision['"]|import\s*['"]@mediapipe\/tasks-vision['"]|require\(\s*['"]@mediapipe\/tasks-vision['"]\s*\)/
    if (staticVision.test(text)) out.push(`${name}: static import of @mediapipe/tasks-vision`)
    for (const lit of FORBIDDEN_LITERALS) {
      if (text.includes(lit)) out.push(`${name}: forbidden "${lit}"`)
    }
    if (/https?:\/\/[A-Za-z0-9]/.test(text)) out.push(`${name}: external http(s) host`)
    if (
      /(?:from\s*|import\s*\(\s*|import\s+|require\(\s*)['"][^'"]*\/reader(?:\/[^'"]*)?['"]/.test(
        text,
      )
    ) {
      out.push(`${name}: imports from src/reader/`)
    }
  }
  return out
}

describe('attention module privacy and origin smoke scan', () => {
  const sources = loadSources()

  it('scans real, non-test source files', () => {
    expect(sources.length).toBeGreaterThan(0)
    const names = sources.map((s) => s.name)
    expect(names).toContain('cameraAdapter.ts')
    expect(names).toContain('detectorAdapter.ts')
    expect(sources.every((s) => s.text.length > 0)).toBe(true)
  })

  it('self-check: scanner flags a deliberately bad sample', () => {
    const bad: SourceFile[] = [
      {
        name: 'bad.ts',
        text: [
          "import { FaceLandmarker } from '@mediapipe/tasks-vision'",
          "import { x } from '../reader/storage'",
          'navigator.mediaDevices.getUserMedia({})',
          "console.log('x'); fetch('https://example.com/a')",
          'new XMLHttpRequest(); navigator.sendBeacon()',
          "const u = 'https://cdn.jsdelivr.net/x' + 'storage.googleapis.com'",
        ].join('\n'),
      },
    ]
    const found = scan(bad).join('\n')
    expect(found).toContain('getUserMedia outside')
    expect(found).toContain('static import')
    expect(found).toContain('"cdn.jsdelivr.net"')
    expect(found).toContain('"storage.googleapis.com"')
    expect(found).toContain('"console."')
    expect(found).toContain('"fetch("')
    expect(found).toContain('"XMLHttpRequest"')
    expect(found).toContain('"sendBeacon"')
    expect(found).toContain('external http(s) host')
    expect(found).toContain('src/reader/')
  })

  it('self-check: scanner accepts dynamic import() and typeof import', () => {
    const ok: SourceFile[] = [
      {
        name: 'ok.ts',
        text: "type V = typeof import('@mediapipe/tasks-vision')\nconst lib = await import('@mediapipe/tasks-vision')",
      },
    ]
    expect(scan(ok)).toEqual([])
  })

  it('self-check: getUserMedia is allowed in cameraAdapter.ts', () => {
    expect(scan([{ name: 'cameraAdapter.ts', text: 'navigator.mediaDevices.getUserMedia({})' }])).toEqual([])
  })

  it('src/attention/ sources have no privacy or origin violations', () => {
    expect(scan(sources)).toEqual([])
  })

  it('getUserMedia is called in cameraAdapter.ts', () => {
    const cam = sources.find((s) => s.name === 'cameraAdapter.ts')
    expect(cam?.text).toMatch(/getUserMedia\(/)
  })

  it('@mediapipe/tasks-vision is referenced via dynamic import()', () => {
    const det = sources.find((s) => s.name === 'detectorAdapter.ts')
    expect(det?.text).toMatch(/import\(\s*['"]@mediapipe\/tasks-vision['"]\s*\)/)
  })
})
