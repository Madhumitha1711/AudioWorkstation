import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // faustwasm re-evaluates its own classes' source inside the AudioWorklet;
    // minified identifiers break it ("z is not defined") in prod only.
    minify: false,
  },
})
