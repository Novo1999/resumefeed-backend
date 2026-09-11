import { AppDataSource } from '../config/data-source';
import { In } from 'typeorm';
import { Resume } from '../entities/resume';
import { ResumeComment } from '../entities/resume-comment';
import { CommentReaction } from '../entities/comment-reaction';
import { assertUuid, encodeCursor, microsecondTimestamp, parseCursor } from './cursor';
import { loadPublicProfiles, unknownProfile } from './profile.service';
import { ServiceError } from './service-error';
import { emptyReactionCounts } from './resume.service';
import { COMMENT_BODY_MAX_LENGTH } from '../types/comment';
import type { PublicProfile, ReactionCounts, ReactionKind } from '../types/resume';
import type {
  CommentReactionResponse,
  CommentRepliesResponse,
  CommentResponse,
  CommentThread,
  CommentThreadsResponse,
  WriteCommentRequest,
} from '../types/comment';

const THREAD_PAGE_SIZE = 20;
const REPLY_PAGE_SIZE = 20;
/** Replies shipped inline with each root. The rest come from the replies route. */
const REPLY_PREVIEW_SIZE = 2;

function assertDatabase() {
  if (!AppDataSource.isInitialized) {
    throw new ServiceError('Database is not connected.', 'database_unavailable');
  }
}

export function parseCommentBody(body: unknown): WriteCommentRequest {
  if (typeof body !== 'object' || body === null) {
    throw new ServiceError('Expected a JSON object.', 'bad_request', {
      body: 'Write something first.',
    });
  }

  const value = (body as { body?: unknown }).body;
  if (typeof value !== 'string') {
    throw new ServiceError('Comment body must be text.', 'bad_request', {
      body: 'Comment body must be text.',
    });
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ServiceError('A comment cannot be empty.', 'bad_request', {
      body: 'Write something first.',
    });
  }
  if (trimmed.length > COMMENT_BODY_MAX_LENGTH) {
    throw new ServiceError('That comment is too long.', 'bad_request', {
      body: `Keep it to ${COMMENT_BODY_MAX_LENGTH} characters or fewer.`,
    });
  }
  return { body: trimmed };
}

type ReactionContext = {
  counts: Map<string, ReactionCounts>;
  viewer: Map<string, ReactionKind>;
};

function emptyReactionContext(): ReactionContext {
  return { counts: new Map(), viewer: new Map() };
}

/**
 * Per-kind tallies plus the viewer's own pick, for a whole page of comments in
 * two queries rather than two per comment.
 */
async function loadCommentReactions(
  commentIds: string[],
  viewerId: string,
): Promise<ReactionContext> {
  const context = emptyReactionContext();
  if (commentIds.length === 0) return context;

  const repository = AppDataSource.getRepository(CommentReaction);
  const [rows, mine] = await Promise.all([
    repository
      .createQueryBuilder('reaction')
      .select('reaction.comment_id', 'commentId')
      .addSelect('reaction.kind', 'kind')
      .addSelect('count(*)::integer', 'total')
      .where('reaction.comment_id IN (:...commentIds)', { commentIds })
      .groupBy('reaction.comment_id')
      .addGroupBy('reaction.kind')
      .getRawMany<{ commentId: string; kind: ReactionKind; total: number }>(),
    repository.findBy({ authorId: viewerId, commentId: In(commentIds) }),
  ]);

  for (const row of rows) {
    const counts = context.counts.get(row.commentId) ?? emptyReactionCounts();
    counts[row.kind] = row.total;
    context.counts.set(row.commentId, counts);
  }
  for (const reaction of mine) context.viewer.set(reaction.commentId, reaction.kind);
  return context;
}

/**
 * A tombstone keeps its replies but gives up its body and its author, so
 * deleting is never a way to have said something anonymously.
 */
function serializeComment(
  comment: ResumeComment,
  profiles: Map<string, PublicProfile>,
  reactions: ReactionContext,
  viewerId: string,
  resumeOwnerId: string,
): CommentResponse {
  const deleted = comment.deletedAt !== null;
  const isAuthor = comment.authorId === viewerId;
  return {
    id: comment.id,
    resumeId: comment.resumeId,
    parentId: comment.parentId,
    author: deleted ? null : (profiles.get(comment.authorId) ?? unknownProfile(comment.authorId)),
    replyToAuthor:
      deleted || comment.replyToAuthorId === null
        ? null
        : (profiles.get(comment.replyToAuthorId) ?? unknownProfile(comment.replyToAuthorId)),
    body: deleted ? null : comment.body,
    deleted,
    replyCount: comment.replyCount,
    editedAt: comment.editedAt?.toISOString() ?? null,
    createdAt: comment.createdAt.toISOString(),
    reactionCount: comment.reactionCount,
    reactionCounts: reactions.counts.get(comment.id) ?? emptyReactionCounts(),
    viewerReaction: reactions.viewer.get(comment.id) ?? null,
    viewerCanEdit: !deleted && isAuthor,
    viewerCanDelete: !deleted && (isAuthor || resumeOwnerId === viewerId),
  };
}

