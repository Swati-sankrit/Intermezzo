import { createContext, useContext, type ReactNode } from 'react';
import type { DataStore } from '../library/localStore';

const DataStoreContext = createContext<DataStore | null>(null);

export function DataStoreProvider({ store, children }: { store: DataStore; children: ReactNode }) {
  return <DataStoreContext.Provider value={store}>{children}</DataStoreContext.Provider>;
}

/** The one way screens reach storage. Throws if no provider is mounted. */
export function useDataStore(): DataStore {
  const store = useContext(DataStoreContext);
  if (store === null) throw new Error('useDataStore must be used inside a DataStoreProvider');
  return store;
}
