import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Resume } from './resume';

/** A written piece of feedback on a resume. Replies are intentionally out of v1. */
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

  @Column({ type: 'varchar', length: 2000 })
  body!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => Resume, (resume) => resume.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resume_id' })
  resume!: Resume;
}
