import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reactions on comments, with the same semantics as reactions on resumes: the
 * same five kinds, one per person, and picking another kind replaces it.
 */
export class AddCommentReactions1789170000000 implements MigrationInterface {
  name = 'AddCommentReactions1789170000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "resume_comments"
        ADD COLUMN IF NOT EXISTS "reaction_count" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(
      `ALTER TABLE "resume_comments" DROP CONSTRAINT IF EXISTS "CHK_resume_comments_reaction_count"`,
    );
    await queryRunner.query(
      `ALTER TABLE "resume_comments" ADD CONSTRAINT "CHK_resume_comments_reaction_count" CHECK ("reaction_count" >= 0)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "comment_reactions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "comment_id" uuid NOT NULL,
        "author_id" uuid NOT NULL,
        "kind" "public"."reaction_kind_enum" NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_comment_reactions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_comment_reactions_comment_author" UNIQUE ("comment_id", "author_id"),
        CONSTRAINT "FK_comment_reactions_comment" FOREIGN KEY ("comment_id") REFERENCES "resume_comments"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_comment_reactions_comment_id" ON "comment_reactions" ("comment_id")`,
    );

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "refresh_comment_reaction_count"(target_comment_id uuid) RETURNS void AS $fn$
      BEGIN
        IF target_comment_id IS NULL THEN
          RETURN;
        END IF;
        UPDATE resume_comments
        SET reaction_count = (
          SELECT count(*)::integer FROM comment_reactions WHERE comment_id = target_comment_id
        )
        WHERE id = target_comment_id;
      END;
      $fn$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "sync_comment_reaction_count"() RETURNS trigger AS $fn$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          PERFORM refresh_comment_reaction_count(OLD.comment_id);
        ELSE
          PERFORM refresh_comment_reaction_count(NEW.comment_id);
          IF TG_OP = 'UPDATE' AND OLD.comment_id IS DISTINCT FROM NEW.comment_id THEN
            PERFORM refresh_comment_reaction_count(OLD.comment_id);
          END IF;
        END IF;
        RETURN NULL;
      END;
      $fn$ LANGUAGE plpgsql
    `);

    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TRG_comment_reactions_count" ON "comment_reactions"`,
    );
    await queryRunner.query(
      `CREATE TRIGGER "TRG_comment_reactions_count" AFTER INSERT OR UPDATE OR DELETE ON "comment_reactions" FOR EACH ROW EXECUTE FUNCTION "sync_comment_reaction_count"()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TRG_comment_reactions_count" ON "comment_reactions"`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS "sync_comment_reaction_count"()`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS "refresh_comment_reaction_count"(uuid)`);
    await queryRunner.query(`DROP TABLE IF EXISTS "comment_reactions"`);
    await queryRunner.query(
      `ALTER TABLE "resume_comments" DROP CONSTRAINT IF EXISTS "CHK_resume_comments_reaction_count"`,
    );
    await queryRunner.query(`ALTER TABLE "resume_comments" DROP COLUMN IF EXISTS "reaction_count"`);
  }
}
