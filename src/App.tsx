import { createLocalStore } from './library/localStore';
import { DataStoreProvider } from './ui/dataStoreContext';
import { LibraryShell } from './ui/LibraryShell';

// One store for the whole app; screens reach it only through the context.
const store = createLocalStore();

function App() {
  return (
    <DataStoreProvider store={store}>
      <LibraryShell />
    </DataStoreProvider>
  );
}

export default App;
