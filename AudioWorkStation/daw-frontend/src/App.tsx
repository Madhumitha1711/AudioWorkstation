import Chapter2b from './chapters/Chapter2b';
import Chapter3 from './chapters/Chapter3';
import Chapter4 from './chapters/Chapter4';
import Chapter6 from './chapters/Chapter6';
import Chapter7 from './chapters/Chapter7';
import Chapter9 from './chapters/Chapter9';
import Chapter10 from './chapters/Chapter10';
import Chapter11 from './chapters/Chapter11';
import Chapter12 from './chapters/Chapter12';
import './App.css';

export default function App() {
  return (
    <div className="soundcraft-app">
      {/* ── Chapter 2b ── */}
      <div className="chapter-divider">
        <h2 className="chapter-title">ParamEQ — Full Parametric Curve</h2>
        <p className="chapter-desc">
          A Logic-style 8-band parametric EQ (HPF, low shelf, 4 peaks, high shelf, LPF), driven by
          a single Faust ParamEQ WASM instance. Drag nodes directly on the curve in the Test Bench,
          or match a hidden target by ear — then download either render as a WAV file.
        </p>
        <hr className="lab-separator" />
      </div>

      <div className="screen">
        <Chapter2b />
      </div>

      {/* ── Chapter 10 ── */}
      <div className="chapter-divider">
        <h2 className="chapter-title">Silence the Noise Floor</h2>
        <p className="chapter-desc">
          A noise gate closes on quiet passages and opens on loud ones, muting hiss, hum, and bleed
          between hits without touching the signal above threshold. Dial in Gate Open / Gate Close,
          Attack, Hold, Release, and Floor — then compare the noisy vs. gated waveform.
        </p>
        <hr className="lab-separator" />
      </div>

      <div className="screen">
        <Chapter10 />
      </div>

      {/* ── Chapter 12 ── */}
      <div className="chapter-divider">
        <h2 className="chapter-title">Split-Band De-Esser</h2>
        <p className="chapter-desc">
          A de-esser splits the signal at a crossover frequency and compresses just the sibilant
          high band once it crosses threshold. Dial in Freq, Thresh, and Range, pick a High-Pass/Shelf
          or Band-Pass split, then watch the split-band curve and live scope react to real "s" bursts.
        </p>
        <hr className="lab-separator" />
      </div>

      <div className="screen">
        <Chapter12 />
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

      {/* ── Chapter 9 ── */}
      <div className="chapter-divider">
        <h2 className="chapter-title">Shape Character with Modulated, Filtered Delay</h2>
        <p className="chapter-desc">
          Beyond timing and feedback, a great delay has character — filtered repeats, subtle pitch
          modulation, and analog-style saturation. Dial in a delay that breathes instead of just
          repeating.
        </p>
        <hr className="lab-separator" />
      </div>

      <div className="screen">
        <Chapter9 />
      </div>


      {/* ── Chapter 11 ── */}
      <div className="chapter-divider">
        <h2 className="chapter-title">Set a Brickwall Ceiling with a Limiter</h2>
        <p className="chapter-desc">
          A limiter is a compressor with an infinite ratio: Threshold decides where limiting starts,
          Out Ceiling decides the hardest cap the output can ever reach. Dial in Threshold, Ceiling,
          Release, Auto Release, and Link L/R — then catch a hot loop's peaks without pumping the mix.
        </p>
        <hr className="lab-separator" />
      </div>

      <div className="screen">
        <Chapter11 />
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


    </div>
  );
}
