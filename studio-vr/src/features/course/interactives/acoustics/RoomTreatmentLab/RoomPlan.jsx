// Top-down plan of the treatment room for one step: walls, source, mic,
// the direct path, the four first-order reflections (drawn with real
// mirror-image geometry), and whatever treatment that step has added.
//
//   amber  = the problem: specular reflections that reach the mic, flutter
//            echo between the parallel side walls, bass building up in the
//            corners
//   green  = the fix: absorption panels, bass traps, diffuser, ceiling cloud
//
// A reflection off an absorbing wall is drawn as a faded first leg that
// stops at the panel; off the diffuser it fans out into short scattered
// rays instead of bouncing straight back at the mic. `live` (the step is
// playing) animates the rays and pulses the corner boom.

const X0 = 14;
const Y0 = 14;
const X1 = 206;
const Y1 = 136;
const S = { x: 64, y: 92 };
const M = { x: 146, y: 62 };

// Mirror the mic in the wall, intersect source→mirror with the wall.
function reflectionPoint(wall) {
  const mirror = {
    top: { x: M.x, y: 2 * Y0 - M.y },
    bottom: { x: M.x, y: 2 * Y1 - M.y },
    left: { x: 2 * X0 - M.x, y: M.y },
    right: { x: 2 * X1 - M.x, y: M.y },
  }[wall];
  const t =
    wall === "top" || wall === "bottom"
      ? ((wall === "top" ? Y0 : Y1) - S.y) / (mirror.y - S.y)
      : ((wall === "left" ? X0 : X1) - S.x) / (mirror.x - S.x);
  return { x: S.x + t * (mirror.x - S.x), y: S.y + t * (mirror.y - S.y) };
}
const WALLS = ["top", "bottom", "left", "right"];
const P = Object.fromEntries(WALLS.map((w) => [w, reflectionPoint(w)]));

const CORNERS = [
  [X0, Y0, 1, 1],
  [X1, Y0, -1, 1],
  [X0, Y1, 1, -1],
  [X1, Y1, -1, -1],
];

function arc(cx, cy, dx, dy, r) {
  return `M${cx + dx * r},${cy} A${r},${r} 0 0 ${dx * dy > 0 ? 1 : 0} ${cx},${cy + dy * r}`;
}

function describe(plan) {
  const parts = [];
  if (plan.foamAll) parts.push("thin foam on every wall, so no reflections reach the mic");
  else if (plan.absorb.length) parts.push("absorption panels at the first reflection points");
  else parts.push("bare walls, with strong reflections reaching the mic");
  if (plan.flutter) parts.push("flutter echo between the parallel walls");
  if (plan.traps) parts.push("bass traps in all four corners");
  if (plan.diffuser) parts.push("a diffuser scattering the back-wall reflection");
  if (plan.cloud) parts.push("a ceiling cloud above the source and mic");
  if (plan.boom > 0.5) parts.push("bass building up in the corners");
  return `Top-down room plan: ${parts.join(", ")}.`;
}

