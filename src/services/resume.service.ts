import { AppDataSource } from '../config/data-source';
import { env } from '../config/env';
import { getSupabase } from '../config/supabase';
import { Resume } from '../entities/resume';
import { ResumeRating } from '../entities/resume-rating';
import type {
  CreateResumeRequest,
  FeedResumeResponse,
  ParsedResumeCreate,
  ResumeAuthor,
  ResumeDocumentResponse,
  ResumeFeedResponse,
  ResumeFieldErrors,
  ResumeResponse,
  ResumeRatingResponse,
  ResumeServiceErrorKind,
  RateResumeRequest,
} from '../types/resume';

const TITLE_MAX_LENGTH = 120;
const CAPTION_MAX_LENGTH = 500;
const FILENAME_MAX_LENGTH = 255;
const FEED_PAGE_SIZE = 10;
const PDF_URL_TTL_SECONDS = 10 * 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type FeedCursor = {
  createdAt: string;
  id: string;
};

export class ResumeServiceError extends Error {
  constructor(
    message: string,
    public readonly kind: ResumeServiceErrorKind,
    public readonly fieldErrors?: ResumeFieldErrors,
  ) {
    super(message);
  }
}

function assertDatabase() {
  if (!AppDataSource.isInitialized) {
    throw new ResumeServiceError('Database is not connected.', 'database_unavailable');
  }
}

function serializeResume(resume: Resume): ResumeResponse {
  return {
    id: resume.id,
    ownerId: resume.ownerId,
    storagePath: resume.storagePath,
    originalFilename: resume.originalFilename,
    title: resume.title,
    caption: resume.caption,
    ratingCount: resume.ratingCount,
    averageRating: resume.averageRating,
    commentCount: resume.commentCount,
    reactionCount: resume.reactionCount,
    createdAt: resume.createdAt.toISOString(),
  };
}

function assertResumeId(resumeId: string): void {
  if (!UUID_PATTERN.test(resumeId)) throw new ResumeServiceError('Invalid resume ID.', 'bad_request');
}

function encodeFeedCursor(cursor: FeedCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function parseFeedCursor(cursor: string | undefined): FeedCursor | null {
  if (!cursor) return null;
  if (cursor.length > 512) throw new ResumeServiceError('Invalid feed cursor.', 'bad_request');

  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as FeedCursor).createdAt !== 'string' ||
      Number.isNaN(Date.parse((parsed as FeedCursor).createdAt)) ||
      typeof (parsed as FeedCursor).id !== 'string' ||
      !UUID_PATTERN.test((parsed as FeedCursor).id)
    ) {
      throw new Error('Malformed cursor');
    }
    return parsed as FeedCursor;
  } catch {
    throw new ResumeServiceError('Invalid feed cursor.', 'bad_request');
  }
}

