/**
 * Default ports for the attention controller. Browser access lives here so
 * controller.ts stays free of globals.
 */
import { createCameraAdapter } from './cameraAdapter';
import { createDetector } from './detectorAdapter';
import { createPageEvents } from './pageEvents';
import { loadChoice, saveChoice } from './storage';
import type {
  AttentionPorts,
  AttentionStore,
  FrameScheduler,
  PageEvents,
  VisibilityPort,
} from './types';

const defaultNow = (): number => performance.timeOrigin + performance.now();

/**
 * Page listeners are attached on first use and re-created after `dispose()`,
 * so a controller can be started again after `stop()`.
 */
function lazyPageEvents(): PageEvents {
  let inner: PageEvents | null = null;
  const get = (): PageEvents => (inner ??= createPageEvents({ now: defaultNow }));
  return {
    tabActive: () => get().tabActive(),
    lastInputT: () => get().lastInputT(),
    onChange: (cb) => get().onChange(cb),
    dispose() {
      inner?.dispose();
      inner = null;
    },
  };
}

/**
 * The camera choice uses storage.ts. Thresholds and debounce stay stand-ins
 * (remember nothing, report failed saves) until their tasks.
 */
const defaultStore: AttentionStore = {
  loadChoice,
  saveChoice,
  loadThresholds: () => null,
  saveThresholds: () => false,
  loadDebounce: () => null,
  saveDebounce: () => false,
};

/** requestVideoFrameCallback when the video supports it, else requestAnimationFrame. */
function defaultFrames(): FrameScheduler {
  let next = 1;
  const cancels = new Map<number, () => void>();
  return {
    request(cb, video) {
      const handle = next++;
      const fire = (): void => {
        cancels.delete(handle);
        cb(defaultNow());
      };
      if (video && typeof video.requestVideoFrameCallback === 'function') {
        const id = video.requestVideoFrameCallback(fire);
        cancels.set(handle, () => video.cancelVideoFrameCallback(id));
      } else {
        const id = window.requestAnimationFrame(fire);
        cancels.set(handle, () => window.cancelAnimationFrame(id));
      }
      return handle;
    },
    cancel(handle) {
      cancels.get(handle)?.();
      cancels.delete(handle);
    },
  };
}

function defaultVisibility(): VisibilityPort {
  return {
    visible: () => document.visibilityState === 'visible',
    onChange(cb) {
      const handler = (): void => cb(document.visibilityState === 'visible');
      document.addEventListener('visibilitychange', handler);
      return () => document.removeEventListener('visibilitychange', handler);
    },
  };
}

export function defaultPorts(): AttentionPorts {
  return {
    frames: defaultFrames(),
    visibility: defaultVisibility(),
    now: defaultNow,
    setInterval: (fn, ms) => window.setInterval(fn, ms),
    clearInterval: (id) => window.clearInterval(id),
    camera: createCameraAdapter(),
    detector: { create: createDetector },
    page: lazyPageEvents(),
    store: defaultStore,
  };
}