/** Every Auth user a page of comments needs a name and avatar for. */
function profileIds(comments: ResumeComment[]): string[] {
  const ids: string[] = [];
  for (const comment of comments) {
    if (comment.deletedAt !== null) continue;
    ids.push(comment.authorId);
    if (comment.replyToAuthorId) ids.push(comment.replyToAuthorId);
  }
  return ids;
}

async function findResumeOrFail(resumeId: string): Promise<Resume> {
  assertUuid(resumeId, 'resume ID');
  const resume = await AppDataSource.getRepository(Resume).findOneBy({ id: resumeId });
  if (!resume) throw new ServiceError('Resume not found.', 'not_found');
  return resume;
}

async function findCommentOrFail(commentId: string): Promise<ResumeComment> {
  assertUuid(commentId, 'comment ID');
  const comment = await AppDataSource.getRepository(ResumeComment).findOneBy({ id: commentId });
  if (!comment) throw new ServiceError('Comment not found.', 'not_found');
  return comment;
}

export async function createComment(
  resumeId: string,
  viewerId: string,
  values: WriteCommentRequest,
): Promise<CommentResponse> {
  assertDatabase();
  const resume = await findResumeOrFail(resumeId);

  const repository = AppDataSource.getRepository(ResumeComment);
  const created = await repository.save(
    repository.create({
      resumeId: resume.id,
      authorId: viewerId,
      parentId: null,
      replyToAuthorId: null,
      body: values.body,
    }),
  );

  const profiles = await loadPublicProfiles([viewerId]);
  return serializeComment(created, profiles, emptyReactionContext(), viewerId, resume.ownerId);
}

/**
 * A reply is posted against the comment being answered, not against the thread.
 * When that comment is itself a reply, the new row hangs off the root instead
 * and remembers whom it answered — which is what keeps threads two levels deep.
 */
export async function createReply(
  commentId: string,
  viewerId: string,
  values: WriteCommentRequest,
): Promise<CommentResponse> {
  assertDatabase();
  const answered = await findCommentOrFail(commentId);
  if (answered.deletedAt !== null) {
    throw new ServiceError('That comment was deleted.', 'not_found');
  }

  const resume = await findResumeOrFail(answered.resumeId);
  const isRoot = answered.parentId === null;

  const repository = AppDataSource.getRepository(ResumeComment);
  const created = await repository.save(
    repository.create({
      resumeId: answered.resumeId,
      authorId: viewerId,
      parentId: isRoot ? answered.id : answered.parentId,
      replyToAuthorId: isRoot ? null : answered.authorId,
      body: values.body,
    }),
  );

  const profiles = await loadPublicProfiles(profileIds([created]));
  return serializeComment(created, profiles, emptyReactionContext(), viewerId, resume.ownerId);
}

export async function updateComment(
  commentId: string,
  viewerId: string,
  values: WriteCommentRequest,
): Promise<CommentResponse> {
  assertDatabase();
  const comment = await findCommentOrFail(commentId);

  if (comment.deletedAt !== null) {
    throw new ServiceError('That comment was deleted.', 'not_found');
  }
  // Deliberately narrower than deletion: the resume owner may remove a comment
  // from their post, but may never put different words in someone's mouth.
  if (comment.authorId !== viewerId) {
    throw new ServiceError('You can only edit your own comments.', 'forbidden');
  }

  comment.body = values.body;
  comment.editedAt = new Date();
  const saved = await AppDataSource.getRepository(ResumeComment).save(comment);

  const resume = await findResumeOrFail(comment.resumeId);
  const [profiles, reactions] = await Promise.all([
    loadPublicProfiles(profileIds([saved])),
    loadCommentReactions([saved.id], viewerId),
  ]);
  return serializeComment(saved, profiles, reactions, viewerId, resume.ownerId);
}

/**
 * Deleting a comment that holds replies leaves a tombstone, because the replies
 * belong to other people. A comment nobody answered is removed outright.
 */
