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

export type ParsedResumeCreate = {
  values: CreateResumeRequest | null;
  errors: ResumeFieldErrors;
};

export type ResumeServiceErrorKind =
  | 'bad_request'
  | 'conflict'
  | 'not_found'
  | 'database_unavailable'
  | 'dependency';

/** Public profile fields safe to show beside a feed post. */
export type ResumeAuthor = {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
};

/** A resume post enriched for a feed card. `pdfUrl` is short-lived and never stored. */
export type FeedResumeResponse = {
  id: string;
  title: string | null;
  originalFilename: string;
  author: ResumeAuthor;
  pdfUrl: string;
  ratingCount: number;
  averageRating: number | null;
  commentCount: number;
  reactionCount: number;
  createdAt: string;
};

export type ResumeFeedResponse = {
  items: FeedResumeResponse[];
};

export type ResumeDocumentResponse = {
  url: string;
  expiresIn: number;
};
