import type { Request, Response } from 'express';
import { sendServiceError } from './service-error.controller';
import {
  createResume,
  getResumeDocument,
  getResumeDetail,
  getResumeFeed,
  getResumeReactors,
  parseResumeRating,
  parseResumeReaction,
  rateResume,
  reactToResume,
  parseResumeCreate,
} from '../services/resume.service';

export async function postResume(req: Request, res: Response) {
  const { values, errors } = parseResumeCreate(req.body, req.user!.id);
  if (!values) {
    res.status(400).json({ error: 'Some fields need fixing.', fieldErrors: errors });
    return;
  }
  try {
    res.status(201).json(await createResume(req.user!.id, values));
  } catch (err) {
    sendServiceError(err, res);
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
    sendServiceError(err, res);
  }
}

export async function getResume(req: Request, res: Response) {
  try {
    res.json(await getResumeDetail(req.params.resumeId, req.user!.id));
  } catch (err) {
    sendServiceError(err, res);
  }
}

export async function putResumeRating(req: Request, res: Response) {
  try {
    const { score } = parseResumeRating(req.body);
    res.json(await rateResume(req.params.resumeId, req.user!.id, score));
  } catch (err) {
    sendServiceError(err, res);
  }
}

export async function getResumePdf(req: Request, res: Response) {
  try {
    res.json(await getResumeDocument(req.params.resumeId));
  } catch (err) {
    sendServiceError(err, res);
  }
}

export async function putResumeReaction(req: Request, res: Response) {
  try {
    const { kind } = parseResumeReaction(req.body);
    res.json(await reactToResume(req.params.resumeId, req.user!.id, kind));
  } catch (err) {
    sendServiceError(err, res);
  }
}

export async function listResumeReactors(req: Request, res: Response) {
  const cursor = req.query.cursor;
  if (cursor !== undefined && typeof cursor !== 'string') {
    res.status(400).json({ error: 'Cursor must be a single string.' });
    return;
  }

  try {
    res.json(await getResumeReactors(req.params.resumeId, cursor));
  } catch (err) {
    sendServiceError(err, res);
  }
}
