import { useRef, useState, useEffect, useCallback } from 'react';

// ── Track definitions ─────────────────────────────────────────────────────────
interface TrackConfig {
  id: string;
  name: string;
  initFaderPos: number; // 0 = top (+6 dB), 1 = bottom (−30 dB)
  initPan: number;      // −100 … +100
  initMuted: boolean;
  initSoloed: boolean;
  color: string;
}

const TRACKS: TrackConfig[] = [
  { id: 'kick',  name: 'KICK',      initFaderPos: 0.17, initPan:   0, initMuted: false, initSoloed: false, color: 'var(--amber)'  },
  { id: 'snare', name: 'SNARE',     initFaderPos: 0.22, initPan:   0, initMuted: false, initSoloed: false, color: 'var(--green)'  },
  { id: 'bass',  name: 'BASS GTR',  initFaderPos: 0.28, initPan:   0, initMuted: false, initSoloed: true,  color: 'var(--blue)'   },
  { id: 'vox',   name: 'LEAD VOX',  initFaderPos: 0.13, initPan:   0, initMuted: false, initSoloed: false, color: 'var(--red)'    },
  { id: 'pad',   name: 'SYNTH PAD', initFaderPos: 0.50, initPan: -20, initMuted: false, initSoloed: false, color: 'var(--purple)' },
  { id: 'gtr',   name: 'AC. GTR',   initFaderPos: 0.35, initPan:  25, initMuted: false, initSoloed: false, color: 'var(--teal)'   },
];

// ── Fader math ────────────────────────────────────────────────────────────────
// pos 0 → +6 dB,  pos 1 → −30 dB (linear mapping)
const DB_MAX = 6;
const DB_MIN = -30;
const FADER_PX = 90;

function posToDb(pos: number): number {
  if (pos >= 0.985) return -Infinity;
  return DB_MAX + (DB_MIN - DB_MAX) * pos;
}
function posToLinear(pos: number): number {
  const db = posToDb(pos);
  return isFinite(db) ? Math.pow(10, db / 20) : 0;
}
function dbDisplay(pos: number): string {
  const db = posToDb(pos);
  if (!isFinite(db)) return '−∞';
  return (db >= 0 ? '+' : '') + db.toFixed(1);
}
function panLabel(pan: number): string {
  const p = Math.round(pan);
  if (Math.abs(p) < 3) return 'C';
  return p < 0 ? `L${Math.abs(p)}` : `R${p}`;
}
// Needle rotation: −100→−135°, 0→0°, +100→+135°
function panRotation(pan: number): string {
  return `${pan * 1.35}deg`;
}
// CSS top% for fader thumb inside FADER_PX track
function faderTop(pos: number): string { return `${pos * 100}%`; }

// ── Audio synthesis ───────────────────────────────────────────────────────────
// All tracks share a 4 s / 2-bar loop at 120 BPM
const LOOP_DUR = 4;       // seconds
const BEAT = 0.5;         // seconds per beat at 120 BPM

/** Add a sine partial into an existing mono Float32Array */
function addSine(d: Float32Array, sr: number, t0: number, freq: number, amp: number, dur: number) {
  const s0 = Math.floor(t0 * sr);
  const sN = Math.min(d.length, s0 + Math.floor(dur * sr));
  let ph = 0;
  for (let i = s0; i < sN; i++) {
    d[i] += amp * Math.sin(ph);
    ph += (2 * Math.PI * freq) / sr;
  }
}

/** Add shaped noise into a Float32Array */
function addNoise(d: Float32Array, sr: number, t0: number, amp: number, dur: number, decay: number) {
  const s0 = Math.floor(t0 * sr);
  const sN = Math.min(d.length, s0 + Math.floor(dur * sr));
  for (let i = s0; i < sN; i++) {
    const t = (i - s0) / sr;
    d[i] += amp * (Math.random() * 2 - 1) * Math.exp(-t * decay);
  }
}

function normalize(d: Float32Array, ceiling: number) {
  let pk = 0;
  for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > pk) pk = Math.abs(d[i]);
  if (pk > 0) for (let i = 0; i < d.length; i++) d[i] = (d[i] / pk) * ceiling;
}

