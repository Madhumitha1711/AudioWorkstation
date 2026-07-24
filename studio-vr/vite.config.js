import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // @grame/faustwasm builds its AudioWorkletProcessor at runtime by
    // `.toString()`-ing several of its own classes (FaustBaseWebAudioDsp,
    // FaustMonoWebAudioDsp, WasmAllocator, etc.) and re-evaluating that
    // source inside a fresh AudioWorklet global scope (via a Blob URL).
    // That trick only works if every identifier those classes reference
    // keeps its original name. Minifying the production bundle renames
    // internal helpers the classes call (they show up as single-letter
    // names like `z`), so the re-evaluated worklet code throws
    // "ReferenceError: z is not defined" and the processor never
    // registers — this only shows up in the minified prod build, not in
    // `vite dev`, which never minifies. Keeping minify off avoids it.
    minify: false,
  },
})
