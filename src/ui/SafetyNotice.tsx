import { useId, useRef } from 'react';
import { useFocusTrap } from './useFocusTrap';
import { useHauntSettings } from './useHauntSettings';
import './SafetyNotice.css';

/**
 * Shown before the first session. Render it only while `noticeSeen` is false
 * (HauntLayer decides); pressing "Begin reading" saves `noticeSeen` and the
 * parent unmounts it. Escape does not close it, as with ConsentDialog.
 */
export function SafetyNotice() {
  const headingId = useId();
  const textId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const { update } = useHauntSettings();
  useFocusTrap(panelRef, true);

  return (
    <div className="notice__backdrop">
      <div
        ref={panelRef}
        className="notice"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={textId}
      >
        <h2 id={headingId} className="notice__heading">
          Before the candle burns low
        </h2>
        <div id={textId}>
          <p className="notice__text">
            If you look away, the room slowly stirs. The light dims and a shadow moves
            at the edge of the page. Your book stays in view.
          </p>
          <p className="notice__text">
            A few haunts add quiet sound. You can turn sound off, or choose Gentle mode
            to keep the haunting faint. Both are in the top bar.
          </p>
          <p className="notice__text">
            Nothing flashes quickly. Any flicker is slow, and if your device asks for
            reduced motion, the page uses soft fades instead.
          </p>
        </div>
        <div className="notice__actions">
          <button
            type="button"
            className="notice__button"
            onClick={() => update({ noticeSeen: true })}
          >
            Begin reading
          </button>
        </div>
      </div>
    </div>
  );
}
