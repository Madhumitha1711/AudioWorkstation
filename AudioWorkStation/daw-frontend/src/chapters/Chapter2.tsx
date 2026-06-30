import { useRef, useState, useEffect, useCallback } from 'react';

// ── Band config ───────────────────────────────────────────────────────────────
interface EQBand { freq: number; label: string; sub: string; }

const BANDS: EQBand[] = [
  { freq: 60,    label: '60Hz',  sub: 'SUB'      },
  { freq: 120,   label: '120Hz', sub: 'BASS'     },
  { freq: 250,   label: '250Hz', sub: 'LO-MID'   },
  { freq: 500,   label: '500Hz', sub: 'MID'      },
  { freq: 1000,  label: '1kHz',  sub: 'HI-MID'   },
  { freq: 3000,  label: '3kHz',  sub: 'PRESENCE' },
  { freq: 8000,  label: '8kHz',  sub: 'AIR'      },
  { freq: 16000, label: '16kHz', sub: 'SHEEN'    },
];

// Hidden target — students must match this by ear, not visually
const TARGET_GAINS = [-3, +6, +2, -1, +4, -3, +7, +3];

const GAIN_MIN = -12;
const GAIN_MAX = +12;
const FADER_TRACK_PX = 80;

// ── Canvas ────────────────────────────────────────────────────────────────────
const FMIN = 20, FMAX = 20000;

function fToX(f: number, W: number) {
  return (Math.log10(f / FMIN) / Math.log10(FMAX / FMIN)) * W;
}
function gainToY(g: number, H: number) {
  return ((GAIN_MAX - g) / (GAIN_MAX - GAIN_MIN)) * H;
}

function pathThrough(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  if (pts.length < 2) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
      p2.x, p2.y,
    );
  }
}

function hiDpi(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const W   = canvas.clientWidth  || canvas.width;
  const H   = canvas.clientHeight || canvas.height;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width  = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, W, H };
}

