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
import { ResumeComment } from './resume-comment';
import { REACTION_KINDS, type ReactionKind } from '../types/resume';

/** One reaction per person, per comment. Picking another kind replaces it. */
@Entity({ name: 'comment_reactions' })
@Unique('UQ_comment_reactions_comment_author', ['commentId', 'authorId'])
@Index('IDX_comment_reactions_comment_id', ['commentId'])
export class CommentReaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'comment_id', type: 'uuid' })
  commentId!: string;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId!: string;

  @Column({ type: 'enum', enum: REACTION_KINDS, enumName: 'reaction_kind_enum' })
  kind!: ReactionKind;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => ResumeComment, (comment) => comment.reactions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'comment_id' })
  comment!: ResumeComment;
}
