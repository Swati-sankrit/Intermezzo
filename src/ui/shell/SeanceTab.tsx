import { LIBRARY_MESSAGES as MSG } from '../libraryMessages';
import type { Profile } from '../../library/model';
import { SeanceCamera } from './SeanceCamera';
import { SeanceHaunt } from './SeanceHaunt';
import { SeanceProfile, type SeanceProfileProps } from './SeanceProfile';
import { SeanceVolume } from './SeanceVolume';
import '../theme.css';
import '../LibraryScreen.css';
import './SeanceTab.css';

export interface SeanceTabProps {
  profile: Profile;
  actions: SeanceProfileProps['actions'];
  /** The library message; the retry text shows when a profile save failed. */
  message: string | null;
  /** True while the Data_Store loads. */
  loading: boolean;
  /** Deletes everything through the store. Resolves true only when all of it is gone. */
  onClearData: () => Promise<boolean>;
}

/** The settings tab: profile, haunt mode, camera choice and volume cap. */
export function SeanceTab({ profile, actions, message, loading, onClearData }: SeanceTabProps) {
  return (
    <section className="seance" aria-labelledby="seance-title">
      <h2 id="seance-title" className="settings__heading">The Séance</h2>
      {/* The key restarts the name field from the loaded profile once loading ends. */}
      <SeanceProfile
        key={loading ? 'loading' : 'ready'}
        profile={profile}
        actions={actions}
        saveFailed={message === MSG.profileSaveFailed}
        loading={loading}
        onClearData={onClearData}
      />
      <SeanceHaunt />
      <SeanceCamera />
      <SeanceVolume />
    </section>
  );
}
