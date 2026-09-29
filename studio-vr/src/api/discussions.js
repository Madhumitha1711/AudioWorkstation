import request from "./client";

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

export function deleteThread(token, threadId) {
  return request(`/discussions/${threadId}`, { method: "DELETE", token });
}

export function deleteReply(token, threadId, replyId) {
  return request(`/discussions/${threadId}/replies/${replyId}`, {
    method: "DELETE",
    token,
  });
}
