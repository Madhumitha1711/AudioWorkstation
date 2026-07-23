import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { DiscussionThread } from './discussion-thread.entity';

// A single reply within a discussion thread (either channel). Whether a
// reply renders with the "Instructor" badge on the frontend is derived from
// the author's role at read time (see discussion.mapper.ts), not stored
// here — so a role change (e.g. syncAdminRole promoting a new instructor)
// is reflected on old replies too, rather than freezing a role label at
// the moment the reply was posted.
@Entity('discussion_replies')
export class DiscussionReply {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => DiscussionThread, (thread) => thread.replies, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'threadId' })
  thread: DiscussionThread;

  @Column()
  threadId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'authorId' })
  author: User;

  @Column()
  authorId: number;

  @Column({ type: 'text' })
  text: string;

  @CreateDateColumn()
  createdAt: Date;
}
