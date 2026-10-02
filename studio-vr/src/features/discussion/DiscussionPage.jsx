import { useEffect, useRef, useState } from "react";
import { Tabs, useTabTransition } from "../../components/Tabs";
import { useSelector } from "react-redux";
import {
  createThread,
  deleteReply,
  deleteThread,
  listThreads,
  replyToThread,
} from "../../api/discussions";
import "./DiscussionPage.css";

const CHANNEL_TABS = [
  { id: "main", label: "Main Bus" },
  { id: "talkback", label: "Talkback" },
];

function initialsOf(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "YO";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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
  const token = useSelector((state) => state.session.token);

  const [channel, setChannel] = useState("main");
  const feedRef = useRef(null);
  useTabTransition(feedRef, channel, CHANNEL_TABS.findIndex((t) => t.id === channel));
  const [route, setRoute] = useState("main");
  const [mainThreads, setMainThreads] = useState([]);
  const [talkbackThreads, setTalkbackThreads] = useState([]);
  const [draft, setDraft] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const [openReplyId, setOpenReplyId] = useState(null);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [sendingReplyId, setSendingReplyId] = useState(null);

  const [deletingThreadId, setDeletingThreadId] = useState(null);
  const [deletingReplyId, setDeletingReplyId] = useState(null);

  const [pendingDelete, setPendingDelete] = useState(null);

  const isTalkback = channel === "talkback";
  const threads = isTalkback ? talkbackThreads : mainThreads;

  const isPendingDeleteInFlight =
    pendingDelete?.kind === "thread"
      ? deletingThreadId === pendingDelete.thread.id
      : pendingDelete?.kind === "reply"
        ? deletingReplyId === pendingDelete.replyId
        : false;

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
    if (isPendingDeleteInFlight) return;
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

        <Tabs
          className="disc-channels"
          tabClassName="disc-channel-tab"
          items={CHANNEL_TABS}
          value={channel}
          onChange={selectChannel}
          ariaLabel="Discussion channel"
          idPrefix="disc"
          renderTab={(t) => (
            <>
              <span className="dot" /> {t.label}{" "}
              <span className="count">· {t.id === "main" ? mainThreads.length : talkbackThreads.length}</span>
            </>
          )}
        />

        <div className="disc-channel-note">
          {isTalkback
            ? "Only you and your instructor can see this."
            : "Visible to everyone in this lesson."}
        </div>

        <div ref={feedRef} className="disc-feed" role="tabpanel" id={`disc-panel-${channel}`} aria-labelledby={`disc-tab-${channel}`}>
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
