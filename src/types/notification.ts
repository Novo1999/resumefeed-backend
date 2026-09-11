import type { NotificationKind } from '../entities/notification';
import type { PublicProfile, ReactionKind } from './resume';

export type NotificationResponse = {
  id: string;
  kind: NotificationKind;
  resumeId: string;
  commentId: string | null;
  commentBody: string | null;
  reactionKind: ReactionKind | null;
  ratingScore: number | null;
  readAt: string | null;
  removedAt: string | null;
  available: boolean;
  createdAt: string;
  actor: PublicProfile;
};

export type NotificationListResponse = {
  items: NotificationResponse[];
  nextCursor: string | null;
  unreadCount: number;
};
