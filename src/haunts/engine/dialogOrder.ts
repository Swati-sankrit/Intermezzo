/**
 * Which first-run dialogs may show. Pure. The camera choice is typed
 * structurally so the haunts engine does not import from src/attention/.
 * The consent dialog is held back until the safety notice has been seen,
 * so the two are never visible together (Req 8.9 to 8.12).
 */
export type CameraChoiceLike = 'unanswered' | 'camera' | 'no-camera' | (string & {});

export interface VisibleDialogs {
  readonly notice: boolean;
  readonly consent: boolean;
}

export function visibleDialogs(noticeSeen: boolean, cameraChoice: CameraChoiceLike): VisibleDialogs {
  return {
    notice: !noticeSeen,
    consent: noticeSeen && cameraChoice === 'unanswered',
  };
}
