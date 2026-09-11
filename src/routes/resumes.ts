import { Router } from 'express';
import {
  getResumePdf,
  getResume,
  listResumeReactors,
  listResumes,
  postResume,
  putResumeRating,
  putResumeReaction,
} from '../controllers/resume.controller';
import { listCommentThreads, postComment } from '../controllers/comment.controller';
import { requireAuth } from '../middleware/auth';

/** Route modules only declare the URL and middleware chain. */
export const resumeRouter = Router();

resumeRouter.post('/', requireAuth, postResume);
resumeRouter.get('/', requireAuth, listResumes);
resumeRouter.get('/:resumeId', requireAuth, getResume);
resumeRouter.put('/:resumeId/rating', requireAuth, putResumeRating);
resumeRouter.put('/:resumeId/reaction', requireAuth, putResumeReaction);
resumeRouter.get('/:resumeId/reactions', requireAuth, listResumeReactors);
resumeRouter.get('/:resumeId/document', requireAuth, getResumePdf);
resumeRouter.post('/:resumeId/comments', requireAuth, postComment);
resumeRouter.get('/:resumeId/comments', requireAuth, listCommentThreads);
