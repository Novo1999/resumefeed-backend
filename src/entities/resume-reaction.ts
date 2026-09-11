import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Resume } from './resume';
import { REACTION_KINDS, type ReactionKind } from '../types/resume';

/** One reaction per person, per resume. Picking another kind replaces it. */
@Entity({ name: 'resume_reactions' })
@Unique('UQ_resume_reactions_resume_author', ['resumeId', 'authorId'])
@Index('IDX_resume_reactions_resume_id', ['resumeId'])
export class ResumeReaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'resume_id', type: 'uuid' })
  resumeId!: string;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId!: string;

  @Column({ type: 'enum', enum: REACTION_KINDS, enumName: 'reaction_kind_enum' })
  kind!: ReactionKind;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => Resume, (resume) => resume.reactions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resume_id' })
  resume!: Resume;
}
