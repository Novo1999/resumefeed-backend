import express from 'express';
import cors from 'cors';
import { env } from './config/env';

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // Mount your routes here, e.g. app.use('/api', router)

  return app;
}