// KICK: beat 1 & 3 of each bar (index 0, 2, 4, 6 at 120 BPM)
function makeKick(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, sr * LOOP_DUR, sr);
  const d = buf.getChannelData(0);
  for (const t0 of [0, BEAT * 2, BEAT * 4, BEAT * 6]) {
    const s0 = Math.floor(t0 * sr);
    let ph = 0;
    const dur = Math.floor(0.38 * sr);
    for (let i = 0; i < dur && s0 + i < d.length; i++) {
      const t = i / sr;
      const freq = 130 * Math.exp(-t * 22) + 48;
      const env  = Math.exp(-t * 9);
      d[s0 + i] += env * 0.85 * Math.sin(ph);
      ph += (2 * Math.PI * freq) / sr;
    }
    // transient click
    addNoise(d, sr, t0, 0.28, 0.008, 500);
    // sub body
    addSine(d, sr, t0, 50, 0.22, 0.18);
  }
  normalize(d, 0.88);
  return buf;
}

// SNARE: beat 2 & 4 of each bar
function makeSnare(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, sr * LOOP_DUR, sr);
  const d = buf.getChannelData(0);
  for (const t0 of [BEAT, BEAT * 3, BEAT * 5, BEAT * 7]) {
    addNoise(d, sr, t0, 0.80, 0.22, 18);
    addSine (d, sr, t0, 185, 0.28, 0.10);
    addSine (d, sr, t0, 290, 0.14, 0.07);
    addNoise(d, sr, t0, 0.35, 0.005, 900); // rim click
  }
  normalize(d, 0.78);
  return buf;
}

// BASS GUITAR: E1–A1–B1 walking line across 8 quarter-note slots
function makeBass(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, sr * LOOP_DUR, sr);
  const d = buf.getChannelData(0);
  // E1 A1 A1 B1 E1 A1 B1 A1
  const notes = [41.2, 55.0, 55.0, 61.7, 41.2, 55.0, 61.7, 55.0];
  for (let b = 0; b < 8; b++) {
    const t0   = b * BEAT;
    const freq = notes[b];
    const dur  = BEAT * 0.88;
    const s0   = Math.floor(t0 * sr);
    const sN   = Math.min(d.length, s0 + Math.floor(dur * sr));
    let ph = 0;
    for (let i = s0; i < sN; i++) {
      const t = (i - s0) / sr;
      const atk = Math.min(1, t / 0.018);
      const rel = t > dur - 0.05 ? Math.max(0, (dur - t) / 0.05) : 1;
      let sig = 0;
      const maxH = Math.min(10, Math.floor((sr / 2) / freq));
      for (let h = 1; h <= maxH; h++) sig += (1 / h) * Math.sin(ph * h);
      d[i] += atk * rel * 0.52 * sig;
      ph += (2 * Math.PI * freq) / sr;
    }
  }
  // crude LP (moving average ×3)
  for (let i = 2; i < d.length; i++) d[i] = (d[i] + d[i - 1] + d[i - 2]) / 3;
  normalize(d, 0.82);
  return buf;
}

// LEAD VOX: G4-B4-D5 melodic phrase
function makeVox(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, sr * LOOP_DUR, sr);
  const d = buf.getChannelData(0);
  const melody = [392, 494, 587, 494, 440, 392, 494, 392];
  for (let b = 0; b < 8; b++) {
    const t0   = b * BEAT;
    const freq = melody[b];
    const dur  = BEAT * 0.80;
    const s0   = Math.floor(t0 * sr);
    const sN   = Math.min(d.length, s0 + Math.floor(dur * sr));
    let ph = 0;
    for (let i = s0; i < sN; i++) {
      const t   = (i - s0) / sr;
      const atk = Math.min(1, t / 0.035);
      const rel = t > dur - 0.06 ? Math.max(0, (dur - t) / 0.06) : 1;
      let sig = 0;
      const maxH = Math.min(9, Math.floor((sr / 2) / freq));
      for (let h = 1; h <= maxH; h++) sig += (1 / Math.pow(h, 1.3)) * Math.sin(ph * h);
      // slight vibrato
      const vib = 1 + 0.003 * Math.sin(2 * Math.PI * 5.2 * t);
      d[i] += atk * rel * 0.38 * sig * vib;
      ph += (2 * Math.PI * freq) / sr;
    }
  }
  normalize(d, 0.75);
  return buf;
}

