import cors from 'cors';
import express from 'express';
import { AppDataSource, ensureDatabase } from './config/data-source';
import { env } from './config/env';
import { withDatabase } from './middleware/database';
import { httpLogger } from './middleware/logger';
import { commentRouter } from './routes/comments';
import { meRouter } from './routes/me';
import { resumeRouter } from './routes/resumes';
import { notificationRouter } from './routes/notifications';

export function createApp() {
  const app = express();

  app.use(httpLogger);
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.get('/health/db', async (_req, res) => {
    try {
      await ensureDatabase();
      await AppDataSource.query('select 1');
      res.json({ status: 'ok', database: 'connected' });
    } catch (err) {
      res.status(503).json({
        status: 'error',
        database: 'disconnected',
        databaseUrlSet: Boolean(env.databaseUrl),
        message: (err as Error).message,
      });
    }
  });

  app.use('/api/me', withDatabase, meRouter);
  app.use('/api/resumes', withDatabase, resumeRouter);
  app.use('/api/comments', withDatabase, commentRouter);
  app.use('/api/notifications', withDatabase, notificationRouter);

  return app;
}

const app = createApp();

export default app;
