/** Reactions supported by the first version of the resume feed. */
export const REACTION_KINDS = ['helpful', 'insightful', 'encouraging'] as const;

export type ReactionKind = (typeof REACTION_KINDS)[number];

/**
 * PostgreSQL returns `numeric` columns as strings. This keeps the entity API
 * numeric without sacrificing exact decimal storage in the database.
 */
export const nullableNumericTransformer = {
  to(value: number | null): number | null {
    return value;
  },
  from(value: string | number | null): number | null {
    return value === null ? null : Number(value);
  },
};
