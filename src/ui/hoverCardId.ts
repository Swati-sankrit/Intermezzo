/** DOM id of a catalogue entry's hover card, used by aria-describedby. */
export function hoverCardId(slug: string): string {
  return `hover-card-${slug.replace(/[^a-z0-9]+/gi, '-')}`;
}
