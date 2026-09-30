import request from "./client";

// OS hardware format of the default audio output device (incl. bit depth,
// which browsers never expose) — served by studio-backend's GET
// /audio-device (src/audio-device/ there). Public, dev-tool only: used by
// /audio-test (src/dev-tools/AudioFormatTester.jsx).
export function getAudioDeviceFormat() {
  return request("/audio-device");
}
