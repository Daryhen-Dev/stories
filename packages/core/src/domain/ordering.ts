/** Minimal structural view of a story row needed for SL R5 ordering. */
export interface OrderedStory {
  readonly position: number;
  readonly createdAt: Date;
}

/**
 * Operator-controlled order (SL R5): `position` ascending with `createdAt`
 * descending (newest first) as tiebreak. The manifest generator sorts with
 * this comparator and the embed trusts the resulting order (no re-sort).
 */
export function compareStories(a: OrderedStory, b: OrderedStory): number {
  return (
    a.position - b.position || b.createdAt.getTime() - a.createdAt.getTime()
  );
}
