import request from "./client";

// Backs studio-backend's DiscussionsController — every call requires the
// bearer token (like courses/payments, neither route there is @Public()/
// @SkipPayment(), so this needs a signed-in, paid student). Every call
// resolves to the shapes in that controller's DiscussionThreadResponse /
// see discussion.mapper.ts on the backend for exactly what's on each
// thread/reply (authorName, isMine, isInstructor, etc.).

export function listThreads(token, channel) {
  return request(`/discussions?channel=${encodeURIComponent(channel)}`, { token });
}

export function createThread(token, { channel, question, tag }) {
  return request("/discussions", {
    method: "POST",
    token,
    body: { channel, question, tag },
  });
}

export function replyToThread(token, threadId, text) {
  return request(`/discussions/${threadId}/replies`, {
    method: "POST",
    token,
    body: { text },
  });
}

// Resolves to { id } — the backend doesn't have anything more to return
// once the thread (and, via DB cascade, every reply under it) is gone.
export function deleteThread(token, threadId) {
  return request(`/discussions/${threadId}`, { method: "DELETE", token });
}

// Resolves to the thread's fresh DiscussionThreadResponse (with the reply
// removed from its `replies` array) rather than a bare confirmation, so
// the caller can just swap the thread in place — same pattern as
// replyToThread's response.
export function deleteReply(token, threadId, replyId) {
  return request(`/discussions/${threadId}/replies/${replyId}`, {
    method: "DELETE",
    token,
  });
}
