import { Router } from 'express';
import { AppDataSource } from '../config/data-source';
import { env } from '../config/env';
import { getSupabase } from '../config/supabase';
import { Resume } from '../entities/resume';
import { requireAuth } from '../middleware/auth';
import type {
  CreateResumeRequest,
  FeedResumeResponse,
  ResumeAuthor,
  ResumeDocumentResponse,
  ResumeFieldErrors,
  ResumeFeedResponse,
  ResumeResponse,
} from '../types/resume';

const TITLE_MAX_LENGTH = 120;
const FILENAME_MAX_LENGTH = 255;
const FEED_PAGE_SIZE = 20;
const PDF_URL_TTL_SECONDS = 10 * 60;

function serialize(resume: Resume): ResumeResponse {
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

function parseCreate(body: unknown, userId: string): {
  values: CreateResumeRequest | null;
  errors: ResumeFieldErrors;
} {
  const errors: ResumeFieldErrors = {};
  if (typeof body !== 'object' || body === null) {
    return { values: null, errors: { storagePath: 'Expected a JSON object.' } };
  }

  const input = body as Record<string, unknown>;
  const storagePath = input.storagePath;
  const originalFilename = input.originalFilename;
  const title = input.title;

  if (typeof storagePath !== 'string') {
    errors.storagePath = 'Storage path is required.';
  } else {
    const segments = storagePath.split('/');
    const objectName = segments[1];
    // Restrict to one file directly beneath the caller's folder. Besides matching
    // bucket RLS, it prevents an arbitrary path from being attached to a post.
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

  if (typeof originalFilename !== 'string') {
    errors.originalFilename = 'Original filename is required.';
  } else if (
    originalFilename.trim().length === 0 ||
    originalFilename.length > FILENAME_MAX_LENGTH ||
    /[\\/\0]/.test(originalFilename)
  ) {
    errors.originalFilename = 'Filename must be a valid name up to 255 characters.';
  }

  let parsedTitle: string | null = null;
  if (title !== undefined && title !== null) {
    if (typeof title !== 'string') {
      errors.title = 'Title must be text.';
    } else {
      const trimmed = title.trim();
      if (trimmed.length > TITLE_MAX_LENGTH) {
        errors.title = `Title must be ${TITLE_MAX_LENGTH} characters or fewer.`;
      } else {
        parsedTitle = trimmed || null;
      }
    }
  }

  if (Object.keys(errors).length > 0 || typeof storagePath !== 'string' || typeof originalFilename !== 'string') {
    return { values: null, errors };
  }

  return {
    values: {
      storagePath,
      originalFilename: originalFilename.trim(),
      title: parsedTitle,
    },
    errors,
  };
}

/** Checks that the submitted path is an existing PDF object, not merely a string. */
async function hasUploadedPdf(userId: string, storagePath: string): Promise<boolean> {
  const objectName = storagePath.slice(userId.length + 1);
  const { data, error } = await getSupabase()
    .storage
    .from(env.supabaseResumeBucket)
    .list(userId, { limit: 1, search: objectName });

  if (error) throw new Error(error.message);

  const file = data?.find((item) => item.name === objectName);
  return file?.metadata?.mimetype === 'application/pdf';
}

function profileText(metadata: Record<string, unknown> | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

async function loadAuthors(ownerIds: string[]): Promise<Map<string, ResumeAuthor>> {
  const uniqueOwnerIds = [...new Set(ownerIds)];
  const authors = await Promise.all(
    uniqueOwnerIds.map(async (id): Promise<ResumeAuthor> => {
      const { data, error } = await getSupabase().auth.admin.getUserById(id);
      // A deleted Auth user should not take the rest of the feed down. It can be
      // cleaned up later while the old public post remains identifiable.
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
    throw new Error(error?.message ?? 'Could not create a PDF viewing link.');
  }
  return data.signedUrl;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export const resumeRouter = Router();

/** Creates the database post after the browser has uploaded its PDF through bucket RLS. */
resumeRouter.post('/', requireAuth, async (req, res) => {
  if (!AppDataSource.isInitialized) {
    res.status(503).json({ error: 'Database is not connected.' });
    return;
  }

  const user = req.user!;
  const { values, errors } = parseCreate(req.body, user.id);
  if (!values) {
    res.status(400).json({ error: 'Some fields need fixing.', fieldErrors: errors });
    return;
  }

  try {
    if (!(await hasUploadedPdf(user.id, values.storagePath))) {
      res.status(400).json({
        error: 'The uploaded file could not be found as a PDF in your resume bucket.',
        fieldErrors: { storagePath: 'Upload a PDF before creating its post.' },
      });
      return;
    }

    const resume = AppDataSource.getRepository(Resume).create({
      ownerId: user.id,
      storagePath: values.storagePath,
      originalFilename: values.originalFilename,
      title: values.title ?? null,
      mimeType: 'application/pdf',
    });
    const created = await AppDataSource.getRepository(Resume).save(resume);

    res.status(201).json(serialize(created));
  } catch (err) {
    // Postgres unique violation: a post already exists for this bucket object.
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'That PDF has already been posted.' });
      return;
    }
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * Authenticated public feed. PDF links are intentionally short-lived because
 * resumes stay in a private bucket even though their posts are public.
 */
resumeRouter.get('/', requireAuth, async (_req, res) => {
  if (!AppDataSource.isInitialized) {
    res.status(503).json({ error: 'Database is not connected.' });
    return;
  }

  try {
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
        author: authors.get(resume.ownerId) ?? {
          id: resume.ownerId,
          fullName: null,
          avatarUrl: null,
        },
        pdfUrl: await createPdfUrl(resume.storagePath),
        ratingCount: resume.ratingCount,
        averageRating: resume.averageRating,
        commentCount: resume.commentCount,
        reactionCount: resume.reactionCount,
        createdAt: resume.createdAt.toISOString(),
      })),
    );

    const response: ResumeFeedResponse = { items };
    res.json(response);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

/** Refreshes a PDF link without ever exposing a storage URL permanently. */
resumeRouter.get('/:resumeId/document', requireAuth, async (req, res) => {
  if (!AppDataSource.isInitialized) {
    res.status(503).json({ error: 'Database is not connected.' });
    return;
  }
  if (!isUuid(req.params.resumeId)) {
    res.status(400).json({ error: 'Invalid resume ID.' });
    return;
  }

  try {
    const resume = await AppDataSource.getRepository(Resume).findOneBy({ id: req.params.resumeId });
    if (!resume) {
      res.status(404).json({ error: 'Resume not found.' });
      return;
    }

    const response: ResumeDocumentResponse = {
      url: await createPdfUrl(resume.storagePath),
      expiresIn: PDF_URL_TTL_SECONDS,
    };
    res.json(response);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});
