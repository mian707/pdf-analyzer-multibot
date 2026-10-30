import type { CitationRecord } from '../types';

// Single source of truth for how papers move between screening stages.

/** Stage 1 -> Stage 2: the human included the paper OR was unsure at title/abstract.
 *  Unsure papers get judged on the full text instead of being lost at T/A. */
export const passesTitleAbstract = (c: CitationRecord): boolean =>
  c.reviewStatus === 'INCLUDED' || c.reviewStatus === 'NOT_SURE';

/** Stage 1 "Conflicts": human vs AI disagree (AI NOT_SURE is ignored),
 *  OR the human marked the paper NOT_SURE (needs a second look / resolution). */
export const isTitleAbstractConflict = (c: CitationRecord): boolean =>
  c.reviewStatus === 'NOT_SURE' ||
  (c.reviewStatus !== 'UNREVIEWED' && !!c.aiReviewStatus &&
   c.aiReviewStatus !== 'NOT_SURE' && c.reviewStatus !== c.aiReviewStatus);

/** Stage 2 "Conflicts": human vs AI disagree on the full text, OR the paper
 *  came in as NOT_SURE from T/A and still has no full-text include/exclude. */
export const isFullTextConflict = (c: CitationRecord): boolean => {
  const ft = c.fullTextStatus;
  const decided = ft === 'INCLUDED' || ft === 'EXCLUDED';
  const unsureAtTA = c.reviewStatus === 'NOT_SURE' && !decided;
  const aiDisagrees = !!ft && ft !== 'UNREVIEWED' && !!c.fullTextAiStatus &&
    c.fullTextAiStatus !== 'NOT_SURE' && ft !== c.fullTextAiStatus;
  return unsureAtTA || aiDisagrees;
};