export async function deleteComment(commentId: string, viewerId: string): Promise<void> {
  assertDatabase();
  const comment = await findCommentOrFail(commentId);
  if (comment.deletedAt !== null) return;

  const resume = await findResumeOrFail(comment.resumeId);
  if (comment.authorId !== viewerId && resume.ownerId !== viewerId) {
    throw new ServiceError(
      'Only the comment author or the resume owner can delete this.',
      'forbidden',
    );
  }

  const repository = AppDataSource.getRepository(ResumeComment);
  // A reply is never tombstoned, so the trigger-maintained count is exact and
  // there is no second query to run here.
  if (comment.replyCount > 0) {
    await repository.update(comment.id, { deletedAt: new Date(), body: '' });
    return;
  }
  await repository.delete(comment.id);
}

/** Root comments newest first, each carrying the oldest few of its replies. */
export async function getCommentThreads(
  resumeId: string,
  viewerId: string,
  cursor: string | undefined,
): Promise<CommentThreadsResponse> {
  assertDatabase();
  const resume = await findResumeOrFail(resumeId);
  const parsedCursor = parseCursor(cursor);

  const query = AppDataSource.getRepository(ResumeComment)
    .createQueryBuilder('comment')
    .addSelect(microsecondTimestamp('comment.created_at'), 'comment_cursor_created_at')
    .where('comment.resume_id = :resumeId', { resumeId: resume.id })
    .andWhere('comment.parent_id IS NULL')
    .orderBy('comment.created_at', 'DESC')
    .addOrderBy('comment.id', 'DESC')
    .take(THREAD_PAGE_SIZE + 1);

  if (parsedCursor) {
    query.andWhere(
      '(comment.created_at, comment.id) < (:createdAt::timestamptz, :id::uuid)',
      parsedCursor,
    );
  }

  const { entities: fetched, raw } = await query.getRawAndEntities();
  const roots = fetched.slice(0, THREAD_PAGE_SIZE);
  if (roots.length === 0) return { items: [], nextCursor: null };

  const lastCursorValue = raw[roots.length - 1]?.comment_cursor_created_at;
  const nextCursor =
    fetched.length > THREAD_PAGE_SIZE && typeof lastCursorValue === 'string'
      ? encodeCursor({ createdAt: lastCursorValue, id: roots[roots.length - 1].id })
      : null;

  const previews = await loadReplyPreviews(roots.map((root) => root.id));
  const previewed = [...previews.values()].flat();
  const onPage = [...roots, ...previewed];
  const [profiles, reactions] = await Promise.all([
    loadPublicProfiles(profileIds(onPage)),
    loadCommentReactions(
      onPage.map((comment) => comment.id),
      viewerId,
    ),
  ]);

  const items: CommentThread[] = roots.map((root) => ({
    ...serializeComment(root, profiles, reactions, viewerId, resume.ownerId),
    replies: (previews.get(root.id) ?? []).map((reply) =>
      serializeComment(reply, profiles, reactions, viewerId, resume.ownerId),
    ),
  }));
  return { items, nextCursor };
}

