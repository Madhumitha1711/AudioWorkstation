import { useCallback, useEffect, useRef, useState } from "react";
import { parseHeader, fmtRate } from "../audio/audioFileHeader";

const AudioCtx =
  typeof window !== "undefined"
    ? window.AudioContext || window.webkitAudioContext
    : null;

async function probeDeviceRate() {
  if (!AudioCtx) return null;
  const c = new AudioCtx();
  const info = { sampleRate: c.sampleRate, baseLatency: c.baseLatency };
  await c.close();
  return info;
}

function fmtTime(s) {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function AudioFormatTester() {
  const ctxRef = useRef(null);
  const bufferRef = useRef(null);
  const sourceRef = useRef(null);
  const startedAtRef = useRef(0);
  const offsetRef = useRef(0);
  const rafRef = useRef(0);

  const [status, setStatus] = useState("empty");
  const [errorMsg, setErrorMsg] = useState("");
  const [fileInfo, setFileInfo] = useState(null);
  const [source, setSource] = useState(null);
  const [engine, setEngine] = useState(null);
  const [device, setDevice] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  const refreshDevice = useCallback(async () => {
    try {
      setDevice(await probeDeviceRate());
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    probeDeviceRate()
      .then((d) => alive && setDevice(d))
      .catch(console.error);
    const md = navigator.mediaDevices;
    md?.addEventListener?.("devicechange", refreshDevice);
    return () => {
      alive = false;
      md?.removeEventListener?.("devicechange", refreshDevice);
    };
  }, [refreshDevice]);

  const stopSource = () => {
    if (sourceRef.current) {
      sourceRef.current.onended = null;
      try {
        sourceRef.current.stop();
      } catch {
      }
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    cancelAnimationFrame(rafRef.current);
  };

  useEffect(
    () => () => {
      stopSource();
      ctxRef.current?.close();
    },
    [],
  );

  const tick = () => {
    const ctx = ctxRef.current;
    if (!ctx || !sourceRef.current) return;
    setPosition(offsetRef.current + (ctx.currentTime - startedAtRef.current));
    rafRef.current = requestAnimationFrame(tick);
  };

  const play = async (from = offsetRef.current) => {
    const ctx = ctxRef.current;
    const buffer = bufferRef.current;
    if (!ctx || !buffer) return;
    if (ctx.state === "suspended") await ctx.resume();
    stopSource();

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);

    const start = Math.min(Math.max(from, 0), buffer.duration);
    src.start(0, start);
    src.onended = () => {
      if (sourceRef.current !== src) return;
      sourceRef.current = null;
      cancelAnimationFrame(rafRef.current);
      offsetRef.current = 0;
      setPosition(0);
      setPlaying(false);
    };
    sourceRef.current = src;
    offsetRef.current = start;
    startedAtRef.current = ctx.currentTime;
    setPlaying(true);
    refreshDevice();
    rafRef.current = requestAnimationFrame(tick);
  };

  const pause = () => {
    const ctx = ctxRef.current;
    if (!ctx || !sourceRef.current) return;
    offsetRef.current += ctx.currentTime - startedAtRef.current;
    stopSource();
    setPosition(offsetRef.current);
    setPlaying(false);
  };

  const stop = () => {
    stopSource();
    offsetRef.current = 0;
    setPosition(0);
    setPlaying(false);
  };

  const seek = (t) => {
    offsetRef.current = t;
    setPosition(t);
    if (playing) play(t);
  };

  const handleFile = async (file) => {
    if (!file) return;
    stop();
    await ctxRef.current?.close();
    ctxRef.current = null;
    bufferRef.current = null;
    setSource(null);
    setEngine(null);
    setErrorMsg("");
    setStatus("loading");
    setFileInfo({ name: file.name, sizeMB: file.size / (1024 * 1024), type: file.type });

    try {
      const raw = await file.arrayBuffer();
      const header = parseHeader(raw);

      const dev = await probeDeviceRate();
      setDevice(dev);

      let ctx;
      try {
        ctx = header?.sampleRate ? new AudioCtx({ sampleRate: header.sampleRate }) : new AudioCtx();
      } catch {
        ctx = new AudioCtx();
      }
      ctxRef.current = ctx;

      const buffer = await ctx.decodeAudioData(raw);
      bufferRef.current = buffer;

      setSource(header);
      setEngine({
        sampleRate: ctx.sampleRate,
        duration: buffer.duration,
      });
      setStatus("ready");
    } catch (e) {
      console.error(e);
      setErrorMsg(
        `The browser couldn't decode this file (${e.message || e}). Chrome/Firefox don't decode AIFF or ALAC — try Safari or a WAV/FLAC.`,
      );
      setStatus("error");
    }
  };

  const inRate = source?.sampleRate ?? null;
  const ctxRate = engine?.sampleRate ?? null;
  const devRate = device?.sampleRate ?? null;
  const playedRate = ctxRate && devRate ? devRate : ctxRate;

  let rateVerdict = null;
  const bottleneck = ctxRate && devRate ? Math.min(ctxRate, devRate) : playedRate;
  if (inRate && playedRate) {
    if (bottleneck < inRate) {
      const where = ctxRate < inRate ? "by the browser when decoding" : "by the OS / output device";
      rateVerdict = { tone: "bad", text: `Downsampled ${fmtRate(inRate)} → ${fmtRate(bottleneck)} ${where}` };
    } else if (playedRate > inRate) {
      rateVerdict = { tone: "warn", text: `Upsampled ${fmtRate(inRate)} → ${fmtRate(playedRate)} to match the output device` };
    } else {
      rateVerdict = { tone: "good", text: `Native ${fmtRate(inRate)} end to end — no resampling` };
    }
  }

  const duration = engine?.duration ?? 0;

  return (
    <div
      style={pageStyle}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFile(e.dataTransfer.files?.[0]);
      }}
    >
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
          <h1 style={{ fontSize: "var(--fs-2xl)", fontWeight: 700, margin: 0 }}>Audio Sample Rate &amp; Bit Depth Tester</h1>
          <span style={{ fontSize: "var(--fs-sm)", opacity: 0.55 }}>dev tool · /audio-test</span>
        </div>

        <div
          style={{
            ...dropZoneStyle,
            borderColor: dragOver ? "#16a34a" : "rgba(0,0,0,0.18)",
          }}
        >
          <label style={uploadButtonStyle}>
            Upload audio
            <input
              type="file"
              accept="audio/*,.wav,.aif,.aiff,.aifc,.flac,.m4a,.mp3,.ogg,.opus"
              onChange={(e) => handleFile(e.target.files?.[0])}
              style={{ display: "none" }}
            />
          </label>
          <span style={{ fontSize: "var(--fs-sm)", opacity: 0.6 }}>
            or drag &amp; drop · WAV / RF64 / BWF, AIFF, FLAC, M4A (ALAC/AAC), MP3, Ogg
          </span>
          {fileInfo && (
            <span style={{ fontSize: "var(--fs-sm)", marginLeft: "auto" }}>
              {fileInfo.name} · {fileInfo.sizeMB.toFixed(1)} MB
            </span>
          )}
        </div>

        {status === "loading" && <div style={{ marginTop: 18, opacity: 0.7 }}>Reading &amp; decoding…</div>}
        {status === "error" && <div style={{ marginTop: 18, color: "#dc2626" }}>{errorMsg}</div>}

        {status === "ready" && (
          <>
            <div style={{ ...cardStyle, marginTop: 18, display: "flex", alignItems: "center", gap: 12 }}>
              <button style={btnStyle} onClick={() => (playing ? pause() : play())}>
                {playing ? "Pause" : "Play"}
              </button>
              <button style={{ ...btnStyle, background: "#e5e7eb", color: "#1f2328" }} onClick={stop}>
                Stop
              </button>
              <span style={monoSmall}>{fmtTime(position)}</span>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.01}
                value={Math.min(position, duration)}
                onChange={(e) => seek(Number(e.target.value))}
                style={{ flex: 1, accentColor: "#16a34a" }}
              />
              <span style={monoSmall}>{fmtTime(duration)}</span>
            </div>

            <div style={{ ...cardStyle, marginTop: 12, borderColor: playing ? "#16a34a" : "rgba(0,0,0,0.1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--fs-sm)", opacity: 0.8 }}>
                {playing && (
                  <>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "#16a34a",
                        boxShadow: "0 0 6px rgba(22,163,74,0.6)",
                      }}
                    />
                    NOW PLAYING
                  </>
                )}
                <button style={{ ...miniBtn, marginLeft: "auto" }} onClick={refreshDevice}>
                  Re-check device
                </button>
              </div>
              <div style={headlineRow}>
                <Headline label="Input sample rate" value={fmtRate(inRate)} />
                <Headline label="Input bit depth" value={source?.bitDepth ? `${source.bitDepth}-bit` : "n/a"} />
                <Arrow />
                <Headline
                  label="Played sample rate"
                  value={fmtRate(playedRate)}
                  sub={bottleneck && bottleneck !== playedRate ? `content limited to ${fmtRate(bottleneck)}` : "output device rate"}
                  tone={rateVerdict?.tone}
                />
              </div>
            </div>
          </>
        )}

        {status === "empty" && (
          <div style={{ marginTop: 40, textAlign: "center", opacity: 0.5, fontSize: "var(--fs-base)" }}>
            Output device currently running at{" "}
            <span style={{ fontWeight: 600 }}>
              {fmtRate(devRate)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

const toneColor = { good: "#15803d", warn: "#b45309", bad: "#dc2626", neutral: "#6b7280" };

function Headline({ label, value, sub, tone }) {
  return (
    <div style={{ minWidth: 130 }}>
      <div style={{ fontSize: "var(--fs-xs)", opacity: 0.6, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div
        style={{
          fontSize: "var(--fs-3xl)",
          fontWeight: 700,
          color: tone ? toneColor[tone] : "#1f2328",
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: "var(--fs-2xs)", opacity: 0.5 }}>{sub}</div>}
    </div>
  );
}

function Arrow() {
  return <div style={{ fontSize: "var(--fs-2xl)", opacity: 0.4, alignSelf: "center" }}>→</div>;
}

const pageStyle = {
  width: "100%",
  height: "100%",
  overflow: "auto",
  background: "#f6f7f9",
  color: "#1f2328",
  fontFamily: "var(--font-sans)",
  padding: "24px 16px 48px",
  boxSizing: "border-box",
};

const cardStyle = {
  background: "#fff",
  border: "1px solid rgba(0,0,0,0.1)",
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  borderRadius: 10,
  padding: "14px 16px",
};

const dropZoneStyle = {
  ...cardStyle,
  display: "flex",
  alignItems: "center",
  gap: 14,
  flexWrap: "wrap",
  border: "1px dashed rgba(0,0,0,0.18)",
};

const headlineRow = {
  display: "flex",
  flexWrap: "wrap",
  gap: 20,
  margin: "10px 0 4px",
};

const uploadButtonStyle = {
  display: "inline-block",
  padding: "9px 14px",
  background: "#16a34a",
  color: "#fff",
  borderRadius: 6,
  fontWeight: 700,
  fontSize: "var(--fs-md)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const btnStyle = {
  padding: "8px 16px",
  background: "#16a34a",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  fontWeight: 700,
  fontSize: "var(--fs-md)",
  cursor: "pointer",
  fontFamily: "inherit",
  minWidth: 70,
};

const miniBtn = {
  padding: "3px 8px",
  background: "transparent",
  color: "#1f2328",
  border: "1px solid rgba(0,0,0,0.2)",
  borderRadius: 5,
  fontSize: "var(--fs-xs)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const monoSmall = { fontFamily: "var(--font-mono)", fontSize: "var(--fs-sm)", minWidth: 40, textAlign: "center" };

export default AudioFormatTester;
