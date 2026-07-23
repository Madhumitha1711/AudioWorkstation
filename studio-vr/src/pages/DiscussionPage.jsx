import { useState } from "react";
import { useSelector } from "react-redux";
import "./DiscussionPage.css";

// Ported from design/soundcraft-discussion.html — a two-channel Q&A board
// for the current station: "Main Bus" (visible to the whole lesson) and
// "Talkback" (a private line to the instructor).

function initialsOf(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "YO";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const MAIN_SEED = [
  {
    id: "m1",
    initials: "RK",
    name: "Riya K.",
    time: "2 hours ago",
    tag: "Compressor Studio",
    question:
      "When the ratio is set past 10:1, is that functionally the same as a limiter, or is there still a meaningful difference in how the knee behaves?",
    status: "answered",
    replies: [
      {
        id: "m1-r1",
        initials: "MT",
        name: "Marcus T.",
        role: "Instructor",
        text: "Functionally close, yes — but a true limiter usually pairs that ratio with a much faster attack and a fixed low threshold. Try switching the attack to under 1ms on this station's compressor and compare.",
      },
    ],
  },
  {
    id: "m2",
    initials: "DJ",
    name: "Devon J.",
    time: "Yesterday",
    tag: "Compressor Studio",
    question:
      "Anyone else finding the gain reduction meter lags behind what you're actually hearing? Or is that just how it's supposed to feel at fast attack times?",
    replyCount: 3,
    replies: [],
  },
  {
    id: "m3",
    initials: "SL",
    name: "Sam L.",
    time: "2 days ago",
    tag: "Compressor Studio",
    question:
      "Is sidechain compression something we'll cover in this station, or does that live under Spatial Audio?",
    replies: [],
  },
];

const TALKBACK_SEED = [
  {
    id: "t1",
    initials: "YO",
    name: "You",
    time: "3 days ago",
    tag: "Compressor Studio",
    question:
      "I don't fully understand why my compressed track sounds quieter overall even though the meter shows less gain reduction than my classmate's. Is this a gain staging mistake on my end?",
    status: "answered",
    private: true,
    replies: [
      {
        id: "t1-r1",
        initials: "MT",
        name: "Marcus T.",
        role: "Instructor",
        text: "Almost certainly a make-up gain issue rather than anything wrong with your ratio — send me a screenshot of your input trim and I'll check it in our next session.",
      },
    ],
  },
];

function PrivateIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function ThreadCard({ thread }) {
  return (
    <div className="disc-card">
      <div className="disc-card-top">
        <div className="disc-who">
          <div className="disc-avatar">{thread.initials}</div>
          <div className="disc-who-meta">
            <div className="disc-name">{thread.name}</div>
            <div className="disc-meta-line">
              {thread.time} <span className="disc-tag">· {thread.tag}</span>
            </div>
          </div>
        </div>
        {thread.private && (
          <div className="disc-private-mark">
            <PrivateIcon />
            Private
          </div>
        )}
      </div>

      <div className="disc-question">{thread.question}</div>

      <div className="disc-card-actions">
        {thread.status === "answered" && (
          <button className="disc-action-btn answered">✓ Answered</button>
        )}
        {typeof thread.replyCount === "number" && (
          <button className="disc-action-btn">{thread.replyCount} replies</button>
        )}
        <button className="disc-action-btn">↳ Reply</button>
      </div>

      {thread.replies?.length > 0 && (
        <div className="disc-thread">
          {thread.replies.map((reply) => (
            <div className="disc-reply" key={reply.id}>
              <div className="disc-avatar">{reply.initials}</div>
              <div className="disc-reply-body">
                <div className="disc-name instructor">
                  {reply.name} <span className="disc-role">{reply.role}</span>
                </div>
                <div className="disc-reply-text">{reply.text}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DiscussionPage() {
  const studentName = useSelector((state) => state.session.studentName) || "You";

  const [channel, setChannel] = useState("main"); // 'main' | 'talkback'
  const [route, setRoute] = useState("main"); // composer's routing switch
  const [mainThreads, setMainThreads] = useState(MAIN_SEED);
  const [talkbackThreads, setTalkbackThreads] = useState(TALKBACK_SEED);
  const [draft, setDraft] = useState("");

  const isTalkback = channel === "talkback";
  const threads = isTalkback ? talkbackThreads : mainThreads;

  const selectChannel = (next) => {
    setChannel(next);
    // Keep the composer's routing switch in sync with the tab you're
    // viewing, same as the original mockup.
    setRoute(next);
  };

  const toggleRoute = () => setRoute((r) => (r === "main" ? "talkback" : "main"));

  const handleSend = () => {
    const text = draft.trim();
    if (!text) return;

    const newThread = {
      id: `local-${Date.now()}`,
      initials: initialsOf(studentName),
      name: studentName,
      time: "Just now",
      tag: "Compressor Studio",
      question: text,
      private: route === "talkback",
      replies: [],
    };

    if (route === "talkback") {
      setTalkbackThreads((prev) => [newThread, ...prev]);
      setChannel("talkback");
    } else {
      setMainThreads((prev) => [newThread, ...prev]);
      setChannel("main");
    }
    setDraft("");
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
          {threads.length === 0 ? (
            <div className="disc-empty">
              <h3>No questions yet</h3>
              <p>Be the first to ask something about this station.</p>
            </div>
          ) : (
            threads.map((thread) => <ThreadCard key={thread.id} thread={thread} />)
          )}
        </div>

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
            <button className="disc-send-btn" onClick={handleSend}>
              {route === "talkback" ? "Send on Talkback" : "Post to Main Bus"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DiscussionPage;
