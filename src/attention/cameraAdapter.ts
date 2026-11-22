/**
 * Camera adapter. The only file in the app that calls getUserMedia.
 *
 * The <video> element is muted, playsInline, and never inserted into the
 * document (the spike confirmed a detached element plays and yields frames).
 * No frame is read, stored, or sent from here; the element is handed to the
 * detector, which returns only a pose reading.
 */
import type { CameraAdapter, CameraErrorKind, CameraHandle } from './types';

/** Rejection value of `open()`. `kind` is the only thing callers branch on. */
export class CameraError extends Error {
  readonly kind: CameraErrorKind;

  constructor(kind: CameraErrorKind) {
    super(kind === 'denied' ? 'Camera permission denied' : 'Camera unavailable');
    this.name = 'CameraError';
    this.kind = kind;
  }
}

/** NotAllowedError and SecurityError mean denied; every other failure means unavailable. */
export function classifyCameraError(err: unknown): CameraErrorKind {
  const name =
    typeof err === 'object' && err !== null && 'name' in err
      ? (err as { name: unknown }).name
      : undefined;
  return name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable';
}

/**
 * Returns a function that stops every track, then rethrows the first failure
 * (if any). Safe to call again after a failure: tracks that stopped are
 * remembered and skipped, and tracks that threw are tried again.
 */
export function createTrackStopper(tracks: readonly MediaStreamTrack[]): () => void {
  const stopped = new Set<MediaStreamTrack>();
  return () => {
    let failed = false;
    let firstError: unknown;
    for (const track of tracks) {
      if (stopped.has(track)) continue;
      try {
        track.stop();
        stopped.add(track);
      } catch (err) {
        if (!failed) {
          failed = true;
          firstError = err;
        }
      }
    }
    if (failed) throw firstError;
  };
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
      const stopTracks = createTrackStopper(tracks);

      try {
        await video.play();
      } catch {
        // Release the camera before reporting; a stop failure here is secondary.
        try {
          stopTracks();
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
          stopTracks();
        },
      };
    },
  };
}
