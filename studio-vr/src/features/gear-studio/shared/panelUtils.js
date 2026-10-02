import { canvasFont } from '../../../theme/fonts';

export function hiDpi(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || canvas.width;
  const H = canvas.clientHeight || canvas.height;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, W, H };
}

export const specToFrac = (spec, v) => (spec.toFrac ? spec.toFrac(v) : (v - spec.min) / (spec.max - spec.min));
export const specFromFrac = (spec, f) => (spec.fromFrac ? spec.fromFrac(f) : spec.min + f * (spec.max - spec.min));
export const knobRotationForSpec = (spec, v) => -140 + specToFrac(spec, v) * 280;

function polarToCartesian(r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: r * Math.cos(rad), y: r * Math.sin(rad) };
}

export function describeArc(r, start, end) {
  if (Math.abs(end - start) < 0.1) end = start + 0.1;
  const s = polarToCartesian(r, start);
  const e = polarToCartesian(r, end);
  const large = end - start > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

function hLine(ctx, W, y, stroke, dash) {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(W, y);
  ctx.stroke();
  ctx.setLineDash([]);
}

function polyline(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
}

export function drawLevelScope(canvas, history, nowT, {
  windowS = 4, minDb, maxDb, gridFrom = Math.ceil(minDb / 12) * 12,
  zeroLine = { stroke: '#2E2E3D', dash: [4, 3] }, lines = [], idleText = null,
  fill, fillAlpha = 0.24, fillBottom = (p) => p.outputDb, inColor = '#00FF87', inAlpha = 0.6, outColor, timeLabels = false,
}) {
  const hd = hiDpi(canvas);
  if (!hd) return;
  const { ctx, W, H } = hd;
  const toY = (db) => H - ((Math.min(maxDb, Math.max(minDb, db)) - minDb) / (maxDb - minDb)) * H;
  const toX = (t) => ((t - (nowT - windowS)) / windowS) * W;
  ctx.fillStyle = '#0D0D0F';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#6A6A7A';
  ctx.font = canvasFont(9, { mono: true });
  for (let db = gridFrom; db <= maxDb; db += 12) {
    const y = toY(db);
    hLine(ctx, W, y, 'rgba(255,255,255,0.03)', []);
    ctx.fillText(`${db > 0 ? '+' : ''}${db}`, 3, y - 2);
  }
  if (zeroLine) hLine(ctx, W, toY(0), zeroLine.stroke, zeroLine.dash);
  for (const l of lines) {
    const y = toY(l.db);
    hLine(ctx, W, y, l.stroke, l.dash ?? [2, 3]);
    ctx.fillStyle = l.labelColor;
    ctx.fillText(l.label, W - l.dx, y + (l.dy ?? -3));
  }
  if (idleText) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = canvasFont(10, { mono: true });
    ctx.fillText(idleText, W / 2 - 110, H / 2);
    return;
  }
  const visible = history.filter((p) => p.t >= nowT - windowS - 0.25);
  if (visible.length < 2) return;
  const pts = (fn) => visible.map((p) => ({ x: toX(p.t), y: toY(fn(p)) }));
  const inPts = pts((p) => p.inputDb);
  const outPts = pts((p) => p.outputDb);
  const bottom = pts(fillBottom);
  ctx.save();
  ctx.globalAlpha = fillAlpha;
  ctx.fillStyle = fill;
  polyline(ctx, inPts);
  for (let i = bottom.length - 1; i >= 0; i--) ctx.lineTo(bottom[i].x, bottom[i].y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = inAlpha;
  ctx.strokeStyle = inColor;
  ctx.lineWidth = 1.25;
  polyline(ctx, inPts);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = outColor;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  polyline(ctx, outPts);
  ctx.stroke();
  if (timeLabels) {
    ctx.fillStyle = '#8A8A9A';
    ctx.font = canvasFont(9, { mono: true });
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`-${windowS}s`, 4, H - 4);
    ctx.fillText('NOW', W - 26, H - 4);
  }
}

function vLine(ctx, x, H, stroke, dash) {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, H);
  ctx.stroke();
  ctx.setLineDash([]);
}

export function transferFrame(canvas, { inMin, inMax, outMin = inMin, outMax = inMax, xStep, yStep = xStep, yFrom = outMin, signedY = false }) {
  const hd = hiDpi(canvas);
  if (!hd) return null;
  const { ctx, W, H } = hd;
  const toX = (db) => ((db - inMin) / (inMax - inMin)) * W;
  const toY = (db) => H - ((Math.max(outMin, db) - outMin) / (outMax - outMin)) * H;
  ctx.fillStyle = '#0D0D0F';
  ctx.fillRect(0, 0, W, H);
  for (let db = inMin; db <= inMax; db += xStep) vLine(ctx, toX(db), H, 'rgba(255,255,255,0.03)', []);
  for (let db = yFrom; db <= outMax; db += yStep) hLine(ctx, W, toY(db), 'rgba(255,255,255,0.03)', []);
  ctx.fillStyle = '#6A6A7A';
  ctx.font = canvasFont(9, { mono: true });
  for (let db = inMin; db <= inMax; db += xStep) ctx.fillText(`${db}`, toX(db) + 2, H - 2);
  for (let db = yFrom; db <= outMax; db += yStep) ctx.fillText(`${signedY && db > 0 ? '+' : ''}${db}`, 2, toY(db) - 2);
  ctx.strokeStyle = '#2E2E3D';
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(toX(inMin), toY(inMin));
  ctx.lineTo(toX(inMax), toY(inMax));
  ctx.stroke();
  ctx.setLineDash([]);
  const marker = (x, label, labelY = H - 5) => {
    vLine(ctx, x, H, '#3D3D52', [2, 3]);
    ctx.fillStyle = '#8A8A9A';
    ctx.font = canvasFont(10, { mono: true });
    ctx.fillText(label, x + 3, labelY);
  };
  const curve = (fn, stroke, fill) => {
    const pts = [];
    for (let db = inMin; db <= inMax; db += 0.5) pts.push({ x: toX(db), y: toY(fn(db)) });
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2.5;
    if (fill) {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, H);
      for (const p of pts) ctx.lineTo(p.x, p.y);
      ctx.lineTo(toX(inMax), H);
      ctx.closePath();
      ctx.fill();
    }
    polyline(ctx, pts);
    ctx.stroke();
  };
  const axisLabels = () => {
    ctx.fillStyle = '#8A8A9A';
    ctx.font = canvasFont(10, { mono: true });
    ctx.fillText('INPUT (dB) →', W - 82, H - 5);
    ctx.save();
    ctx.translate(11, H * 0.38);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('↑ OUT (dB)', 0, 0);
    ctx.restore();
  };
  return { ctx, W, H, toX, toY, hLine: (y, stroke, dash) => hLine(ctx, W, y, stroke, dash), vLine: (x, stroke, dash) => vLine(ctx, x, H, stroke, dash), marker, curve, axisLabels };
}
