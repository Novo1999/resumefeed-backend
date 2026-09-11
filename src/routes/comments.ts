import { Router } from 'express';
import {
  listCommentReplies,
  patchComment,
  postReply,
  removeComment,
} from '../controllers/comment.controller';
import { requireAuth } from '../middleware/auth';

/**
 * Everything addressed by a comment ID. A comment ID is globally unique, so
 * repeating its resume in the path would only add a second way to name one row.
 * Creating and listing a resume's comments stay on the resume router.
 */
export const commentRouter = Router();

commentRouter.get('/:commentId/replies', requireAuth, listCommentReplies);
commentRouter.post('/:commentId/replies', requireAuth, postReply);
commentRouter.patch('/:commentId', requireAuth, patchComment);
commentRouter.delete('/:commentId', requireAuth, removeComment);
