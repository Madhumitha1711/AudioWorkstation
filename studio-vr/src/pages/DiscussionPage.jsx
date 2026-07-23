import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import {
  createThread,
  deleteReply,
  deleteThread,
  listThreads,
  replyToThread,
} from "../api/discussions";
import "./DiscussionPage.css";

// Ported from design/soundcraft-discussion.html — a two-channel Q&A board
// for the current station: "Main Bus" (visible to the whole lesson) and
// "Talkback" (a private line to the instructor). Originally shipped with
// hardcoded seed data and no persistence; now backed by studio-backend's
// /discussions API (see src/api/discussions.js) — threads/replies are
// real rows, "Talkback" is actually private (enforced server-side, not
// just hidden in the UI), an instructor (admin) reply auto-marks a thread
// "answered", and a student can delete their own question or reply (an
// instructor can delete any, for moderation — see DiscussionsService.remove
// / removeReply on the backend). Deletions are confirmed with an in-theme
// modal (ConfirmDialog) rather than the browser's native window.confirm,
// which can't be styled and looks jarring against the rest of the page.

function initialsOf(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "YO";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Turns a backend ISO timestamp into the same kind of relative label the
// original mocked seed data used ("2 hours ago", "Yesterday", ...).
function formatRelativeTime(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  if (diffMs < MINUTE) return "Just now";
  if (diffMs < HOUR) {
    const n = Math.floor(diffMs / MINUTE);
    return `${n} minute${n === 1 ? "" : "s"} ago`;
  }
  if (diffMs < DAY) {
    const n = Math.floor(diffMs / HOUR);
    return `${n} hour${n === 1 ? "" : "s"} ago`;
  }
  const days = Math.floor(diffMs / DAY);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

function PrivateIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

// Replaces window.confirm for both "delete this question" and "delete this
// reply" — same dialog, different copy. Clicking the dimmed backdrop
// cancels (same as the Cancel button); the confirm button is disabled
// while the delete request for it is in flight so a second click can't
// double-fire.
function ConfirmDialog({ title, body, confirmLabel, pending, onCancel, onConfirm }) {
  return (
    <div className="disc-modal-overlay" onClick={onCancel}>
      <div
        className="disc-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="disc-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div id="disc-modal-title" className="disc-modal-title">
          {title}
        </div>
        <p className="disc-modal-body">{body}</p>
        <div className="disc-modal-actions">
          <button className="disc-modal-btn" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
          <button className="disc-modal-btn danger" onClick={onConfirm} disabled={pending}>
            {pending ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ThreadCard({
  thread,
  isReplyOpen,
  replyDraft,
  sendingReply,
  deletingThread,
  deletingReplyId,
  onToggleReply,
  onReplyDraftChange,
  onReplySend,
  onDeleteThread,
  onDeleteReply,
}) {
  const name = thread.isMine ? "You" : thread.authorName;

  return (
    <div className="disc-card">
      <div className="disc-card-top">
        <div className="disc-who">
          <div className="disc-avatar">{initialsOf(name)}</div>
          <div className="disc-who-meta">
            <div className="disc-name">{name}</div>
            <div className="disc-meta-line">
              {formatRelativeTime(thread.createdAt)}
              {thread.tag && <span className="disc-tag"> · {thread.tag}</span>}
            </div>
          </div>
        </div>
        {thread.isPrivate && (
          <div className="disc-private-mark">
            <PrivateIcon />
            Private
          </div>
        )}
      </div>

      <div className="disc-question">{thread.question}</div>

      <div className="disc-card-actions">
        {thread.status === "answered" && (
          <span className="disc-action-btn answered">✓ Answered</span>
        )}
        <button className="disc-action-btn" onClick={onToggleReply}>
          ↳ {isReplyOpen ? "Cancel" : "Reply"}
        </button>
        {thread.canDelete && (
          <button
            className="disc-action-btn danger"
            onClick={onDeleteThread}
            disabled={deletingThread}
          >
            {deletingThread ? "Deleting…" : "🗑 Delete"}
          </button>
        )}
      </div>

      {thread.replies.length > 0 && (
        <div className="disc-thread">
          {thread.replies.map((reply) => {
            const replyName = reply.isMine ? "You" : reply.authorName;
            return (
              <div className="disc-reply" key={reply.id}>
                <div className="disc-avatar">{initialsOf(replyName)}</div>
                <div className="disc-reply-body">
                  <div className="disc-reply-head">
                    <div className={`disc-name${reply.isInstructor ? " instructor" : ""}`}>
                      {replyName}
                      {reply.isInstructor && <span className="disc-role">Instructor</span>}
                    </div>
                    {reply.canDelete && (
                      <button
                        className="disc-reply-delete"
                        onClick={() => onDeleteReply(reply.id)}
                        disabled={deletingReplyId === reply.id}
                        title="Delete reply"
                        aria-label="Delete reply"
                      >
                        {deletingReplyId === reply.id ? "…" : "✕"}
                      </button>
                    )}
                  </div>
                  <div className="disc-reply-text">{reply.text}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isReplyOpen && (
        <div className="disc-reply-composer">
          <textarea
            placeholder="Write a reply…"
            value={replyDraft}
            onChange={(e) => onReplyDraftChange(e.target.value)}
            autoFocus
          />
          <button
            className="disc-action-btn disc-reply-send"
            onClick={onReplySend}
            disabled={sendingReply || !replyDraft.trim()}
          >
            {sendingReply ? "Sending…" : "Send reply"}
          </button>
        </div>
      )}
    </div>
  );
}

function DiscussionPage() {
  // Author display name for "my" threads/replies now comes from the
  // backend (isMine + authorName on each thread/reply — see
  // discussion.mapper.ts), so the session's studentName isn't needed here
  // beyond identifying which student is signed in via the token below.
  const token = useSelector((state) => state.session.token);

  const [channel, setChannel] = useState("main"); // 'main' | 'talkback'
  const [route, setRoute] = useState("main"); // composer's routing switch
  const [mainThreads, setMainThreads] = useState([]);
  const [talkbackThreads, setTalkbackThreads] = useState([]);
  const [draft, setDraft] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  // Which thread (if any) has its inline reply box open, keyed by thread
  // id, plus a per-thread draft so switching tabs or replying to a
  // different thread doesn't clobber an in-progress reply elsewhere.
  const [openReplyId, setOpenReplyId] = useState(null);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [sendingReplyId, setSendingReplyId] = useState(null);

  // Which thread/reply is mid-delete, so its button can show a disabled
  // "Deleting…" state instead of letting a second click double-fire.
  const [deletingThreadId, setDeletingThreadId] = useState(null);
  const [deletingReplyId, setDeletingReplyId] = useState(null);

  // The delete confirmation modal's pending target — null when closed,
  // otherwise { kind: 'thread', thread } or { kind: 'reply', thread, replyId }.
  // Clicking a card's delete action opens this instead of deleting right
  // away; the actual API call only runs once the modal is confirmed.
  const [pendingDelete, setPendingDelete] = useState(null);

  const isTalkback = channel === "talkback";
  const threads = isTalkback ? talkbackThreads : mainThreads;

  const isPendingDeleteInFlight =
    pendingDelete?.kind === "thread"
      ? deletingThreadId === pendingDelete.thread.id
      : pendingDelete?.kind === "reply"
        ? deletingReplyId === pendingDelete.replyId
        : false;

  // Both channels are fetched up front (not just the active tab) so the
  // "· N" counts on both tabs are accurate before the student ever clicks
  // over to Talkback.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError("");
      try {
        const [main, talkback] = await Promise.all([
          listThreads(token, "main"),
          listThreads(token, "talkback"),
        ]);
        if (cancelled) return;
        setMainThreads(main);
        setTalkbackThreads(talkback);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  // Escape dismisses the confirm modal, same as clicking Cancel or the
  // dimmed backdrop — but not while the delete it's confirming is still in
  // flight, so the request can't be abandoned mid-air from the UI's point
  // of view (the server-side delete still runs either way).
  useEffect(() => {
    if (!pendingDelete) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape" && !isPendingDeleteInFlight) setPendingDelete(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pendingDelete, isPendingDeleteInFlight]);

  const selectChannel = (next) => {
    setChannel(next);
    // Keep the composer's routing switch in sync with the tab you're
    // viewing, same as the original mockup.
    setRoute(next);
  };

  const toggleRoute = () => setRoute((r) => (r === "main" ? "talkback" : "main"));

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setError("");
    try {
      const thread = await createThread(token, { channel: route, question: text });
      if (route === "talkback") {
        setTalkbackThreads((prev) => [thread, ...prev]);
        setChannel("talkback");
      } else {
        setMainThreads((prev) => [thread, ...prev]);
        setChannel("main");
      }
      setDraft("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const toggleReplyBox = (threadId) => {
    setOpenReplyId((cur) => (cur === threadId ? null : threadId));
  };

  const setReplyDraft = (threadId, text) => {
    setReplyDrafts((prev) => ({ ...prev, [threadId]: text }));
  };

  const handleReplySend = async (thread) => {
    const text = (replyDrafts[thread.id] || "").trim();
    if (!text || sendingReplyId) return;

    setSendingReplyId(thread.id);
    setError("");
    try {
      const updated = await replyToThread(token, thread.id, text);
      const patch = (list) => list.map((t) => (t.id === updated.id ? updated : t));
      if (thread.channel === "talkback") {
        setTalkbackThreads(patch);
      } else {
        setMainThreads(patch);
      }
      setReplyDrafts((prev) => ({ ...prev, [thread.id]: "" }));
      setOpenReplyId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSendingReplyId(null);
    }
  };

  // Opens the confirm modal rather than deleting immediately — see
  // pendingDelete above.
  const requestDeleteThread = (thread) => setPendingDelete({ kind: "thread", thread });
  const requestDeleteReply = (thread, replyId) =>
    setPendingDelete({ kind: "reply", thread, replyId });

  const runDeleteThread = async (thread) => {
    setDeletingThreadId(thread.id);
    setError("");
    try {
      await deleteThread(token, thread.id);
      const remove = (list) => list.filter((t) => t.id !== thread.id);
      if (thread.channel === "talkback") {
        setTalkbackThreads(remove);
      } else {
        setMainThreads(remove);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingThreadId(null);
    }
  };

  const runDeleteReply = async (thread, replyId) => {
    setDeletingReplyId(replyId);
    setError("");
    try {
      const updated = await deleteReply(token, thread.id, replyId);
      const patch = (list) => list.map((t) => (t.id === updated.id ? updated : t));
      if (thread.channel === "talkback") {
        setTalkbackThreads(patch);
      } else {
        setMainThreads(patch);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingReplyId(null);
    }
  };

  const cancelPendingDelete = () => {
    if (isPendingDeleteInFlight) return; // let the in-flight request finish first
    setPendingDelete(null);
  };

  const confirmPendingDelete = async () => {
    if (!pendingDelete) return;
    if (pendingDelete.kind === "thread") {
      await runDeleteThread(pendingDelete.thread);
    } else {
      await runDeleteReply(pendingDelete.thread, pendingDelete.replyId);
    }
    setPendingDelete(null);
  };

  return (
    <div className="svr-discussion">
      <div className="disc-wrap">
        <h1>Discussion</h1>
        <div className="disc-subhead">
          Ask on the Main Bus for everyone to hear, or send a private line to your instructor.
        </div>

        <div className="disc-channels">
          <button
            className={`disc-channel-tab${channel === "main" ? " active" : ""}`}
            onClick={() => selectChannel("main")}
          >
            <span className="dot" /> Main Bus <span className="count">· {mainThreads.length}</span>
          </button>
          <button
            className={`disc-channel-tab${channel === "talkback" ? " active" : ""}`}
            onClick={() => selectChannel("talkback")}
          >
            <span className="dot" /> Talkback <span className="count">· {talkbackThreads.length}</span>
          </button>
        </div>

        <div className="disc-channel-note">
          {isTalkback
            ? "Only you and your instructor can see this."
            : "Visible to everyone in this lesson."}
        </div>

        <div className="disc-feed">
          {loading ? (
            <div className="disc-empty">
              <h3>Loading discussion…</h3>
            </div>
          ) : threads.length === 0 ? (
            <div className="disc-empty">
              <h3>No questions yet</h3>
              <p>Be the first to ask something about this station.</p>
            </div>
          ) : (
            threads.map((thread) => (
              <ThreadCard
                key={thread.id}
                thread={thread}
                isReplyOpen={openReplyId === thread.id}
                replyDraft={replyDrafts[thread.id] || ""}
                sendingReply={sendingReplyId === thread.id}
                deletingThread={deletingThreadId === thread.id}
                deletingReplyId={deletingReplyId}
                onToggleReply={() => toggleReplyBox(thread.id)}
                onReplyDraftChange={(text) => setReplyDraft(thread.id, text)}
                onReplySend={() => handleReplySend(thread)}
                onDeleteThread={() => requestDeleteThread(thread)}
                onDeleteReply={(replyId) => requestDeleteReply(thread, replyId)}
              />
            ))
          )}
        </div>

        {error && <div className="disc-error">{error}</div>}

        <div className={`disc-composer${route === "talkback" ? " talkback-mode" : ""}`}>
          <textarea
            placeholder="Ask a question about this station…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="disc-composer-bottom">
            <div className="disc-route">
              <span className="disc-route-label">Route to</span>
              <div
                className={`disc-switch${route === "talkback" ? " talkback" : ""}`}
                onClick={toggleRoute}
                role="switch"
                aria-checked={route === "talkback"}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleRoute();
                  }
                }}
              >
                <div className="disc-thumb" />
                <div className="disc-switch-opt main">Main Bus</div>
                <div className="disc-switch-opt tb">Talkback</div>
              </div>
              <span className="disc-route-hint">
                {route === "talkback"
                  ? "Only your instructor can see this."
                  : "Everyone in this lesson can see this."}
              </span>
            </div>
            <button className="disc-send-btn" onClick={handleSend} disabled={sending}>
              {sending
                ? "Sending…"
                : route === "talkback"
                  ? "Send on Talkback"
                  : "Post to Main Bus"}
            </button>
          </div>
        </div>
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title={pendingDelete.kind === "thread" ? "Delete this question?" : "Delete this reply?"}
          body={
            pendingDelete.kind === "thread"
              ? "This removes it, and every reply on it, for everyone. This can't be undone."
              : "This can't be undone."
          }
          confirmLabel="Delete"
          pending={isPendingDeleteInFlight}
          onCancel={cancelPendingDelete}
          onConfirm={confirmPendingDelete}
        />
      )}
    </div>
  );
}

export default DiscussionPage;
