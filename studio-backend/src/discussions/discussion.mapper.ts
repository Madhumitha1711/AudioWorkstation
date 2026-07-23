import { DiscussionReply } from './discussion-reply.entity';
import { DiscussionThread } from './discussion-thread.entity';
import {
  DiscussionReplyResponse,
  DiscussionThreadResponse,
} from './discussion.types';

// Falls back to the part of the email before '@' for accounts that never
// set a username (e.g. Google sign-in without a display name) — matches
// studio-vr's own LoginPage/SignupPage fallback for `studentName`, so a
// thread's author name lines up with what that student sees of themselves
// in the header.
function displayName(user: { username: string | null; email: string }): string {
  return user.username || user.email.split('@')[0];
}

function mapReply(
  reply: DiscussionReply,
  currentUserId: number,
  currentUserIsInstructor: boolean,
): DiscussionReplyResponse {
  const isMine = reply.authorId === currentUserId;
  return {
    id: reply.id,
    authorName: displayName(reply.author),
    isInstructor: reply.author.role === 'admin',
    isMine,
    // Same author-or-instructor rule DiscussionsService.removeReply
    // enforces server-side — computed once here so the frontend just
    // reads a flag instead of re-implementing the permission check.
    canDelete: isMine || currentUserIsInstructor,
    text: reply.text,
    createdAt: reply.createdAt.toISOString(),
  };
}

export function mapThread(
  thread: DiscussionThread,
  currentUserId: number,
  currentUserIsInstructor: boolean,
): DiscussionThreadResponse {
  const isMine = thread.authorId === currentUserId;
  return {
    id: thread.id,
    channel: thread.channel,
    tag: thread.tag,
    question: thread.question,
    status: thread.status,
    authorName: displayName(thread.author),
    isMine,
    canDelete: isMine || currentUserIsInstructor,
    isPrivate: thread.channel === 'talkback',
    createdAt: thread.createdAt.toISOString(),
    replies: (thread.replies ?? [])
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((reply) => mapReply(reply, currentUserId, currentUserIsInstructor)),
  };
}
