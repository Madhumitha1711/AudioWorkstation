import { useEffect, useRef } from "react";

// Log-frequency spectrum (20 Hz – 20 kHz) plus a pair of L/R RMS meters on
// one canvas, drawn every animation frame while mounted. Ported from the
// mockup's drawScope(). Colors are read from the canvas's own computed
// style, so the lab-scoped --cll-* tokens (and their light-theme values)
// apply without the drawing code knowing about themes.
//
// `side`/`band`/`active`/`concealed` are read through a ref so prop changes
// never restart the rAF loop. `concealed` (quiz, before answering / hint)
// draws nothing at all — not the curve, the band or the L/R meters — so
// the answer can't be read through the veil.
const fbin = new Float32Array(2048);
const tbin = new Float32Array(1024);

// Canvas gradients need an alpha channel on the token color. The --cll-green
// / --cll-amber tokens are plain #rrggbb for exactly this reason.
const withAlpha = (hex, a) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

function Spectrum({ engine, side, band, active, concealed = false }) {
  const cvRef = useRef(null);
  const propsRef = useRef({ side, band, active, concealed });
  useEffect(() => {
    propsRef.current = { side, band, active, concealed };
  }, [side, band, active, concealed]);

  useEffect(() => {
    let raf = 0;
    const cv = cvRef.current;

    function draw() {
      raf = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth, h = cv.clientHeight;
      if (!w) return;
      if (cv.width !== Math.round(w * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      const { side, band, active, concealed } = propsRef.current;
      const cs = getComputedStyle(cv);
      const tok = (v) => cs.getPropertyValue(v).trim();
      const g = cv.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      if (concealed) return;

      const mw = 34, sw = w - mw - 8;
      const x = (f) => (Math.log10(f / 20) / 3) * sw;

      g.strokeStyle = tok("--cll-grid");
      g.lineWidth = 1;
      [50, 100, 200, 500, 1000, 2000, 5000, 10000].forEach((f) => {
        g.beginPath();
        g.moveTo(x(f) + 0.5, 0);
        g.lineTo(x(f) + 0.5, h);
        g.stroke();
      });

      if (band) {
        const amber = tok("--cll-amber");
        g.fillStyle = withAlpha(amber, 0.13);
        g.fillRect(x(band[0]), 0, x(Math.min(band[1], 20000)) - x(band[0]), h);
        g.strokeStyle = withAlpha(amber, 0.53);
        g.setLineDash([3, 3]);
        band.forEach((f) => {
          if (f < 20000) {
            g.beginPath();
            g.moveTo(x(f), 0);
            g.lineTo(x(f), h);
            g.stroke();
          }
        });
        g.setLineDash([]);
      }

      const col = tok(side === "A" ? "--cll-green" : "--cll-amber");
      const levels = [0, 0];
      const A = active && engine.isPlaying() ? engine.analysers() : null;
      if (A) {
        A.an.getFloatFrequencyData(fbin);
        const ny = A.sampleRate / 2;
        g.beginPath();
        g.moveTo(0, h);
        for (let px = 0; px <= sw; px += 2) {
          const f = 20 * Math.pow(10, (px / sw) * 3);
          const i = Math.min(fbin.length - 1, Math.round((f / ny) * fbin.length));
          const db = Math.max(-110, fbin[i]);
          const y = h - ((db + 110) / 90) * h;
          g.lineTo(px, Math.max(2, y));
        }
        g.lineTo(sw, h);
        g.closePath();
        const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, withAlpha(col, 0.4));
        gr.addColorStop(1, withAlpha(col, 0.02));
        g.fillStyle = gr;
        g.fill();
        g.strokeStyle = col;
        g.lineWidth = 1.5;
        g.stroke();
        [A.anL, A.anR].forEach((a, k) => {
          a.getFloatTimeDomainData(tbin);
          let sum = 0;
          for (let i = 0; i < tbin.length; i++) sum += tbin[i] * tbin[i];
          const db = 20 * Math.log10(Math.sqrt(sum / tbin.length) + 1e-6);
          levels[k] = Math.max(0, Math.min(1, (db + 48) / 48));
        });
      }

      // L/R meters
      const mx = w - mw;
      g.font = "500 9px ui-monospace, Consolas, monospace";
      g.textAlign = "center";
      levels.forEach((lv, k) => {
        const bx = mx + k * 16, bh = h - 22;
        g.fillStyle = tok("--cll-meter-bg");
        g.fillRect(bx, 6, 10, bh);
        g.fillStyle = col;
        g.fillRect(bx, 6 + bh * (1 - lv), 10, bh * lv);
        g.fillStyle = tok("--text-dim");
        g.fillText(k ? "R" : "L", bx + 5, h - 5);
      });
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  return <canvas ref={cvRef} className="cll-canvas" aria-hidden="true" />;
}

export default Spectrum;
