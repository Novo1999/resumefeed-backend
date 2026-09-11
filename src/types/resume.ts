/** Reactions supported by the first version of the resume feed. */
export const REACTION_KINDS = ['helpful', 'insightful', 'encouraging'] as const;

export type ReactionKind = (typeof REACTION_KINDS)[number];

export type CreateResumeRequest = {
  /** Private bucket path, always `<authenticated-user-id>/<uuid>.pdf`. */
  storagePath: string;
  originalFilename: string;
  /** An optional label for a feed card. */
  title?: string | null;
};

export type ResumeResponse = {
  id: string;
  ownerId: string;
  storagePath: string;
  originalFilename: string;
  title: string | null;
  ratingCount: number;
  averageRating: number | null;
  commentCount: number;
  reactionCount: number;
  createdAt: string;
};

export type ResumeFieldErrors = Partial<Record<'storagePath' | 'originalFilename' | 'title', string>>;
