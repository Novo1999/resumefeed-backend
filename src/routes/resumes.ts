import { Router } from 'express';
import {
  getResumePdf,
  listResumeReactors,
  listResumes,
  postResume,
  putResumeRating,
  putResumeReaction,
} from '../controllers/resume.controller';
import { requireAuth } from '../middleware/auth';

/** Route modules only declare the URL and middleware chain. */
export const resumeRouter = Router();

resumeRouter.post('/', requireAuth, postResume);
resumeRouter.get('/', requireAuth, listResumes);
resumeRouter.put('/:resumeId/rating', requireAuth, putResumeRating);
resumeRouter.put('/:resumeId/reaction', requireAuth, putResumeReaction);
resumeRouter.get('/:resumeId/reactions', requireAuth, listResumeReactors);
resumeRouter.get('/:resumeId/document', requireAuth, getResumePdf);
