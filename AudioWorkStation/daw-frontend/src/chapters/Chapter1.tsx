import { useRef, useState, useEffect, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────
type WaveType = 'sine' | 'square' | 'sawtooth' | 'triangle';

interface WaveParams {
  waveType: WaveType;
  frequency: number;
  amplitude: number;
  phaseShift: number;
  harmonics: number;
}

// ── Music utilities ──────────────────────────────────────────────────────────
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function freqToNote(freq: number): string {
  const midi = Math.round(12 * Math.log2(freq / 440) + 69);
  const oct = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  return `${name}${oct}`;
}

function formatPeriod(freq: number): string {
  const ms = (1 / freq) * 1000;
  return ms >= 1 ? `${ms.toFixed(2)}ms` : `${(ms * 1000).toFixed(0)}µs`;
}

function formatWavelength(freq: number): string {
  const m = 343 / freq;
  return m >= 1 ? `${m.toFixed(2)}m` : `${(m * 100).toFixed(0)}cm`;
}

// ── Fourier synthesis ────────────────────────────────────────────────────────
// Builds a PeriodicWave encoding the chosen wave type as a truncated Fourier
// series (up to numHarmonics terms) with an optional phase offset.
//
// Web Audio PeriodicWave represents:  Σ [real[n]·cos(nωt) + imag[n]·sin(nωt)]
//
// For a pure-sine Fourier series x(t) = Σ bₙ·sin(nωt + n·φ):
//   bₙ·sin(nωt + n·φ) = bₙ·cos(n·φ)·sin(nωt) + bₙ·sin(n·φ)·cos(nωt)
//   → real[n] = bₙ·sin(n·φ)   (cosine coefficient)
//   → imag[n] = bₙ·cos(n·φ)   (sine coefficient)
function buildPeriodicWave(
  ctx: AudioContext,
  { waveType, harmonics, phaseShift }: Pick<WaveParams, 'waveType' | 'harmonics' | 'phaseShift'>
): PeriodicWave {
  const size = harmonics + 1;
  const real = new Float32Array(size);
  const imag = new Float32Array(size);
  // DC offset = 0
  real[0] = 0; imag[0] = 0;

  const φ = (phaseShift * Math.PI) / 180;

  for (let n = 1; n <= harmonics; n++) {
    // Fourier sine coefficient for the n-th harmonic
    let b = 0;
    switch (waveType) {
      case 'sine':
        // Sine IS the fundamental — a single harmonic by definition.
        // All higher terms are zero; the harmonics slider is disabled for sine.
        b = n === 1 ? 1 : 0;
        break;
      case 'square':
        // Only odd harmonics: 4/(π·n)
        b = n % 2 === 1 ? 4 / (Math.PI * n) : 0;
        break;
      case 'sawtooth':
        // All harmonics: 2·(−1)^(n+1) / (π·n)
        b = (2 * Math.pow(-1, n + 1)) / (Math.PI * n);
        break;
      case 'triangle':
        // Only odd harmonics: 8·(−1)^((n−1)/2) / (π²·n²)
        b = n % 2 === 1
          ? (8 / (Math.PI ** 2 * n ** 2)) * Math.pow(-1, (n - 1) / 2)
          : 0;
        break;
    }

    // Apply per-harmonic phase shift (proper time-shift: n·φ)
    const nφ = n * φ;
    real[n] = b * Math.sin(nφ);
    imag[n] = b * Math.cos(nφ);
  }

  // disableNormalization: false → Web Audio normalises the peak to 1.0,
  // so the gain node exclusively controls perceived amplitude.
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

// ── Canvas helpers ───────────────────────────────────────────────────────────

// Compute one sample of the Fourier series for the given wave type.
// Returns an unnormalised value; the caller normalises by peak amplitude.
function computeSample(
  type: WaveType,
  harmonics: number,
  phaseShiftDeg: number,
  i: number,           // sample index (0-based)
  N: number            // samples per cycle = sampleRate / frequency
): number {
  const φ = (phaseShiftDeg * Math.PI) / 180;
  let sum = 0;
  for (let n = 1; n <= harmonics; n++) {
    let b = 0;
    switch (type) {
      case 'sine':     b = n === 1 ? 1 : 0; break;
      case 'square':   b = n % 2 === 1 ? 4 / (Math.PI * n) : 0; break;
      case 'sawtooth': b = (2 * Math.pow(-1, n + 1)) / (Math.PI * n); break;
      case 'triangle': b = n % 2 === 1
          ? (8 / (Math.PI ** 2 * n ** 2)) * Math.pow(-1, (n - 1) / 2) : 0; break;
    }
    sum += b * Math.sin(n * 2 * Math.PI * i / N + n * φ);
  }
  return sum;
}

interface OscilloscopeOpts {
  waveType: WaveType;
  harmonics: number;
  phaseShift: number;  // degrees
  amplitude: number;   // 0..1
  frequency: number;   // Hz
  sampleRate: number;
}

// Draw the oscilloscope frame using a mathematically-computed wave so that
// phase shift is immediately visible as horizontal displacement.
// When phaseShift != 0 a dim blue reference at 0° is drawn underneath.
function drawOscilloscope(
  canvas: HTMLCanvasElement,
  opts: OscilloscopeOpts
) {
  const { waveType, harmonics, phaseShift, amplitude, frequency, sampleRate } = opts;
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;

  // ── Background ─────────────────────────────────────────────────────────────
  ctx.fillStyle = '#0D0D0F';
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.025)';
  ctx.lineWidth = 1;
  for (let y = 0; y <= H; y += H / 5) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  for (let x = 0; x <= W; x += W / 10) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }

  // Centre baseline
  ctx.strokeStyle = '#2E2E3D';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, H / 2);
  ctx.lineTo(W, H / 2);
  ctx.stroke();

  // ── Compute wave ────────────────────────────────────────────────────────────
  // Fixed time window: 3 cycles at the reference pitch (440 Hz).
  // Higher frequency → more cycles visible (wave compresses).
  // Lower frequency → fewer cycles (wave stretches).
  // Clamped so extremes stay readable: min 1 cycle, max 12 cycles.
  const samplesPerCycle = sampleRate / frequency;
  const cyclesToShow = Math.max(1, Math.min(12, (frequency / 440) * 3));
  const totalSamples = Math.round(cyclesToShow * samplesPerCycle);

  // Build sample arrays and find peak for normalisation
  const live = new Float32Array(totalSamples);
  let peak = 0;
  for (let i = 0; i < totalSamples; i++) {
    live[i] = computeSample(waveType, harmonics, phaseShift, i, samplesPerCycle);
    if (Math.abs(live[i]) > peak) peak = Math.abs(live[i]);
  }
  const norm = peak > 0 ? 1 / peak : 1;

  // Helper: draw a polyline from a Float32Array of normalised [-1..1] values
  const drawLine = (samples: Float32Array, strokeStyle: string, lineWidth: number, glowColor?: string) => {
    const n = samples.length;
    if (glowColor) {
      ctx.save();
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = lineWidth * 5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * W;
        const y = H / 2 - samples[i] * amplitude * H * 0.44;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * W;
      const y = H / 2 - samples[i] * amplitude * H * 0.44;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  };

  // ── Reference wave (phase = 0, only shown when phaseShift != 0) ────────────
  if (phaseShift !== 0) {
    const ref = new Float32Array(totalSamples);
    let refPeak = 0;
    for (let i = 0; i < totalSamples; i++) {
      ref[i] = computeSample(waveType, harmonics, 0, i, samplesPerCycle);
      if (Math.abs(ref[i]) > refPeak) refPeak = Math.abs(ref[i]);
    }
    const refNorm = refPeak > 0 ? 1 / refPeak : 1;
    const refNormalised = new Float32Array(totalSamples);
    for (let i = 0; i < totalSamples; i++) refNormalised[i] = ref[i] * refNorm;

    ctx.globalAlpha = 0.35;
    drawLine(refNormalised, '#4D9EFF', 1.5);
    ctx.globalAlpha = 1;

    // "REF 0°" label
    ctx.fillStyle = 'rgba(77,158,255,0.6)';
    ctx.font = '18px "JetBrains Mono", monospace';
    ctx.fillText('REF 0°', 12, 22);
  }

  // ── Live wave (with phase shift) ────────────────────────────────────────────
  const liveNorm = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) liveNorm[i] = live[i] * norm;

  drawLine(liveNorm, '#F5A623', 2, 'rgba(245,166,35,0.12)');

  // Phase label when active
  if (phaseShift !== 0) {
    ctx.fillStyle = 'rgba(245,166,35,0.8)';
    ctx.font = '18px "JetBrains Mono", monospace';
    ctx.fillText(`${phaseShift}°`, W - 70, 22);
  }

  // Cycle count label (bottom-right) — shows how many cycles are visible
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.font = '11px "JetBrains Mono", monospace';
  const cycleLabel = cyclesToShow % 1 === 0
    ? `${cyclesToShow} cycles`
    : `${cyclesToShow.toFixed(1)} cycles`;
  ctx.fillText(cycleLabel, W - 88, H - 8);
}

function clearCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;
  ctx.fillStyle = '#0D0D0F';
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.025)';
  ctx.lineWidth = 1;
  for (let y = 0; y <= H; y += H / 5) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  for (let x = 0; x <= W; x += W / 10) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }

  // Baseline
  ctx.strokeStyle = '#2E2E3D';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, H / 2);
  ctx.lineTo(W, H / 2);
  ctx.stroke();
}

// ── VU bar config ────────────────────────────────────────────────────────────
const VU_COLORS: ('green' | 'amber' | 'red')[] = [
  'green', 'green', 'green', 'green', 'amber', 'amber', 'red', 'red',
];

// ── Component ────────────────────────────────────────────────────────────────
export default function Chapter1() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [waveType, setWaveType]   = useState<WaveType>('sine');
  const [frequency, setFrequency] = useState(440);
  const [amplitude, setAmplitude] = useState(0.75);
  const [phaseShift, setPhaseShift] = useState(0);
  const [harmonics, setHarmonics]   = useState(16);
  const [vuLevel, setVuLevel] = useState(0);

  // Task completion
  const [task3Done, setTask3Done] = useState(false); // add 2nd harmonic
  const [task4Done, setTask4Done] = useState(false); // observe waveform change

  // Derived display values
  const noteName   = freqToNote(frequency);
  const period     = formatPeriod(frequency);
  const wavelength = formatWavelength(frequency);

  // Audio refs
  const audioCtxRef   = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainRef       = useRef<GainNode | null>(null);
  const analyserRef   = useRef<AnalyserNode | null>(null);
  const animRef       = useRef<number>(0);
  const canvasRef     = useRef<HTMLCanvasElement>(null);

  // Keep a stable ref to latest params so startAudio callback stays stable
  const paramsRef = useRef<WaveParams>({ waveType, frequency, amplitude, phaseShift, harmonics });
  useEffect(() => {
    paramsRef.current = { waveType, frequency, amplitude, phaseShift, harmonics };
  }, [waveType, frequency, amplitude, phaseShift, harmonics]);

  // ── Task tracking ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (harmonics >= 2) setTask3Done(true);
  }, [harmonics]);

  // Mark "observe waveform change" when playing + something differs from defaults
  const isPlayingRef = useRef(false);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  useEffect(() => {
    if (
      isPlaying &&
      (waveType !== 'sine' || frequency !== 440 || amplitude !== 0.75 ||
       phaseShift !== 0 || harmonics !== 1)
    ) {
      setTask4Done(true);
    }
  }, [isPlaying, waveType, frequency, amplitude, phaseShift, harmonics]);

  // ── Animation loop ─────────────────────────────────────────────────────────
  const startAnimation = useCallback(() => {
    const loop = () => {
      const canvas   = canvasRef.current;
      const analyser = analyserRef.current;
      const audioCtx = audioCtxRef.current;
      if (canvas && analyser && audioCtx) {
        // Draw computed wave (phase shift visible as displacement from reference)
        drawOscilloscope(canvas, {
          ...paramsRef.current,
          sampleRate: audioCtx.sampleRate,
        });

        // RMS from live signal for VU meter
        const td = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(td);
        let sum = 0;
        for (const v of td) sum += v * v;
        setVuLevel(Math.sqrt(sum / td.length));
      }
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
  }, []);

  const stopAnimation = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    setVuLevel(0);
    if (canvasRef.current) clearCanvas(canvasRef.current);
  }, []);

  // ── Audio graph ────────────────────────────────────────────────────────────
  const startAudio = useCallback(async () => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') await ctx.resume();

    // Tear down old oscillator
    if (oscillatorRef.current) {
      try { oscillatorRef.current.stop(); } catch { /* already stopped */ }
      oscillatorRef.current.disconnect();
    }

    const { waveType, frequency, amplitude, phaseShift, harmonics } = paramsRef.current;

    const osc = ctx.createOscillator();
    osc.setPeriodicWave(buildPeriodicWave(ctx, { waveType, harmonics, phaseShift }));
    osc.frequency.value = frequency;

    const gain = ctx.createGain();
    gain.gain.value = amplitude;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.05;

    // osc → gain → analyser → speakers
    osc.connect(gain);
    gain.connect(analyser);
    analyser.connect(ctx.destination);

    osc.start();
    oscillatorRef.current = osc;
    gainRef.current       = gain;
    analyserRef.current   = analyser;

    setIsPlaying(true);
    startAnimation();
  }, [startAnimation]);

  const stopAudio = useCallback(() => {
    if (oscillatorRef.current) {
      try { oscillatorRef.current.stop(); } catch { /* ok */ }
      oscillatorRef.current.disconnect();
      oscillatorRef.current = null;
    }
    gainRef.current     = null;
    analyserRef.current = null;
    setIsPlaying(false);
    stopAnimation();
  }, [stopAnimation]);

  // ── Live parameter updates (no graph rebuild) ──────────────────────────────
  useEffect(() => {
    const ctx = audioCtxRef.current;
    const osc = oscillatorRef.current;
    if (!ctx || !osc) return;
    osc.setPeriodicWave(buildPeriodicWave(ctx, paramsRef.current));
    osc.frequency.setTargetAtTime(paramsRef.current.frequency, ctx.currentTime, 0.01);
  }, [waveType, harmonics, phaseShift, frequency]);

  useEffect(() => {
    const ctx  = audioCtxRef.current;
    const gain = gainRef.current;
    if (!ctx || !gain) return;
    gain.gain.setTargetAtTime(amplitude, ctx.currentTime, 0.01);
  }, [amplitude]);

  // ── Reset ──────────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    stopAudio();
    setWaveType('sine');
    setFrequency(440);
    setAmplitude(0.75);
    setPhaseShift(0);
    setHarmonics(1);
    setTask3Done(false);
    setTask4Done(false);
  }, [stopAudio]);

  // ── Space key ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
      e.preventDefault();
      if (isPlayingRef.current) stopAudio();
      else startAudio();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [startAudio, stopAudio]);

  // ── Draw initial preview on mount and whenever params change while paused ──
  useEffect(() => {
    if (isPlaying) return; // animation loop handles it while playing
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawOscilloscope(canvas, {
      waveType, harmonics, phaseShift, amplitude, frequency,
      sampleRate: 44100, // use standard rate for preview
    });
  }, [isPlaying, waveType, harmonics, phaseShift, amplitude, frequency]);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      try { oscillatorRef.current?.stop(); } catch { /* ok */ }
      audioCtxRef.current?.close();
    };
  }, []);

  // ── VU bars ────────────────────────────────────────────────────────────────
  // When playing: use live RMS from the analyser.
  // When paused: estimate from amplitude (sine RMS = amplitude × 0.707).
  const displayLevel = isPlaying ? vuLevel : amplitude * 0.707;

  // Map to 0–1: sine at amplitude=1.0 → ~1.0, amplitude=0.75 → ~0.74
  const normalizedLevel = Math.min(1, displayLevel * 1.42);

  // Progressive fill: bar i activates when level crosses i/8.
  // The "frontier" bar fills partially for a smooth analog look.
  //   barFraction ≥ 1  → fully lit (90% height)
  //   0 < barFraction < 1 → partially lit (frontier)
  //   ≤ 0              → inactive stub (8%)
  const vuBars = VU_COLORS.map((color, i) => {
    const barFraction = normalizedLevel * 8 - i;
    const h = barFraction >= 1 ? 90
            : barFraction > 0  ? Math.max(8, barFraction * 90)
            : 8;
    return { color, height: `${h}%` };
  });

  // ── Wave shape SVG paths (mini icons) ─────────────────────────────────────
  const waveIcons: Record<WaveType, string> = {
    sine:     'M0,10 C5,2 9,2 13,10 C17,18 21,18 25,10 C29,2 33,2 36,10',
    square:   'M0,10 9,10 9,2 18,2 18,18 27,18 27,10 36,10',
    sawtooth: 'M0,18 9,2 9,18 18,2 18,18 27,2 27,18 36,2',
    triangle: 'M0,10 9,2 18,18 27,2 36,10',
  };

  const harmLabel = harmonics === 1 ? '1' :
    harmonics === 2 ? '2' :
    harmonics === 3 ? '3' : `${harmonics}`;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="waveform-lab">
      {/* ── Top bar ── */}
      <div className="lab-topbar">
        <div className="lab-title-row">
          <div className="lab-icon">〜</div>
          <div>
            <div className="lab-name">Waveform Builder</div>
            <div className="lab-subtitle">LAB · CH 01 · INTERACTIVE</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span className="badge">● OBJECTIVE</span>
          <div className="lab-status">
            <div className="status-dot" />
            {isPlaying ? 'LIVE' : 'PAUSED'}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="waveform-body">
        {/* LEFT: oscilloscope + controls */}
        <div className="waveform-canvas-area">
          {/* Oscilloscope */}
          <div className="canvas-label">OSCILLOSCOPE VIEW — TIME DOMAIN</div>
          <div className="waveform-display">
            <canvas
              ref={canvasRef}
              width={1200}
              height={280}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            />
            <span className="axis-label-y top">+1.0</span>
            <span className="axis-label-y mid">0</span>
            <span className="axis-label-y bot">−1.0</span>
          </div>

          {/* Wave type selector */}
          <div className="canvas-label" style={{ marginTop: '0.75rem' }}>WAVEFORM TYPE</div>
          <div className="wave-type-row">
            {(['sine', 'square', 'sawtooth', 'triangle'] as WaveType[]).map(type => (
              <button
                key={type}
                className={`wave-btn${waveType === type ? ' active' : ''}`}
                onClick={() => {
                  setWaveType(type);
                  // Sine = 1 harmonic by definition; all others default to 16
                  setHarmonics(type === 'sine' ? 1 : 16);
                }}
              >
                <svg className="wave-shape" viewBox="0 0 36 20">
                  <path d={waveIcons[type]} fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                {type.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Parameter sliders */}
          <div className="param-sliders">
            {/* Frequency */}
            <div className="param-group">
              <div className="param-label">
                <span>FREQUENCY</span>
                <span className="param-val">{frequency} Hz</span>
              </div>
              <input
                type="range"
                className="param-slider"
                min={20} max={2000} value={frequency}
                onChange={e => setFrequency(Number(e.target.value))}
              />
            </div>

            {/* Amplitude */}
            <div className="param-group">
              <div className="param-label">
                <span>AMPLITUDE</span>
                <span className="param-val">{amplitude.toFixed(2)}</span>
              </div>
              <input
                type="range"
                className="param-slider"
                min={0} max={1} step={0.01} value={amplitude}
                onChange={e => setAmplitude(Number(e.target.value))}
              />
            </div>

            {/* Phase shift */}
            <div className="param-group">
              <div className="param-label">
                <span>PHASE SHIFT</span>
                <span className="param-val">{phaseShift}°</span>
              </div>
              <input
                type="range"
                className="param-slider"
                min={0} max={360} value={phaseShift}
                onChange={e => setPhaseShift(Number(e.target.value))}
              />
            </div>

            {/* Harmonics */}
            <div className="param-group" style={{ opacity: waveType === 'sine' ? 0.35 : 1 }}>
              <div className="param-label">
                <span>HARMONICS</span>
                <span className="param-val">
                  {waveType === 'sine' ? 'PURE (1)' : harmLabel}
                </span>
              </div>
              <input
                type="range"
                className="param-slider"
                min={1} max={32} value={harmonics}
                disabled={waveType === 'sine'}
                onChange={e => setHarmonics(Number(e.target.value))}
              />
              {waveType === 'sine' && (
                <div style={{ fontSize: '0.5rem', color: 'var(--text-faint)', marginTop: '2px' }}>
                  Sine = 1 harmonic by definition
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: sidebar */}
        <div className="waveform-sidebar">
          {/* VU Meter */}
          <div className="meter-block">
            <div className="meter-label">
              VU METER
              <span className="meter-sublabel"> — Volume Unit</span>
            </div>
            <div className="vu-meter">
              {vuBars.map((bar, i) => (
                <div
                  key={i}
                  className={`vu-bar ${bar.color}`}
                  style={{ height: bar.height, transition: 'height 80ms ease-out' }}
                />
              ))}
            </div>
            <div className="vu-legend">
              <span className="vu-legend-item green">● safe</span>
              <span className="vu-legend-item amber">● loud</span>
              <span className="vu-legend-item red">● clip</span>
            </div>
          </div>

          {/* Frequency readout */}
          <div className="freq-readout">
            <div>
              <span className="freq-big">{frequency}</span>
              <span className="freq-unit">Hz</span>
            </div>
            <div className="freq-row">
              <div className="freq-item">
                <div className="freq-item-val">{noteName}</div>
                <div className="freq-item-lbl">PITCH</div>
                <div className="freq-item-sub">nearest note</div>
              </div>
              <div className="freq-item">
                <div className="freq-item-val">{period}</div>
                <div className="freq-item-lbl">PERIOD</div>
                <div className="freq-item-sub">1 cycle = 1/f</div>
              </div>
              <div className="freq-item">
                <div className="freq-item-val">{wavelength}</div>
                <div className="freq-item-lbl">WAVELENGTH</div>
                <div className="freq-item-sub">343m/s ÷ f</div>
              </div>
            </div>
          </div>

          {/* Concept callout */}
          <div className="concept-callout">
            <strong>Concept check:</strong>{' '}
            {waveType === 'sine'
              ? `Sine is a single pure frequency — no harmonics. It's the building block all other waves are made from. Reduce harmonics on Square to watch it approach a sine.`
              : waveType === 'square'
              ? `Square = odd harmonics (1, 3, 5…) at 1/n amplitude. Drag HARMONICS left to reduce terms and watch the corners soften (Gibbs phenomenon). At 1 harmonic it's a pure sine.`
              : waveType === 'sawtooth'
              ? `Sawtooth = all harmonics (1, 2, 3…) at 1/n amplitude — the richest, buzziest wave. Reduce harmonics to see the ramp smooth out toward a sine.`
              : `Triangle = odd harmonics at 1/n² amplitude — harmonics fall off much faster than square, giving a softer, flute-like tone. Reduce harmonics to compare with square.`}
          </div>

          {/* Task checklist */}
          <div className="task-list">
            <div className="task-item">
              <div className="task-check done">✓</div>
              Select sine wave
            </div>
            <div className="task-item">
              <div className={`task-check${frequency === 440 ? ' done' : ''}`}>
                {frequency === 440 ? '✓' : ''}
              </div>
              Set frequency to 440 Hz
            </div>
            <div className="task-item">
              <div className={`task-check${task3Done ? ' done' : ''}`}>
                {task3Done ? '✓' : ''}
              </div>
              Add 2nd harmonic
            </div>
            <div className="task-item">
              <div className={`task-check${task4Done ? ' done' : ''}`}>
                {task4Done ? '✓' : ''}
              </div>
              Observe waveform change
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="lab-footer">
        <div className="hint-text">
          💡 Tip: Press{' '}
          <span className="hint-key">Space</span>
          {' '}to play / pause your waveform
        </div>
        <div className="btn-row">
          <button className="btn-secondary" onClick={handleReset}>Reset</button>
          <button
            className="btn-primary"
            onClick={isPlaying ? stopAudio : startAudio}
          >
            {isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>
        </div>
      </div>
    </div>
  );
}
