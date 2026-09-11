/** Reactions supported by the resume feed. One per person, per resume. */
export const REACTION_KINDS = ['like', 'heart', 'fire', 'wow', 'haha'] as const;

export type ReactionKind = (typeof REACTION_KINDS)[number];

/** Tally of every kind on a resume. Kinds nobody picked are present as 0. */
export type ReactionCounts = Record<ReactionKind, number>;

export type ReactToResumeRequest = {
  /** Null clears the viewer's reaction. */
  kind: ReactionKind | null;
};

export type ResumeReactionResponse = {
  resumeId: string;
  viewerReaction: ReactionKind | null;
  reactionCount: number;
  reactionCounts: ReactionCounts;
};

/** A single person's reaction, for the "who reacted" list. */
export type ResumeReactor = {
  id: string;
  kind: ReactionKind;
  createdAt: string;
  user: PublicProfile;
};

export type ResumeReactorsResponse = {
  items: ResumeReactor[];
  /** Opaque cursor for the next oldest page, or null when the list is exhausted. */
  nextCursor: string | null;
};

export type CreateResumeRequest = {
  /** Private bucket path, always `<authenticated-user-id>/<uuid>.pdf`. */
  storagePath: string;
  originalFilename: string;
  /** An optional label for a feed card. */
  title?: string | null;
  /** Optional public context displayed above the PDF preview. */
  caption?: string | null;
};

export type ResumeResponse = {
  id: string;
  ownerId: string;
  storagePath: string;
  originalFilename: string;
  title: string | null;
  caption: string | null;
  ratingCount: number;
  averageRating: number | null;
  commentCount: number;
  reactionCount: number;
  createdAt: string;
};

export type RateResumeRequest = {
  score: number;
};

export type ResumeRatingResponse = {
  resumeId: string;
  viewerRating: number;
  ratingCount: number;
  averageRating: number | null;
};

export type ResumeFieldErrors = Partial<
  Record<'storagePath' | 'originalFilename' | 'title' | 'caption', string>
>;

export type ParsedResumeCreate = {
  values: CreateResumeRequest | null;
  errors: ResumeFieldErrors;
};

/** Profile fields safe to show beside anyone — a resume owner, a commenter, a reactor. */
export type PublicProfile = {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
};

/** A resume post enriched for a feed card. `pdfUrl` is short-lived and never stored. */
export type FeedResumeResponse = {
  id: string;
  title: string | null;
  caption: string | null;
  originalFilename: string;
  author: PublicProfile;
  pdfUrl: string;
  ratingCount: number;
  averageRating: number | null;
  /** The signed-in viewer's score, if they have rated this resume. */
  viewerRating: number | null;
  commentCount: number;
  reactionCount: number;
  reactionCounts: ReactionCounts;
  /** The signed-in viewer's reaction, if they left one. */
  viewerReaction: ReactionKind | null;
  createdAt: string;
};

export type ResumeFeedResponse = {
  items: FeedResumeResponse[];
  /** Opaque cursor for the next oldest page, or null when the feed is exhausted. */
  nextCursor: string | null;
};

/** One Resume enriched exactly as it appears in the feed, for the detail route. */
export type ResumeDetailResponse = FeedResumeResponse;

export type ResumeDocumentResponse = {
  url: string;
  expiresIn: number;
};
