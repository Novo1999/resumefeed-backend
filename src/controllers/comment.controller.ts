import type { Request, Response } from 'express';
import {
  createComment,
  createReply,
  deleteComment,
  getCommentReplies,
  getCommentThreads,
  parseCommentBody,
  reactToComment,
  updateComment,
} from '../services/comment.service';
import { parseResumeReaction } from '../services/resume.service';
import { sendServiceError } from './service-error.controller';

/** Pagination cursors arrive as a query string, which Express may hand back as an array. */
function readCursor(req: Request, res: Response): string | undefined | null {
  const cursor = req.query.cursor;
  if (cursor === undefined) return undefined;
  if (typeof cursor !== 'string') {
    res.status(400).json({ error: 'Cursor must be a single string.' });
    return null;
  }
  return cursor;
}

export async function postComment(req: Request, res: Response) {
  try {
    const values = parseCommentBody(req.body);
    res.status(201).json(await createComment(req.params.resumeId, req.user!.id, values));
  } catch (err) {
    sendServiceError(err, res);
  }
}

export async function listCommentThreads(req: Request, res: Response) {
  const cursor = readCursor(req, res);
  if (cursor === null) return;

  try {
    res.json(await getCommentThreads(req.params.resumeId, req.user!.id, cursor));
  } catch (err) {
    sendServiceError(err, res);
  }
}

export async function postReply(req: Request, res: Response) {
  try {
    const values = parseCommentBody(req.body);
    res.status(201).json(await createReply(req.params.commentId, req.user!.id, values));
  } catch (err) {
    sendServiceError(err, res);
  }
}

export async function listCommentReplies(req: Request, res: Response) {
  const cursor = readCursor(req, res);
  if (cursor === null) return;

  try {
    res.json(await getCommentReplies(req.params.commentId, req.user!.id, cursor));
  } catch (err) {
    sendServiceError(err, res);
  }
}

export async function patchComment(req: Request, res: Response) {
  try {
    const values = parseCommentBody(req.body);
    res.json(await updateComment(req.params.commentId, req.user!.id, values));
  } catch (err) {
    sendServiceError(err, res);
  }
}

export async function removeComment(req: Request, res: Response) {
  try {
    await deleteComment(req.params.commentId, req.user!.id);
    res.status(204).end();
  } catch (err) {
    sendServiceError(err, res);
  }
}

export async function putCommentReaction(req: Request, res: Response) {
  try {
    const { kind } = parseResumeReaction(req.body);
    res.json(await reactToComment(req.params.commentId, req.user!.id, kind));
  } catch (err) {
    sendServiceError(err, res);
  }
}
