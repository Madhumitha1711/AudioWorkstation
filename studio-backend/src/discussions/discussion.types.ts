import { DiscussionChannel, DiscussionStatus } from './discussion-thread.entity';

// Reshaped output for studio-vr's DiscussionPage — see discussion.mapper.ts.
// `isMine`/`isInstructor` are computed relative to whichever user made the
// request, so the frontend can show "You" vs. a real name and the
// "Instructor" badge without needing to know its own user id. `canDelete`
// folds in the same author-or-instructor rule DiscussionsService.remove/
// removeReply enforce server-side, so the frontend never has to re-derive
// (and risk drifting from) that permission check just to decide whether to
// render the delete button.

export interface DiscussionReplyResponse {
  id: number;
  authorName: string;
  isInstructor: boolean;
  isMine: boolean;
  canDelete: boolean;
  text: string;
  createdAt: string;
}

export interface DiscussionThreadResponse {
  id: number;
  channel: DiscussionChannel;
  tag: string | null;
  question: string;
  status: DiscussionStatus;
  authorName: string;
  isMine: boolean;
  canDelete: boolean;
  isPrivate: boolean;
  createdAt: string;
  replies: DiscussionReplyResponse[];
}