// SYNTH PAD: sustained G-major chord with detuned unison for width
function makePad(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, sr * LOOP_DUR, sr);
  const d = buf.getChannelData(0);
  const chord = [196, 247, 294, 392]; // G3 B3 D4 G4
  const detune = [-6, +4, -3, +7]; // cents per voice
  const atkSmp = Math.floor(0.55 * sr);
  for (const [ci, f0] of chord.entries()) {
    const freq = f0 * Math.pow(2, detune[ci] / 1200);
    let ph = ci * 0.8; // stagger phases
    for (let i = 0; i < d.length; i++) {
      const atk = Math.min(1, i / atkSmp);
      d[i] += atk * 0.17 * Math.sin(ph);
      ph += (2 * Math.PI * freq) / sr;
    }
    // second detuned layer
    const freq2 = f0 * Math.pow(2, -detune[ci] / 1200);
    let ph2 = ci * 1.3;
    for (let i = 0; i < d.length; i++) {
      const atk = Math.min(1, i / atkSmp);
      d[i] += atk * 0.12 * Math.sin(ph2);
      ph2 += (2 * Math.PI * freq2) / sr;
    }
  }
  normalize(d, 0.70);
  return buf;
}

// ACOUSTIC GUITAR: G-major chord strums on off-beats with Karplus-ish pluck
function makeGtr(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, sr * LOOP_DUR, sr);
  const d = buf.getChannelData(0);
  // G2 B2 D3 G3 B3 (voicing bottom to top)
  const strings = [98, 123, 147, 196, 247];
  // Strum on beats 1.5, 2.5, 3.5, 4.5 (off-beats)
  for (const t0 of [0.25, 0.75, BEAT * 4 + 0.25, BEAT * 4 + 0.75]) {
    for (const [si, freq] of strings.entries()) {
      const delay = si * 0.007;
      const s0    = Math.floor((t0 + delay) * sr);
      const sN    = Math.min(d.length, s0 + Math.floor(0.40 * sr));
      let ph = Math.random() * Math.PI * 2;
      for (let i = s0; i < sN; i++) {
        const t   = (i - s0) / sr;
        const env = Math.exp(-t * 10);
        let sig = 0;
        const maxH = Math.min(7, Math.floor((sr / 2) / freq));
        for (let h = 1; h <= maxH; h++) sig += (1 / Math.pow(h, 1.9)) * Math.sin(ph * h);
        d[i] += env * 0.32 * sig;
        ph += (2 * Math.PI * freq) / sr;
      }
    }
  }
  normalize(d, 0.72);
  return buf;
}

const MAKERS = [makeKick, makeSnare, makeBass, makeVox, makePad, makeGtr];

