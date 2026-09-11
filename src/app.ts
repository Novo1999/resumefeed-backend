import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { requireAuth } from './middleware/auth';
import { httpLogger } from './middleware/logger';

export function createApp() {
  const app = express();

  app.use(httpLogger);
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // Who the caller is, according to their access token. Handy for checking the
  // frontend is sending the header correctly.
  app.get('/api/me', requireAuth, (req, res) => {
    const user = req.user!;
    res.json({ id: user.id, email: user.email, metadata: user.user_metadata });
  });

  // Mount your routes here, e.g. app.use('/api', router)
  // Protect them with `requireAuth`: app.use('/api/resumes', requireAuth, resumeRouter)

  return app;
}
