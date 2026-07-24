// Shared, non-component Reverb logic: room presets, the effective-RT60
// helper, Faust param defaults/addresses, the pushFaustParams helper that
// writes typed params onto a live Faust reverb node, and a small
// analyser-peak reader.
//
// Split out from Reverb.jsx (which exports the ReverbEditorPanel/Reverb
// *components*) so that file only exports components — keeps Vite Fast
// Refresh working there — and gives any other host (e.g. the DAW
// workstation's insert-chain popup, ../panorama/DawWorkstationScreen) a plain
// module to import this from without pulling in component-only concerns.
// Same split as ./gateEngine for the Noise Gate.

// rt60 is in seconds (visual only — IR generated from this)
export const ROOM_PRESETS = {
  ROOM: { name: 'ROOM', icon: '🚿', rt60: 0.4, earlyCount: 3, label: 'Small Room' },
  CHAMBER: { name: 'CHAMBER', icon: '🎙️', rt60: 0.9, earlyCount: 4, label: 'Vocal Chamber' },
  HALL: { name: 'HALL', icon: '⛪', rt60: 1.8, earlyCount: 5, label: 'Concert Hall' },
  CATHEDRAL: { name: 'CATHEDRAL', icon: '🏛️', rt60: 4.0, earlyCount: 7, label: 'Cathedral' },
  PLATE: { name: 'PLATE', icon: '🛠️', rt60: 2.5, earlyCount: 2, label: 'Plate Reverb' },
};

// Preset → sensible Freeverb defaults
export const PRESET_FREEVERB = {
  ROOM: { size: 30, decay: 35, damping: 65, diffusion: 50 },
  CHAMBER: { size: 50, decay: 55, damping: 55, diffusion: 60 },
  HALL: { size: 68, decay: 70, damping: 45, diffusion: 80 },
  CATHEDRAL: { size: 88, decay: 90, damping: 30, diffusion: 85 },
  PLATE: { size: 55, decay: 60, damping: 70, diffusion: 40 },
};
export const PRESET_ORDER = ['ROOM', 'CHAMBER', 'HALL', 'CATHEDRAL', 'PLATE'];
export const DEFAULT_PRESET = 'HALL';

// Effective RT60 from Freeverb knobs — mirrors the room_size formula in
// lib.rs: size × (0.05 + decay × 0.95) then scales to a visual RT60 range of
// 0.1 s – 5 s.
export function calcEffectiveRt60(size, decay) {
  const roomSize = (size / 100) * (0.05 + (decay / 100) * 0.95);
  return Math.max(0.1, roomSize * 5.0);
}

// Defaults — mirror the `init` values in public/faust/reverb/dsp-meta.json.
export const DEFAULTS = {
  preDelay: 24,
  // ── Shelving filters (replace the old HPF/LPF hi-cut/lo-cut) ──
  hiShelfFreq: 8000,
  hiShelfGain: -6,
  loShelfFreq: 120,
  loShelfGain: -6,
  wetDry: 35,
  ...PRESET_FREEVERB['HALL'],
};

// Faust addresses, from public/faust/reverb/dsp-meta.json's `ui` tree.
export const ADDR = {
  damping: '/Reverb_Parameters/DAMPING',
  decay: '/Reverb_Parameters/DECAY',
  diffusion: '/Reverb_Parameters/DIFFUSION',
  hiShelfFreq: '/Reverb_Parameters/HI-CUT_Freq',
  hiShelfGain: '/Reverb_Parameters/HI-SHELF_Gain',
  loShelfFreq: '/Reverb_Parameters/LO-CUT_Freq',
  loShelfGain: '/Reverb_Parameters/LO-SHELF_Gain',
  preDelay: '/Reverb_Parameters/PRE-DELAY',
  size: '/Reverb_Parameters/SIZE',
  wetDry: '/Reverb_Parameters/WET-DRY',
};

// Pushes every UI param onto a live Faust node. SIZE/DECAY/DAMPING/DIFFUSION/
// WET-DRY are 0..1 in the patch but 0..100 (%) on the knobs; the shelving
// filter freqs/gains and pre-delay already match the patch's own units. The
// reverb patch owns its own wet/dry mix internally, so — like the delay —
// there's no separate host-level bypass crossfade to manage.
export function pushFaustParams(node, p) {
  node.setParamValue(ADDR.damping, p.damping / 100);
  node.setParamValue(ADDR.decay, p.decay / 100);
  node.setParamValue(ADDR.diffusion, p.diffusion / 100);
  node.setParamValue(ADDR.hiShelfFreq, p.hiShelfFreq);
  node.setParamValue(ADDR.hiShelfGain, p.hiShelfGain);
  node.setParamValue(ADDR.loShelfFreq, p.loShelfFreq);
  node.setParamValue(ADDR.loShelfGain, p.loShelfGain);
  node.setParamValue(ADDR.preDelay, p.preDelay);
  node.setParamValue(ADDR.size, p.size / 100);
  node.setParamValue(ADDR.wetDry, p.wetDry / 100);
}

export const METER_FLOOR_DB = -70;

// Reads one analyser's current block-peak level, as a LINEAR amplitude
// (0..1) rather than dB — shared by the standalone lab's own level reading
// and any host (e.g. the DAW workstation) driving ReverbEditorPanel from its
// own analysers. Callers that want dB convert with
// `peak > 1e-6 ? 20 * Math.log10(peak) : METER_FLOOR_DB`.
export function analyserPeakLinear(analyser) {
  if (!analyser) return null;
  const buf = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buf);
  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
  return peak;
}
