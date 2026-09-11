import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Durable activity records, created by database triggers and delivered via Realtime. */
export class AddNotifications1789180000000 implements MigrationInterface {
  name = 'AddNotifications1789180000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."notification_kind_enum" AS ENUM (
          'resume_comment', 'comment_reply', 'resume_reaction', 'comment_reaction', 'resume_rating'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notifications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "recipient_id" uuid NOT NULL,
        "actor_id" uuid NOT NULL,
        "kind" "public"."notification_kind_enum" NOT NULL,
        "resume_id" uuid NOT NULL,
        "comment_id" uuid,
        "comment_body" character varying(2000),
        "reaction_id" uuid,
        "rating_id" uuid,
        "reaction_kind" "public"."reaction_kind_enum",
        "rating_score" smallint,
        "read_at" TIMESTAMP WITH TIME ZONE,
        "removed_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_notifications_not_self" CHECK ("recipient_id" <> "actor_id"),
        CONSTRAINT "CHK_notifications_rating_score" CHECK ("rating_score" IS NULL OR "rating_score" BETWEEN 1 AND 5)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_notifications_recipient_created_at" ON "notifications" ("recipient_id", "created_at" DESC, "id" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_notifications_recipient_unread" ON "notifications" ("recipient_id") WHERE "read_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_notifications_reaction_id" ON "notifications" ("reaction_id") WHERE "reaction_id" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "notify_comment_insert"() RETURNS trigger AS $fn$
      DECLARE recipient uuid;
      BEGIN
        IF NEW.parent_id IS NULL THEN
          SELECT owner_id INTO recipient FROM resumes WHERE id = NEW.resume_id;
          IF recipient IS NOT NULL AND recipient <> NEW.author_id THEN
            INSERT INTO notifications (recipient_id, actor_id, kind, resume_id, comment_id, comment_body)
            VALUES (recipient, NEW.author_id, 'resume_comment', NEW.resume_id, NEW.id, NEW.body);
          END IF;
          RETURN NEW;
        END IF;

        IF NEW.reply_to_author_id IS NOT NULL THEN
          recipient := NEW.reply_to_author_id;
        ELSE
          SELECT author_id INTO recipient FROM resume_comments WHERE id = NEW.parent_id;
        END IF;
        IF recipient IS NOT NULL AND recipient <> NEW.author_id THEN
          INSERT INTO notifications (recipient_id, actor_id, kind, resume_id, comment_id, comment_body)
          VALUES (recipient, NEW.author_id, 'comment_reply', NEW.resume_id, NEW.id, NEW.body);
        END IF;
        RETURN NEW;
      END;
      $fn$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "notify_resume_reaction_insert"() RETURNS trigger AS $fn$
      DECLARE recipient uuid;
      BEGIN
        SELECT owner_id INTO recipient FROM resumes WHERE id = NEW.resume_id;
        IF recipient IS NOT NULL AND recipient <> NEW.author_id THEN
          INSERT INTO notifications (recipient_id, actor_id, kind, resume_id, reaction_id, reaction_kind)
          VALUES (recipient, NEW.author_id, 'resume_reaction', NEW.resume_id, NEW.id, NEW.kind);
        END IF;
        RETURN NEW;
      END;
      $fn$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "notify_comment_reaction_insert"() RETURNS trigger AS $fn$
      DECLARE recipient uuid;
      DECLARE target_resume uuid;
      BEGIN
        SELECT author_id, resume_id INTO recipient, target_resume FROM resume_comments WHERE id = NEW.comment_id;
        IF recipient IS NOT NULL AND recipient <> NEW.author_id THEN
          INSERT INTO notifications (recipient_id, actor_id, kind, resume_id, comment_id, reaction_id, reaction_kind)
          VALUES (recipient, NEW.author_id, 'comment_reaction', target_resume, NEW.comment_id, NEW.id, NEW.kind);
        END IF;
        RETURN NEW;
      END;
      $fn$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "notify_rating_insert"() RETURNS trigger AS $fn$
      DECLARE recipient uuid;
      BEGIN
        SELECT owner_id INTO recipient FROM resumes WHERE id = NEW.resume_id;
        IF recipient IS NOT NULL AND recipient <> NEW.author_id THEN
          INSERT INTO notifications (recipient_id, actor_id, kind, resume_id, rating_id, rating_score)
          VALUES (recipient, NEW.author_id, 'resume_rating', NEW.resume_id, NEW.id, NEW.score);
        END IF;
        RETURN NEW;
      END;
      $fn$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "mark_reaction_notification_removed"() RETURNS trigger AS $fn$
      BEGIN
        UPDATE notifications SET removed_at = COALESCE(removed_at, now()) WHERE reaction_id = OLD.id;
        RETURN OLD;
      END;
      $fn$ LANGUAGE plpgsql
    `);

    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TRG_notifications_comment_insert" ON "resume_comments"`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TRG_notifications_resume_reaction_insert" ON "resume_reactions"`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TRG_notifications_resume_reaction_delete" ON "resume_reactions"`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TRG_notifications_comment_reaction_insert" ON "comment_reactions"`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TRG_notifications_comment_reaction_delete" ON "comment_reactions"`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TRG_notifications_rating_insert" ON "resume_ratings"`,
    );
    await queryRunner.query(
      `CREATE TRIGGER "TRG_notifications_comment_insert" AFTER INSERT ON "resume_comments" FOR EACH ROW EXECUTE FUNCTION "notify_comment_insert"()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER "TRG_notifications_resume_reaction_insert" AFTER INSERT ON "resume_reactions" FOR EACH ROW EXECUTE FUNCTION "notify_resume_reaction_insert"()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER "TRG_notifications_resume_reaction_delete" AFTER DELETE ON "resume_reactions" FOR EACH ROW EXECUTE FUNCTION "mark_reaction_notification_removed"()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER "TRG_notifications_comment_reaction_insert" AFTER INSERT ON "comment_reactions" FOR EACH ROW EXECUTE FUNCTION "notify_comment_reaction_insert"()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER "TRG_notifications_comment_reaction_delete" AFTER DELETE ON "comment_reactions" FOR EACH ROW EXECUTE FUNCTION "mark_reaction_notification_removed"()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER "TRG_notifications_rating_insert" AFTER INSERT ON "resume_ratings" FOR EACH ROW EXECUTE FUNCTION "notify_rating_insert"()`,
    );

    await queryRunner.query(`ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(
      `DROP POLICY IF EXISTS "notifications_recipient_select" ON "notifications"`,
    );
    await queryRunner.query(
      `CREATE POLICY "notifications_recipient_select" ON "notifications" FOR SELECT USING (recipient_id = auth.uid())`,
    );
    // Supabase manages this publication. The guarded block keeps local Postgres usable.
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
          BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
          EXCEPTION WHEN duplicate_object THEN NULL;
          END;
        END IF;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TRG_notifications_rating_insert" ON "resume_ratings"`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TRG_notifications_comment_reaction_delete" ON "comment_reactions"`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TRG_notifications_comment_reaction_insert" ON "comment_reactions"`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TRG_notifications_resume_reaction_delete" ON "resume_reactions"`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TRG_notifications_resume_reaction_insert" ON "resume_reactions"`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TRG_notifications_comment_insert" ON "resume_comments"`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS "mark_reaction_notification_removed"()`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS "notify_rating_insert"()`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS "notify_comment_reaction_insert"()`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS "notify_resume_reaction_insert"()`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS "notify_comment_insert"()`);
    await queryRunner.query(
      `DROP POLICY IF EXISTS "notifications_recipient_select" ON "notifications"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."notification_kind_enum"`);
  }
}
