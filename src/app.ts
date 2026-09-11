import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { httpLogger } from './middleware/logger';
import { meRouter } from './routes/me';

export function createApp() {
  const app = express();

  app.use(httpLogger);
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/api/me', meRouter);

  // Mount further routes here, protected with `requireAuth`:
  //   app.use('/api/resumes', requireAuth, resumeRouter)

  return app;
}

const app = createApp();

export default app;
