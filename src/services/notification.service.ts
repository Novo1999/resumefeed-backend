import { In, IsNull } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { Notification } from '../entities/notification';
import { Resume } from '../entities/resume';
import { ResumeComment } from '../entities/resume-comment';
import { assertUuid, encodeCursor, microsecondTimestamp, parseCursor } from './cursor';
import { loadPublicProfiles, unknownProfile } from './profile.service';
import { ServiceError } from './service-error';
import type { NotificationListResponse, NotificationResponse } from '../types/notification';

const NOTIFICATION_PAGE_SIZE = 30;

function assertDatabase() {
  if (!AppDataSource.isInitialized) {
    throw new ServiceError('Database is not connected.', 'database_unavailable');
  }
}

async function availability(items: Notification[]): Promise<Map<string, boolean>> {
  const resumeIds = [...new Set(items.map((item) => item.resumeId))];
  const commentIds = [
    ...new Set(items.flatMap((item) => (item.commentId ? [item.commentId] : []))),
  ];
  const [resumes, comments] = await Promise.all([
    resumeIds.length ? AppDataSource.getRepository(Resume).findBy({ id: In(resumeIds) }) : [],
    commentIds.length
      ? AppDataSource.getRepository(ResumeComment).findBy({ id: In(commentIds) })
      : [],
  ]);
  const existingResumes = new Set(resumes.map((resume) => resume.id));
  const liveComments = new Set(
    comments.filter((comment) => comment.deletedAt === null).map((comment) => comment.id),
  );
  return new Map(
    items.map((item) => [
      item.id,
      existingResumes.has(item.resumeId) && (!item.commentId || liveComments.has(item.commentId)),
    ]),
  );
}

export async function getNotifications(
  recipientId: string,
  cursor: string | undefined,
): Promise<NotificationListResponse> {
  assertDatabase();
  const parsedCursor = parseCursor(cursor);
  const query = AppDataSource.getRepository(Notification)
    .createQueryBuilder('notification')
    .addSelect(microsecondTimestamp('notification.created_at'), 'notification_cursor_created_at')
    .where('notification.recipient_id = :recipientId', { recipientId })
    .orderBy('notification.created_at', 'DESC')
    .addOrderBy('notification.id', 'DESC')
    .take(NOTIFICATION_PAGE_SIZE + 1);
  if (parsedCursor) {
    query.andWhere(
      '(notification.created_at, notification.id) < (:createdAt::timestamptz, :id::uuid)',
      parsedCursor,
    );
  }

  const { entities: fetched, raw } = await query.getRawAndEntities();
  const items = fetched.slice(0, NOTIFICATION_PAGE_SIZE);
  const hasNextPage = fetched.length > NOTIFICATION_PAGE_SIZE;
  const lastCursorValue = raw[items.length - 1]?.notification_cursor_created_at;
  const [profiles, available, unreadCount] = await Promise.all([
    loadPublicProfiles(items.map((item) => item.actorId)),
    availability(items),
    AppDataSource.getRepository(Notification).countBy({ recipientId, readAt: IsNull() }),
  ]);
  return {
    items: items.map<NotificationResponse>((item) => ({
      id: item.id,
      kind: item.kind,
      resumeId: item.resumeId,
      commentId: item.commentId,
      commentBody: item.commentBody,
      reactionKind: item.reactionKind,
      ratingScore: item.ratingScore,
      readAt: item.readAt?.toISOString() ?? null,
      removedAt: item.removedAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      available: available.get(item.id) ?? false,
      actor: profiles.get(item.actorId) ?? unknownProfile(item.actorId),
    })),
    nextCursor:
      hasNextPage && items.length > 0 && typeof lastCursorValue === 'string'
        ? encodeCursor({ createdAt: lastCursorValue, id: items[items.length - 1].id })
        : null,
    unreadCount,
  };
}

export async function getUnreadNotificationCount(
  recipientId: string,
): Promise<{ unreadCount: number }> {
  assertDatabase();
  return {
    unreadCount: await AppDataSource.getRepository(Notification).countBy({
      recipientId,
      readAt: IsNull(),
    }),
  };
}

export async function markNotificationRead(id: string, recipientId: string): Promise<void> {
  assertDatabase();
  assertUuid(id, 'notification ID');
  const result = await AppDataSource.getRepository(Notification)
    .createQueryBuilder()
    .update(Notification)
    .set({ readAt: () => 'COALESCE(read_at, now())' })
    .where('id = :id AND recipient_id = :recipientId', { id, recipientId })
    .execute();
  if (!result.affected) throw new ServiceError('Notification not found.', 'not_found');
}

export async function markAllNotificationsRead(
  recipientId: string,
): Promise<{ unreadCount: number }> {
  assertDatabase();
  await AppDataSource.getRepository(Notification)
    .createQueryBuilder()
    .update(Notification)
    .set({ readAt: () => 'now()' })
    .where('recipient_id = :recipientId AND read_at IS NULL', { recipientId })
    .execute();
  return { unreadCount: 0 };
}
