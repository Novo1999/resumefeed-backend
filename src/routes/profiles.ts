import { Router } from 'express';
import { getProfile } from '../controllers/profile.controller';
import { requireAuth } from '../middleware/auth';

export const profileRouter = Router();

profileRouter.get('/:userId', requireAuth, getProfile);
