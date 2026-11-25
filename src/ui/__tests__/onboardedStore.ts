import { createMemoryStore } from '../../library/memoryStore';
import { EMPTY_DATA_MODEL, type DataModel } from '../../library/model';

/** An empty Data_Model whose reader has already finished onboarding (so the Library_Screen shows). */
export const ONBOARDED_MODEL: DataModel = {
  ...EMPTY_DATA_MODEL,
  profile: { ...EMPTY_DATA_MODEL.profile, onboardingCompleted: true },
};

/** A memory store that starts from ONBOARDED_MODEL. The memory store assigns its model synchronously in save. */
export function createOnboardedStore() {
  const store = createMemoryStore();
  void store.save(ONBOARDED_MODEL);
  return store;
}
