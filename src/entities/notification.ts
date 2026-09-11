import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { ReactionKind } from '../types/resume';

export const NOTIFICATION_KINDS = [
  'resume_comment',
  'comment_reply',
  'resume_reaction',
  'comment_reaction',
  'resume_rating',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** A durable, recipient-scoped record of one piece of community activity. */
@Entity({ name: 'notifications' })
@Index('IDX_notifications_recipient_created_at', ['recipientId', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'recipient_id', type: 'uuid' })
  recipientId!: string;

  @Column({ name: 'actor_id', type: 'uuid' })
  actorId!: string;

  @Column({ type: 'enum', enum: NOTIFICATION_KINDS, enumName: 'notification_kind_enum' })
  kind!: NotificationKind;

  @Column({ name: 'resume_id', type: 'uuid' })
  resumeId!: string;

  @Column({ name: 'comment_id', type: 'uuid', nullable: true })
  commentId!: string | null;

  /** Event-time preview, retained when its Comment is later deleted. */
  @Column({ name: 'comment_body', type: 'varchar', length: 2000, nullable: true })
  commentBody!: string | null;

  @Column({ name: 'reaction_id', type: 'uuid', nullable: true })
  reactionId!: string | null;

  @Column({ name: 'rating_id', type: 'uuid', nullable: true })
  ratingId!: string | null;

  @Column({
    name: 'reaction_kind',
    type: 'enum',
    enum: ['like', 'heart', 'fire', 'wow', 'haha'],
    nullable: true,
  })
  reactionKind!: ReactionKind | null;

  @Column({ name: 'rating_score', type: 'smallint', nullable: true })
  ratingScore!: number | null;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @Column({ name: 'removed_at', type: 'timestamptz', nullable: true })
  removedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
