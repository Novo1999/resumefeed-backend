import type { PublicProfile, ReactionCounts, ReactionKind } from './resume';

export const COMMENT_BODY_MAX_LENGTH = 2000;

export type WriteCommentRequest = {
  body: string;
};

/**
 * A comment or a reply. A tombstoned comment reports `deleted: true` and hides
 * both its body and its author, so deleting is not a way to be quoted anonymously.
 */
export type CommentResponse = {
  id: string;
  resumeId: string;
  /** Null on a root comment; the root's ID on a reply. */
  parentId: string | null;
  author: PublicProfile | null;
  /** Present when this reply answers another reply: renders "replying to @Sam". */
  replyToAuthor: PublicProfile | null;
  body: string | null;
  deleted: boolean;
  replyCount: number;
  editedAt: string | null;
  createdAt: string;
  reactionCount: number;
  reactionCounts: ReactionCounts;
  /** The signed-in viewer's reaction on this comment, if they left one. */
  viewerReaction: ReactionKind | null;
  viewerCanEdit: boolean;
  viewerCanDelete: boolean;
};

/** A root comment carrying the start of its thread. */
export type CommentThread = CommentResponse & {
  /** The oldest few replies; `replyCount` says how many exist in total. */
  replies: CommentResponse[];
};

export type CommentThreadsResponse = {
  items: CommentThread[];
  /** Opaque cursor for the next oldest page of root comments, or null. */
  nextCursor: string | null;
};

export type CommentRepliesResponse = {
  items: CommentResponse[];
  /** Opaque cursor for the next newest page of replies, or null. */
  nextCursor: string | null;
};

export type CommentReactionResponse = {
  commentId: string;
  viewerReaction: ReactionKind | null;
  reactionCount: number;
  reactionCounts: ReactionCounts;
};
