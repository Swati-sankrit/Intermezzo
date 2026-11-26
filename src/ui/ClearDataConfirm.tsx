import { useState } from 'react';
import { LIBRARY_MESSAGES as MSG } from './libraryMessages';
import './theme.css';
import './LibraryScreen.css';
import './shell/SeanceTab.css';

export interface ClearDataConfirmProps {
  /** Resolves true when everything was deleted. */
  onConfirm: () => Promise<boolean>;
  onCancel: () => void;
}

/** Says what "Clear my data" deletes. A failure shows an error and keeps the button for another try. */
export function ClearDataConfirm({ onConfirm, onCancel }: ClearDataConfirmProps) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const confirm = async () => {
    setBusy(true);
    setFailed(false);
    const ok = await onConfirm().catch(() => false);
    if (!ok) {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <>
      <h2 id="settings-heading" className="settings__heading">Clear my data?</h2>
      <p className="settings__text">
        This deletes your profile, shelves, reading positions, stats, the text of books you uploaded, and any data
        from the earlier version of this app. It cannot be undone.
      </p>
      {failed && (
        <p className="settings__error" role="alert">{MSG.clearFailed}</p>
      )}
      <div className="settings__actions">
        <button type="button" data-first className="library__button btn-quiet" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="settings__danger" disabled={busy} onClick={() => void confirm()}>
          {failed ? 'Try again' : 'Clear my data'}
        </button>
      </div>
    </>
  );
}