// ── Analyser RMS helper ───────────────────────────────────────────────────────
function rmsFromAnalyser(analyser: AnalyserNode): number {
  const data = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / data.length);
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Chapter3() {
  const [faderPos,    setFaderPos]    = useState(() => TRACKS.map(t => t.initFaderPos));
  const [panValues,   setPanValues]   = useState(() => TRACKS.map(t => t.initPan));
  const [muted,       setMuted]       = useState(() => TRACKS.map(t => t.initMuted));
  const [soloed,      setSoloed]      = useState(() => TRACKS.map(t => t.initSoloed));
  const [selTrack,    setSelTrack]    = useState(2);           // BASS GTR pre-selected
  const [masterPos,   setMasterPos]   = useState(0.28);
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [timeStr,     setTimeStr]     = useState('00:00:00:00');
  const [lufsStr,     setLufsStr]     = useState('−8');
  const [masterFill,  setMasterFill]  = useState<[number, number]>([0.72, 0.65]);
  const [trackFill,   setTrackFill]   = useState<number[]>(TRACKS.map(() => 0));
  const [taskDone,    setTaskDone]    = useState([false, false, false]);
  const [submitted,   setSubmitted]   = useState(false);

  // Audio refs
  const actxRef     = useRef<AudioContext | null>(null);
  const bufsRef     = useRef<(AudioBuffer | null)[]>(Array(6).fill(null));
  const gainRefs    = useRef<(GainNode | null)[]>(Array(6).fill(null));
  const panRefs     = useRef<(StereoPannerNode | null)[]>(Array(6).fill(null));
  const anlRefs     = useRef<(AnalyserNode | null)[]>(Array(6).fill(null));
  const srcRefs     = useRef<(AudioBufferSourceNode | null)[]>(Array(6).fill(null));
  const masterGRef  = useRef<GainNode | null>(null);
  const masterARef  = useRef<AnalyserNode | null>(null);
  const startACRef  = useRef(0); // audioCtx.currentTime when play started
  const startWallRef = useRef(0); // performance.now() when play started
  const animRef     = useRef(0);
  const clockRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  // Drag refs
  const fdrDrag  = useRef<{ idx: number; startY: number; startPos: number } | null>(null);
  const panDrag  = useRef<{ idx: number; startX: number; startPan: number } | null>(null);
  const mstDrag  = useRef<{ startY: number; startPos: number } | null>(null);

  // Mirrors for use inside callbacks without stale closure
  const faderRef  = useRef(faderPos);
  const panRef    = useRef(panValues);
  const mutedRef  = useRef(muted);
  const soloedRef = useRef(soloed);
  const masterRef = useRef(masterPos);
  useEffect(() => { faderRef.current  = faderPos;  }, [faderPos]);
  useEffect(() => { panRef.current    = panValues;  }, [panValues]);
  useEffect(() => { mutedRef.current  = muted;      }, [muted]);
  useEffect(() => { soloedRef.current = soloed;     }, [soloed]);
  useEffect(() => { masterRef.current = masterPos;  }, [masterPos]);

  // ── Effective mute logic (solo bus) ─────────────────────────────────────────
  const isEffMuted = useCallback((idx: number, m: boolean[], s: boolean[]) => {
    const anySolo = s.some(Boolean);
    return m[idx] || (anySolo && !s[idx]);
  }, []);

  // ── Apply track gain/pan/mute to live audio nodes ────────────────────────────
  useEffect(() => {
    const anySolo = soloed.some(Boolean);
    TRACKS.forEach((_, i) => {
      const g = gainRefs.current[i];
      const p = panRefs.current[i];
      if (!g || !p) return;
      const eff = muted[i] || (anySolo && !soloed[i]);
      g.gain.value = eff ? 0 : posToLinear(faderPos[i]);
      p.pan.value  = panValues[i] / 100;
    });
  }, [faderPos, panValues, muted, soloed]);

  // Apply master gain
  useEffect(() => {
    if (masterGRef.current) masterGRef.current.gain.value = posToLinear(masterPos);
  }, [masterPos]);

  // ── Task checking ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const panStereo = panValues[4] < -10 && panValues[5] > 10;
    const levelVox  = !muted[3] && posToDb(faderPos[3]) >= -3;
    // Rough LUFS estimate: based on mix energy
    const anySolo   = soloed.some(Boolean);
    const weights   = [0.9, 0.75, 0.85, 1.1, 0.6, 0.65]; // perceptual weight per track
    let rmsEst = 0;
    TRACKS.forEach((_, i) => {
      const eff = muted[i] || (anySolo && !soloed[i]);
      if (!eff) rmsEst += Math.pow(posToLinear(faderPos[i]) * weights[i], 2);
    });
    rmsEst = Math.sqrt(rmsEst / TRACKS.length) * posToLinear(masterPos);
    // Calibrated offset: at the default mix state this reads ~−8 LUFS (matching the design target).
    // Real LUFS requires ITU-R BS.1770 K-weighting; this is a proportional approximation.
    const lufs = rmsEst > 0 ? Math.round(20 * Math.log10(rmsEst) - 1) : -70;
    setLufsStr(lufs <= -60 ? '−∞' : `${lufs}`);
    const hitLufs = lufs <= -14;
    setTaskDone([panStereo, levelVox, hitLufs]);
  }, [faderPos, panValues, muted, soloed, masterPos]);

  // ── Build audio graph ──────────────────────────────────────────────────────────
  const buildGraph = useCallback(async () => {
    if (!actxRef.current) actxRef.current = new AudioContext();
    const ctx = actxRef.current;
    if (ctx.state === 'suspended') await ctx.resume();

    // Master chain
    const masterG = ctx.createGain();
    masterG.gain.value = posToLinear(masterRef.current);
    const masterA = ctx.createAnalyser();
    masterA.fftSize = 256;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value      = 0;
    limiter.ratio.value     = 20;
    limiter.attack.value    = 0.001;
    limiter.release.value   = 0.08;
    masterG.connect(masterA);
    masterA.connect(limiter);
    limiter.connect(ctx.destination);
    masterGRef.current = masterG;
    masterARef.current = masterA;

    const anySolo = soloedRef.current.some(Boolean);

    for (let i = 0; i < TRACKS.length; i++) {
      // Build buffer if needed
      if (!bufsRef.current[i]) bufsRef.current[i] = MAKERS[i](ctx);

      // Nodes
      const gain = ctx.createGain();
      const pan  = ctx.createStereoPanner();
      const anl  = ctx.createAnalyser();
      anl.fftSize = 256;

      const eff = mutedRef.current[i] || (anySolo && !soloedRef.current[i]);
      gain.gain.value = eff ? 0 : posToLinear(faderRef.current[i]);
      pan.pan.value   = panRef.current[i] / 100;

      gain.connect(pan);
      pan.connect(anl);
      anl.connect(masterG);

      gainRefs.current[i] = gain;
      panRefs.current[i]  = pan;
      anlRefs.current[i]  = anl;

      // Source
      const src = ctx.createBufferSource();
      src.buffer = bufsRef.current[i];
      src.loop   = true;
      src.connect(gain);
      src.start();
      srcRefs.current[i] = src;
    }
  }, []);

  // ── Meter animation loop ─────────────────────────────────────────────────────
  const startMeters = useCallback(() => {
    const tick = () => {
      // Per-track
      const fills = TRACKS.map((_, i) => {
        const anl = anlRefs.current[i];
        if (!anl) return 0;
        return Math.min(1, rmsFromAnalyser(anl) * 18);
      });
      setTrackFill(fills);

      // Master — level meters only; LUFS comes from the static fader-based estimate
      const ma = masterARef.current;
      if (ma) {
        const rms = rmsFromAnalyser(ma);
        const lv = Math.min(1, rms * 14);
        setMasterFill([lv * (0.9 + Math.random() * 0.1), lv * (0.85 + Math.random() * 0.1)]);
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  }, []);

  // ── Transport: Play ────────────────────────────────────────────────────────────
  const handlePlay = useCallback(async () => {
    if (isPlaying) return;
    await buildGraph();
    startMeters();
    startWallRef.current = performance.now();
    setIsPlaying(true);

    // Clock
    clockRef.current = setInterval(() => {
      const elap = (performance.now() - startWallRef.current) / 1000;
      const total = Math.floor(elap);
      const hh = String(Math.floor(total / 3600)).padStart(2, '0');
      const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
      const ss = String(total % 60).padStart(2, '0');
      const ff = String(Math.floor((elap % 1) * 30)).padStart(2, '0');
      setTimeStr(`${hh}:${mm}:${ss}:${ff}`);
    }, 33);
  }, [isPlaying, buildGraph, startMeters]);

  // ── Transport: Stop ────────────────────────────────────────────────────────────
  const handleStop = useCallback(() => {
    for (let i = 0; i < TRACKS.length; i++) {
      try { srcRefs.current[i]?.stop(); } catch { /* ok */ }
      srcRefs.current[i] = null;
      gainRefs.current[i] = null;
      panRefs.current[i]  = null;
      anlRefs.current[i]  = null;
    }
    masterGRef.current = null;
    masterARef.current = null;
    actxRef.current?.close();
    actxRef.current = null;
    // buffers survive — no need to rebuild next time
    cancelAnimationFrame(animRef.current);
    if (clockRef.current) clearInterval(clockRef.current);
    setIsPlaying(false);
    setTimeStr('00:00:00:00');
    setMasterFill([0, 0]);
    setTrackFill(TRACKS.map(() => 0));
  }, []);

  // ── Reset mixer to defaults ────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    handleStop();
    setFaderPos(TRACKS.map(t => t.initFaderPos));
    setPanValues(TRACKS.map(t => t.initPan));
    setMuted(TRACKS.map(t => t.initMuted));
    setSoloed(TRACKS.map(t => t.initSoloed));
    setSelTrack(2);
    setMasterPos(0.28);
    setSubmitted(false);
    setTaskDone([false, false, false]);
  }, [handleStop]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────────────
  useEffect(() => () => { handleStop(); }, [handleStop]);

  // ── Fader drag ──────────────────────────────────────────────────────────────────
  const onFaderDown = useCallback((idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    fdrDrag.current = { idx, startY: e.clientY, startPos: faderRef.current[idx] };
  }, []);

  const onMasterFaderDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    mstDrag.current = { startY: e.clientY, startPos: masterRef.current };
  }, []);

  // ── Pan drag ───────────────────────────────────────────────────────────────────
  const onPanDown = useCallback((idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    panDrag.current = { idx, startX: e.clientX, startPan: panRef.current[idx] };
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (fdrDrag.current) {
        const { idx, startY, startPos } = fdrDrag.current;
        const dy  = (e.clientY - startY) / FADER_PX;
        const pos = Math.max(0, Math.min(0.99, startPos + dy));
        setFaderPos(prev => { const n = [...prev]; n[idx] = pos; return n; });
      }
      if (panDrag.current) {
        const { idx, startX, startPan } = panDrag.current;
        // 200 px of drag = full −100…+100 sweep; no rounding during drag
        const dp  = (e.clientX - startX) * (200 / 200);
        const pan = Math.max(-100, Math.min(100, startPan + dp));
        setPanValues(prev => { const n = [...prev]; n[idx] = pan; return n; });
      }
      if (mstDrag.current) {
        const { startY, startPos } = mstDrag.current;
        const dy  = (e.clientY - startY) / 60;
        const pos = Math.max(0, Math.min(0.99, startPos + dy));
        setMasterPos(pos);
      }
    };
    const onUp = () => {
      fdrDrag.current  = null;
      panDrag.current  = null;
      mstDrag.current  = null;
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };
  }, []);

  // ── Mute / Solo ────────────────────────────────────────────────────────────────
  const toggleMute = useCallback((idx: number) => {
    setMuted(prev => { const n = [...prev]; n[idx] = !n[idx]; return n; });
  }, []);

  const toggleSolo = useCallback((idx: number) => {
    setSoloed(prev => { const n = [...prev]; n[idx] = !n[idx]; return n; });
  }, []);

  // ── Level meter segments (8 segs per column) ────────────────────────────────────
  function meterSegs(level: number) {
    // level 0–1, 8 segments: 5 green, 2 amber, 1 red
    const count = Math.round(level * 8);
    return Array.from({ length: 8 }, (_, i) => {
      const lit = 8 - 1 - i < count; // bottom-to-top
      if (i === 0) return lit ? 'r' : '';       // top = red
      if (i <= 2)  return lit ? 'a' : '';       // next = amber
      return lit ? 'g' : '';                     // rest = green
    });
  }

  // Master meter bar heights
  const masterBarH = (fill: number) =>
    `linear-gradient(to top, var(--green) 0%, var(--green) 70%, var(--amber) 70%, var(--amber) 88%, var(--red) 88%)`;

  // ── Render ────────────────────────────────────────────────────────────────────
  const anySolo = soloed.some(Boolean);

  return (
    <div className="mix-lab">

      {/* ── Top bar ── */}
      <div className="lab-topbar">
        <div className="lab-title-row">
          <div className="lab-icon" style={{ background: 'var(--red-dim)', borderColor: 'rgba(255,77,106,0.4)' }}>
            ⊞
          </div>
          <div>
            <div className="lab-name">Mixing Console</div>
            <div className="lab-subtitle">LAB · CH 03 · SESSION MIX</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div className="lab-status" style={{ color: isPlaying ? 'var(--green)' : 'var(--text-dim)' }}>
            <div className="status-dot" style={{
              background: isPlaying ? 'var(--green)' : 'var(--text-faint)',
              boxShadow: isPlaying ? '0 0 6px var(--green)' : 'none',
              animation: isPlaying ? undefined : 'none',
            }} />
            {isPlaying ? 'PLAYING' : 'STOPPED'}
          </div>
        </div>
      </div>

      {/* ── Mix body ── */}
      <div className="mix-body">

        {/* Channel strips + master */}
        <div className="tracks-grid">
          {TRACKS.map((trk, i) => {
            const effMuted = muted[i] || (anySolo && !soloed[i]);
            const level    = effMuted ? 0 : trackFill[i];
            const segsL    = meterSegs(level * 1.0);
            const segsR    = meterSegs(level * 0.85);
            const isSelected = selTrack === i;

            return (
              <div
                key={trk.id}
                className={`channel-strip${isSelected ? ' selected' : ''}`}
                style={isSelected ? { borderColor: trk.color, boxShadow: `0 0 12px ${trk.color}22` } : {}}
                onClick={() => setSelTrack(i)}
              >
                {/* Name */}
                <div className="channel-name" style={isSelected ? { color: trk.color } : {}}>
                  {trk.name}
                </div>

                {/* M / S buttons */}
                <div className="channel-btns">
                  <div
                    className={`ch-btn${muted[i] ? ' m-active' : ''}`}
                    onClick={e => { e.stopPropagation(); toggleMute(i); }}
                  >M</div>
                  <div
                    className={`ch-btn${soloed[i] ? ' s-active' : ''}`}
                    onClick={e => { e.stopPropagation(); toggleSolo(i); }}
                  >S</div>
                </div>

                {/* Pan knob */}
                <div className="pan-knob-wrap">
                  <div
                    className="pan-knob"
                    style={{ cursor: 'ew-resize', userSelect: 'none' }}
                    onMouseDown={e => onPanDown(i, e)}
                    title="Drag left/right to pan"
                  >
                    <div className="pan-needle" style={{ transform: `translateX(-50%) rotate(${panRotation(panValues[i])})` }} />
                  </div>
                  <div className="pan-label">{panLabel(panValues[i])}</div>
                </div>

                {/* Fader */}
                <div
                  className="channel-fader-track"
                  style={{ cursor: 'ns-resize', userSelect: 'none' }}
                  onMouseDown={e => onFaderDown(i, e)}
                >
                  {/* Unity tick */}
                  <div style={{
                    position: 'absolute', top: '17%', left: '-3px', right: '-3px',
                    height: '1px', background: 'var(--border-bright)', opacity: 0.5,
                  }} />
                  <div
                    className="channel-fader-thumb"
                    style={{
                      top: faderTop(faderPos[i]),
                      borderColor: isSelected ? trk.color : undefined,
                    }}
                  />
                </div>

                {/* dB readout */}
                <div className="db-val" style={isSelected ? { color: trk.color } : {}}>
                  {dbDisplay(faderPos[i])}
                </div>

                {/* Level meter */}
                <div className="level-meter-strip">
                  {/* Left column */}
                  <div className="level-col">
                    {segsL.map((cls, si) =>
                      cls ? <div key={si} className={`level-seg ${cls}`} style={{ height: '3px' }} /> : null
                    )}
                  </div>
                  {/* Right column */}
                  <div className="level-col">
                    {segsR.map((cls, si) =>
                      cls ? <div key={si} className={`level-seg ${cls}`} style={{ height: '3px' }} /> : null
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* ── Master strip ── */}
          <div className="master-strip">
            <div className="master-label">MASTER</div>
            <div className="master-meters">
              {([masterFill[0], masterFill[1]] as number[]).map((fill, ci) => (
                <div key={ci} className="master-col">
                  <div
                    className="master-col-fill"
                    style={{
                      height: `${Math.max(2, fill * 100)}%`,
                      background: masterBarH(fill),
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="loudness-label"
              style={{ color: taskDone[2] ? 'var(--green)' : 'var(--text-faint)' }}>
              {lufsStr} LUFS
            </div>
            {/* Master fader */}
            <div style={{
              fontFamily: 'var(--mono)',
              fontSize: '0.5rem',
              color: 'var(--text-faint)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}>OUTPUT GAIN</div>
            <div
              className="channel-fader-track"
              style={{ width: '16px', height: '60px', cursor: 'ns-resize', userSelect: 'none' }}
              onMouseDown={onMasterFaderDown}
            >
              {/* Unity (0 dB) tick */}
              <div style={{
                position: 'absolute', top: '17%', left: '-4px', right: '-4px',
                height: '1px', background: 'var(--amber)', opacity: 0.4,
              }} />
              <div className="channel-fader-thumb" style={{
                top: faderTop(masterPos),
                width: '28px',
                height: '10px',
                background: 'var(--amber)',
              }} />
            </div>
            <div className="db-val" style={{ color: 'var(--amber)', fontSize: '0.6rem' }}>
              {dbDisplay(masterPos)} <span style={{ color: 'var(--text-faint)', fontSize: '0.5rem' }}>dB</span>
            </div>
          </div>
        </div>

        {/* ── Selected track info panel ── */}
        <div style={{
          marginTop: '0.75rem',
          background: 'var(--console)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          padding: '0.6rem 1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1.5rem',
          fontSize: '0.7rem',
          color: 'var(--text-faint)',
        }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
            SELECTED: <span style={{ color: TRACKS[selTrack].color }}>{TRACKS[selTrack].name}</span>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem' }}>
            FADER: <span style={{ color: 'var(--amber)' }}>{dbDisplay(faderPos[selTrack])} dB</span>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem' }}>
            PAN: <span style={{ color: 'var(--amber)' }}>{panLabel(panValues[selTrack])} ({Math.round(panValues[selTrack])})</span>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem' }}>
            STATUS: <span style={{
              color: muted[selTrack] ? 'var(--red)' :
                     (anySolo && !soloed[selTrack]) ? 'var(--text-faint)' :
                     soloed[selTrack] ? 'var(--green)' : 'var(--text)',
            }}>
              {muted[selTrack] ? 'MUTED' :
               (anySolo && !soloed[selTrack]) ? 'MUTED (SOLO BUS)' :
               soloed[selTrack] ? 'SOLOED' : 'ACTIVE'}
            </span>
          </div>
          <div style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: '0.6rem', color: 'var(--text-faint)' }}>
            Drag fader ↕ · Drag knob ↔ for pan
          </div>
        </div>

        {/* ── Concept callout ── */}
        <div className="concept-callout" style={{
          marginTop: '0.75rem',
          background: 'var(--red-dim)',
          borderColor: 'rgba(255,77,106,0.2)',
        }}>
          <strong style={{ color: 'var(--red)' }}>Concept check:</strong>{' '}
          A balanced mix sits at around −14 LUFS — loud enough to feel full but leaving headroom.
          Pan drums & bass to centre, spread pads/guitars wide. Solo each track to check for clashing
          frequencies, then unmute all and listen as a whole.
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="lab-footer">
        <div className="task-list" style={{ flexDirection: 'row', gap: '1rem' }}>
          {[
            'Pan stereo elements',
            'Level lead vocal',
            'Achieve −14 LUFS master',
          ].map((label, i) => (
            <div key={i} className="task-item">
              <div className={`task-check${taskDone[i] ? ' done' : ''}`}>
                {taskDone[i] ? '✓' : ''}
              </div>
              {label}
            </div>
          ))}
        </div>
        <div className="btn-row">
          {submitted ? (
            <span style={{
              fontFamily: 'var(--mono)', fontSize: '0.65rem',
              color: taskDone.every(Boolean) ? 'var(--green)' : 'var(--amber)',
            }}>
              {taskDone.every(Boolean)
                ? '✓ All tasks complete!'
                : `${taskDone.filter(Boolean).length}/3 tasks done`}
            </span>
          ) : null}
          <button className="btn-secondary" onClick={isPlaying ? handleStop : handleReset}>
            {isPlaying ? '⏹ Stop' : '↺ Reset'}
          </button>
          <button
            className="btn-secondary"
            onClick={handlePlay}
            style={isPlaying ? { borderColor: 'var(--green)', color: 'var(--green)' } : {}}
          >
            {isPlaying ? '⏸ Playing' : '▶ Play Session'}
          </button>
          <button
            className="btn-primary"
            onClick={() => setSubmitted(true)}
            disabled={submitted && taskDone.every(Boolean)}
          >
            {submitted && taskDone.every(Boolean) ? '✓ Mix Submitted →' : 'Submit Mix →'}
          </button>
        </div>
      </div>
    </div>
  );
}
