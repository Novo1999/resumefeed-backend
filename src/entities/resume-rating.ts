import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Resume } from './resume';

/** One 1-to-5 rating per person per resume. Updating this row changes a vote. */
@Entity({ name: 'resume_ratings' })
@Unique('UQ_resume_ratings_resume_author', ['resumeId', 'authorId'])
@Check('"score" BETWEEN 1 AND 5')
@Index('IDX_resume_ratings_resume_id', ['resumeId'])
export class ResumeRating {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'resume_id', type: 'uuid' })
  resumeId!: string;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId!: string;

  @Column({ type: 'smallint' })
  score!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => Resume, (resume) => resume.ratings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resume_id' })
  resume!: Resume;
}
