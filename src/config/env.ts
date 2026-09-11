import 'dotenv/config';

/** Plain environment config. Fill values in `.env` (see `.env.example`). */
export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: (process.env.NODE_ENV ?? 'development') === 'production',
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',

  /** Morgan format name or format string. Unset means: pick one per NODE_ENV. */
  logFormat: process.env.LOG_FORMAT || undefined,

  databaseUrl: process.env.DATABASE_URL ?? '',
  // Migrations are now the default. Set this to true only for disposable local DBs.
  dbSynchronize: process.env.DB_SYNCHRONIZE === 'true',
  dbMigrationsRun: process.env.DB_MIGRATIONS_RUN !== 'false',
  dbLogging: process.env.DB_LOGGING === 'true',
  dbSsl: process.env.DB_SSL !== 'false',

  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  supabaseResumeBucket: process.env.SUPABASE_RESUME_BUCKET ?? 'resumes',
  supabaseAvatarBucket: process.env.SUPABASE_AVATAR_BUCKET ?? 'avatars',
};
