import { useCallback, useEffect, useRef, useState } from "react";
import { getAudioDeviceFormat } from "../api/audioDevice";

// Standalone audio format / playback-path tester — not part of the student flow.
//
// Upload an audio file and this page shows, side by side:
//   1. SOURCE  — the file's real sample rate + bit depth, read straight from
//                its header (WAV/RF64/BWF, AIFF/AIFC, FLAC, MP3, Ogg, M4A/ALAC),
//                not from the browser decoder (which always hands back float32
//                at the AudioContext's rate, so it can't tell you either).
//   2. ENGINE  — the Web Audio context we play through. We open it AT the
//                file's own rate (new AudioContext({ sampleRate })) so
//                decodeAudioData does NOT resample; the page verifies that by
//                comparing decoded samples against the raw PCM bytes.
//   3. DEVICE  — the rate the OS output device is actually running at (a
//                default AudioContext reports the hardware rate). If the
//                device runs slower than the file (e.g. 96 kHz file, 48 kHz
//                output in Audio MIDI Setup) the browser/OS downsamples at the
//                output and we flag it.
//
// Bit depth: Web Audio always renders in 32-bit float, and browsers do not
// expose the output device's format (16/24/32-bit). So the device bit depth
// is read from the OS (CoreAudio, macOS) by studio-backend's GET /audio-device
// (see src/api/audioDevice.js) — only meaningful when the backend runs locally
// on the same Mac, and disabled by default in production deployments.

const AudioCtx =
  typeof window !== "undefined"
    ? window.AudioContext || window.webkitAudioContext
    : null;

// ─── Header parsing ────────────────────────────────────────────────────────

function readStr(dv, off, len) {
  let s = "";
  for (let i = 0; i < len && off + i < dv.byteLength; i++) {
    s += String.fromCharCode(dv.getUint8(off + i));
  }
  return s;
}

function findBytes(u8, pattern, from = 0, to = u8.length) {
  const codes = [...pattern].map((c) => c.charCodeAt(0));
  const end = Math.min(to, u8.length) - codes.length;
  outer: for (let i = from; i <= end; i++) {
    for (let j = 0; j < codes.length; j++) {
      if (u8[i + j] !== codes[j]) continue outer;
    }
    return i;
  }
  return -1;
}

// ID3v2 tag in front of MP3 / FLAC files — returns offset of real data.
function skipId3(dv) {
  if (dv.byteLength < 10 || readStr(dv, 0, 3) !== "ID3") return 0;
  const size =
    ((dv.getUint8(6) & 0x7f) << 21) |
    ((dv.getUint8(7) & 0x7f) << 14) |
    ((dv.getUint8(8) & 0x7f) << 7) |
    (dv.getUint8(9) & 0x7f);
  const footer = dv.getUint8(5) & 0x10 ? 10 : 0;
  return 10 + size + footer;
}

// 80-bit IEEE extended float (AIFF COMM sample rate).
function readExtended(dv, off) {
  const expon = dv.getUint16(off) & 0x7fff;
  const hi = dv.getUint32(off + 2);
  const lo = dv.getUint32(off + 6);
  if (expon === 0 && hi === 0 && lo === 0) return 0;
  return Math.round((hi * 2 ** 32 + lo) * 2 ** (expon - 16383 - 63));
}

function parseWav(dv) {
  const riff = readStr(dv, 0, 4);
  if (!["RIFF", "RF64", "BW64"].includes(riff) || readStr(dv, 8, 4) !== "WAVE")
    return null;

  let off = 12;
  let fmt = null;
  let ds64DataSize = null;

  while (off + 8 <= dv.byteLength) {
    const id = readStr(dv, off, 4);
    let size = dv.getUint32(off + 4, true);
    const body = off + 8;

    if (id === "ds64" && body + 16 <= dv.byteLength) {
      ds64DataSize = Number(dv.getBigUint64(body + 8, true));
    } else if (id === "fmt ") {
      let code = dv.getUint16(body, true);
      const bits = dv.getUint16(body + 14, true);
      let validBits = bits;
      // WAVE_FORMAT_EXTENSIBLE: real format lives in the SubFormat GUID,
      // real resolution in wValidBitsPerSample.
      if (code === 0xfffe && size >= 40) {
        validBits = dv.getUint16(body + 18, true) || bits;
        code = dv.getUint16(body + 24, true);
      }
      fmt = {
        code,
        channels: dv.getUint16(body + 2, true),
        sampleRate: dv.getUint32(body + 4, true),
        bits,
        validBits,
      };
    } else if (id === "data") {
      // RF64: real data size lives in ds64 — needed to step past the chunk.
      if (size === 0xffffffff && ds64DataSize != null) size = ds64DataSize;
    }
    off = body + size + (size & 1);
  }

  if (!fmt) return null;

  const isFloat = fmt.code === 3;
  const isPcm = fmt.code === 1 || isFloat;
  let codec;
  if (fmt.code === 1) codec = "PCM (integer)";
  else if (isFloat) codec = "PCM (IEEE float)";
  else if (fmt.code === 6) codec = "A-law";
  else if (fmt.code === 7) codec = "µ-law";
  else codec = `WAV codec 0x${fmt.code.toString(16)}`;

  return {
    container: riff === "RIFF" ? "WAV" : `WAV (${riff})`,
    codec,
    sampleRate: fmt.sampleRate,
    channels: fmt.channels,
    bitDepth: isPcm ? fmt.validBits : fmt.bits,
    bitDepthLabel: isPcm
      ? `${fmt.validBits}-bit ${isFloat ? "float" : "integer"}${
          fmt.validBits !== fmt.bits ? ` (in ${fmt.bits}-bit container)` : ""
        }`
      : `${fmt.bits}-bit ${codec}`,
    isFloat,
    lossless: true,
  };
}

