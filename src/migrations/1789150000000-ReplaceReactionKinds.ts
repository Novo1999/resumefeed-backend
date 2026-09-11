import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Swaps the three feedback-flavoured reactions for the five familiar ones and
 * narrows the constraint to one reaction per person, per resume.
 */
export class ReplaceReactionKinds1789150000000 implements MigrationInterface {
  name = 'ReplaceReactionKinds1789150000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."reaction_kind_enum" RENAME TO "reaction_kind_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."reaction_kind_enum" AS ENUM ('like', 'heart', 'fire', 'wow', 'haha')`,
    );
    await queryRunner.query(`
      ALTER TABLE "resume_reactions"
      ALTER COLUMN "kind" TYPE "public"."reaction_kind_enum"
      USING (
        CASE "kind"::text
          WHEN 'insightful' THEN 'wow'
          WHEN 'encouraging' THEN 'heart'
          ELSE 'like'
        END
      )::"public"."reaction_kind_enum"
    `);
    await queryRunner.query(`DROP TYPE "public"."reaction_kind_enum_old"`);

    // The old constraint allowed one row per kind, so a person may hold several
    // on the same resume. Keep their most recent and drop the rest.
    await queryRunner.query(`
      DELETE FROM "resume_reactions" WHERE "id" IN (
        SELECT "id" FROM (
          SELECT "id", row_number() OVER (
            PARTITION BY "resume_id", "author_id"
            ORDER BY "created_at" DESC, "id" DESC
          ) AS rn
          FROM "resume_reactions"
        ) ranked WHERE ranked.rn > 1
      )
    `);

    await queryRunner.query(
      `ALTER TABLE "resume_reactions" DROP CONSTRAINT IF EXISTS "UQ_resume_reactions_resume_author_kind"`,
    );
    await queryRunner.query(
      `ALTER TABLE "resume_reactions" ADD CONSTRAINT "UQ_resume_reactions_resume_author" UNIQUE ("resume_id", "author_id")`,
    );

    await queryRunner.query(
      `UPDATE "resumes" SET "reaction_count" = (
         SELECT count(*)::integer FROM "resume_reactions" WHERE "resume_id" = "resumes"."id"
       )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "resume_reactions" DROP CONSTRAINT IF EXISTS "UQ_resume_reactions_resume_author"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."reaction_kind_enum" RENAME TO "reaction_kind_enum_new"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."reaction_kind_enum" AS ENUM ('helpful', 'insightful', 'encouraging')`,
    );
    await queryRunner.query(`
      ALTER TABLE "resume_reactions"
      ALTER COLUMN "kind" TYPE "public"."reaction_kind_enum"
      USING (
        CASE "kind"::text
          WHEN 'wow' THEN 'insightful'
          WHEN 'heart' THEN 'encouraging'
          ELSE 'helpful'
        END
      )::"public"."reaction_kind_enum"
    `);
    await queryRunner.query(`DROP TYPE "public"."reaction_kind_enum_new"`);
    await queryRunner.query(
      `ALTER TABLE "resume_reactions" ADD CONSTRAINT "UQ_resume_reactions_resume_author_kind" UNIQUE ("resume_id", "author_id", "kind")`,
    );
  }
}
