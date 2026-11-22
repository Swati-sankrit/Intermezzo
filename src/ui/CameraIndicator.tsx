import './CameraIndicator.css';

interface CameraIndicatorProps {
  cameraOn: boolean;
  onTurnOff: () => void;
}

/**
 * Shown for as long as the camera is on. It renders straight from `cameraOn`
 * and has no other condition, so it stays visible while paused and while the
 * tab is hidden.
 */
export function CameraIndicator({ cameraOn, onTurnOff }: CameraIndicatorProps) {
  if (!cameraOn) return null;
  return (
    <div className="camera-indicator" role="group" aria-label="The camera is on">
      <svg
        className="camera-indicator__dot"
        viewBox="0 0 12 12"
        width="12"
        height="12"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="6" cy="6" r="5" />
      </svg>
      <span className="camera-indicator__text">Camera on</span>
      <button type="button" className="camera-indicator__button" onClick={onTurnOff}>
        Turn camera off
      </button>
    </div>
  );
}
