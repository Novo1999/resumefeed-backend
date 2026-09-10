import 'dotenv/config';

/** Plain environment config. Fill values in `.env` (see `.env.example`). */
export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',

  databaseUrl: process.env.DATABASE_URL ?? '',
  dbSynchronize: process.env.DB_SYNCHRONIZE !== 'false',
  dbLogging: process.env.DB_LOGGING === 'true',
  dbSsl: process.env.DB_SSL !== 'false',

  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
};
