import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { env } from './env';
import { CommentReaction } from '../entities/comment-reaction';
import { Resume } from '../entities/resume';
import { ResumeComment } from '../entities/resume-comment';
import { ResumeRating } from '../entities/resume-rating';
import { ResumeReaction } from '../entities/resume-reaction';
import { CreateResumeFeed1789130000000 } from '../migrations/1789130000000-CreateResumeFeed';
import { AddResumeCaption1789140000000 } from '../migrations/1789140000000-AddResumeCaption';
import { ReplaceReactionKinds1789150000000 } from '../migrations/1789150000000-ReplaceReactionKinds';
import { AddCommentThreads1789160000000 } from '../migrations/1789160000000-AddCommentThreads';
import { AddCommentReactions1789170000000 } from '../migrations/1789170000000-AddCommentReactions';

/**
 * TypeORM connection to your Supabase Postgres.
 *
 * Entities and migrations are listed explicitly rather than loaded from a glob:
 * a serverless build (Vercel) bundles the source into one file, so a runtime
 * `__dirname` glob finds nothing and every entity looks unregistered.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: env.databaseUrl,
  synchronize: env.dbSynchronize,
  logging: env.dbLogging,
  ssl: env.dbSsl ? { rejectUnauthorized: false } : false,
  entities: [Resume, ResumeComment, ResumeRating, ResumeReaction, CommentReaction],
  migrations: [
    CreateResumeFeed1789130000000,
    AddResumeCaption1789140000000,
    ReplaceReactionKinds1789150000000,
    AddCommentThreads1789160000000,
    AddCommentReactions1789170000000,
  ],
  migrationsRun: env.dbMigrationsRun,
  subscribers: [],
  // One connection per serverless instance; the Supabase pooler fans out.
  extra: { max: env.dbPoolMax },
});

let initializing: Promise<DataSource> | null = null;

/**
 * Connect once per process and hand every later caller the same connection.
 *
 * A serverless platform never runs the `listen` bootstrap, so the connection
 * has to be established from inside the request path. A failed attempt clears
 * the cache so the next request retries instead of caching a dead promise.
 */
export function ensureDatabase(): Promise<DataSource> {
  if (AppDataSource.isInitialized) return Promise.resolve(AppDataSource);
  if (!env.databaseUrl) {
    return Promise.reject(new Error('DATABASE_URL is not set.'));
  }
  if (!initializing) {
    initializing = AppDataSource.initialize().catch((err) => {
      initializing = null;
      throw err;
    });
  }
  return initializing;
}
