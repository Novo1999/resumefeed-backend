import cors from 'cors';
import express from 'express';
import { env } from './config/env';
import { httpLogger } from './middleware/logger';
import { meRouter } from './routes/me';
import { resumeRouter } from './routes/resumes';

export function createApp() {
  const app = express();

  app.use(httpLogger);
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/api/me', meRouter);
  app.use('/api/resumes', resumeRouter);

  return app;
}

const app = createApp();

export default app;
