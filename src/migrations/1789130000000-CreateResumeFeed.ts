import type { MigrationInterface, QueryRunner } from 'typeorm';

/** First durable schema for public resume posts and their community feedback. */
export class CreateResumeFeed1789130000000 implements MigrationInterface {
  name = 'CreateResumeFeed1789130000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // `synchronize` was enabled while this feature was first developed. These
    // guards let this migration adopt that schema and record itself once, while
    // remaining a normal first-run migration for a clean database.
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."reaction_kind_enum" AS ENUM ('helpful', 'insightful', 'encouraging');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "resumes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "owner_id" uuid NOT NULL,
        "storage_path" character varying(512) NOT NULL,
        "original_filename" character varying(255) NOT NULL,
        "title" character varying(120),
        "mime_type" character varying(100) NOT NULL DEFAULT 'application/pdf',
        "rating_count" integer NOT NULL DEFAULT 0,
        "average_rating" numeric(3,2),
        "comment_count" integer NOT NULL DEFAULT 0,
        "reaction_count" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_resumes_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_resumes_storage_path" UNIQUE ("storage_path"),
        CONSTRAINT "CHK_resumes_pdf" CHECK ("mime_type" = 'application/pdf'),
        CONSTRAINT "CHK_resumes_rating_count" CHECK ("rating_count" >= 0),
        CONSTRAINT "CHK_resumes_comment_count" CHECK ("comment_count" >= 0),
        CONSTRAINT "CHK_resumes_reaction_count" CHECK ("reaction_count" >= 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_resumes_owner_created_at" ON "resumes" ("owner_id", "created_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_resumes_feed_created_at" ON "resumes" ("created_at")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "resume_ratings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "resume_id" uuid NOT NULL,
        "author_id" uuid NOT NULL,
        "score" smallint NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_resume_ratings_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_resume_ratings_resume_author" UNIQUE ("resume_id", "author_id"),
        CONSTRAINT "CHK_resume_ratings_score" CHECK ("score" BETWEEN 1 AND 5),
        CONSTRAINT "FK_resume_ratings_resume" FOREIGN KEY ("resume_id") REFERENCES "resumes"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_resume_ratings_resume_id" ON "resume_ratings" ("resume_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "resume_comments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "resume_id" uuid NOT NULL,
        "author_id" uuid NOT NULL,
        "body" character varying(2000) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_resume_comments_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_resume_comments_resume" FOREIGN KEY ("resume_id") REFERENCES "resumes"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_resume_comments_resume_created_at" ON "resume_comments" ("resume_id", "created_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_resume_comments_author_id" ON "resume_comments" ("author_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "resume_reactions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "resume_id" uuid NOT NULL,
        "author_id" uuid NOT NULL,
        "kind" "public"."reaction_kind_enum" NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_resume_reactions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_resume_reactions_resume_author_kind" UNIQUE ("resume_id", "author_id", "kind"),
        CONSTRAINT "FK_resume_reactions_resume" FOREIGN KEY ("resume_id") REFERENCES "resumes"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_resume_reactions_resume_id" ON "resume_reactions" ("resume_id")`);

    // Keep feed-card totals correct even if writes are made outside a future API.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "touch_resume_updated_at"() RETURNS trigger AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "refresh_resume_rating_stats"(target_resume_id uuid) RETURNS void AS $$
      BEGIN
        UPDATE resumes
        SET rating_count = (SELECT count(*)::integer FROM resume_ratings WHERE resume_id = target_resume_id),
            average_rating = (SELECT avg(score)::numeric(3,2) FROM resume_ratings WHERE resume_id = target_resume_id),
            updated_at = now()
        WHERE id = target_resume_id;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "sync_resume_rating_stats"() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          PERFORM refresh_resume_rating_stats(OLD.resume_id);
        ELSE
          PERFORM refresh_resume_rating_stats(NEW.resume_id);
          IF TG_OP = 'UPDATE' AND OLD.resume_id IS DISTINCT FROM NEW.resume_id THEN
            PERFORM refresh_resume_rating_stats(OLD.resume_id);
          END IF;
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "refresh_resume_comment_count"(target_resume_id uuid) RETURNS void AS $$
      BEGIN
        UPDATE resumes
        SET comment_count = (SELECT count(*)::integer FROM resume_comments WHERE resume_id = target_resume_id),
            updated_at = now()
        WHERE id = target_resume_id;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "sync_resume_comment_count"() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          PERFORM refresh_resume_comment_count(OLD.resume_id);
        ELSE
          PERFORM refresh_resume_comment_count(NEW.resume_id);
          IF TG_OP = 'UPDATE' AND OLD.resume_id IS DISTINCT FROM NEW.resume_id THEN
            PERFORM refresh_resume_comment_count(OLD.resume_id);
          END IF;
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "refresh_resume_reaction_count"(target_resume_id uuid) RETURNS void AS $$
      BEGIN
        UPDATE resumes
        SET reaction_count = (SELECT count(*)::integer FROM resume_reactions WHERE resume_id = target_resume_id),
            updated_at = now()
        WHERE id = target_resume_id;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "sync_resume_reaction_count"() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          PERFORM refresh_resume_reaction_count(OLD.resume_id);
        ELSE
          PERFORM refresh_resume_reaction_count(NEW.resume_id);
          IF TG_OP = 'UPDATE' AND OLD.resume_id IS DISTINCT FROM NEW.resume_id THEN
            PERFORM refresh_resume_reaction_count(OLD.resume_id);
          END IF;
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_resumes_touch_updated_at" ON "resumes"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_resume_ratings_touch_updated_at" ON "resume_ratings"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_resume_comments_touch_updated_at" ON "resume_comments"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_resume_ratings_stats" ON "resume_ratings"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_resume_comments_count" ON "resume_comments"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_resume_reactions_count" ON "resume_reactions"`);
    await queryRunner.query(`CREATE TRIGGER "TRG_resumes_touch_updated_at" BEFORE UPDATE ON "resumes" FOR EACH ROW EXECUTE FUNCTION "touch_resume_updated_at"()`);
    await queryRunner.query(`CREATE TRIGGER "TRG_resume_ratings_touch_updated_at" BEFORE UPDATE ON "resume_ratings" FOR EACH ROW EXECUTE FUNCTION "touch_resume_updated_at"()`);
    await queryRunner.query(`CREATE TRIGGER "TRG_resume_comments_touch_updated_at" BEFORE UPDATE ON "resume_comments" FOR EACH ROW EXECUTE FUNCTION "touch_resume_updated_at"()`);
    await queryRunner.query(`CREATE TRIGGER "TRG_resume_ratings_stats" AFTER INSERT OR UPDATE OR DELETE ON "resume_ratings" FOR EACH ROW EXECUTE FUNCTION "sync_resume_rating_stats"()`);
    await queryRunner.query(`CREATE TRIGGER "TRG_resume_comments_count" AFTER INSERT OR UPDATE OR DELETE ON "resume_comments" FOR EACH ROW EXECUTE FUNCTION "sync_resume_comment_count"()`);
    await queryRunner.query(`CREATE TRIGGER "TRG_resume_reactions_count" AFTER INSERT OR UPDATE OR DELETE ON "resume_reactions" FOR EACH ROW EXECUTE FUNCTION "sync_resume_reaction_count"()`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER "TRG_resume_reactions_count" ON "resume_reactions"`);
    await queryRunner.query(`DROP TRIGGER "TRG_resume_comments_count" ON "resume_comments"`);
    await queryRunner.query(`DROP TRIGGER "TRG_resume_ratings_stats" ON "resume_ratings"`);
    await queryRunner.query(`DROP TRIGGER "TRG_resume_comments_touch_updated_at" ON "resume_comments"`);
    await queryRunner.query(`DROP TRIGGER "TRG_resume_ratings_touch_updated_at" ON "resume_ratings"`);
    await queryRunner.query(`DROP TRIGGER "TRG_resumes_touch_updated_at" ON "resumes"`);
    await queryRunner.query(`DROP FUNCTION "sync_resume_reaction_count"()`);
    await queryRunner.query(`DROP FUNCTION "refresh_resume_reaction_count"(uuid)`);
    await queryRunner.query(`DROP FUNCTION "sync_resume_comment_count"()`);
    await queryRunner.query(`DROP FUNCTION "refresh_resume_comment_count"(uuid)`);
    await queryRunner.query(`DROP FUNCTION "sync_resume_rating_stats"()`);
    await queryRunner.query(`DROP FUNCTION "refresh_resume_rating_stats"(uuid)`);
    await queryRunner.query(`DROP FUNCTION "touch_resume_updated_at"()`);
    await queryRunner.query(`DROP TABLE "resume_reactions"`);
    await queryRunner.query(`DROP TABLE "resume_comments"`);
    await queryRunner.query(`DROP TABLE "resume_ratings"`);
    await queryRunner.query(`DROP TABLE "resumes"`);
    await queryRunner.query(`DROP TYPE "public"."reaction_kind_enum"`);
  }
}
