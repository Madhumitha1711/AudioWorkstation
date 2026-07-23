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
import { User } from '../users/user.entity';
import { DiscussionReply } from './discussion-reply.entity';

export type DiscussionChannel = 'main' | 'talkback';
export type DiscussionStatus = 'open' | 'answered';

// A single question posted to the discussion board. 'main' threads are the
// shared Q&A visible to everyone in the lesson; 'talkback' threads are a
// private line between one student and the instructor (an admin account) —
// see DiscussionsService for exactly who can read/reply to which. Status
// flips to 'answered' automatically the first time an admin replies (see
// DiscussionsService.reply), mirroring studio-vr's original mocked seed
// data where only instructor-answered threads showed the green checkmark.
@Entity('discussion_threads')
export class DiscussionThread {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  channel: DiscussionChannel;

  // Free-text label for which station/lesson the question is about (e.g.
  // "Compressor Studio"). Nothing in studio-vr currently passes a station
  // into /discussion (no route param on that route), so every thread
  // created through the current UI has this as null — kept as a real
  // column rather than dropped so a future per-station discussion view
  // doesn't need a schema change.
  @Column({ type: 'varchar', nullable: true })
  tag: string | null;

  @Column({ type: 'text' })
  question: string;

  @Column({ default: 'open' })
  status: DiscussionStatus;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'authorId' })
  author: User;

  @Column()
  authorId: number;

  @OneToMany(() => DiscussionReply, (reply) => reply.thread)
  replies: DiscussionReply[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
