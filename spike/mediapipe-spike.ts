// THROWAWAY SPIKE (task 2.3). Not imported by the app, not shipped.
// Prints only faceFound, yaw, pitch and the 16 raw matrix numbers as page text.
// Never renders the video, never stores a frame, never calls console.* with data.
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

const WASM_PATH = '/mediapipe/wasm'
const MODEL_PATH = '/models/face_landmarker.task'
const MIN_GAP_MS = 100

const out = document.getElementById('out') as HTMLPreElement
const select = document.getElementById('delegate') as HTMLSelectElement
const startBtn = document.getElementById('start') as HTMLButtonElement
const stopBtn = document.getElementById('stop') as HTMLButtonElement

const param = new URLSearchParams(location.search).get('delegate')
const initial: 'GPU' | 'CPU' = param?.toLowerCase() === 'cpu' ? 'CPU' : 'GPU'
select.value = initial.toLowerCase()
// Changing the delegate reloads the page with ?delegate=..., so each run starts clean.
select.addEventListener('change', () => {
  const url = new URL(location.href)
  url.searchParams.set('delegate', select.value)
  location.href = url.toString()
})

const deg = (r: number) => (r * 180) / Math.PI
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

// Same formula as design/task 2.4: normalise the three rotation columns,
// pitch = asin(clamp(-R[1][2])), yaw = atan2(R[0][2], R[2][2]), in degrees.
function angles(R: number[][]): { yaw: number; pitch: number } | null {
  const norms = [0, 1, 2].map((c) => Math.hypot(R[0][c], R[1][c], R[2][c]))
  if (norms.some((n) => !Number.isFinite(n) || n === 0)) return null
  const N = (r: number, c: number) => R[r][c] / norms[c]
  return {
    pitch: deg(Math.asin(clamp(-N(1, 2), -1, 1))),
    yaw: deg(Math.atan2(N(0, 2), N(2, 2))),
  }
}

function both(d: number[]) {
  const rowMajor = angles([0, 1, 2].map((i) => [0, 1, 2].map((j) => d[4 * i + j])))
  const colMajor = angles([0, 1, 2].map((i) => [0, 1, 2].map((j) => d[4 * j + i])))
  return { rowMajor, colMajor }
}

const f = (n: number | undefined) => (n === undefined ? '   n/a' : n.toFixed(1).padStart(6))
const fmt = (a: { yaw: number; pitch: number } | null) =>
  a ? `yaw ${f(a.yaw)}  pitch ${f(a.pitch)}` : 'invalid'

let header = ''
const show = (lines: string[]) => {
  out.textContent = [header, ...lines].join('\n')
}

let landmarker: FaceLandmarker | null = null
let stream: MediaStream | null = null
let video: HTMLVideoElement | null = null
let running = false
let lastStart = -Infinity
let lastTs = 0

function stop() {
  running = false
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  video = null
  landmarker?.close()
  landmarker = null
  startBtn.disabled = false
  stopBtn.disabled = true
}

async function start() {
  startBtn.disabled = true
  const delegate = select.value === 'cpu' ? 'CPU' : 'GPU'
  header = `delegate: ${delegate} | wasm: ${WASM_PATH} | model: ${MODEL_PATH}`
  show(['Loading model...'])
  try {
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH)
    landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: true,
    })
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false,
    })
    // Detached element: created, never appended to the document.
    video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.srcObject = stream
    await video.play()
  } catch (e) {
    const err = e as { name?: string; message?: string }
    show([`FAILED: ${err.name ?? 'Error'}: ${err.message ?? ''}`])
    stop()
    startBtn.disabled = false
    return
  }
  header += ` | video.isConnected: ${video.isConnected}`
  stopBtn.disabled = false
  running = true
  loop()
}

function loop() {
  if (!running || !video || !landmarker) return
  const v = video
  const next = () => {
    if (typeof v.requestVideoFrameCallback === 'function') v.requestVideoFrameCallback(loop)
    else requestAnimationFrame(loop)
  }
  const now = performance.now()
  if (now - lastStart < MIN_GAP_MS || v.readyState < 2) {
    next()
    return
  }
  lastStart = now
  lastTs = Math.max(now, lastTs + 1)
  try {
    const res = landmarker.detectForVideo(v, lastTs)
    const faceFound = res.faceLandmarks.length > 0
    const m = res.facialTransformationMatrixes?.[0]
    const lines = [`faceFound: ${faceFound}`]
    if (faceFound && m) {
      const d = m.data
      lines.push(`matrix rows=${m.rows} columns=${m.columns} length=${d.length}`)
      if (d.length === 16) {
        const { rowMajor, colMajor } = both(d)
        lines.push(`row-major layout:    ${fmt(rowMajor)}`)
        lines.push(`column-major layout: ${fmt(colMajor)}`)
        lines.push('raw data (index 0..15):')
        for (let r = 0; r < 4; r++) {
          lines.push('  ' + d.slice(4 * r, 4 * r + 4).map((x) => x.toFixed(4).padStart(9)).join(' '))
        }
      }
    } else if (faceFound) {
      lines.push('no matrix returned')
    }
    show(lines)
  } catch (e) {
    const err = e as { message?: string }
    show([`detect FAILED: ${err.message ?? ''}`])
    stop()
    return
  }
  next()
}

startBtn.addEventListener('click', () => void start())
stopBtn.addEventListener('click', stop)
