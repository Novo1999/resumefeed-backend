import type { Request, Response } from 'express';
import {
  createResume,
  getResumeDocument,
  getResumeFeed,
  parseResumeRating,
  rateResume,
  parseResumeCreate,
  ResumeServiceError,
} from '../services/resume.service';

function sendResumeError(error: unknown, res: Response) {
  if (error instanceof ResumeServiceError) {
    const status = {
      bad_request: 400,
      conflict: 409,
      not_found: 404,
      database_unavailable: 503,
      dependency: 502,
    }[error.kind];
    res.status(status).json({ error: error.message, fieldErrors: error.fieldErrors });
    return;
  }
  res.status(500).json({ error: (error as Error).message });
}

export async function postResume(req: Request, res: Response) {
  const { values, errors } = parseResumeCreate(req.body, req.user!.id);
  if (!values) {
    res.status(400).json({ error: 'Some fields need fixing.', fieldErrors: errors });
    return;
  }
  try {
    res.status(201).json(await createResume(req.user!.id, values));
  } catch (err) {
    sendResumeError(err, res);
  }
}

export async function listResumes(req: Request, res: Response) {
  const cursor = req.query.cursor;
  if (cursor !== undefined && typeof cursor !== 'string') {
    res.status(400).json({ error: 'Feed cursor must be a single string.' });
    return;
  }

  try {
    res.json(await getResumeFeed(cursor, req.user!.id));
  } catch (err) {
    sendResumeError(err, res);
  }
}

export async function putResumeRating(req: Request, res: Response) {
  try {
    const { score } = parseResumeRating(req.body);
    res.json(await rateResume(req.params.resumeId, req.user!.id, score));
  } catch (err) {
    sendResumeError(err, res);
  }
}

export async function getResumePdf(req: Request, res: Response) {
  try {
    res.json(await getResumeDocument(req.params.resumeId));
  } catch (err) {
    sendResumeError(err, res);
  }
}
