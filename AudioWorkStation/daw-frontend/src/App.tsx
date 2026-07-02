import Chapter1 from './chapters/Chapter1';
import Chapter2 from './chapters/Chapter2';
import Chapter3 from './chapters/Chapter3';
import Chapter4 from './chapters/Chapter4';
import Chapter5 from './chapters/Chapter5';
import Chapter6 from './chapters/Chapter6';
import Chapter7 from './chapters/Chapter7';
import './App.css';

export default function App() {
  return (
    <div className="soundcraft-app">
      {/* ── Chapter 1 ── */}
      <div className="chapter-divider">
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

      {/* ── Chapter 3 ── */}
      <div className="chapter-divider">
        <h2 className="chapter-title">Balance a Six-Track Session</h2>
        <p className="chapter-desc">
          Apply fader, pan, mute, and solo controls on a real multi-track session.
          Your goal: craft a balanced mix where every element is heard clearly.
        </p>
        <hr className="lab-separator" />
      </div>

      <div className="screen">
        <Chapter3 />
      </div>

      {/* ── Chapter 4 ── */}
      <div className="chapter-divider">
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

      {/* ── Chapter 5 ── */}
      <div className="chapter-divider">
        <h2 className="chapter-title">Place Sounds in 3D Space</h2>
        <p className="chapter-desc">
          Drag sound sources around the stage. Adjust azimuth, elevation, distance, and
          reverb to create a believable sense of three-dimensional acoustic space.
        </p>
        <hr className="lab-separator" />
      </div>

      <div className="screen">
        <Chapter5 />
      </div>

      {/* ── Chapter 6 ── */}
      <div className="chapter-divider">
        <h2 className="chapter-title">Design a Reverb Space</h2>
        <p className="chapter-desc">
          Reverb is the sum of thousands of reflections decaying over time. Shape the impulse
          response — early reflections, density, and decay — to place a sound inside a believable
          physical space.
        </p>
        <hr className="lab-separator" />
      </div>

      <div className="screen">
        <Chapter6 />
      </div>

      {/* ── Chapter 7 ── */}
      <div className="chapter-divider">
        <h2 className="chapter-title">Add Warmth with Saturation</h2>
        <p className="chapter-desc">
          Saturation adds harmonic content by softly clipping a signal, the way analog tape
          and tube circuits do. Compare clipping curves and see exactly which harmonics each
          type generates.
        </p>
        <hr className="lab-separator" />
      </div>

      <div className="screen">
        <Chapter7 />
      </div>
    </div>
  );
}
