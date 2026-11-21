// Book titles. Pure, no DOM or React.

const FALLBACK_TITLE = 'Untitled';

/** The file name without its last extension ("moby.txt" becomes "moby"). Never empty. */
export function fileNameToTitle(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const stem = base.replace(/\.[^.]*$/, '').trim();
  return stem.length > 0 ? stem : FALLBACK_TITLE;
}

/** The given title if it has visible text, otherwise the title derived from the file name. */
export function resolveTitle(title: string | null | undefined, fileName: string): string {
  const t = typeof title === 'string' ? title.trim() : '';
  return t.length > 0 ? t : fileNameToTitle(fileName);
}
