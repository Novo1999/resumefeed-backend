import { Router } from 'express';
import {
  getResumePdf,
  listResumes,
  postResume,
  putResumeRating,
} from '../controllers/resume.controller';
import { requireAuth } from '../middleware/auth';

/** Route modules only declare the URL and middleware chain. */
export const resumeRouter = Router();

resumeRouter.post('/', requireAuth, postResume);
resumeRouter.get('/', requireAuth, listResumes);
resumeRouter.put('/:resumeId/rating', requireAuth, putResumeRating);
resumeRouter.get('/:resumeId/document', requireAuth, getResumePdf);
