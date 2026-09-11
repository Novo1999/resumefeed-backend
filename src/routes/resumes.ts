import { Router } from 'express';
import { getResumePdf, listResumes, postResume } from '../controllers/resume.controller';
import { requireAuth } from '../middleware/auth';

/** Route modules only declare the URL and middleware chain. */
export const resumeRouter = Router();

resumeRouter.post('/', requireAuth, postResume);
resumeRouter.get('/', requireAuth, listResumes);
resumeRouter.get('/:resumeId/document', requireAuth, getResumePdf);
