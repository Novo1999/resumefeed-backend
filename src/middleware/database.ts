import type { NextFunction, Request, Response } from 'express';
import { ensureDatabase } from '../config/data-source';

/**
 * Connect before any route that touches Postgres.
 *
 * Under `listen` this resolves instantly after the first request; on a
 * serverless platform it is the only thing that ever opens the connection.
 */
export async function withDatabase(_req: Request, res: Response, next: NextFunction) {
  try {
    await ensureDatabase();
    next();
  } catch (err) {
    const message = (err as Error).message;
    console.error('Database connection failed:', message);
    res.status(503).json({ error: `Database is not connected: ${message}` });
  }
}
