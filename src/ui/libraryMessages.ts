/** Plain-words messages for library failures. */
export const LIBRARY_MESSAGES = {
  loadFailed: 'Your saved books could not be loaded. You can still open a book below.',
  newerVersion: 'Your saved data comes from a newer version of this app.',
  positionSaveFailed: 'Your place could not be saved. It will try again.',
  statsSaveFailed: 'Progress stats were not saved. Reading goes on, and it will try again.',
  profileSaveFailed: 'Your changes could not be saved. Try again.',
  onboardingNotSaved: 'Your name and candle will not be saved after the tab closes.',
  addFailed: 'This book could not be added. Try a different file or browser.',
  removeFailed: 'This book could not be removed. You can try again.',
  catalogueFailed: 'The library could not be loaded.',
  differentFile: 'That is not the same file. Choose the file you first opened, or choose the book again.',
} as const;
