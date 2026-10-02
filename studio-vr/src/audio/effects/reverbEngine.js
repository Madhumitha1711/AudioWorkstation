export const ROOM_PRESETS = {
  ROOM: { name: 'ROOM', icon: '🚿', rt60: 0.4, earlyCount: 3, label: 'Small Room' },
  CHAMBER: { name: 'CHAMBER', icon: '🎙️', rt60: 0.9, earlyCount: 4, label: 'Vocal Chamber' },
  HALL: { name: 'HALL', icon: '⛪', rt60: 1.8, earlyCount: 5, label: 'Concert Hall' },
  CATHEDRAL: { name: 'CATHEDRAL', icon: '🏛️', rt60: 4.0, earlyCount: 7, label: 'Cathedral' },
  PLATE: { name: 'PLATE', icon: '🛠️', rt60: 2.5, earlyCount: 2, label: 'Plate Reverb' },
};

export const PRESET_FREEVERB = {
  ROOM: { size: 30, decay: 35, damping: 65, diffusion: 50 },
  CHAMBER: { size: 50, decay: 55, damping: 55, diffusion: 60 },
  HALL: { size: 68, decay: 70, damping: 45, diffusion: 80 },
  CATHEDRAL: { size: 88, decay: 90, damping: 30, diffusion: 85 },
  PLATE: { size: 55, decay: 60, damping: 70, diffusion: 40 },
};
export const PRESET_ORDER = ['ROOM', 'CHAMBER', 'HALL', 'CATHEDRAL', 'PLATE'];
export const DEFAULT_PRESET = 'HALL';

export function calcEffectiveRt60(size, decay) {
  const roomSize = (size / 100) * (0.05 + (decay / 100) * 0.95);
  return Math.max(0.1, roomSize * 5.0);
}

export const DEFAULTS = {
  preDelay: 24,
  hiShelfFreq: 8000,
  hiShelfGain: -6,
  loShelfFreq: 120,
  loShelfGain: -6,
  wetDry: 35,
  ...PRESET_FREEVERB['HALL'],
};

const ADDR = {
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
