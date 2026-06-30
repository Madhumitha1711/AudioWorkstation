import Chapter1 from './chapters/Chapter1';
import Chapter2 from './chapters/Chapter2';
import Chapter4 from './chapters/Chapter4';
import './App.css';

export default function App() {
  return (
    <div className="soundcraft-app">
      {/* ── Chapter 1 ── */}
      <div className="chapter-divider">
        <div className="chapter-tag">Chapter 01 · Sound Fundamentals</div>
        <h2 className="chapter-title">Anatomy of a Sound Wave</h2>
        <p className="chapter-desc">
          You've learned how waves carry energy through air. Now build one from
          scratch — observe how frequency, amplitude, and shape transform sound in
          real time.
        </p>
        <hr className="lab-separator" />
      </div>

      <div className="screen">
        <Chapter1 />
      </div>

      {/* ── Chapter 2 ── */}
      <div className="chapter-divider">
        <div className="chapter-tag">Chapter 02 · Equalization</div>
        <h2 className="chapter-title">Match the Frequency Curve</h2>
        <p className="chapter-desc">
          An EQ shapes the tonal balance of a sound. Adjust each frequency band to
          match the reference curve — your score updates live as you dial in.
        </p>
        <hr className="lab-separator" />
      </div>

      <div className="screen">
        <Chapter2 />
      </div>

      {/* ── Chapter 4 ── */}
      <div className="chapter-divider">
        <div className="chapter-tag">Chapter 04 · Dynamics Processing</div>
        <h2 className="chapter-title">Shape the Dynamic Range</h2>
        <p className="chapter-desc">
          A compressor controls the loudest and softest moments of a recording.
          Dial in threshold, ratio, attack, and release — then compare the
          uncompressed vs. compressed waveform.
        </p>
        <hr className="lab-separator" />
      </div>

      <div className="screen">
        <Chapter4 />
      </div>
    </div>
  );
}