function drawSpectrum(
  canvas: HTMLCanvasElement,
  userGains: number[],
  showTarget: boolean,
) {
  const hd = hiDpi(canvas); if (!hd) return;
  const { ctx, W, H } = hd;

  ctx.fillStyle = '#0D0D0F';
  ctx.fillRect(0, 0, W, H);

  // Vertical grid
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1; ctx.setLineDash([]);
  for (const f of [20,50,100,200,500,1000,2000,5000,10000,20000]) {
    const x = fToX(f, W);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }

  // Horizontal dB grid
  const y0 = gainToY(0, H);
  for (const db of [-12, -6, 0, 6, 12]) {
    const y = gainToY(db, H);
    ctx.strokeStyle = db === 0 ? '#2E2E3D' : 'rgba(255,255,255,0.04)';
    ctx.lineWidth   = db === 0 ? 1.5 : 1;
    ctx.setLineDash(db === 0 ? [5, 5] : []);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.setLineDash([]);

  // dB labels
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '10px "JetBrains Mono", monospace';
  for (const db of [-12, -6, 0, 6, 12]) {
    ctx.fillText(`${db > 0 ? '+' : ''}${db}`, 4, gainToY(db, H) + 4);
  }

  const makePts = (gains: number[]) => [
    { x: 0, y: gainToY(gains[0], H) },
    ...BANDS.map((b, i) => ({ x: fToX(b.freq, W), y: gainToY(gains[i], H) })),
    { x: W, y: gainToY(gains[gains.length - 1], H) },
  ];

  const drawCurve = (
    gains: number[], stroke: string, strokeA: number,
    fill: string, fillA: number,
  ) => {
    const pts = makePts(gains);
    if (fillA > 0) {
      ctx.save(); ctx.globalAlpha = fillA; ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, y0); ctx.lineTo(pts[0].x, pts[0].y);
      pathThrough(ctx, pts);
      ctx.lineTo(pts[pts.length - 1].x, y0);
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
    ctx.save(); ctx.globalAlpha = strokeA;
    ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath(); pathThrough(ctx, pts); ctx.stroke(); ctx.restore();
  };

  // Target curve — only shown after student submits
  if (showTarget) {
    drawCurve(TARGET_GAINS, '#F5A623', 0.85, '#F5A623', 0.08);
  } else {
    // Ghost hint: just the flat 0dB line with label "MATCH BY EAR"
    ctx.fillStyle = 'rgba(245,166,35,0.25)';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText('TARGET HIDDEN — LISTEN & MATCH BY EAR', W / 2 - 160, 18);
  }

  // User curve (always visible)
  drawCurve(userGains, '#4D9EFF', 0.9, '#4D9EFF', 0.06);

  // Freq labels
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '9px "JetBrains Mono", monospace';
  const lbls: [number, string][] = [
    [20,'20'],[50,'50'],[100,'100'],[200,'200'],[500,'500'],
    [1000,'1k'],[2000,'2k'],[5000,'5k'],[10000,'10k'],[20000,'20k'],
  ];
  for (const [f, l] of lbls) ctx.fillText(l, fToX(f, W) - 6, H - 4);
}

// ── Audio: synthesised D-minor chord ─────────────────────────────────────────
//
// 8 sawtooth oscillators span the full 60 Hz–16 kHz spectrum so every EQ band
// is audible.  Extra shimmer sines at 8/12/15 kHz ensure AIR and SHEEN bands
// produce a clear, audible change.  The buffer is kept at low amplitude so the
// target's +7 dB highshelf and +6 dB bass boost have plenty of headroom —
// the DynamicsCompressor after the EQ chain acts as a brick-wall safety net.
function createMusicBuffer(ctx: AudioContext): AudioBuffer {
  const sr  = ctx.sampleRate;
  const dur = 6;
  const buf = ctx.createBuffer(1, sr * dur, sr);
  const d   = buf.getChannelData(0);

  // Sawtooth voices: [Hz, relative amplitude]
  // C2 → C3 → G3 → D4 → G4 → C5 → G5 → C6
  const voices: [number, number][] = [
    [65.41,   0.28],  // C2  — SUB
    [130.81,  0.24],  // C3  — BASS
    [196.00,  0.20],  // G3  — LO-MID
    [293.66,  0.17],  // D4  — MID
    [392.00,  0.14],  // G4  — HI-MID
    [523.25,  0.11],  // C5  — PRESENCE
    [783.99,  0.08],  // G5  — lower AIR
    [1046.50, 0.06],  // C6  — upper AIR
  ];

  // Shimmer sines for AIR (8 kHz) and SHEEN (12/15 kHz) bands — subtle
  const shimmer: [number, number][] = [
    [8000,  0.025],
    [12000, 0.018],
    [15000, 0.013],
  ];

  for (let i = 0; i < d.length; i++) {
    const t = i / sr;

    let sig = 0;

    // 1/h^1.5 rolloff instead of 1/h — reduces upper harmonic buzz,
    // giving a smooth organ-like tone rather than a bright sawtooth.
    // Max 14 harmonics per voice to avoid intermodulation grit.
    for (const [f0, amp] of voices) {
      const maxH = Math.min(14, Math.floor((sr / 2) / f0));
      for (let h = 1; h <= maxH; h++) {
        sig += amp * (1 / Math.pow(h, 1.5)) * Math.sin(2 * Math.PI * f0 * h * t);
      }
    }

    // Shimmer tones — kept subtle so they register on EQ but don't pierce
    for (const [f, amp] of shimmer) {
      sig += amp * Math.sin(2 * Math.PI * f * t);
    }

    // Scale down to ~0.12 peak — leaves ample headroom for +7 dB EQ boosts
    d[i] = sig * 0.10;
  }

  return buf;
}

function buildFilters(ctx: AudioContext, gains: number[]): BiquadFilterNode[] {
  return BANDS.map((band, i) => {
    const f = ctx.createBiquadFilter();
    const isShelf = i === 0 || i === BANDS.length - 1;
    f.type = i === 0 ? 'lowshelf' : i === BANDS.length - 1 ? 'highshelf' : 'peaking';
    f.frequency.value = band.freq;
    // Q=0.707 → smooth Butterworth shelf (no resonant bump at shelf knee)
    // Q=0.8  → ~1.25-octave wide peaking band → clearly audible on any speaker
    f.Q.value    = isShelf ? 0.707 : 0.8;
    f.gain.value = gains[i];
    return f;
  });
}

function chainAndConnect(
  filters: BiquadFilterNode[],
  destination: AudioNode,
): void {
  for (let i = 0; i < filters.length - 1; i++) filters[i].connect(filters[i + 1]);
  filters[filters.length - 1].connect(destination);
}

// ── Score ─────────────────────────────────────────────────────────────────────
function calcBandScores(userGains: number[]) {
  return BANDS.map((_, i) => {
    const diff = userGains[i] - TARGET_GAINS[i];
    const acc  = Math.max(0, 1 - Math.abs(diff) / 6);
    const color =
      Math.abs(diff) < 1 ? 'var(--green)' :
      Math.abs(diff) < 3 ? 'var(--amber)' : 'var(--red)';
    return { diff, acc, color };
  });
}
function overallScore(userGains: number[]) {
  const sc = calcBandScores(userGains);
  return Math.round(sc.reduce((a, b) => a + b.acc, 0) / BANDS.length * 100);
}

const BAND_TIPS = [
  'Sub (60Hz) adds low-end weight. The target cuts it slightly — hear the rumble reduce.',
  'Bass (120Hz) carries warmth. The target boosts it heavily — listen for that fullness.',
  'Low-mids (250Hz) shape body. A gentle boost adds thickness to the chord.',
  'Mids (500Hz) are nearly flat — the target cuts slightly for clarity.',
  'Hi-mids (1kHz) add presence and punch. The target boosts here; hear the forward bite.',
  'Presence (3kHz) can sound harsh. The target cuts here — notice the harshness recede.',
  'Air (8kHz) adds brilliance. The target boosts heavily; the chord should gain sparkle.',
  'Sheen (16kHz) is ultra-high shimmer. Boost to match the airy, open top end.',
];

type PlayMode = 'idle' | 'target' | 'mine';

// ── Component ─────────────────────────────────────────────────────────────────
export default function Chapter2() {
  const [userGains, setUserGains] = useState<number[]>(Array(8).fill(0));
  const [playMode, setPlayMode]   = useState<PlayMode>('idle');
  const [revealed, setRevealed]   = useState(false);   // target curve hidden until submit
  const [submitted, setSubmitted] = useState(false);
  const [hintUsed, setHintUsed]   = useState(false);

  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const audioCtxRef    = useRef<AudioContext | null>(null);
  const sourceRef      = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef    = useRef<GainNode | null>(null);
  const filtersRef     = useRef<BiquadFilterNode[]>([]);
  const musicBufferRef = useRef<AudioBuffer | null>(null);
  const userGainsRef   = useRef(userGains);
  const dragRef        = useRef<{ bandIdx: number; startY: number; startGain: number } | null>(null);

  useEffect(() => { userGainsRef.current = userGains; }, [userGains]);

  // Redraw on any state change
  useEffect(() => {
    const c = canvasRef.current;
    if (c) drawSpectrum(c, userGains, revealed);
  }, [userGains, revealed]);

  // Live-update filter gains while "Hear Mine" is playing
  useEffect(() => {
    if (playMode !== 'mine') return;
    filtersRef.current.forEach((f, i) => { f.gain.value = userGains[i]; });
  }, [userGains, playMode]);

  // ── Audio ─────────────────────────────────────────────────────────────────
  const stopAudio = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch { /* ok */ }
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    setPlayMode('idle');
  }, []);

  const playAudio = useCallback(async (mode: 'target' | 'mine') => {
    if (playMode === mode) { stopAudio(); return; }
    stopAudio();

    // Recreate if missing or closed (e.g. after component cleanup / hot reload)
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
      musicBufferRef.current = null; // must rebuild buffer with the new context
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') await ctx.resume();

    // Build music buffer once per context
    if (!musicBufferRef.current) {
      musicBufferRef.current = createMusicBuffer(ctx);
    }

    const gains   = mode === 'target' ? TARGET_GAINS : [...userGainsRef.current];
    const filters = buildFilters(ctx, gains);
    filtersRef.current = filters;

    const gainNode = ctx.createGain();
    // Lower master gain so the target's +7 dB / +6 dB boosts stay well below 0 dBFS
    gainNode.gain.value = 0.35;
    gainNodeRef.current = gainNode;

    // Brick-wall limiter: catches any residual clipping without colouring the sound
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;   // dBFS — start limiting here
    limiter.knee.value      = 0;    // hard knee
    limiter.ratio.value     = 20;   // near-brick-wall
    limiter.attack.value    = 0.001;
    limiter.release.value   = 0.1;

    chainAndConnect(filters, gainNode);
    gainNode.connect(limiter);
    limiter.connect(ctx.destination);

    const source = ctx.createBufferSource();
    source.buffer = musicBufferRef.current;
    source.loop   = true;
    source.connect(filters[0]);
    source.start();
    sourceRef.current = source;
    setPlayMode(mode);
  }, [playMode, stopAudio]);

  // ── Fader drag ────────────────────────────────────────────────────────────
  const handleFaderMouseDown = useCallback((bandIdx: number, e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { bandIdx, startY: e.clientY, startGain: userGainsRef.current[bandIdx] };
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const { bandIdx, startY, startGain } = dragRef.current;
      const dGain = ((startY - e.clientY) / FADER_TRACK_PX) * (GAIN_MAX - GAIN_MIN);
      const snapped = Math.round(
        Math.max(GAIN_MIN, Math.min(GAIN_MAX, startGain + dGain)) * 2
      ) / 2;
      setUserGains(prev => {
        const next = [...prev];
        next[bandIdx] = snapped;
        return next;
      });
    };
    const onUp = () => { dragRef.current = null; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };
  }, []);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => () => {
    try { sourceRef.current?.stop(); } catch { /* ok */ }
    audioCtxRef.current?.close();
    audioCtxRef.current  = null;
    musicBufferRef.current = null;
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const score      = overallScore(userGains);
  const bandScores = calcBandScores(userGains);
  const scoreColor =
    score >= 90 ? 'var(--green)' :
    score >= 60 ? 'var(--amber)' : 'var(--red)';

  const worstIdx = bandScores.reduce(
    (w, b, i) => Math.abs(b.diff) > Math.abs(bandScores[w].diff) ? i : w, 0
  );

  const gainToFaderTop = (g: number) =>
    `${((GAIN_MAX - g) / (GAIN_MAX - GAIN_MIN)) * 100}%`;

  const handleReset = () => {
    stopAudio();
    setUserGains(Array(8).fill(0));
    setRevealed(false);
    setSubmitted(false);
    setHintUsed(false);
  };

  const handleSubmit = () => {
    stopAudio();
    setRevealed(true);
    setSubmitted(true);
  };

  const handleHint = () => {
    setRevealed(true);
    setHintUsed(true);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="eq-lab">

      {/* Top bar */}
      <div className="lab-topbar">
        <div className="lab-title-row">
          <div className="lab-icon" style={{ background: 'var(--blue-dim)', borderColor: 'rgba(77,158,255,0.4)' }}>
            ≋
          </div>
          <div>
            <div className="lab-name">EQ Matching Challenge</div>
            <div className="lab-subtitle">LAB · CH 02 · EAR TRAINING</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {submitted && (
            <span className="badge" style={{
              background: score >= 90 ? 'var(--green-dim)' : 'var(--amber-dim)',
              borderColor: score >= 90 ? 'rgba(0,255,135,0.3)' : 'rgba(245,166,35,0.3)',
              color: score >= 90 ? 'var(--green)' : 'var(--amber)',
            }}>
              {score >= 90 ? '✓ PASSED' : `${score}% — RETRY`}
            </span>
          )}
          {!submitted && (
            <span className="badge" style={{
              background: 'var(--blue-dim)',
              borderColor: 'rgba(77,158,255,0.3)',
              color: 'var(--blue)',
            }}>
              🎧 LISTEN TO MATCH
            </span>
          )}
          <div className="lab-status" style={{ color: 'var(--blue)' }}>
            <div className="status-dot" style={{ background: 'var(--blue)', boxShadow: '0 0 6px var(--blue)' }} />
            {submitted ? `SCORE: ${score}%` : 'MATCHING'}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="eq-body">

        {/* Left */}
        <div className="eq-main">

          {/* Legend */}
          <div className="legend-row">
            <div className="legend-item">
              <div className="legend-line" style={{
                background: revealed ? 'var(--amber)' : 'var(--text-faint)',
                opacity: revealed ? 1 : 0.4,
              }} />
              {revealed ? 'TARGET CURVE' : 'TARGET (HIDDEN)'}
            </div>
            <div className="legend-item">
              <div className="legend-line" style={{ background: 'var(--blue)' }} />
              YOUR EQ
            </div>
            <div className="legend-item">
              <div className="legend-line" style={{ background: 'var(--text-faint)', height: '1px' }} />
              FLAT (0 dB)
            </div>
          </div>

          {/* Spectrum canvas */}
          <div className="spectrum-display">
            <canvas
              ref={canvasRef}
              width={900}
              height={170}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            />
          </div>

          {/* Faders */}
          <div className="canvas-label" style={{ margin: '0.75rem 0' }}>
            8-BAND EQ · DRAG FADERS TO MATCH THE SOUND YOU HEAR
          </div>
          <div className="eq-bands">
            {BANDS.map((band, i) => (
              <div className="eq-band" key={band.sub}>
                <div className="eq-gain-val" style={{
                  color: submitted
                    ? (Math.abs(bandScores[i].diff) < 1 ? 'var(--green)' :
                       Math.abs(bandScores[i].diff) < 3 ? 'var(--amber)' : 'var(--red)')
                    : 'var(--blue)',
                }}>
                  {userGains[i] > 0 ? '+' : ''}{userGains[i].toFixed(1)}
                </div>
                <div
                  className="eq-fader-track"
                  onMouseDown={e => handleFaderMouseDown(i, e)}
                  style={{ cursor: 'ns-resize', userSelect: 'none' }}
                >
                  {/* 0 dB centre tick */}
                  <div style={{
                    position: 'absolute', top: '50%', left: '-3px', right: '-3px',
                    height: '1px', background: 'var(--border-bright)', opacity: 0.45,
                  }} />
                  {/* Target marker shown after submit */}
                  {submitted && (
                    <div style={{
                      position: 'absolute',
                      top: gainToFaderTop(TARGET_GAINS[i]),
                      left: '-5px', right: '-5px',
                      height: '2px', background: 'var(--amber)', opacity: 0.7,
                      borderRadius: '1px',
                    }} />
                  )}
                  <div className="eq-fader-thumb" style={{ top: gainToFaderTop(userGains[i]) }} />
                </div>
                <div className="eq-band-label">{band.label}<br />{band.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="eq-sidebar">

          {/* Ear training instructions */}
          {!submitted && (
            <div style={{
              background: 'rgba(77,158,255,0.08)',
              border: '1px solid rgba(77,158,255,0.2)',
              borderRadius: '4px',
              padding: '0.75rem',
              fontSize: '0.7rem',
              color: 'var(--text-dim)',
              lineHeight: 1.6,
            }}>
              <div style={{ color: 'var(--blue)', fontWeight: 600, marginBottom: '0.4rem', fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.08em' }}>
                🎧 HOW TO PLAY
              </div>
              1. Press <strong style={{ color: 'var(--amber)' }}>Hear Target</strong> to listen to the goal sound.<br />
              2. Press <strong style={{ color: 'var(--blue)' }}>Hear Mine</strong> to hear your current EQ.<br />
              3. Drag faders until they sound the same.<br />
              4. Submit when you're confident.
            </div>
          )}

          {/* Score ring — only shown after submit */}
          {submitted && (
            <div className="score-ring-wrap">
              <div
                className="score-ring"
                style={{ background: `conic-gradient(${scoreColor} 0% ${score}%, var(--surface) ${score}% 100%)` }}
              >
                <div className="score-ring-inner">
                  <div className="score-num" style={{ color: scoreColor }}>{score}</div>
                  <div className="score-lbl">SCORE</div>
                </div>
              </div>
              <div className="score-label">MATCH ACCURACY</div>
              {hintUsed && (
                <div style={{ fontSize: '0.55rem', color: 'var(--red)', fontFamily: 'var(--mono)', marginTop: '0.2rem' }}>
                  HINT USED
                </div>
              )}
            </div>
          )}

          {/* Band accuracy — only shown after submit */}
          {submitted && (
            <div className="band-analysis">
              <div className="canvas-label">BAND ACCURACY</div>
              {BANDS.map((band, i) => {
                const { diff, acc, color } = bandScores[i];
                return (
                  <div className="band-item" key={band.sub}>
                    <div className="band-name">{band.sub}</div>
                    <div className="band-bar-track">
                      <div className="band-bar-fill" style={{ width: `${acc * 100}%`, background: color }} />
                    </div>
                    <div className="band-diff" style={{ color }}>
                      {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tip: always show, based on worst band (but no spoilers before submit) */}
          <div className="tip-box">
            <strong>Tip:</strong>{' '}
            {submitted
              ? BAND_TIPS[worstIdx]
              : 'Try to A/B compare quickly — your short-term memory for tone fades in about 5 seconds.'}
          </div>

          {/* Hint button before submit */}
          {!submitted && !revealed && (
            <button
              className="btn-secondary"
              onClick={handleHint}
              style={{ fontSize: '0.7rem', borderColor: 'rgba(245,166,35,0.3)', color: 'var(--amber)' }}
            >
              👁 Show Target Curve (reveals answer)
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="lab-footer">
        <div className="hint-text">
          {submitted
            ? (score >= 90
                ? <span style={{ color: 'var(--green)' }}>✓ Excellent ear! Orange markers show target positions.</span>
                : 'Orange markers on faders show the target positions. Retry to improve.')
            : <>Press <strong style={{ color: 'var(--amber)', margin: '0 0.25rem' }}>Hear Target</strong> then <strong style={{ color: 'var(--blue)', margin: '0 0.25rem' }}>Hear Mine</strong> — dial in until they match.</>
          }
        </div>
        <div className="btn-row">
          <button className="btn-secondary" onClick={handleReset}>Reset</button>
          <button
            className="btn-secondary"
            onClick={() => playAudio('target')}
            style={playMode === 'target' ? { borderColor: 'var(--amber)', color: 'var(--amber)' } : {}}
          >
            {playMode === 'target' ? '⏸ Target' : '▶ Hear Target'}
          </button>
          <button
            className="btn-secondary"
            onClick={() => playAudio('mine')}
            style={playMode === 'mine' ? { borderColor: 'var(--blue)', color: 'var(--blue)' } : {}}
          >
            {playMode === 'mine' ? '⏸ Mine' : '▶ Hear Mine'}
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={submitted && score >= 90}>
            {submitted && score >= 90 ? '✓ Passed →' : 'Submit Score →'}
          </button>
        </div>
      </div>
    </div>
  );
}