type ReplyRow = {
  id: string;
  resume_id: string;
  author_id: string;
  parent_id: string;
  reply_to_author_id: string | null;
  body: string;
  reply_count: number;
  reaction_count: number;
  edited_at: Date | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function toComment(row: ReplyRow): ResumeComment {
  const comment = new ResumeComment();
  comment.id = row.id;
  comment.resumeId = row.resume_id;
  comment.authorId = row.author_id;
  comment.parentId = row.parent_id;
  comment.replyToAuthorId = row.reply_to_author_id;
  comment.body = row.body;
  comment.replyCount = row.reply_count;
  comment.reactionCount = row.reaction_count;
  comment.editedAt = row.edited_at;
  comment.deletedAt = row.deleted_at;
  comment.createdAt = row.created_at;
  comment.updatedAt = row.updated_at;
  return comment;
}

/**
 * The oldest few replies for every root on the page, in one round trip. Ranking
 * inside the partition beats a query per thread, which is what a naive
 * `find({ parentId })` per root would cost.
 */
async function loadReplyPreviews(rootIds: string[]): Promise<Map<string, ResumeComment[]>> {
  const previews = new Map<string, ResumeComment[]>(rootIds.map((id) => [id, []]));
  if (rootIds.length === 0) return previews;

  const rows: ReplyRow[] = await AppDataSource.query(
    `SELECT id, resume_id, author_id, parent_id, reply_to_author_id, body,
            reply_count, reaction_count, edited_at, deleted_at, created_at, updated_at
     FROM (
       SELECT *, row_number() OVER (
         PARTITION BY parent_id ORDER BY created_at ASC, id ASC
       ) AS rn
       FROM resume_comments
       WHERE parent_id = ANY($1::uuid[])
     ) ranked
     WHERE ranked.rn <= $2
     ORDER BY ranked.created_at ASC, ranked.id ASC`,
    [rootIds, REPLY_PREVIEW_SIZE],
  );

  for (const row of rows) {
    previews.get(row.parent_id)?.push(toComment(row));
  }
  return previews;
}

/** The rest of one thread's replies, oldest first, behind "show more replies". */
export async function getCommentReplies(
  commentId: string,
  viewerId: string,
  cursor: string | undefined,
): Promise<CommentRepliesResponse> {
  assertDatabase();
  const root = await findCommentOrFail(commentId);
  if (root.parentId !== null) {
    throw new ServiceError('Only a root comment has replies.', 'bad_request');
  }

  const resume = await findResumeOrFail(root.resumeId);
  const parsedCursor = parseCursor(cursor);

  const query = AppDataSource.getRepository(ResumeComment)
    .createQueryBuilder('reply')
    .addSelect(microsecondTimestamp('reply.created_at'), 'reply_cursor_created_at')
    .where('reply.parent_id = :commentId', { commentId: root.id })
    .orderBy('reply.created_at', 'ASC')
    .addOrderBy('reply.id', 'ASC')
    .take(REPLY_PAGE_SIZE + 1);

  // Replies read oldest first, so paging walks forward through the thread.
  if (parsedCursor) {
    query.andWhere(
      '(reply.created_at, reply.id) > (:createdAt::timestamptz, :id::uuid)',
      parsedCursor,
    );
  }

  const { entities: fetched, raw } = await query.getRawAndEntities();
  const replies = fetched.slice(0, REPLY_PAGE_SIZE);
  if (replies.length === 0) return { items: [], nextCursor: null };

  const lastCursorValue = raw[replies.length - 1]?.reply_cursor_created_at;
  const nextCursor =
    fetched.length > REPLY_PAGE_SIZE && typeof lastCursorValue === 'string'
      ? encodeCursor({ createdAt: lastCursorValue, id: replies[replies.length - 1].id })
      : null;

  const [profiles, reactions] = await Promise.all([
    loadPublicProfiles(profileIds(replies)),
    loadCommentReactions(
      replies.map((reply) => reply.id),
      viewerId,
    ),
  ]);
  return {
    items: replies.map((reply) =>
      serializeComment(reply, profiles, reactions, viewerId, resume.ownerId),
    ),
    nextCursor,
  };
}

/** One complete thread for notification deep links, regardless of ordinary pagination. */
export async function getCommentContext(
  commentId: string,
  viewerId: string,
): Promise<CommentThread> {
  assertDatabase();
  const target = await findCommentOrFail(commentId);
  if (target.deletedAt !== null)
    throw new ServiceError('That feedback is no longer available.', 'not_found');
  const rootId = target.parentId ?? target.id;
  const [root, replies] = await Promise.all([
    AppDataSource.getRepository(ResumeComment).findOneByOrFail({ id: rootId }),
    AppDataSource.getRepository(ResumeComment).find({
      where: { parentId: rootId },
      order: { createdAt: 'ASC', id: 'ASC' },
    }),
  ]);
  const resume = await findResumeOrFail(root.resumeId);
  const all = [root, ...replies];
  const [profiles, reactions] = await Promise.all([
    loadPublicProfiles(profileIds(all)),
    loadCommentReactions(
      all.map((comment) => comment.id),
      viewerId,
    ),
  ]);
  return {
    ...serializeComment(root, profiles, reactions, viewerId, resume.ownerId),
    replies: replies.map((reply) =>
      serializeComment(reply, profiles, reactions, viewerId, resume.ownerId),
    ),
  };
}

/** Sets, replaces, or clears the caller's reaction on one comment. */
export async function reactToComment(
  commentId: string,
  viewerId: string,
  kind: ReactionKind | null,
): Promise<CommentReactionResponse> {
  assertDatabase();
  const comment = await findCommentOrFail(commentId);
  if (comment.deletedAt !== null) {
    throw new ServiceError('That comment was deleted.', 'not_found');
  }

  const repository = AppDataSource.getRepository(CommentReaction);
  if (kind === null) {
    await repository.delete({ commentId: comment.id, authorId: viewerId });
  } else {
    await repository.upsert(
      { commentId: comment.id, authorId: viewerId, kind },
      { conflictPaths: ['commentId', 'authorId'] },
    );
  }

  // The trigger owns the total, so read it back rather than recompute it here.
  const [refreshed, reactions] = await Promise.all([
    AppDataSource.getRepository(ResumeComment).findOneByOrFail({ id: comment.id }),
    loadCommentReactions([comment.id], viewerId),
  ]);

  return {
    commentId: comment.id,
    viewerReaction: kind,
    reactionCount: refreshed.reactionCount,
    reactionCounts: reactions.counts.get(comment.id) ?? emptyReactionCounts(),
  };
}
