/**
 * Builds the restricted audio context for one port (see ../hauntAudio.ts).
 *
 * The restriction is structural. A haunt receives only wrapper objects. A wrapper holds the
 * real node in a closure, exposes no `.context` and no `destination`, and its `connect` accepts
 * only wrappers made for this port (looked up in a per-port WeakMap) or the port input. The
 * real node is never handed out, and the real context is not reachable from any wrapper.
 * Event callbacks are called without the event, because `event.target` would be the real node.
 */
import type {
  HauntAudioContext, HauntBufferSource, HauntFilter, HauntNode, HauntPanner, HauntSink, HauntSpatialPanner,
} from '../hauntAudio';
import { applyFixedSettings, positionParams, wrapParam } from './spatialParams';

/** `input` is the port's channel gain node: the only node a haunt chain may end at. */
export function createRestrictedContext(ctx: AudioContext, input: AudioNode): HauntAudioContext {
  const owned = new WeakMap<object, AudioNode>();
  const inputSink: HauntSink = Object.freeze({ isHauntSink: true as const });
  owned.set(inputSink, input);

  function nodeBase(node: AudioNode): HauntNode {
    return {
      isHauntSink: true,
      connect<T extends HauntSink>(target: T): T {
        const to = typeof target === 'object' && target !== null ? owned.get(target) : undefined;
        if (to === undefined) throw new TypeError('A haunt node can only connect to another node of its port or to ctx.input.');
        node.connect(to);
        return target;
      },
      disconnect() {
        node.disconnect();
      },
    };
  }

  function register<W extends HauntNode>(wrapper: W, node: AudioNode): W {
    owned.set(wrapper, node);
    return wrapper;
  }

  return {
    input: inputSink,
    get sampleRate() {
      return ctx.sampleRate;
    },
    get currentTime() {
      return ctx.currentTime;
    },
    createBuffer: (channels, length, sampleRate) => ctx.createBuffer(channels, length, sampleRate),
    createBufferSource() {
      const n = ctx.createBufferSource();
      let endedHandler: (() => void) | null = null;
      const w: HauntBufferSource = {
        ...nodeBase(n),
        get buffer() {
          return n.buffer;
        },
        set buffer(b) {
          n.buffer = b;
        },
        get loop() {
          return n.loop;
        },
        set loop(on) {
          n.loop = on;
        },
        playbackRate: wrapParam(n.playbackRate),
        get onended() {
          return endedHandler;
        },
        set onended(fn) {
          endedHandler = fn;
          n.onended = fn === null ? null : () => fn();
        },
        start: (when) => n.start(when),
        stop: (when) => n.stop(when),
      };
      return register(w, n);
    },
    createBiquadFilter() {
      const n = ctx.createBiquadFilter();
      const w: HauntFilter = {
        ...nodeBase(n),
        get type() {
          return n.type;
        },
        set type(t) {
          n.type = t;
        },
        frequency: wrapParam(n.frequency),
        Q: wrapParam(n.Q),
        gain: wrapParam(n.gain),
        detune: wrapParam(n.detune),
      };
      return register(w, n);
    },
    createStereoPanner() {
      const n = ctx.createStereoPanner();
      const w: HauntPanner = { ...nodeBase(n), pan: wrapParam(n.pan) };
      return register(w, n);
    },
    createSpatialPanner() {
      // Any failure (no createPanner, HRTF refused) gives null; haunts then fall back (Req 1.15).
      let n: PannerNode;
      try {
        n = ctx.createPanner();
        applyFixedSettings(n);
      } catch {
        return null;
      }
      const p = positionParams(n);
      const w: HauntSpatialPanner = { ...nodeBase(n), positionX: p.x, positionY: p.y, positionZ: p.z };
      return register(w, n);
    },
  };
}