function parseAiff(dv) {
  if (readStr(dv, 0, 4) !== "FORM") return null;
  const type = readStr(dv, 8, 4);
  if (type !== "AIFF" && type !== "AIFC") return null;

  let off = 12;
  let comm = null;
  while (off + 8 <= dv.byteLength) {
    const id = readStr(dv, off, 4);
    const size = dv.getUint32(off + 4);
    const body = off + 8;
    if (id === "COMM") {
      comm = {
        channels: dv.getUint16(body),
        sampleSize: dv.getInt16(body + 6),
        sampleRate: readExtended(dv, body + 8),
        compression: type === "AIFC" && size >= 22 ? readStr(dv, body + 18, 4) : "NONE",
      };
    }
    off = body + size + (size & 1);
  }
  if (!comm) return null;

  const c = comm.compression.toLowerCase();
  let isFloat = false;
  let bits = comm.sampleSize;
  let isPcm = true;
  let littleEndian = false;
  if (c === "fl32") { isFloat = true; bits = 32; }
  else if (c === "fl64") { isFloat = true; bits = 64; }
  else if (c === "sowt") littleEndian = true;
  else if (c === "in24") bits = 24;
  else if (c === "in32") bits = 32;
  else if (c !== "none" && c !== "twos") isPcm = false;

  return {
    container: type,
    codec: isPcm ? `PCM (${isFloat ? "float" : "integer"}${littleEndian ? ", little-endian" : ""})` : comm.compression,
    sampleRate: comm.sampleRate,
    channels: comm.channels,
    bitDepth: bits,
    bitDepthLabel: `${bits}-bit ${isFloat ? "float" : "integer"}`,
    isFloat,
    lossless: isPcm,
  };
}

function parseFlac(dv) {
  const start = skipId3(dv);
  if (readStr(dv, start, 4) !== "fLaC") return null;
  const b = start + 8 + 10; // skip "fLaC", block header, min/max block+frame sizes
  const u = (i) => dv.getUint8(b + i);
  const sampleRate = (u(0) << 12) | (u(1) << 4) | (u(2) >> 4);
  const channels = ((u(2) >> 1) & 7) + 1;
  const bits = (((u(2) & 1) << 4) | (u(3) >> 4)) + 1;
  return {
    container: "FLAC",
    codec: "FLAC (lossless)",
    sampleRate,
    channels,
    bitDepth: bits,
    bitDepthLabel: `${bits}-bit integer`,
    isFloat: false,
    lossless: true,
  };
}

function parseMp3(dv) {
  const start = skipId3(dv);
  const end = Math.min(dv.byteLength - 4, start + 65536);
  const rates = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  for (let i = start; i < end; i++) {
    const b1 = dv.getUint8(i + 1);
    if (dv.getUint8(i) !== 0xff || (b1 & 0xe0) !== 0xe0) continue;
    const ver = (b1 >> 3) & 3;
    const layer = (b1 >> 1) & 3;
    const b2 = dv.getUint8(i + 2);
    const srIdx = (b2 >> 2) & 3;
    const brIdx = b2 >> 4;
    if (ver === 1 || layer === 0 || srIdx === 3 || brIdx === 0xf) continue;
    return {
      container: "MPEG audio",
      codec: `MP${4 - layer} (lossy)`,
      sampleRate: rates[ver][srIdx],
      channels: dv.getUint8(i + 3) >> 6 === 3 ? 1 : 2,
      bitDepth: null,
      bitDepthLabel: "n/a — lossy codec (no fixed bit depth)",
      isFloat: false,
      lossless: false,
    };
  }
  return null;
}

