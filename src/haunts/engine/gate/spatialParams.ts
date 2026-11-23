/**
 * Position parameters and fixed settings for the spatial panner wrapper (see restrictedAudio.ts).
 * Facts from MDN and the W3C spec (docs/BUILD_LOG.md, "ghost-dread task 3.1"): `positionX/Y/Z` are
 * AudioParams since Chrome 52, Firefox 50 and Safari 14.1; `setPosition` exists everywhere but is
 * deprecated, so it is used only when `positionX` is missing.
 */
import type { HauntParam } from '../hauntAudio';

export interface PositionParams {
  readonly x: HauntParam;
  readonly y: HauntParam;
  readonly z: HauntParam;
}

/** Settings a haunt can never change. Applied once, before the wrapper is returned. */
export function applyFixedSettings(n: PannerNode): void {
  n.panningModel = 'HRTF';
  n.distanceModel = 'inverse';
  n.refDistance = 0.5;
  n.rolloffFactor = 1;
  // Omnidirectional: the half-angle of 180 degrees covers every direction, so the cone never attenuates.
  n.coneInnerAngle = 360;
  n.coneOuterAngle = 0;
  n.coneOuterGain = 0;
}

export function wrapParam(p: AudioParam): HauntParam {
  return {
    setValueAtTime(value, time) {
      p.setValueAtTime(value, time);
    },
    linearRampToValueAtTime(value, time) {
      p.linearRampToValueAtTime(value, time);
    },
    cancelScheduledValues(time) {
      p.cancelScheduledValues(time);
    },
  };
}

/**
 * Without `positionX` the three params share one stored triple. Setting a value, by either
 * method, stores it and calls `setPosition` at once, so ramps become steps and times are ignored.
 */
function shimParams(n: PannerNode): PositionParams {
  const pos = [0, 0, 0];
  const make = (i: number): HauntParam => {
    const set = (value: number): void => {
      pos[i] = value;
      n.setPosition(pos[0], pos[1], pos[2]);
    };
    return {
      setValueAtTime: (value) => set(value),
      linearRampToValueAtTime: (value) => set(value),
      cancelScheduledValues: () => undefined,
    };
  };
  return { x: make(0), y: make(1), z: make(2) };
}

export function positionParams(n: PannerNode): PositionParams {
  const hasParams = (n as Partial<PannerNode>).positionX !== undefined;
  if (!hasParams) return shimParams(n);
  return { x: wrapParam(n.positionX), y: wrapParam(n.positionY), z: wrapParam(n.positionZ) };
}
