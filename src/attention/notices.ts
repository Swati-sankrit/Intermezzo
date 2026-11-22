/**
 * Notice gate: at most one notice per kind per Session. Pure. The wording for
 * every kind lives here so the UI holds no strings to keep in sync.
 */

import type { Notice, NoticeKind } from './types';

export interface NoticeGateState {
  readonly shown: ReadonlySet<NoticeKind>;
}

export const NOTICE_TEXT: Readonly<Record<NoticeKind, string>> = {
  denied: 'Camera access was not allowed. Reading continues without the camera.',
  'camera-lost': 'The camera stopped. Reading continues without it.',
  'detector-failed': 'Face detection stopped. Reading continues.',
  cameraOffFailed:
    "The camera could not be turned off. You can turn it off in your browser's site settings.",
};

/** A fresh gate for a new Session. */
export function initialNoticeGate(): NoticeGateState {
  return { shown: new Set<NoticeKind>() };
}

/**
 * Returns a non-null notice the first time `kind` is raised in the gate's
 * lifetime, and null on every later call for that kind. Never mutates `state`.
 */
export function raiseNotice(
  state: NoticeGateState,
  kind: NoticeKind,
): { state: NoticeGateState; notice: Notice | null } {
  if (state.shown.has(kind)) {
    return { state, notice: null };
  }
  const shown = new Set(state.shown);
  shown.add(kind);
  return { state: { shown }, notice: { kind, text: NOTICE_TEXT[kind] } };
}