function parseOgg(dv, u8) {
  if (readStr(dv, 0, 4) !== "OggS") return null;
  const vorbis = findBytes(u8, "\x01vorbis", 0, 4096);
  if (vorbis >= 0) {
    return {
      container: "Ogg",
      codec: "Vorbis (lossy)",
      sampleRate: dv.getUint32(vorbis + 12, true),
      channels: dv.getUint8(vorbis + 11),
      bitDepth: null,
      bitDepthLabel: "n/a — lossy codec (no fixed bit depth)",
      isFloat: false,
      lossless: false,
    };
  }
  const opus = findBytes(u8, "OpusHead", 0, 4096);
  if (opus >= 0) {
    const inputRate = dv.getUint32(opus + 12, true);
    return {
      container: "Ogg",
      codec: "Opus (lossy)",
      // Opus always decodes at 48 kHz regardless of the original input rate.
      sampleRate: 48000,
      note: inputRate ? `Opus always decodes at 48 kHz (encoder input was ${fmtRate(inputRate)})` : "Opus always decodes at 48 kHz",
      channels: dv.getUint8(opus + 9),
      bitDepth: null,
      bitDepthLabel: "n/a — lossy codec (no fixed bit depth)",
      isFloat: false,
      lossless: false,
    };
  }
  return null;
}

function parseMp4(dv, u8) {
  if (readStr(dv, 4, 4) !== "ftyp") return null;
  const alac = findBytes(u8, "alac");
  if (alac >= 0) {
    // Sample entry 'alac' contains a nested 'alac' box with the real config
    // (the sample entry's own 16.16 rate field overflows above 65 kHz).
    const inner = findBytes(u8, "alac", alac + 4);
    if (inner >= 0 && inner + 32 <= u8.length) {
      const cfg = inner + 8;
      const bits = dv.getUint8(cfg + 5);
      return {
        container: "MP4 / M4A",
        codec: "Apple Lossless (ALAC)",
        sampleRate: dv.getUint32(cfg + 20),
        channels: dv.getUint8(cfg + 9),
        bitDepth: bits,
        bitDepthLabel: `${bits}-bit integer`,
        isFloat: false,
        lossless: true,
      };
    }
  }
  const mp4a = findBytes(u8, "mp4a");
  if (mp4a >= 0 && mp4a + 32 <= u8.length) {
    return {
      container: "MP4 / M4A",
      codec: "AAC (lossy)",
      sampleRate: dv.getUint16(mp4a + 28),
      channels: dv.getUint16(mp4a + 20),
      bitDepth: null,
      bitDepthLabel: "n/a — lossy codec (no fixed bit depth)",
      isFloat: false,
      lossless: false,
    };
  }
  return null;
}

function parseHeader(arrayBuffer) {
  const dv = new DataView(arrayBuffer);
  const u8 = new Uint8Array(arrayBuffer);
  const parsers = [
    () => parseWav(dv),
    () => parseAiff(dv),
    () => parseFlac(dv),
    () => parseOgg(dv, u8),
    () => parseMp4(dv, u8),
    () => parseMp3(dv),
  ];
  for (const p of parsers) {
    try {
      const r = p();
      if (r && r.sampleRate > 0) return r;
    } catch {
      // malformed header for this format — try the next parser
    }
  }
  return null;
}

// The device's hardware format (incl. bit depth) comes from the OS via
// studio-backend's GET /audio-device — browsers never expose bit depth.
// Returns { ok:false, error } when the backend is unreachable, the endpoint
// is disabled (404 in production), or the lookup fails.
async function fetchOsFormat() {
  try {
    return await getAudioDeviceFormat();
  } catch (e) {
    return {
      ok: false,
      error: /404|not found/i.test(e.message)
        ? "OS lookup is disabled on this backend (set AUDIO_DEVICE_INFO_ENABLED=true)"
        : e.message,
    };
  }
}

async function probeDeviceRate() {
  if (!AudioCtx) return null;
  const c = new AudioCtx();
  const info = { sampleRate: c.sampleRate, baseLatency: c.baseLatency };
  await c.close();
  info.os = await fetchOsFormat();
  return info;
}

// ─── Formatting ────────────────────────────────────────────────────────────

function fmtRate(hz) {
  if (!hz) return "—";
  const k = hz / 1000;
  return `${Number.isInteger(k) ? k : k.toFixed(1)} kHz`;
}

