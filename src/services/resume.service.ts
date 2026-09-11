import { AppDataSource } from '../config/data-source';
import { env } from '../config/env';
import { getSupabase } from '../config/supabase';
import { Resume } from '../entities/resume';
import type {
  CreateResumeRequest,
  FeedResumeResponse,
  ParsedResumeCreate,
  ResumeAuthor,
  ResumeDocumentResponse,
  ResumeFeedResponse,
  ResumeFieldErrors,
  ResumeResponse,
  ResumeServiceErrorKind,
} from '../types/resume';

const TITLE_MAX_LENGTH = 120;
const FILENAME_MAX_LENGTH = 255;
const FEED_PAGE_SIZE = 20;
const PDF_URL_TTL_SECONDS = 10 * 60;

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
    ratingCount: resume.ratingCount,
    averageRating: resume.averageRating,
    commentCount: resume.commentCount,
    reactionCount: resume.reactionCount,
    createdAt: resume.createdAt.toISOString(),
  };
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

  if (Object.keys(errors).length > 0 || typeof storagePath !== 'string' || typeof originalFilename !== 'string') {
    return { values: null, errors };
  }
  return { values: { storagePath, originalFilename: originalFilename.trim(), title: parsedTitle }, errors };
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

export async function getResumeFeed(): Promise<ResumeFeedResponse> {
  assertDatabase();
  const resumes = await AppDataSource.getRepository(Resume).find({
    order: { createdAt: 'DESC', id: 'DESC' },
    take: FEED_PAGE_SIZE,
  });
  const authors = await loadAuthors(resumes.map((resume) => resume.ownerId));
  const items: FeedResumeResponse[] = await Promise.all(
    resumes.map(async (resume) => ({
      id: resume.id,
      title: resume.title,
      originalFilename: resume.originalFilename,
      author: authors.get(resume.ownerId) ?? { id: resume.ownerId, fullName: null, avatarUrl: null },
      pdfUrl: await createPdfUrl(resume.storagePath),
      ratingCount: resume.ratingCount,
      averageRating: resume.averageRating,
      commentCount: resume.commentCount,
      reactionCount: resume.reactionCount,
      createdAt: resume.createdAt.toISOString(),
    })),
  );
  return { items };
}

export async function getResumeDocument(resumeId: string): Promise<ResumeDocumentResponse> {
  assertDatabase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(resumeId)) {
    throw new ResumeServiceError('Invalid resume ID.', 'bad_request');
  }
  const resume = await AppDataSource.getRepository(Resume).findOneBy({ id: resumeId });
  if (!resume) throw new ResumeServiceError('Resume not found.', 'not_found');
  return { url: await createPdfUrl(resume.storagePath), expiresIn: PDF_URL_TTL_SECONDS };
}
