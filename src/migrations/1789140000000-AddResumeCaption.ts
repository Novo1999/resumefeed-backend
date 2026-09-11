import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds an optional public caption to each resume feed post. */
export class AddResumeCaption1789140000000 implements MigrationInterface {
  name = 'AddResumeCaption1789140000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "caption" character varying(500)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resumes" DROP COLUMN IF EXISTS "caption"`);
  }
}