function fmtTime(s) {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ─── Component ─────────────────────────────────────────────────────────────

function AudioFormatTester() {
  const ctxRef = useRef(null);
  const bufferRef = useRef(null);
  const sourceRef = useRef(null);
  const startedAtRef = useRef(0); // ctx.currentTime when playback (re)started
  const offsetRef = useRef(0); // seconds into the buffer at that moment
  const rafRef = useRef(0);

  const [status, setStatus] = useState("empty"); // empty | loading | ready | error
  const [errorMsg, setErrorMsg] = useState("");
  const [fileInfo, setFileInfo] = useState(null);
  const [source, setSource] = useState(null); // parsed header
  const [engine, setEngine] = useState(null); // context + decode results
  const [device, setDevice] = useState(null); // hardware output probe
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  // OS hardware format of the default output device (bit depth the machine
  // actually plays at), or null if the OS lookup is unavailable.
  const os = device?.os;
  const deviceFmt =
    os?.ok && os.bitDepth
      ? { bits: os.bitDepth, float: os.isFloat, label: `${os.bitDepth}-bit ${os.isFloat ? "float" : "integer"}` }
      : null;

  const refreshDevice = useCallback(async () => {
    try {
      setDevice(await probeDeviceRate());
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Probe the output device on mount and whenever devices change
  // (headphones plugged in, interface switched, etc.).
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
        // already stopped
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

    // Unity-gain, direct-to-destination path: nothing between the buffer
    // and the output that could alter samples.
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
    // Re-read the device rate at play time — the OS output may have changed.
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

      // Open the context at the FILE's rate so decoding doesn't resample.
      // Falls back to the device default rate if the browser refuses it
      // (the played-rate readout then shows the downsample).
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

  // ── Derived verdicts ────────────────────────────────────────────────────
  const inRate = source?.sampleRate ?? null;
  const ctxRate = engine?.sampleRate ?? null;
  const devRate = device?.sampleRate ?? null;
  const playedRate = ctxRate && devRate ? devRate : ctxRate;

  let rateVerdict = null;
  // Lowest rate anywhere in the chain = the real bandwidth that reaches you.
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

  let depthVerdict = null;
  if (source) {
    const b = source.bitDepth;
    if (b == null) depthVerdict = { tone: "neutral", text: "Lossy source — decoded to 32-bit float" };
    else if (source.isFloat && b > 32) depthVerdict = { tone: "bad", text: `${b}-bit float → reduced to 32-bit float by Web Audio` };
    else if (!source.isFloat && b > 24) depthVerdict = { tone: "warn", text: `${b}-bit integer → ~24-bit precision (float32 mantissa)` };
    else depthVerdict = { tone: "good", text: `${b}-bit ${source.isFloat ? "float" : "integer"} carried losslessly in 32-bit float` };

    // Final hop: engine float32 → device format. Only judgeable once the
    // user has told us the device format.
    if (deviceFmt && b != null && !deviceFmt.float && deviceFmt.bits < Math.min(b, 24)) {
      depthVerdict = {
        tone: "bad",
        text: `Reduced ${b}-bit → ${deviceFmt.bits}-bit by the OS output device`,
      };
    } else if (deviceFmt && depthVerdict.tone === "good") {
      depthVerdict = { tone: "good", text: `${b}-bit preserved through to the ${deviceFmt.label} device` };
    }
  }

  const playedBits = deviceFmt ? deviceFmt.label : "unknown";
  const playedBitsSub = deviceFmt
    ? `OS output device${os.deviceName ? ` · ${os.deviceName}` : ""}`
    : "OS format unavailable";

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
            {/* Transport */}
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

            {/* Now-playing headline */}
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
                <Headline
                  label="Played bit depth"
                  value={playedBits}
                  sub={playedBitsSub}
                  tone={deviceFmt ? depthVerdict?.tone : "neutral"}
                />
              </div>
              {os && !os.ok && <Note warn>OS bit depth unavailable: {os.error}</Note>}
            </div>
          </>
        )}

        {status === "empty" && (
          <div style={{ marginTop: 40, textAlign: "center", opacity: 0.5, fontSize: "var(--fs-base)" }}>
            Output device currently running at{" "}
            <span style={{ fontWeight: 600 }}>
              {fmtRate(devRate)}
              {deviceFmt && ` · ${deviceFmt.label}`}
            </span>
            {os?.ok && os.deviceName && <div style={{ fontSize: "var(--fs-sm)", marginTop: 4 }}>{os.deviceName}</div>}
            {os && !os.ok && <div style={{ fontSize: "var(--fs-xs)", marginTop: 4 }}>Bit depth unavailable: {os.error}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Small presentational pieces ───────────────────────────────────────────

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

function Note({ children, warn }) {
  return (
    <div style={{ fontSize: "var(--fs-xs)", lineHeight: 1.5, marginTop: 8, opacity: warn ? 1 : 0.6, color: warn ? toneColor.warn : "#1f2328" }}>
      {children}
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

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
