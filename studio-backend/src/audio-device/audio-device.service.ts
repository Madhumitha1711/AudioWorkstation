import { execFile } from 'node:child_process';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import { AudioDeviceFormat } from './audio-device.types';

// Browsers expose the output device's sample rate but never its bit depth,
// so studio-vr's /audio-test dev tool (src/dev-tools/AudioFormatTester.jsx)
// asks this API instead. We run coreaudio_format.py, which reads the default
// output device's hardware format from CoreAudio (the same value Audio MIDI
// Setup shows).
//
// NOTE: this reports the audio device of the machine the *backend* runs on,
// so it's only meaningful when studio-backend runs locally on the same Mac
// as the browser. macOS only — any other platform returns ok:false.
//
// The .py helper sits next to this file and is copied into dist/ by the
// `assets` entry in nest-cli.json, so __dirname resolves in both
// `nest start --watch` and `node dist/main`.
const HELPER = path.join(__dirname, 'coreaudio_format.py');

@Injectable()
export class AudioDeviceService {
  getOutputFormat(): Promise<AudioDeviceFormat> {
    if (process.platform !== 'darwin') {
      return Promise.resolve({
        ok: false,
        error: `OS bit depth lookup is only implemented for macOS (backend is on ${process.platform})`,
      });
    }

    return new Promise((resolve) => {
      execFile(
        'python3',
        [HELPER],
        { timeout: 5000 },
        (err, stdout, stderr) => {
          if (err) {
            resolve({ ok: false, error: (stderr || err.message).trim() });
            return;
          }
          try {
            resolve(JSON.parse(stdout) as AudioDeviceFormat);
          } catch {
            resolve({
              ok: false,
              error: `Unexpected helper output: ${stdout.slice(0, 200)}`,
            });
          }
        },
      );
    });
  }
}
