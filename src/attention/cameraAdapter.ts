/**
 * Camera adapter. The only file in the app that calls getUserMedia.
 *
 * The <video> element is muted, playsInline, and never inserted into the
 * document (the spike confirmed a detached element plays and yields frames).
 * No frame is read, stored, or sent from here; the element is handed to the
 * detector, which returns only a pose reading.
 */

export type CameraErrorKind = 'denied' | 'unavailable';

/** Rejection value of `open()`. `kind` is the only thing callers branch on. */
export class CameraError extends Error {
  readonly kind: CameraErrorKind;

  constructor(kind: CameraErrorKind) {
    super(kind === 'denied' ? 'Camera permission denied' : 'Camera unavailable');
    this.name = 'CameraError';
    this.kind = kind;
  }
}

export interface CameraHandle {
  /** Stops every track. Stops all of them even if one throws, then rethrows the first error. */
  stop(): void;
  /** Registers a callback fired once when any track ends on its own. */
  onEnded(cb: () => void): void;
  readonly video: HTMLVideoElement;
}

export interface CameraAdapter {
  open(): Promise<CameraHandle>;
}

/** NotAllowedError and SecurityError mean denied; every other failure means unavailable. */
export function classifyCameraError(err: unknown): CameraErrorKind {
  const name =
    typeof err === 'object' && err !== null && 'name' in err
      ? (err as { name: unknown }).name
      : undefined;
  return name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable';
}

/** Stops every track, then rethrows the first failure (if any). */
function stopAllTracks(tracks: readonly MediaStreamTrack[]): void {
  let failed = false;
  let firstError: unknown;
  for (const track of tracks) {
    try {
      track.stop();
    } catch (err) {
      if (!failed) {
        failed = true;
        firstError = err;
      }
    }
  }
  if (failed) throw firstError;
}

function createVideo(stream: MediaStream): HTMLVideoElement {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  return video;
}

export function createCameraAdapter(): CameraAdapter {
  return {
    async open(): Promise<CameraHandle> {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        });
      } catch (err) {
        throw new CameraError(classifyCameraError(err));
      }

      const tracks = stream.getTracks();
      const video = createVideo(stream);

      try {
        await video.play();
      } catch {
        // Release the camera before reporting; a stop failure here is secondary.
        try {
          stopAllTracks(tracks);
        } catch {
          // The original failure (playback) is what the caller needs to hear about.
        }
        throw new CameraError('unavailable');
      }

      const endedCallbacks: Array<() => void> = [];
      let ended = false;
      const handleEnded = (): void => {
        if (ended) return;
        ended = true;
        for (const cb of endedCallbacks) cb();
      };
      for (const track of tracks) track.addEventListener('ended', handleEnded);

      return {
        video,
        onEnded(cb) {
          if (ended) cb();
          else endedCallbacks.push(cb);
        },
        stop() {
          for (const track of tracks) track.removeEventListener('ended', handleEnded);
          video.pause();
          video.srcObject = null;
          stopAllTracks(tracks);
        },
      };
    },
  };
}
