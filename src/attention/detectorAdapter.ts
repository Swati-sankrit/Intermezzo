/**
 * MediaPipe Face Landmarker adapter. The library is loaded with a dynamic
 * import() only (never a static import) so the reading view's first paint is
 * unaffected. Wasm and model are served from this app's own origin.
 *
 * Only a PoseReading leaves this file: no frame, landmark, or MediaPipe
 * result object is kept beyond a single detect() call.
 */
import { poseFromMatrix16 } from './pose';
import type { Detector, PoseReading } from './types';

type Vision = typeof import('@mediapipe/tasks-vision');
type Landmarker = Awaited<ReturnType<Vision['FaceLandmarker']['createFromOptions']>>;
type Resolved = Awaited<ReturnType<Vision['FilesetResolver']['forVisionTasks']>>;

const WASM_PATH = '/mediapipe/wasm';
const MODEL_PATH = '/models/face_landmarker.task';
const NOT_FOUND: PoseReading = { faceFound: false, yaw: 0, pitch: 0 };

/**
 * The only place that reads a transformation matrix. MediaPipe's Matrix is
 * `{ rows, columns, data: number[] }`, flat and column-major (confirmed by the
 * task 2.3 spike). Returns a copy as number[] of length 16, or null.
 */
function readMatrix4(matrix: unknown): number[] | null {
  if (typeof matrix !== 'object' || matrix === null) return null;
  const m = matrix as { rows?: unknown; columns?: unknown; data?: unknown };
  if (m.rows !== 4 || m.columns !== 4) return null;
  if (!Array.isArray(m.data) || m.data.length !== 16) return null;
  return Array.from(m.data as number[]);
}

function create(
  lib: Vision,
  fileset: Resolved,
  delegate: 'GPU' | 'CPU',
): Promise<Landmarker> {
  return lib.FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: true,
  });
}

/** Loads MediaPipe, tries the GPU delegate, retries once on CPU, else rejects. */
export async function createDetector(): Promise<Detector> {
  const lib = await import('@mediapipe/tasks-vision');
  const fileset = await lib.FilesetResolver.forVisionTasks(WASM_PATH);

  let landmarker: Landmarker;
  try {
    landmarker = await create(lib, fileset, 'GPU');
  } catch {
    landmarker = await create(lib, fileset, 'CPU');
  }

  // Starts at -1 so a non-finite first t becomes 0 (always finite).
  let lastTs = -1;

  return {
    detect(video: HTMLVideoElement, t: number): PoseReading {
      // detectForVideo needs strictly increasing timestamps.
      const ts = Number.isFinite(t) ? Math.max(Math.floor(t), lastTs + 1) : lastTs + 1;
      lastTs = ts;

      const result = landmarker.detectForVideo(video, ts);
      if (result.faceLandmarks.length === 0) return NOT_FOUND;
      const data = readMatrix4(result.facialTransformationMatrixes?.[0]);
      if (data === null) return NOT_FOUND;
      return poseFromMatrix16(data);
    },
    close(): void {
      landmarker.close();
    },
  };
}