export default function RoomPlan({ plan, live }) {
  const absorbed = (w) => plan.foamAll || plan.absorb.includes(w);

  return (
    <svg className={`rtp${live ? " is-live" : ""}`} viewBox="0 0 220 150" role="img" aria-label={describe(plan)}>
      {/* floor + walls */}
      <rect className="rtp-floor" x={X0} y={Y0} width={X1 - X0} height={Y1 - Y0} />

      {/* corner bass build-up */}
      {plan.boom > 0.05 &&
        CORNERS.map(([cx, cy, dx, dy], i) => (
          <g key={i} className="rtp-boom" style={{ opacity: plan.boom }}>
            <path d={arc(cx, cy, dx, dy, 12)} />
            <path d={arc(cx, cy, dx, dy, 20)} />
            <path d={arc(cx, cy, dx, dy, 28)} />
          </g>
        ))}

      {/* ceiling cloud (drawn under the rays — it's overhead) */}
      {plan.cloud && (
        <g className="rtp-cloud">
          <rect x={S.x - 12} y={M.y - 14} width={M.x - S.x + 24} height={S.y - M.y + 28} rx="4" />
          <text x={(S.x + M.x) / 2} y={M.y - 17} textAnchor="middle">
            ceiling cloud
          </text>
        </g>
      )}

      {/* flutter echo between the two parallel side walls */}
      {plan.flutter && (
        <polyline
          className="rtp-flutter"
          points={[182, 186, 190, 194, 198].map((x, i) => `${x},${i % 2 ? Y1 - 3 : Y0 + 3}`).join(" ")}
        />
      )}

      {/* reflections */}
      {WALLS.map((w) => {
        const p = P[w];
        if (absorbed(w)) {
          return (
            <g key={w} className="rtp-absorbed">
              <line x1={S.x} y1={S.y} x2={p.x} y2={p.y} />
              <circle cx={p.x} cy={p.y} r="2.2" />
            </g>
          );
        }
        if (w === "right" && plan.diffuser) {
          return (
            <g key={w} className="rtp-scattered">
              <line className="rtp-ray-in" x1={S.x} y1={S.y} x2={p.x} y2={p.y} />
              {[150, 170, 190, 210, 230].map((deg) => {
                const a = (deg * Math.PI) / 180;
                return <line key={deg} x1={p.x - 6} y1={p.y} x2={p.x - 6 + Math.cos(a) * 20} y2={p.y + Math.sin(a) * 20} />;
              })}
            </g>
          );
        }
        return <polyline key={w} className="rtp-ray" points={`${S.x},${S.y} ${p.x},${p.y} ${M.x},${M.y}`} />;
      })}

      {/* direct sound */}
      <line className="rtp-direct" x1={S.x} y1={S.y} x2={M.x} y2={M.y} />

      {/* walls on top of rays so the rays meet them cleanly */}
      <rect className="rtp-wall" x={X0} y={Y0} width={X1 - X0} height={Y1 - Y0} />

      {/* treatment */}
      {plan.foamAll ? (
        <g className="rtp-foam">
          <rect x={X0} y={Y0} width={X1 - X0} height="3.5" />
          <rect x={X0} y={Y1 - 3.5} width={X1 - X0} height="3.5" />
          <rect x={X0} y={Y0} width="3.5" height={Y1 - Y0} />
          <rect x={X1 - 3.5} y={Y0} width="3.5" height={Y1 - Y0} />
        </g>
      ) : (
        <g className="rtp-panel">
          {plan.absorb.includes("top") && <rect x={P.top.x - 20} y={Y0} width="40" height="6" rx="1" />}
          {plan.absorb.includes("bottom") && <rect x={P.bottom.x - 20} y={Y1 - 6} width="40" height="6" rx="1" />}
          {plan.absorb.includes("left") && <rect x={X0} y={P.left.y - 20} width="6" height="40" rx="1" />}
          {plan.absorb.includes("right") && <rect x={X1 - 6} y={P.right.y - 20} width="6" height="40" rx="1" />}
        </g>
      )}
      {plan.traps && (
        <g className="rtp-trap">
          {CORNERS.map(([cx, cy, dx, dy], i) => (
            <path key={i} d={`M${cx},${cy} L${cx + dx * 22},${cy} L${cx},${cy + dy * 22} Z`} />
          ))}
        </g>
      )}
      {plan.diffuser && (
        <g className="rtp-diffuser">
          {[4, 9, 2, 7, 5, 10, 3].map((d, i) => (
            <rect key={i} x={X1 - d} y={P.right.y - 24.5 + i * 7} width={d} height="6.5" />
          ))}
        </g>
      )}

      {/* source + mic */}
      <g className="rtp-src">
        <circle cx={S.x} cy={S.y} r="7" />
        <path d={`M${S.x - 2.5},${S.y - 3} l0,6 l5,-3 z`} />
        <text x={S.x} y={S.y + 17} textAnchor="middle">
          source
        </text>
      </g>
      <g className="rtp-mic">
        <circle cx={M.x} cy={M.y} r="4.5" />
        <line x1={M.x + 3} y1={M.y + 3} x2={M.x + 9} y2={M.y + 9} />
        <text x={M.x + 3} y={M.y - 9} textAnchor="middle">
          mic
        </text>
      </g>
    </svg>
  );
}

/** One-line legend shown above the steps. */
export function RoomPlanLegend() {
  return (
    <div className="rtp-legend" aria-hidden="true">
      <span>
        <i className="rtp-key rtp-key--direct" /> direct sound
      </span>
      <span>
        <i className="rtp-key rtp-key--ray" /> reflection reaching the mic
      </span>
      <span>
        <i className="rtp-key rtp-key--boom" /> bass build-up
      </span>
      <span>
        <i className="rtp-key rtp-key--fix" /> treatment
      </span>
    </div>
  );
}
