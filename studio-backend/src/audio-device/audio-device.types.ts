// Shape of GET /audio-device — mirrors the JSON printed by
// coreaudio_format.py. Always HTTP 200; `ok: false` carries the reason the
// lookup couldn't run (wrong OS, helper failed, ...).
export type AudioDeviceFormat =
  | {
      ok: true;
      deviceName: string | null;
      sampleRate: number;
      nominalSampleRate: number;
      bitDepth: number | null;
      isFloat: boolean;
      channels: number;
      formatLabel: string;
    }
  | { ok: false; error: string };
