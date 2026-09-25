import { FREQS, SCALE_AGES, median } from "./hearingAgeModel";

// SVG charts for HearingAgeLab. Every color is applied through a CSS class
// or a var() in an inline style (never a resolved hex from JS), so the
// charts follow a light/dark switch instantly without re-rendering — the
// mockup instead read getComputedStyle() and had to redraw on theme flip.

const W = 680;
const H = 340;
const PAD = { l: 52, r: 96, t: 24, b: 40 };
const BANDS = [
  // [from dB, to dB, label, tone] — WHO grade bands
  [null, 20, "Normal", "green"],
  [20, 35, "Mild", "blue"],
  [35, 50, "Moderate", "amber"],
  [50, null, "Severe+", "red"],
];

function makeScales(yMin, yMax) {
  const x = (f) => PAD.l + (Math.log2(f / 250) / 5) * (W - PAD.l - PAD.r);
  const y = (d) => PAD.t + ((d - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
  return { x, y };
}

const toPath = (pts) => pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join("");

function Axes({ x, y, yMin, yMax, bandLabels }) {
  const ys = [];
  for (let d = yMin; d <= yMax; d += 10) ys.push(d);
  return (
    <g>
      {BANDS.map(([a0, b0, label, tone]) => {
        const a = a0 ?? yMin;
        const b = b0 ?? yMax;
        return (
          <g key={label}>
            <rect className={`hha-band hha-fill-${tone}`} x={PAD.l} y={y(a)} width={W - PAD.l - PAD.r} height={y(b) - y(a)} />
            {bandLabels && (
              <text className={`hha-fill-${tone}`} x={W - PAD.r + 10} y={(y(a) + y(b)) / 2 + 4} fontSize="10.5">
                {label}
              </text>
            )}
          </g>
        );
      })}
      {ys.map((d) => (
        <g key={d}>
          <line className="hha-gridline" x1={PAD.l} x2={W - PAD.r} y1={y(d)} y2={y(d)} />
          <text className="hha-axis-text" x={PAD.l - 10} y={y(d) + 4} fontSize="10.5" textAnchor="end">
            {d}
          </text>
        </g>
      ))}
      {FREQS.map((f) => (
        <g key={f}>
          <line className="hha-gridline" x1={x(f)} x2={x(f)} y1={PAD.t} y2={H - PAD.b} />
          <text className="hha-axis-text" x={x(f)} y={H - PAD.b + 18} fontSize="10.5" textAnchor="middle">
            {f >= 1000 ? f / 1000 + "k" : f}
          </text>
        </g>
      ))}
      <text className="hha-axis-text" x={PAD.l} y={H - 4} fontSize="10">
        Pitch (Hz) →
      </text>
      <text className="hha-axis-text" x="14" y={PAD.t + 4} fontSize="10" transform={`rotate(-90 14 ${PAD.t + 4})`} textAnchor="end">
        dB loss ↓
      </text>
    </g>
  );
}

/* Audiogram: measured thresholds per ear vs. the median curve at the
   calendar age and at the hearing age. Log-frequency x, dB loss y (down). */
export function Audiogram({ r, hear }) {
  const yMin = -10;
  const yMax = 80;
  const { x, y } = makeScales(yMin, yMax);
  const pts = (e) => FREQS.filter((f) => r.thr[e][f] != null).map((f) => [x(f), y(r.thr[e][f])]);
  const R = pts("R");
  const L = pts("L");
  return (
    <svg className="hha-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Audiogram of your right and left ear compared with typical hearing">
      <Axes x={x} y={y} yMin={yMin} yMax={yMax} bandLabels />
      <path className="hha-curve hha-curve-cal" d={toPath(FREQS.map((f) => [x(f), y(median(f, r.age, r.sex))]))} />
      <path className="hha-curve hha-curve-hear" d={toPath(FREQS.map((f) => [x(f), y(median(f, Math.max(hear, 18), r.sex))]))} />
      <path className="hha-ear-line hha-stroke-red" d={toPath(R)} />
      <path className="hha-ear-line hha-stroke-blue" d={toPath(L)} />
      {R.map(([cx, cy], i) => (
        <circle key={`r${i}`} className="hha-mark-r" cx={cx} cy={cy} r="6" />
      ))}
      {L.map(([cx, cy], i) => (
        <path key={`l${i}`} className="hha-mark-l" d={`M${cx - 5},${cy - 5}L${cx + 5},${cy + 5}M${cx + 5},${cy - 5}L${cx - 5},${cy + 5}`} />
      ))}
    </svg>
  );
}

/* "How ears age": the median curve for each decade, teal (20) → red (80). */
export function AgeFamily({ sex }) {
  const yMin = -10;
  const yMax = 80;
  const { x, y } = makeScales(yMin, yMax);
  // One curve per decade, teal → red. Right-hand labels are pushed at
  // least 13px below the previous one so they never overlap.
  const curves = [];
  SCALE_AGES.forEach((a, i) => {
    const col = `color-mix(in srgb, var(--hha-red) ${(i / (SCALE_AGES.length - 1)) * 100}%, var(--hha-teal))`;
    const pts = FREQS.map((f) => [x(f), y(Math.min(median(f, a, sex), 80))]);
    const last = pts.at(-1);
    const prev = curves.at(-1)?.ly ?? -99;
    curves.push({ a, col, pts, last, ly: Math.max(last[1] + 4, prev + 13) });
  });
  return (
    <svg className="hha-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Typical hearing loss by frequency for each decade of age">
      <Axes x={x} y={y} yMin={yMin} yMax={yMax} bandLabels={false} />
      {curves.map(({ a, col, pts, last, ly }) => (
        <g key={a}>
          <path d={toPath(pts)} fill="none" strokeWidth="2" style={{ stroke: col }} />
          <text x={last[0] + 8} y={ly} fontSize="10.5" style={{ fill: col }}>
            {a} yrs
          </text>
        </g>
      ))}
    </svg>
  );
}
