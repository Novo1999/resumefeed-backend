import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Keeps a short notification preview after its source feedback is removed. */
export class AddNotificationCommentSnapshot1789190000000 implements MigrationInterface {
  name = 'AddNotificationCommentSnapshot1789190000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "comment_body" character varying(2000)`,
    );
    await queryRunner.query(`
      UPDATE "notifications" AS notification
      SET "comment_body" = comment."body"
      FROM "resume_comments" AS comment
      WHERE notification."comment_id" = comment."id"
        AND notification."comment_body" IS NULL
        AND comment."deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN IF EXISTS "comment_body"`);
  }
}
