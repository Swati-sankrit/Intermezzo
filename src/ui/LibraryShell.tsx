import { useState } from 'react';
import { flushSync } from 'react-dom';
import { hashBytes } from '../library/bookId';
import { readAsArrayBuffer } from '../reader/fileIO';
import type { ReaderSession } from './bookSession';
import { useDataStore } from './dataStoreContext';
import { LIBRARY_MESSAGES as MSG } from './libraryMessages';
import { LibraryScreen } from './LibraryScreen';
import { Onboarding } from './Onboarding';
import { ReaderView } from './ReaderView';
import { useLibrary } from './useLibrary';
import { useProfileActions } from './useProfileActions';

/** The library and the reader, joined by the Book_Id of the book being read. */
export function LibraryShell() {
  const lib = useLibrary();
  const store = useDataStore();
  const [bookId, setBookId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const session: ReaderSession | undefined = bookId
    ? { bookId, store, model: lib.model, status: lib.status, updateModel: lib.updateModel }
    : undefined;

  // Opening the book already shown (after a failure) must run the load again.
  const open = (id: string) => {
    setNotice(null);
    flushSync(() => setBookId(null));
    setBookId(id);
  };

  const openCatalogue = (slug: string) => {
    if (lib.status !== 'ready') return;
    const id = lib.openCatalogueBook(slug);
    if (id) open(id);
  };

  const openFile = async (file: File) => {
    const id = await lib.openUpload(file);
    if (id) open(id);
  };

  // "Reopen the file": reuse the file only when it is the same one (its hash is the Book_Id).
  const reopenPicked = async (id: string, file: File) => {
    const bytes = await readAsArrayBuffer(file).catch(() => null);
    const hash = bytes ? await hashBytes(bytes) : null;
    if (hash !== id) {
      setNotice(MSG.differentFile);
      return;
    }
    const stored = await lib.openUpload(file);
    if (stored) open(stored);
  };

  const { onboardingEnded, finishOnboarding } = useProfileActions(lib.updateModel);
  const showOnboarding = lib.status === 'ready' && !lib.model.profile.onboardingCompleted;
  const unsavedNotice = onboardingEnded && lib.message === MSG.profileSaveFailed ? MSG.onboardingNotSaved : null;

  return (
    <ReaderView
      session={session}
      onLeave={() => setBookId(null)}
      saveFailure={lib.message === MSG.positionSaveFailed || lib.message === MSG.statsSaveFailed ? lib.message : null}
      onDismissSaveFailure={lib.dismissMessage}
      library={(status, back) =>
        showOnboarding ? (
          <main className="library">
            <Onboarding
              onDone={(choices, then) => {
                finishOnboarding(choices);
                if (then === 'browse') {
                  requestAnimationFrame(() =>
                    document.getElementById('catalogue-heading')?.parentElement?.focus(),
                  );
                }
              }}
              onOpenFile={(file, choices) => {
                finishOnboarding(choices);
                void openFile(file);
              }}
            />
          </main>
        ) : (
        <LibraryScreen
          lib={lib}
          open={status}
          failedBookId={status.failure ? bookId : null}
          notice={notice ?? unsavedNotice}
          onOpenCatalogue={openCatalogue}
          onOpenFile={(file) => void openFile(file)}
          onContinue={(id) => {
            if (lib.status === 'ready') open(id);
          }}
          onReopenPicked={(id, file) => void reopenPicked(id, file)}
          onBack={() => {
            setNotice(null);
            back();
          }}
        />
        )
      }
    />
  );
}
