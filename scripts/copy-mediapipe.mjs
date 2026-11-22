// Copies the MediaPipe wasm runtime so the app loads it from its own origin.
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const target = join(root, 'public', 'mediapipe', 'wasm')

if (!existsSync(source)) {
  console.error(
    `copy-mediapipe: source folder not found: ${source}\n` +
      'Run "npm install @mediapipe/tasks-vision" and try again.',
  )
  process.exit(1)
}

mkdirSync(target, { recursive: true })
cpSync(source, target, { recursive: true })
console.log(`copy-mediapipe: copied ${source} -> ${target}`)