export function parseResumeCreate(body: unknown, userId: string): ParsedResumeCreate {
  const errors: ResumeFieldErrors = {};
  if (typeof body !== 'object' || body === null) {
    return { values: null, errors: { storagePath: 'Expected a JSON object.' } };
  }

  const input = body as Record<string, unknown>;
  const storagePath = input.storagePath;
  const originalFilename = input.originalFilename;
  const title = input.title;
  const caption = input.caption;

  if (typeof storagePath !== 'string') errors.storagePath = 'Storage path is required.';
  else {
    const segments = storagePath.split('/');
    const objectName = segments[1];
    if (
      segments.length !== 2 ||
      segments[0] !== userId ||
      !objectName ||
      objectName.length > FILENAME_MAX_LENGTH ||
      !objectName.toLowerCase().endsWith('.pdf')
    ) {
      errors.storagePath = 'Upload the PDF to your own storage folder.';
    }
  }

  if (typeof originalFilename !== 'string') errors.originalFilename = 'Original filename is required.';
  else if (
    originalFilename.trim().length === 0 ||
    originalFilename.length > FILENAME_MAX_LENGTH ||
    /[\\/\0]/.test(originalFilename)
  ) {
    errors.originalFilename = 'Filename must be a valid name up to 255 characters.';
  }

  let parsedTitle: string | null = null;
  if (title !== undefined && title !== null) {
    if (typeof title !== 'string') errors.title = 'Title must be text.';
    else {
      const trimmed = title.trim();
      if (trimmed.length > TITLE_MAX_LENGTH) errors.title = `Title must be ${TITLE_MAX_LENGTH} characters or fewer.`;
      else parsedTitle = trimmed || null;
    }
  }

  let parsedCaption: string | null = null;
  if (caption !== undefined && caption !== null) {
    if (typeof caption !== 'string') errors.caption = 'Caption must be text.';
    else {
      const trimmed = caption.trim();
      if (trimmed.length > CAPTION_MAX_LENGTH) errors.caption = `Caption must be ${CAPTION_MAX_LENGTH} characters or fewer.`;
      else parsedCaption = trimmed || null;
    }
  }

  if (Object.keys(errors).length > 0 || typeof storagePath !== 'string' || typeof originalFilename !== 'string') {
    return { values: null, errors };
  }
  return {
    values: { storagePath, originalFilename: originalFilename.trim(), title: parsedTitle, caption: parsedCaption },
    errors,
  };
}

export function parseResumeRating(body: unknown): RateResumeRequest {
  if (typeof body !== 'object' || body === null || !Number.isInteger((body as { score?: unknown }).score)) {
    throw new ResumeServiceError('Rating score must be a whole number from 1 to 5.', 'bad_request');
  }

  const score = (body as { score: number }).score;
  if (score < 1 || score > 5) {
    throw new ResumeServiceError('Rating score must be between 1 and 5.', 'bad_request');
  }
  return { score };
}

async function hasUploadedPdf(userId: string, storagePath: string): Promise<boolean> {
  const objectName = storagePath.slice(userId.length + 1);
  const { data, error } = await getSupabase()
    .storage
    .from(env.supabaseResumeBucket)
    .list(userId, { limit: 1, search: objectName });
  if (error) throw new ResumeServiceError(error.message, 'dependency');
  return data?.find((item) => item.name === objectName)?.metadata?.mimetype === 'application/pdf';
}

function profileText(metadata: Record<string, unknown> | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

async function loadAuthors(ownerIds: string[]): Promise<Map<string, ResumeAuthor>> {
  const authors = await Promise.all(
    [...new Set(ownerIds)].map(async (id): Promise<ResumeAuthor> => {
      const { data, error } = await getSupabase().auth.admin.getUserById(id);
      if (error || !data.user) return { id, fullName: null, avatarUrl: null };
      return {
        id,
        fullName: profileText(data.user.user_metadata, 'full_name'),
        avatarUrl: profileText(data.user.user_metadata, 'avatar_url'),
      };
    }),
  );
  return new Map(authors.map((author) => [author.id, author]));
}

async function createPdfUrl(storagePath: string): Promise<string> {
  const { data, error } = await getSupabase()
    .storage
    .from(env.supabaseResumeBucket)
    .createSignedUrl(storagePath, PDF_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    throw new ResumeServiceError(error?.message ?? 'Could not create a PDF viewing link.', 'dependency');
  }
  return data.signedUrl;
}

export async function createResume(userId: string, values: CreateResumeRequest): Promise<ResumeResponse> {
  assertDatabase();
  if (!(await hasUploadedPdf(userId, values.storagePath))) {
    throw new ResumeServiceError(
      'The uploaded file could not be found as a PDF in your resume bucket.',
      'bad_request',
      { storagePath: 'Upload a PDF before creating its post.' },
    );
  }

  try {
    const repository = AppDataSource.getRepository(Resume);
    const created = await repository.save(
      repository.create({
        ownerId: userId,
        storagePath: values.storagePath,
        originalFilename: values.originalFilename,
        title: values.title ?? null,
        caption: values.caption ?? null,
        mimeType: 'application/pdf',
      }),
    );
    return serializeResume(created);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      throw new ResumeServiceError('That PDF has already been posted.', 'conflict');
    }
    throw err;
  }
}

