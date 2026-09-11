import { Router } from 'express';
import {
  getUnreadCount,
  listNotifications,
  readAllNotifications,
  readNotification,
} from '../controllers/notification.controller';
import { requireAuth } from '../middleware/auth';

export const notificationRouter = Router();

notificationRouter.get('/', requireAuth, listNotifications);
notificationRouter.get('/unread-count', requireAuth, getUnreadCount);
notificationRouter.post('/read-all', requireAuth, readAllNotifications);
notificationRouter.patch('/:notificationId/read', requireAuth, readNotification);
