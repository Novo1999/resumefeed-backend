import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Turns the flat comment list into two-level threads: a root comment and its
 * replies, with a trigger that flattens any deeper attempt back onto the root.
 * See docs/adr/0001-replies-are-two-levels-flattened.md.
 */
export class AddCommentThreads1789160000000 implements MigrationInterface {
  name = 'AddCommentThreads1789160000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "resume_comments"
        ADD COLUMN IF NOT EXISTS "parent_id" uuid,
        ADD COLUMN IF NOT EXISTS "reply_to_author_id" uuid,
        ADD COLUMN IF NOT EXISTS "reply_count" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "edited_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(
      `ALTER TABLE "resume_comments" DROP CONSTRAINT IF EXISTS "CHK_resume_comments_reply_count"`,
    );
    await queryRunner.query(
      `ALTER TABLE "resume_comments" ADD CONSTRAINT "CHK_resume_comments_reply_count" CHECK ("reply_count" >= 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "resume_comments" DROP CONSTRAINT IF EXISTS "FK_resume_comments_parent"`,
    );
    await queryRunner.query(`
      ALTER TABLE "resume_comments"
      ADD CONSTRAINT "FK_resume_comments_parent"
      FOREIGN KEY ("parent_id") REFERENCES "resume_comments"("id") ON DELETE CASCADE
    `);

    // Roots and replies are read by different keys and in opposite directions,
    // so each gets its own partial index.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_resume_comments_roots"
      ON "resume_comments" ("resume_id", "created_at" DESC, "id" DESC)
      WHERE "parent_id" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_resume_comments_replies"
      ON "resume_comments" ("parent_id", "created_at", "id")
      WHERE "parent_id" IS NOT NULL
    `);

    // The hard guarantee behind the two-level rule: a reply to a reply is
    // silently re-parented onto the root rather than rejected, so the API is
    // never the only thing keeping the tree shallow.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "enforce_comment_depth"() RETURNS trigger AS $fn$
      DECLARE
        parent_parent_id uuid;
        parent_resume_id uuid;
      BEGIN
        IF NEW.parent_id IS NULL THEN
          RETURN NEW;
        END IF;

        IF NEW.parent_id = NEW.id THEN
          RAISE EXCEPTION 'A comment cannot reply to itself';
        END IF;

        SELECT "parent_id", "resume_id" INTO parent_parent_id, parent_resume_id
        FROM resume_comments WHERE id = NEW.parent_id;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Parent comment % does not exist', NEW.parent_id;
        END IF;

        IF parent_resume_id <> NEW.resume_id THEN
          RAISE EXCEPTION 'A reply must belong to the same resume as its parent';
        END IF;

        IF parent_parent_id IS NOT NULL THEN
          NEW.parent_id := parent_parent_id;
        END IF;

        RETURN NEW;
      END;
      $fn$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "refresh_comment_reply_count"(target_comment_id uuid) RETURNS void AS $fn$
      BEGIN
        IF target_comment_id IS NULL THEN
          RETURN;
        END IF;
        UPDATE resume_comments
        SET reply_count = (
          SELECT count(*)::integer FROM resume_comments
          WHERE parent_id = target_comment_id AND deleted_at IS NULL
        )
        WHERE id = target_comment_id;
      END;
      $fn$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "sync_comment_reply_count"() RETURNS trigger AS $fn$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          PERFORM refresh_comment_reply_count(OLD.parent_id);
        ELSE
          PERFORM refresh_comment_reply_count(NEW.parent_id);
          IF TG_OP = 'UPDATE' AND OLD.parent_id IS DISTINCT FROM NEW.parent_id THEN
            PERFORM refresh_comment_reply_count(OLD.parent_id);
          END IF;
        END IF;
        RETURN NULL;
      END;
      $fn$ LANGUAGE plpgsql
    `);

    // A tombstone holds its replies up but is not something a viewer can read,
    // so the feed card must not promise it.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "refresh_resume_comment_count"(target_resume_id uuid) RETURNS void AS $fn$
      BEGIN
        UPDATE resumes
        SET comment_count = (
              SELECT count(*)::integer FROM resume_comments
              WHERE resume_id = target_resume_id AND deleted_at IS NULL
            ),
            updated_at = now()
        WHERE id = target_resume_id;
      END;
      $fn$ LANGUAGE plpgsql
    `);

    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TRG_resume_comments_depth" ON "resume_comments"`,
    );
    await queryRunner.query(
      `CREATE TRIGGER "TRG_resume_comments_depth" BEFORE INSERT OR UPDATE ON "resume_comments" FOR EACH ROW EXECUTE FUNCTION "enforce_comment_depth"()`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TRG_resume_comments_reply_count" ON "resume_comments"`,
    );
    await queryRunner.query(
      `CREATE TRIGGER "TRG_resume_comments_reply_count" AFTER INSERT OR UPDATE OR DELETE ON "resume_comments" FOR EACH ROW EXECUTE FUNCTION "sync_comment_reply_count"()`,
    );

    await queryRunner.query(`
      UPDATE "resumes" SET "comment_count" = (
        SELECT count(*)::integer FROM "resume_comments"
        WHERE "resume_id" = "resumes"."id" AND "deleted_at" IS NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TRG_resume_comments_reply_count" ON "resume_comments"`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TRG_resume_comments_depth" ON "resume_comments"`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS "sync_comment_reply_count"()`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS "refresh_comment_reply_count"(uuid)`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS "enforce_comment_depth"()`);

    // A reply has no home in a flat list, and a tombstone is not a comment.
    await queryRunner.query(`DELETE FROM "resume_comments" WHERE "parent_id" IS NOT NULL`);
    await queryRunner.query(`DELETE FROM "resume_comments" WHERE "deleted_at" IS NOT NULL`);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "refresh_resume_comment_count"(target_resume_id uuid) RETURNS void AS $fn$
      BEGIN
        UPDATE resumes
        SET comment_count = (SELECT count(*)::integer FROM resume_comments WHERE resume_id = target_resume_id),
            updated_at = now()
        WHERE id = target_resume_id;
      END;
      $fn$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_resume_comments_replies"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_resume_comments_roots"`);
    await queryRunner.query(
      `ALTER TABLE "resume_comments" DROP CONSTRAINT IF EXISTS "FK_resume_comments_parent"`,
    );
    await queryRunner.query(
      `ALTER TABLE "resume_comments" DROP CONSTRAINT IF EXISTS "CHK_resume_comments_reply_count"`,
    );
    await queryRunner.query(`
      ALTER TABLE "resume_comments"
        DROP COLUMN IF EXISTS "deleted_at",
        DROP COLUMN IF EXISTS "edited_at",
        DROP COLUMN IF EXISTS "reply_count",
        DROP COLUMN IF EXISTS "reply_to_author_id",
        DROP COLUMN IF EXISTS "parent_id"
    `);

    await queryRunner.query(`
      UPDATE "resumes" SET "comment_count" = (
        SELECT count(*)::integer FROM "resume_comments" WHERE "resume_id" = "resumes"."id"
      )
    `);
  }
}
