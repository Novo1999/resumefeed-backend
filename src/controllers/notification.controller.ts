import type { Request, Response } from 'express';
import { sendServiceError } from './service-error.controller';
import {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notification.service';

export async function listNotifications(req: Request, res: Response) {
  const cursor = req.query.cursor;
  if (cursor !== undefined && typeof cursor !== 'string') {
    res.status(400).json({ error: 'Cursor must be a single string.' });
    return;
  }
  try {
    res.json(await getNotifications(req.user!.id, cursor));
  } catch (err) {
    sendServiceError(err, res);
  }
}

export async function getUnreadCount(req: Request, res: Response) {
  try {
    res.json(await getUnreadNotificationCount(req.user!.id));
  } catch (err) {
    sendServiceError(err, res);
  }
}

export async function readNotification(req: Request, res: Response) {
  try {
    await markNotificationRead(req.params.notificationId, req.user!.id);
    res.status(204).end();
  } catch (err) {
    sendServiceError(err, res);
  }
}

export async function readAllNotifications(req: Request, res: Response) {
  try {
    res.json(await markAllNotificationsRead(req.user!.id));
  } catch (err) {
    sendServiceError(err, res);
  }
}