/** Creates or replaces the caller's single rating and returns refreshed feed totals. */
export async function rateResume(
  resumeId: string,
  userId: string,
  score: number,
): Promise<ResumeRatingResponse> {
  assertDatabase();
  assertResumeId(resumeId);

  const resumeRepository = AppDataSource.getRepository(Resume);
  if (!(await resumeRepository.existsBy({ id: resumeId }))) {
    throw new ResumeServiceError('Resume not found.', 'not_found');
  }

  await AppDataSource.getRepository(ResumeRating).upsert(
    { resumeId, authorId: userId, score },
    { conflictPaths: ['resumeId', 'authorId'] },
  );

  // The database trigger owns aggregate maintenance, so always reload its
  // result instead of reproducing averaging logic in the write path.
  const refreshed = await resumeRepository.findOneByOrFail({ id: resumeId });
  return {
    resumeId,
    viewerRating: score,
    ratingCount: refreshed.ratingCount,
    averageRating: refreshed.averageRating,
  };
}

export async function getResumeFeed(cursor: string | undefined, viewerId: string): Promise<ResumeFeedResponse> {
  assertDatabase();
  const parsedCursor = parseFeedCursor(cursor);
  const query = AppDataSource.getRepository(Resume)
    .createQueryBuilder('resume')
    // Keep the database's microsecond timestamp intact for the next cursor.
    .addSelect(
      `to_char(resume.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      'feed_cursor_created_at',
    )
    .orderBy('resume.created_at', 'DESC')
    .addOrderBy('resume.id', 'DESC')
    .take(FEED_PAGE_SIZE + 1);

  if (parsedCursor) {
    query.where(
      '(resume.created_at, resume.id) < (:createdAt::timestamptz, :id::uuid)',
      parsedCursor,
    );
  }

  const { entities: fetchedResumes, raw } = await query.getRawAndEntities();
  const resumes = fetchedResumes.slice(0, FEED_PAGE_SIZE);
  const hasNextPage = fetchedResumes.length > FEED_PAGE_SIZE;
  const lastCursorValue = raw[resumes.length - 1]?.feed_cursor_created_at;
  const nextCursor =
    hasNextPage && resumes.length > 0 && typeof lastCursorValue === 'string'
      ? encodeFeedCursor({ createdAt: lastCursorValue, id: resumes[resumes.length - 1].id })
      : null;

  const authors = await loadAuthors(resumes.map((resume) => resume.ownerId));
  const viewerRatings = await AppDataSource.getRepository(ResumeRating).findBy({
    authorId: viewerId,
    resumeId: resumes.map((resume) => resume.id),
  });
  const viewerRatingByResumeId = new Map(viewerRatings.map((rating) => [rating.resumeId, rating.score]));
  const items: FeedResumeResponse[] = await Promise.all(
    resumes.map(async (resume) => ({
      id: resume.id,
      title: resume.title,
      caption: resume.caption,
      originalFilename: resume.originalFilename,
      author: authors.get(resume.ownerId) ?? { id: resume.ownerId, fullName: null, avatarUrl: null },
      pdfUrl: await createPdfUrl(resume.storagePath),
      ratingCount: resume.ratingCount,
      averageRating: resume.averageRating,
      viewerRating: viewerRatingByResumeId.get(resume.id) ?? null,
      commentCount: resume.commentCount,
      reactionCount: resume.reactionCount,
      createdAt: resume.createdAt.toISOString(),
    })),
  );
  return { items, nextCursor };
}

export async function getResumeDocument(resumeId: string): Promise<ResumeDocumentResponse> {
  assertDatabase();
  assertResumeId(resumeId);
  const resume = await AppDataSource.getRepository(Resume).findOneBy({ id: resumeId });
  if (!resume) throw new ResumeServiceError('Resume not found.', 'not_found');
  return { url: await createPdfUrl(resume.storagePath), expiresIn: PDF_URL_TTL_SECONDS };
}
