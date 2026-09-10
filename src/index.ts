import 'reflect-metadata';
import { AppDataSource } from './config/data-source';
import { createApp } from './app';
import { env } from './config/env';

async function bootstrap() {
  try {
    await AppDataSource.initialize();
    console.log('✅ Database connected');
  } catch (err) {
    // Don't crash during setup if the DB isn't configured yet.
    console.warn('⚠️  Database not connected (check DATABASE_URL):', (err as Error).message);
  }

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`🚀 API listening on http://localhost:${env.port}`);
  });
}

bootstrap();
