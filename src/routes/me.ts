import { Router } from 'express';
import { getMe, patchMe } from '../controllers/me.controller';
import { requireAuth } from '../middleware/auth';

/** Route modules only declare the URL and middleware chain. */
export const meRouter = Router();

meRouter.get('/', requireAuth, getMe);
meRouter.patch('/', requireAuth, patchMe);
