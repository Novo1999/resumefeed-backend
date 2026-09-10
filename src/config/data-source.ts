import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { env } from './env';

/**
 * TypeORM connection to your Supabase Postgres.
 * Add entity classes under `src/entities/` — they are picked up by the glob.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: env.databaseUrl,
  synchronize: env.dbSynchronize,
  logging: env.dbLogging,
  ssl: env.dbSsl ? { rejectUnauthorized: false } : false,
  entities: [__dirname + '/../entities/**/*.{ts,js}'],
  migrations: [__dirname + '/../migrations/**/*.{ts,js}'],
  subscribers: [],
});
