import 'reflect-metadata';
import app from './app';
import { ensureDatabase } from './config/data-source';
import { env } from './config/env';

async function bootstrap() {
  try {
    await ensureDatabase();
    console.log('✅ Database connected');
  } catch (err) {
    // Don't crash during setup if the DB isn't configured yet.
    console.warn('⚠️  Database not connected (check DATABASE_URL):', (err as Error).message);
  }

  app.listen(env.port, () => {
    console.log(`🚀 API listening on http://localhost:${env.port}`);
  });
}

bootstrap();
