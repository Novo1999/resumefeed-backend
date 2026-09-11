import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CommentReaction } from './comment-reaction';
import { Resume } from './resume';

/**
 * A written piece of feedback on a resume. A comment with a `parentId` is a
 * reply; threads are exactly two levels deep and a database trigger flattens
 * anything deeper back onto the root.
 */
@Entity({ name: 'resume_comments' })
@Index('IDX_resume_comments_resume_created_at', ['resumeId', 'createdAt'])
@Index('IDX_resume_comments_author_id', ['authorId'])
export class ResumeComment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'resume_id', type: 'uuid' })
  resumeId!: string;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId!: string;

  /** Null on a root comment; otherwise the root this reply hangs off. */
  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId!: string | null;

  /**
   * The Supabase Auth user this reply answers, when it answers another reply
   * rather than the root. Deliberately not a foreign key into this table: the
   * "replying to @Sam" label should survive Sam's comment being deleted.
   */
  @Column({ name: 'reply_to_author_id', type: 'uuid', nullable: true })
  replyToAuthorId!: string | null;

  /** Blanked when the comment is tombstoned. */
  @Column({ type: 'varchar', length: 2000 })
  body!: string;

  /** Live replies on a root comment, maintained by a database trigger. */
  @Column({ name: 'reply_count', type: 'integer', default: 0 })
  replyCount!: number;

  /** Reactions on this comment, maintained by a database trigger. */
  @Column({ name: 'reaction_count', type: 'integer', default: 0 })
  reactionCount!: number;

  /**
   * Set only when the author changes the body. `updatedAt` cannot carry this,
   * because the reply-count trigger bumps it on rows nobody edited.
   */
  @Column({ name: 'edited_at', type: 'timestamptz', nullable: true })
  editedAt!: Date | null;

  /**
   * A tombstone: the comment was deleted but had replies, so the row stays to
   * hold them up. A comment nobody answered is removed outright instead.
   */
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => Resume, (resume) => resume.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resume_id' })
  resume!: Resume;

  @ManyToOne(() => ResumeComment, (comment) => comment.replies, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parent_id' })
  parent!: ResumeComment | null;

  @OneToMany(() => ResumeComment, (comment) => comment.parent)
  replies!: ResumeComment[];

  @OneToMany(() => CommentReaction, (reaction) => reaction.comment)
  reactions!: CommentReaction[];
}
