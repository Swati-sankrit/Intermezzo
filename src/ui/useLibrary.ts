import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hashBytes } from '../library/bookId';
import { CATALOGUE, type CatalogueEntry } from '../library/catalogueData';
import type { FailureKind } from '../library/localStore';
import { createModelSaver, MODEL_SAVE_DELAY_MS, type ModelSaver } from '../library/modelSaver';
import { EMPTY_DATA_MODEL, type BookEntry, type DataModel } from '../library/model';
import { addBookEntry, currentBook as pickCurrentBook } from '../library/shelfOps';
import { readAsArrayBuffer } from '../reader/fileIO';
import { loadFromFile } from './loadSource';
import { useDataStore } from './dataStoreContext';
import { LIBRARY_MESSAGES as MSG } from './libraryMessages';
import { useClearData } from './useClearData';
import { useShelfActions } from './useShelfActions';

export type CatalogueState =
  | { status: 'ready'; entries: readonly CatalogueEntry[] }
  | { status: 'error'; message: string };

function readCatalogue(): CatalogueState {
  try {
    if (!Array.isArray(CATALOGUE)) throw new Error('catalogue missing');
    return { status: 'ready', entries: CATALOGUE };
  } catch {
    return { status: 'error', message: MSG.catalogueFailed };
  }
}

export type SaveKind = 'position' | 'profile' | 'stats';
export interface UpdateOptions {
  /** Wait before the write. Defaults to MODEL_SAVE_DELAY_MS. */
  delayMs?: number;
  /** Picks the message shown if the write fails. Defaults to 'profile'. */
  kind?: SaveKind;
}

/**
 * The Library_Screen's view of the Data_Model. Screens never touch storage.
 * Public API for 5.2-5.4: `model`, `status`, `currentBook`, `catalogue`,
 * `retryCatalogue`, `openCatalogueBook`, `openUpload`, `updateModel`,
 * `message`, `dismissMessage`, plus shelf actions from useShelfActions:
 * `shelfBooks`, `shelfOf`, `moveBook`, `removeBook`.
 */
export function useLibrary() {
  const store = useDataStore();
  const [model, setModel] = useState<DataModel>(EMPTY_DATA_MODEL);
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [catalogue, setCatalogue] = useState<CatalogueState>(readCatalogue);
  const modelRef = useRef<DataModel>(EMPTY_DATA_MODEL);
  const readyRef = useRef(false);
  const lastKind = useRef<SaveKind>('profile');
  const saverRef = useRef<ModelSaver | null>(null);

  useEffect(() => {
    let cancelled = false;
    const saver = createModelSaver(
      store,
      () => modelRef.current,
      (failure: FailureKind | null) => {
        if (cancelled) return;
        if (failure === null) lastKind.current = 'profile';
        if (failure === null) setMessage((m) => (m === MSG.positionSaveFailed || m === MSG.profileSaveFailed || m === MSG.statsSaveFailed ? null : m));
        else if (failure === 'newer_version') setMessage(MSG.newerVersion);
        else if (lastKind.current === 'position') setMessage(MSG.positionSaveFailed);
        else setMessage(lastKind.current === 'stats' ? MSG.statsSaveFailed : MSG.profileSaveFailed);
      },
    );
    saverRef.current = saver;
    void (async () => {
      let result;
      try {
        result = await store.load();
      } catch {
        result = { ok: false, kind: 'unavailable' } as const;
      }
      if (cancelled) return;
      if (result.ok) {
        modelRef.current = result.value;
        setModel(result.value);
      } else {
        if (result.kind === 'newer_version') saver.stop();
        setMessage(
          result.kind === 'newer_version'
            ? MSG.newerVersion
            : result.kind === 'invalid'
              ? MSG.dataUnreadable
              : result.kind === 'migration_failed'
                ? MSG.migrationFailed
                : MSG.loadFailed,
        );
      }
      readyRef.current = true;
      setStatus('ready');
    })();
    return () => {
      cancelled = true;
      void saver.flush().then(() => saver.stop());
    };
  }, [store]);

  /** Apply a pure model update, show it now, and write it soon. Ignored until loading ends. */
  const updateModel = useCallback((fn: (m: DataModel) => DataModel, opts: UpdateOptions = {}) => {
    if (!readyRef.current) return;
    const next = fn(modelRef.current);
    if (next === modelRef.current) return;
    modelRef.current = next;
    setModel(next);
    // A stats write never hides a pending position write's failure message.
    const kind = opts.kind ?? 'profile';
    if (kind !== 'stats' || lastKind.current !== 'position') lastKind.current = kind;
    saverRef.current?.schedule(opts.delayMs ?? MODEL_SAVE_DELAY_MS);
  }, []);

  const retryCatalogue = useCallback(() => setCatalogue(readCatalogue()), []);

  const openCatalogueBook = useCallback(
    (slug: string): string | null => {
      const entry = CATALOGUE.find((e) => e.slug === slug);
      if (!entry) return null;
      const book: BookEntry = {
        bookId: entry.slug,
        title: entry.title,
        author: entry.author,
        fileName: entry.epubPath.split('/').pop() ?? entry.slug,
        source: 'catalogue',
        format: 'epub',
        catalogueSlug: entry.slug,
        addedAt: Date.now(),
      };
      updateModel((m) => addBookEntry(m, book));
      return entry.slug;
    },
    [updateModel],
  );

  /** Hash, parse and store an uploaded file. Resolves to its Book_Id, or null after showing a message. */
  const openUpload = useCallback(
    async (file: File): Promise<string | null> => {
      let bytes: ArrayBuffer;
      try {
        bytes = await readAsArrayBuffer(file);
      } catch {
        setMessage(MSG.addFailed);
        return null;
      }
      const bookId = await hashBytes(bytes);
      if (bookId === null) {
        setMessage(MSG.addFailed);
        return null;
      }
      const loaded = await loadFromFile(file);
      if (!loaded.ok) {
        setMessage(loaded.error);
        return null;
      }
      const put = await store.putText(bookId, loaded.storedText).catch(() => null);
      if (!put || !put.ok) {
        setMessage(MSG.addFailed);
        return null;
      }
      const entry: BookEntry = {
        bookId,
        title: loaded.book.title,
        author: '',
        fileName: file.name,
        source: 'upload',
        format: file.name.toLowerCase().endsWith('.epub') ? 'epub' : 'txt',
        addedAt: Date.now(),
      };
      setMessage(null);
      updateModel((m) => addBookEntry(m, entry));
      return bookId;
    },
    [store, updateModel],
  );

  const currentBook = useMemo(() => pickCurrentBook(model), [model]);
  const shelf = useShelfActions({ store, model, modelRef, readyRef, saverRef, setModel, setMessage, updateModel });
  const clearAllData = useClearData({ store, modelRef, readyRef, saverRef, setModel, setMessage });
  const dismissMessage = useCallback(() => setMessage(null), []);

  return {
    clearAllData,
    model,
    status,
    message,
    dismissMessage,
    catalogue,
    retryCatalogue,
    currentBook,
    openCatalogueBook,
    openUpload,
    updateModel,
    ...shelf,
  };
}
