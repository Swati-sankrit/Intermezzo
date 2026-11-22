import { useId, useRef } from 'react';
import { useFocusTrap } from './useFocusTrap';
import './ConsentDialog.css';

interface ConsentDialogProps {
  /** Called once with true ("Turn on camera") or false ("Read without camera"). */
  onChoose: (useCamera: boolean) => void;
}

/**
 * Shown before the camera is first used. Render it only while the choice is
 * unanswered; unmounting closes it and returns focus. Escape does not close it.
 */
export function ConsentDialog({ onChoose }: ConsentDialogProps) {
  const headingId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, true);

  return (
    <div className="consent__backdrop">
      <div
        ref={panelRef}
        className="consent"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
      >
        <h2 id={headingId} className="consent__heading">
          May the candle watch you read?
        </h2>
        <p className="consent__text">
          Your camera only tells the page whether you are facing the screen.
        </p>
        <p className="consent__text">
          Everything is worked out on this device and never leaves it.
        </p>
        <p className="consent__text">
          No picture is stored or sent anywhere. You can turn the camera off at any time.
        </p>
        <div className="consent__actions">
          <button
            type="button"
            className="consent__button consent__button--primary"
            onClick={() => onChoose(true)}
          >
            Turn on camera
          </button>
          <button type="button" className="consent__button" onClick={() => onChoose(false)}>
            Read without camera
          </button>
        </div>
      </div>
    </div>
  );
}
