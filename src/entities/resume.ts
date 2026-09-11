import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ResumeComment } from './resume-comment';
import { ResumeRating } from './resume-rating';
import { ResumeReaction } from './resume-reaction';
import { nullableNumericTransformer } from './transformers';

/**
 * A post in the feed. The actual document remains a private object in Supabase
 * Storage; this row deliberately stores its path, never a signed URL.
 */
@Entity({ name: 'resumes' })
@Check('"mime_type" = \'application/pdf\'')
@Check('"rating_count" >= 0')
@Check('"comment_count" >= 0')
@Check('"reaction_count" >= 0')
@Index('IDX_resumes_owner_created_at', ['ownerId', 'createdAt'])
@Index('IDX_resumes_feed_created_at', ['createdAt'])
export class Resume {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Supabase Auth user ID. Auth remains the source of truth for user profiles. */
  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string;

  /** Relative to the private `resumes` bucket, e.g. `<owner-id>/<uuid>.pdf`. */
  @Column({ name: 'storage_path', type: 'varchar', length: 512, unique: true })
  storagePath!: string;

  @Column({ name: 'original_filename', type: 'varchar', length: 255 })
  originalFilename!: string;

  /** Optional human-friendly label; the original filename is used when absent. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  title!: string | null;

  @Column({ name: 'mime_type', type: 'varchar', length: 100, default: 'application/pdf' })
  mimeType!: 'application/pdf';

  @Column({ name: 'rating_count', type: 'integer', default: 0 })
  ratingCount!: number;

  /** Null means the resume has not received a rating yet. */
  @Column({
    name: 'average_rating',
    type: 'numeric',
    precision: 3,
    scale: 2,
    nullable: true,
    transformer: nullableNumericTransformer,
  })
  averageRating!: number | null;

  @Column({ name: 'comment_count', type: 'integer', default: 0 })
  commentCount!: number;

  @Column({ name: 'reaction_count', type: 'integer', default: 0 })
  reactionCount!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => ResumeRating, (rating) => rating.resume)
  ratings!: ResumeRating[];

  @OneToMany(() => ResumeComment, (comment) => comment.resume)
  comments!: ResumeComment[];

  @OneToMany(() => ResumeReaction, (reaction) => reaction.resume)
  reactions!: ResumeReaction[];
}
