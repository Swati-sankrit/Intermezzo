import { useCallback, type MutableRefObject } from 'react';
import type { DataStore } from '../library/localStore';
import type { ModelSaver } from '../library/modelSaver';
import { EMPTY_DATA_MODEL, type DataModel } from '../library/model';

interface Deps {
  store: DataStore;
  modelRef: MutableRefObject<DataModel>;
  readyRef: MutableRefObject<boolean>;
  saverRef: MutableRefObject<ModelSaver | null>;
  setModel: (m: DataModel) => void;
  setMessage: (m: string | null) => void;
}

/**
 * "Clear my data": the store deletes the model, all book text and all legacy data.
 * Only after that succeeds does the in-memory model become empty (so onboarding shows).
 * On any failure the model in memory is left as it was and the result is false.
 */
export function useClearData({ store, modelRef, readyRef, saverRef, setModel, setMessage }: Deps) {
  return useCallback(async (): Promise<boolean> => {
    if (!readyRef.current) return false;
    try {
      await saverRef.current?.flush(); // a pending write must not land after the clear
      const cleared = await store.clear();
      if (!cleared.ok) return false;
    } catch {
      return false;
    }
    modelRef.current = EMPTY_DATA_MODEL;
    setModel(EMPTY_DATA_MODEL);
    setMessage(null);
    return true;
  }, [store, modelRef, readyRef, saverRef, setModel, setMessage]);
}
