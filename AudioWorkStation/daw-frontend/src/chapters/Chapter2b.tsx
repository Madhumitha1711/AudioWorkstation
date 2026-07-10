import { useRef, useState, useEffect, useCallback } from 'react';
import { FaustMonoDspGenerator } from '@grame/faustwasm';
import { compileFaustWasm, type FaustDspMeta, type FaustNodeLike } from '../faust/faustTypes';
import { downloadBlob, audioBufferToWavBlob } from '../audio/wavRender';

// ═══════════════════════════════════════════════════════════════════════════
// Chapter 2b — ParamEQ (Logic-style parametric EQ, Faust WASM)
// ═══════════════════════════════════════════════════════════════════════════
// Uses the real 8-band "ParamEQ" Faust patch in public/faust/ParamEQ/
// (HPF → Low Shelf → 4x Peak → High Shelf → LPF), driven by a single Faust
// AudioWorkletNode whose params are the addresses in dsp-meta.json — instead
// of per-band BiquadFilterNodes (Chapter 2) or per-band Faust instances
// (Chapter 2a). The UI mirrors a Logic-style Channel EQ: a draggable curve
// with one node per band, plus a live spectrum analyzer.
//
// Two exercises share the same engine:
//   • TEST BENCH  — upload your own audio, freely sculpt the curve, download
//     the processed result. Meant for experimentation.
//   • EAR TRAINING — a hidden target curve is set on load; adjust your own
//     curve by listening (not looking) until it sounds the same, then submit
//     for a score. Download both the target and your own render as WAV.

const FAUST_BASE_PATH = '/faust/ParamEQ';

// ── Param addresses (from public/faust/ParamEQ/dsp-meta.json) ───────────────
const ADDR = {
  hpfFreq: '/ParamEQ/HPF_Freq',
  hpfBypass: '/ParamEQ/HPF_Bypass',
  hpfOrder: '/ParamEQ/HPF_Order',
  lowShelfFreq: '/ParamEQ/Low_Shelf_Freq',
  lowShelfGain: '/ParamEQ/Low_Shelf_Gain',
  lowShelfQ: '/ParamEQ/Low_Shelf_Q',
  lowShelfBypass: '/ParamEQ/Low_Shelf_Bypass',
  lowShelfDynamicOn: '/ParamEQ/Low_Shelf_Dynamic_On',
  lowShelfThreshold: '/ParamEQ/Low_Shelf_Threshold',
  lowShelfRange: '/ParamEQ/Low_Shelf_Range',
  lowShelfAttack: '/ParamEQ/Low_Shelf_Attack',
  lowShelfRelease: '/ParamEQ/Low_Shelf_Release',
  peak1Freq: '/ParamEQ/Peak1_Freq',
  peak1Gain: '/ParamEQ/Peak1_Gain',
  peak1Q: '/ParamEQ/Peak1_Q',
  peak1Bypass: '/ParamEQ/Peak1_Bypass',
  peak1DynamicOn: '/ParamEQ/Peak1_Dynamic_On',
  peak1Threshold: '/ParamEQ/Peak1_Threshold',
  peak1Range: '/ParamEQ/Peak1_Range',
  peak1Attack: '/ParamEQ/Peak1_Attack',
  peak1Release: '/ParamEQ/Peak1_Release',
  peak2Freq: '/ParamEQ/Peak2_Freq',
  peak2Gain: '/ParamEQ/Peak2_Gain',
  peak2Q: '/ParamEQ/Peak2_Q',
  peak2Bypass: '/ParamEQ/Peak2_Bypass',
  peak2DynamicOn: '/ParamEQ/Peak2_Dynamic_On',
  peak2Threshold: '/ParamEQ/Peak2_Threshold',
  peak2Range: '/ParamEQ/Peak2_Range',
  peak2Attack: '/ParamEQ/Peak2_Attack',
  peak2Release: '/ParamEQ/Peak2_Release',
  peak3Freq: '/ParamEQ/Peak3_Freq',
  peak3Gain: '/ParamEQ/Peak3_Gain',
  peak3Q: '/ParamEQ/Peak3_Q',
  peak3Bypass: '/ParamEQ/Peak3_Bypass',
  peak3DynamicOn: '/ParamEQ/Peak3_Dynamic_On',
  peak3Threshold: '/ParamEQ/Peak3_Threshold',
  peak3Range: '/ParamEQ/Peak3_Range',
  peak3Attack: '/ParamEQ/Peak3_Attack',
  peak3Release: '/ParamEQ/Peak3_Release',
  peak4Freq: '/ParamEQ/Peak4_Freq',
  peak4Gain: '/ParamEQ/Peak4_Gain',
  peak4Q: '/ParamEQ/Peak4_Q',
  peak4Bypass: '/ParamEQ/Peak4_Bypass',
  peak4DynamicOn: '/ParamEQ/Peak4_Dynamic_On',
  peak4Threshold: '/ParamEQ/Peak4_Threshold',
  peak4Range: '/ParamEQ/Peak4_Range',
  peak4Attack: '/ParamEQ/Peak4_Attack',
  peak4Release: '/ParamEQ/Peak4_Release',
  highShelfFreq: '/ParamEQ/High_Shelf_Freq',
  highShelfGain: '/ParamEQ/High_Shelf_Gain',
  highShelfQ: '/ParamEQ/High_Shelf_Q',
  highShelfBypass: '/ParamEQ/High_Shelf_Bypass',
  highShelfDynamicOn: '/ParamEQ/High_Shelf_Dynamic_On',
  highShelfThreshold: '/ParamEQ/High_Shelf_Threshold',
  highShelfRange: '/ParamEQ/High_Shelf_Range',
  highShelfAttack: '/ParamEQ/High_Shelf_Attack',
  highShelfRelease: '/ParamEQ/High_Shelf_Release',
  lpfFreq: '/ParamEQ/LPF_Freq',
  lpfBypass: '/ParamEQ/LPF_Bypass',
  lpfOrder: '/ParamEQ/LPF_Order',
} as const;

// HPF/LPF slope, as a Butterworth order (2/4/6/8 = 12/24/36/48 dB/oct). This
// is the value stored in ParamEQBands/BandDef; the underlying Faust nentry
// only accepts an index 0-3 (see ParamEQDynamic.dsp's hpf_order_sel /
// lpf_order_sel), so ORDER_VALUES/orderToIndex below convert between them.
const ORDER_VALUES = [2, 4, 6, 8] as const;
function orderToIndex(order: number): number {
  const i = ORDER_VALUES.indexOf(order as (typeof ORDER_VALUES)[number]);
  return i === -1 ? 1 : i; // default to index 1 (order 4 / 24dB/oct)
}

type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

// A single uploaded audio file kept in the Test Bench's source list, so
// multiple files can be uploaded and switched between without re-uploading.
interface UploadedAudioTrack {
  id: number;
  name: string;
  buffer: AudioBuffer;
}

// The 6 bands below (Low Shelf, Peak1-4, High Shelf) each carry Faust's
// built-in dynamic (level-dependent) mode: On/Off, Threshold, Range, Attack,
// Release. Range is signed — once the band's own level crosses Threshold,
// gain moves toward Range dB (negative cuts, positive boosts), same as
// dragging FabFilter Pro-Q's dynamic range indicator above or below the
// static gain line. HPF/LPF have no gain of their own, so Faust's ParamEQ
// patch doesn't expose dynamic params for them.
interface ParamEQBands {
  hpfFreq: number; hpfBypass: boolean; hpfOrder: number;
  lowShelfFreq: number; lowShelfGain: number; lowShelfQ: number; lowShelfBypass: boolean;
  lowShelfDynamicOn: boolean; lowShelfThreshold: number; lowShelfRange: number; lowShelfAttack: number; lowShelfRelease: number;
  peak1Freq: number; peak1Gain: number; peak1Q: number; peak1Bypass: boolean;
  peak1DynamicOn: boolean; peak1Threshold: number; peak1Range: number; peak1Attack: number; peak1Release: number;
  peak2Freq: number; peak2Gain: number; peak2Q: number; peak2Bypass: boolean;
  peak2DynamicOn: boolean; peak2Threshold: number; peak2Range: number; peak2Attack: number; peak2Release: number;
  peak3Freq: number; peak3Gain: number; peak3Q: number; peak3Bypass: boolean;
  peak3DynamicOn: boolean; peak3Threshold: number; peak3Range: number; peak3Attack: number; peak3Release: number;
  peak4Freq: number; peak4Gain: number; peak4Q: number; peak4Bypass: boolean;
  peak4DynamicOn: boolean; peak4Threshold: number; peak4Range: number; peak4Attack: number; peak4Release: number;
  highShelfFreq: number; highShelfGain: number; highShelfQ: number; highShelfBypass: boolean;
  highShelfDynamicOn: boolean; highShelfThreshold: number; highShelfRange: number; highShelfAttack: number; highShelfRelease: number;
  lpfFreq: number; lpfBypass: boolean; lpfOrder: number;
}

// A flat, all-pass-through response and dynamic mode off everywhere. Unlike
// dsp-meta.json's own `init` values (which leave every band un-bypassed),
// every band here starts *bypassed* — an empty canvas where nothing shapes
// the sound until you explicitly turn a band ON in BandEditPanel, rather
// than 8 already-active (if currently flat) bands. Range defaults negative
// (a cut/ducking move once armed) since that's the far more common
// dynamic-EQ use case (de-essing, taming resonances); flip it positive in
// the UI to make a band boost instead.
const DEFAULT_DYNAMIC = { dynamicOn: false, threshold: -24, range: -6, attack: 0.005, release: 0.15 };

const DEFAULT_BANDS: ParamEQBands = {
  hpfFreq: 20, hpfBypass: true, hpfOrder: 4,
  lowShelfFreq: 75, lowShelfGain: 0, lowShelfQ: 0.7, lowShelfBypass: true,
  lowShelfDynamicOn: DEFAULT_DYNAMIC.dynamicOn, lowShelfThreshold: DEFAULT_DYNAMIC.threshold, lowShelfRange: DEFAULT_DYNAMIC.range, lowShelfAttack: DEFAULT_DYNAMIC.attack, lowShelfRelease: DEFAULT_DYNAMIC.release,
  peak1Freq: 100, peak1Gain: 0, peak1Q: 0.7, peak1Bypass: true,
  peak1DynamicOn: DEFAULT_DYNAMIC.dynamicOn, peak1Threshold: DEFAULT_DYNAMIC.threshold, peak1Range: DEFAULT_DYNAMIC.range, peak1Attack: DEFAULT_DYNAMIC.attack, peak1Release: DEFAULT_DYNAMIC.release,
  peak2Freq: 250, peak2Gain: 0, peak2Q: 1, peak2Bypass: true,
  peak2DynamicOn: DEFAULT_DYNAMIC.dynamicOn, peak2Threshold: DEFAULT_DYNAMIC.threshold, peak2Range: DEFAULT_DYNAMIC.range, peak2Attack: DEFAULT_DYNAMIC.attack, peak2Release: DEFAULT_DYNAMIC.release,
  peak3Freq: 1000, peak3Gain: 0, peak3Q: 1, peak3Bypass: true,
  peak3DynamicOn: DEFAULT_DYNAMIC.dynamicOn, peak3Threshold: DEFAULT_DYNAMIC.threshold, peak3Range: DEFAULT_DYNAMIC.range, peak3Attack: DEFAULT_DYNAMIC.attack, peak3Release: DEFAULT_DYNAMIC.release,
  peak4Freq: 2500, peak4Gain: 0, peak4Q: 1, peak4Bypass: true,
  peak4DynamicOn: DEFAULT_DYNAMIC.dynamicOn, peak4Threshold: DEFAULT_DYNAMIC.threshold, peak4Range: DEFAULT_DYNAMIC.range, peak4Attack: DEFAULT_DYNAMIC.attack, peak4Release: DEFAULT_DYNAMIC.release,
  highShelfFreq: 7500, highShelfGain: 0, highShelfQ: 0.7, highShelfBypass: true,
  highShelfDynamicOn: DEFAULT_DYNAMIC.dynamicOn, highShelfThreshold: DEFAULT_DYNAMIC.threshold, highShelfRange: DEFAULT_DYNAMIC.range, highShelfAttack: DEFAULT_DYNAMIC.attack, highShelfRelease: DEFAULT_DYNAMIC.release,
  lpfFreq: 20000, lpfBypass: true, lpfOrder: 4,
};

function setBool(node: FaustNodeLike, addr: string, v: boolean): void {
  node.setParamValue(addr, v ? 1 : 0);
}

function applyBandsToNode(node: FaustNodeLike, b: ParamEQBands): void {
  node.setParamValue(ADDR.hpfFreq, b.hpfFreq);
  setBool(node, ADDR.hpfBypass, b.hpfBypass);
  node.setParamValue(ADDR.hpfOrder, orderToIndex(b.hpfOrder));

  node.setParamValue(ADDR.lowShelfFreq, b.lowShelfFreq);
  node.setParamValue(ADDR.lowShelfGain, b.lowShelfGain);
  node.setParamValue(ADDR.lowShelfQ, b.lowShelfQ);
  setBool(node, ADDR.lowShelfBypass, b.lowShelfBypass);
  setBool(node, ADDR.lowShelfDynamicOn, b.lowShelfDynamicOn);
  node.setParamValue(ADDR.lowShelfThreshold, b.lowShelfThreshold);
  node.setParamValue(ADDR.lowShelfRange, b.lowShelfRange);
  node.setParamValue(ADDR.lowShelfAttack, b.lowShelfAttack);
  node.setParamValue(ADDR.lowShelfRelease, b.lowShelfRelease);

  node.setParamValue(ADDR.peak1Freq, b.peak1Freq);
  node.setParamValue(ADDR.peak1Gain, b.peak1Gain);
  node.setParamValue(ADDR.peak1Q, b.peak1Q);
  setBool(node, ADDR.peak1Bypass, b.peak1Bypass);
  setBool(node, ADDR.peak1DynamicOn, b.peak1DynamicOn);
  node.setParamValue(ADDR.peak1Threshold, b.peak1Threshold);
  node.setParamValue(ADDR.peak1Range, b.peak1Range);
  node.setParamValue(ADDR.peak1Attack, b.peak1Attack);
  node.setParamValue(ADDR.peak1Release, b.peak1Release);

  node.setParamValue(ADDR.peak2Freq, b.peak2Freq);
  node.setParamValue(ADDR.peak2Gain, b.peak2Gain);
  node.setParamValue(ADDR.peak2Q, b.peak2Q);
  setBool(node, ADDR.peak2Bypass, b.peak2Bypass);
  setBool(node, ADDR.peak2DynamicOn, b.peak2DynamicOn);
  node.setParamValue(ADDR.peak2Threshold, b.peak2Threshold);
  node.setParamValue(ADDR.peak2Range, b.peak2Range);
  node.setParamValue(ADDR.peak2Attack, b.peak2Attack);
  node.setParamValue(ADDR.peak2Release, b.peak2Release);

  node.setParamValue(ADDR.peak3Freq, b.peak3Freq);
  node.setParamValue(ADDR.peak3Gain, b.peak3Gain);
  node.setParamValue(ADDR.peak3Q, b.peak3Q);
  setBool(node, ADDR.peak3Bypass, b.peak3Bypass);
  setBool(node, ADDR.peak3DynamicOn, b.peak3DynamicOn);
  node.setParamValue(ADDR.peak3Threshold, b.peak3Threshold);
  node.setParamValue(ADDR.peak3Range, b.peak3Range);
  node.setParamValue(ADDR.peak3Attack, b.peak3Attack);
  node.setParamValue(ADDR.peak3Release, b.peak3Release);

  node.setParamValue(ADDR.peak4Freq, b.peak4Freq);
  node.setParamValue(ADDR.peak4Gain, b.peak4Gain);
  node.setParamValue(ADDR.peak4Q, b.peak4Q);
  setBool(node, ADDR.peak4Bypass, b.peak4Bypass);
  setBool(node, ADDR.peak4DynamicOn, b.peak4DynamicOn);
  node.setParamValue(ADDR.peak4Threshold, b.peak4Threshold);
  node.setParamValue(ADDR.peak4Range, b.peak4Range);
  node.setParamValue(ADDR.peak4Attack, b.peak4Attack);
  node.setParamValue(ADDR.peak4Release, b.peak4Release);

  node.setParamValue(ADDR.highShelfFreq, b.highShelfFreq);
  node.setParamValue(ADDR.highShelfGain, b.highShelfGain);
  node.setParamValue(ADDR.highShelfQ, b.highShelfQ);
  setBool(node, ADDR.highShelfBypass, b.highShelfBypass);
  setBool(node, ADDR.highShelfDynamicOn, b.highShelfDynamicOn);
  node.setParamValue(ADDR.highShelfThreshold, b.highShelfThreshold);
  node.setParamValue(ADDR.highShelfRange, b.highShelfRange);
  node.setParamValue(ADDR.highShelfAttack, b.highShelfAttack);
  node.setParamValue(ADDR.highShelfRelease, b.highShelfRelease);

  node.setParamValue(ADDR.lpfFreq, b.lpfFreq);
  setBool(node, ADDR.lpfBypass, b.lpfBypass);
  node.setParamValue(ADDR.lpfOrder, orderToIndex(b.lpfOrder));
}

// ── Band descriptors (drives the curve UI generically) ──────────────────────
type BandKind = 'hpf' | 'lowshelf' | 'peak' | 'highshelf' | 'lpf';

interface BandDef {
  id: string;
  short: string;
  label: string;
  color: string;
  kind: BandKind;
  freqKey: keyof ParamEQBands;
  gainKey?: keyof ParamEQBands;
  qKey?: keyof ParamEQBands;
  bypassKey: keyof ParamEQBands;
  // Present only on HPF/LPF — their slope (Butterworth order 2/4/6/8, i.e.
  // 12/24/36/48 dB/oct) instead of the gain/Q the other bands have.
  orderKey?: keyof ParamEQBands;
  // Present only on the 6 bands Faust's ParamEQ gives dynamic (level-
  // dependent) processing to — HPF/LPF have no gain stage, so no dynamics.
  dynamicOnKey?: keyof ParamEQBands;
  thresholdKey?: keyof ParamEQBands;
  rangeKey?: keyof ParamEQBands;
  attackKey?: keyof ParamEQBands;
  releaseKey?: keyof ParamEQBands;
}

const BAND_DEFS: BandDef[] = [
  { id: 'hpf', short: 'HPF', label: 'High-Pass', color: '#9AA5B1', kind: 'hpf', freqKey: 'hpfFreq', bypassKey: 'hpfBypass', orderKey: 'hpfOrder' },
  {
    id: 'lowShelf', short: 'LOW SHELF', label: 'Low Shelf', color: '#F5A623', kind: 'lowshelf',
    freqKey: 'lowShelfFreq', gainKey: 'lowShelfGain', qKey: 'lowShelfQ', bypassKey: 'lowShelfBypass',
    dynamicOnKey: 'lowShelfDynamicOn', thresholdKey: 'lowShelfThreshold', rangeKey: 'lowShelfRange',
    attackKey: 'lowShelfAttack', releaseKey: 'lowShelfRelease',
  },
  {
    id: 'peak1', short: 'PEAK 1', label: 'Peak 1', color: '#D9E86B', kind: 'peak',
    freqKey: 'peak1Freq', gainKey: 'peak1Gain', qKey: 'peak1Q', bypassKey: 'peak1Bypass',
    dynamicOnKey: 'peak1DynamicOn', thresholdKey: 'peak1Threshold', rangeKey: 'peak1Range',
    attackKey: 'peak1Attack', releaseKey: 'peak1Release',
  },
  {
    id: 'peak2', short: 'PEAK 2', label: 'Peak 2', color: '#6BE86B', kind: 'peak',
    freqKey: 'peak2Freq', gainKey: 'peak2Gain', qKey: 'peak2Q', bypassKey: 'peak2Bypass',
    dynamicOnKey: 'peak2DynamicOn', thresholdKey: 'peak2Threshold', rangeKey: 'peak2Range',
    attackKey: 'peak2Attack', releaseKey: 'peak2Release',
  },
  {
    id: 'peak3', short: 'PEAK 3', label: 'Peak 3', color: '#2DD4BF', kind: 'peak',
    freqKey: 'peak3Freq', gainKey: 'peak3Gain', qKey: 'peak3Q', bypassKey: 'peak3Bypass',
    dynamicOnKey: 'peak3DynamicOn', thresholdKey: 'peak3Threshold', rangeKey: 'peak3Range',
    attackKey: 'peak3Attack', releaseKey: 'peak3Release',
  },
  {
    id: 'peak4', short: 'PEAK 4', label: 'Peak 4', color: '#4D9EFF', kind: 'peak',
    freqKey: 'peak4Freq', gainKey: 'peak4Gain', qKey: 'peak4Q', bypassKey: 'peak4Bypass',
    dynamicOnKey: 'peak4DynamicOn', thresholdKey: 'peak4Threshold', rangeKey: 'peak4Range',
    attackKey: 'peak4Attack', releaseKey: 'peak4Release',
  },
  {
    id: 'highShelf', short: 'HIGH SHELF', label: 'High Shelf', color: '#A78BFA', kind: 'highshelf',
    freqKey: 'highShelfFreq', gainKey: 'highShelfGain', qKey: 'highShelfQ', bypassKey: 'highShelfBypass',
    dynamicOnKey: 'highShelfDynamicOn', thresholdKey: 'highShelfThreshold', rangeKey: 'highShelfRange',
    attackKey: 'highShelfAttack', releaseKey: 'highShelfRelease',
  },
  { id: 'lpf', short: 'LPF', label: 'Low-Pass', color: '#CBD5E1', kind: 'lpf', freqKey: 'lpfFreq', bypassKey: 'lpfBypass', orderKey: 'lpfOrder' },
];

function getFreq(b: ParamEQBands, def: BandDef): number { return b[def.freqKey] as number; }
function getGain(b: ParamEQBands, def: BandDef): number { return def.gainKey ? (b[def.gainKey] as number) : 0; }
function getQ(b: ParamEQBands, def: BandDef): number | undefined { return def.qKey ? (b[def.qKey] as number) : undefined; }
function getBypass(b: ParamEQBands, def: BandDef): boolean { return b[def.bypassKey] as boolean; }
function getDynamicOn(b: ParamEQBands, def: BandDef): boolean { return def.dynamicOnKey ? (b[def.dynamicOnKey] as boolean) : false; }
function getThreshold(b: ParamEQBands, def: BandDef): number { return def.thresholdKey ? (b[def.thresholdKey] as number) : -24; }
function getRange(b: ParamEQBands, def: BandDef): number { return def.rangeKey ? (b[def.rangeKey] as number) : -6; }
function getAttack(b: ParamEQBands, def: BandDef): number { return def.attackKey ? (b[def.attackKey] as number) : 0.005; }
function getRelease(b: ParamEQBands, def: BandDef): number { return def.releaseKey ? (b[def.releaseKey] as number) : 0.15; }
function getOrder(b: ParamEQBands, def: BandDef): number { return def.orderKey ? (b[def.orderKey] as number) : 4; }

function withFreq(b: ParamEQBands, def: BandDef, v: number): ParamEQBands {
  return { ...b, [def.freqKey]: v };
}
function withGain(b: ParamEQBands, def: BandDef, v: number): ParamEQBands {
  if (!def.gainKey) return b;
  return { ...b, [def.gainKey]: v };
}
function withQ(b: ParamEQBands, def: BandDef, v: number): ParamEQBands {
  if (!def.qKey) return b;
  return { ...b, [def.qKey]: v };
}
function withBypass(b: ParamEQBands, def: BandDef, v: boolean): ParamEQBands {
  return { ...b, [def.bypassKey]: v };
}
function withDynamicOn(b: ParamEQBands, def: BandDef, v: boolean): ParamEQBands {
  if (!def.dynamicOnKey) return b;
  return { ...b, [def.dynamicOnKey]: v };
}
function withThreshold(b: ParamEQBands, def: BandDef, v: number): ParamEQBands {
  if (!def.thresholdKey) return b;
  return { ...b, [def.thresholdKey]: v };
}
function withRange(b: ParamEQBands, def: BandDef, v: number): ParamEQBands {
  if (!def.rangeKey) return b;
  return { ...b, [def.rangeKey]: v };
}
function withAttack(b: ParamEQBands, def: BandDef, v: number): ParamEQBands {
  if (!def.attackKey) return b;
  return { ...b, [def.attackKey]: v };
}
function withRelease(b: ParamEQBands, def: BandDef, v: number): ParamEQBands {
  if (!def.releaseKey) return b;
  return { ...b, [def.releaseKey]: v };
}
function withOrder(b: ParamEQBands, def: BandDef, v: number): ParamEQBands {
  if (!def.orderKey) return b;
  return { ...b, [def.orderKey]: v };
}

// ── Curve math (analytic magnitude-response approximations, in dB) ──────────
const FMIN = 20, FMAX = 20000;
const GMIN = -24, GMAX = 24;

// AnalyserNode's dB floor/ceiling — set on the node itself (see `play()`)
// *and* used here to decode its byte data, so the two stay in sync. Real
// signal level (dBFS-ish), deliberately its own scale from the EQ gain axis
// above (GMIN/GMAX) — the spectrum is a level meter, not another EQ curve —
// but the two are now drawn on the *same* graph (see drawEQGraph), sharing
// one frequency axis with a dual dB scale down each side, Pro-Q-style.
const ANALYSER_MIN_DB = -100;
const ANALYSER_MAX_DB = -10;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function butterHighpassDB(f: number, fc: number, order: number): number {
  const ratio = Math.pow(f / fc, 2 * order);
  return 10 * Math.log10(Math.max(ratio / (1 + ratio), 1e-12));
}
function butterLowpassDB(f: number, fc: number, order: number): number {
  const ratio = Math.pow(f / fc, 2 * order);
  return 10 * Math.log10(Math.max(1 / (1 + ratio), 1e-12));
}
// Shelf knee: full gain right at (and past) the corner frequency, tapering
// to 0 dB over a Q-dependent number of octaves — as opposed to a symmetric
// curve centered on fc (which only reaches *half* gain at fc). This keeps
// the corner frequency the point where the shelf reaches its full, dialed-in
// gain, so what you type/drag matches what the curve shows right at that
// node. SHELF_KNEE_OCTAVES is the knee width at SHELF_REF_Q (the default
// 0.7 shelf Q, matching the original fixed-width curve); Q scales that width
// inversely — a higher Q narrows/steepens the transition (a more resonant,
// aggressive shelf), a lower Q widens it into a gentler slope — so dragging
// or scrolling a shelf's Q now visibly changes the curve.
const SHELF_KNEE_OCTAVES = 2;
const SHELF_REF_Q = 0.7;
function shelfKneeShape(t: number, q: number): number {
  const octaves = SHELF_KNEE_OCTAVES * (SHELF_REF_Q / clamp(q, 0.05, 20));
  if (t <= 0) return 1;
  if (t >= octaves) return 0;
  return 0.5 * (1 + Math.cos((Math.PI * t) / octaves));
}
function lowShelfDB(f: number, fc: number, gainDb: number, q: number): number {
  return gainDb * shelfKneeShape(Math.log2(f / fc), q);
}
function highShelfDB(f: number, fc: number, gainDb: number, q: number): number {
  return gainDb * shelfKneeShape(Math.log2(fc / f), q);
}
function peakDB(f: number, fc: number, gainDb: number, q: number): number {
  const x = f / fc;
  const bw = q * (x - 1 / x);
  return gainDb / (1 + bw * bw);
}

// The gain a dynamic-enabled band settles on at its most extreme — fully
// engaged (signal continuously past Threshold). Range is signed and simply
// adds to the static Gain: negative Range ducks the band down by up to
// |Range| dB, positive Range lifts it up by up to Range dB — matching the
// Faust DSP (dyn_gain_db in ParamEQDynamic.dsp), where direction now follows
// the sign of Range instead of a separate Downward/Upward mode. Non-dynamic
// bands (or dynamic-off bands) just return their static gain unchanged.
function dynamicExtremeGain(b: ParamEQBands, def: BandDef): number {
  const gain = getGain(b, def);
  if (!getDynamicOn(b, def)) return gain;
  return gain + getRange(b, def);
}

function bandResponseDB(def: BandDef, b: ParamEQBands, f: number, useDynamicExtreme = false): number {
  if (getBypass(b, def)) return 0;
  const freq = getFreq(b, def);
  const gain = useDynamicExtreme ? dynamicExtremeGain(b, def) : getGain(b, def);
  switch (def.kind) {
    case 'hpf': return butterHighpassDB(f, freq, getOrder(b, def));
    case 'lpf': return butterLowpassDB(f, freq, getOrder(b, def));
    case 'lowshelf': return lowShelfDB(f, freq, gain, getQ(b, def) ?? SHELF_REF_Q);
    case 'highshelf': return highShelfDB(f, freq, gain, getQ(b, def) ?? SHELF_REF_Q);
    case 'peak': return peakDB(f, freq, gain, getQ(b, def) ?? 1);
    default: return 0;
  }
}

function totalResponseDB(b: ParamEQBands, f: number, useDynamicExtreme = false): number {
  let sum = 0;
  for (const def of BAND_DEFS) sum += bandResponseDB(def, b, f, useDynamicExtreme);
  return sum;
}

// Same sum, but skipping HPF/LPF — they always carry some roll-off shape
// near their own corner even when every actual *gain* control is at 0 dB, so
// including them would make the "shaded gain region" show a sliver of fill
// at the edges even on a fully flat setting. This is used for the fill only;
// the drawn curve line still uses totalResponseDB so it shows the true
// response including the HPF/LPF roll-off.
function gainOnlyResponseDB(b: ParamEQBands, f: number): number {
  let sum = 0;
  for (const def of BAND_DEFS) {
    if (!def.gainKey) continue;
    sum += bandResponseDB(def, b, f);
  }
  return sum;
}

// Curve-similarity score: average |dB error| across the audible spectrum,
// not per-parameter distance — two different freq/Q combos that produce the
// same overall shape should score the same, which is what the ear judges.
function curveRMSErrorDB(a: ParamEQBands, b: ParamEQBands): number {
  const N = 48;
  let sumSq = 0;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const f = FMIN * Math.pow(FMAX / FMIN, t);
    const d = totalResponseDB(a, f) - totalResponseDB(b, f);
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / (N + 1));
}
function scoreFromRMS(rms: number): number {
  return Math.round(clamp(1 - rms / 12, 0, 1) * 100);
}

// ── Log-freq / dB ⇄ fractional-position helpers (0..1, used for % layout) ──
function fToFrac(f: number): number { return Math.log10(f / FMIN) / Math.log10(FMAX / FMIN); }
function fracToF(t: number): number { return FMIN * Math.pow(FMAX / FMIN, t); }
function gainToFrac(g: number): number { return (GMAX - g) / (GMAX - GMIN); }
function fracToGain(t: number): number { return GMAX - t * (GMAX - GMIN); }

// ── EQ presets — used both as Test Bench quick-apply buttons and as the
// hidden target pool for Ear Training ────────────────────────────────────────
interface EQPreset { name: string; bands: Partial<ParamEQBands>; }

const EQ_PRESETS: EQPreset[] = [
  { name: 'WARM & ROUND', bands: { hpfFreq: 30, lowShelfGain: 4, peak2Freq: 300, peak2Gain: 2, peak4Freq: 3000, peak4Gain: -3, highShelfGain: -4 } },
  { name: 'BRIGHT & AIRY', bands: { lowShelfGain: -2, peak3Freq: 2000, peak3Gain: 3, highShelfFreq: 9000, highShelfGain: 6 } },
  { name: 'TELEPHONE', bands: { hpfFreq: 400, lpfFreq: 3400, peak2Freq: 1200, peak2Gain: 6, peak2Q: 1.2, lowShelfGain: -12, highShelfGain: -12 } },
  { name: 'BOOMY CUT', bands: { lowShelfGain: -6, peak1Freq: 150, peak1Gain: -4, peak1Q: 1.5 } },
  { name: 'VOCAL PRESENCE', bands: { hpfFreq: 90, lowShelfGain: -2, peak3Freq: 3000, peak3Gain: 5, peak3Q: 0.8, peak4Freq: 6000, peak4Gain: 2 } },
  { name: 'PODCAST CLARITY', bands: { hpfFreq: 80, peak2Freq: 400, peak2Gain: -3, peak2Q: 1.2, peak3Freq: 4000, peak3Gain: 4, highShelfGain: 2 } },
];

function mergeBands(base: ParamEQBands, partial: Partial<ParamEQBands>): ParamEQBands {
  return { ...base, ...partial };
}

// Applies a preset on top of `base` and un-bypasses every band the preset
// actually dials in (freq/gain/Q/order). Needed because DEFAULT_BANDS now
// starts every band bypassed — without this, picking a preset (or loading
// Ear Training's hidden target, which is a preset too) would silently land
// on bands that are still switched OFF and produce no audible/visible change.
function applyPreset(base: ParamEQBands, preset: EQPreset): ParamEQBands {
  let next = mergeBands(base, preset.bands);
  for (const def of BAND_DEFS) {
    const touchesBand = ([def.freqKey, def.gainKey, def.qKey, def.orderKey] as (keyof ParamEQBands | undefined)[])
      .some(key => key !== undefined && Object.prototype.hasOwnProperty.call(preset.bands, key));
    if (touchesBand) next = withBypass(next, def, false);
  }
  return next;
}

function pickRandomPreset(): EQPreset {
  return EQ_PRESETS[Math.floor(Math.random() * EQ_PRESETS.length)];
}

// WAV encoding + download for offline-rendered buffers now lives in
// ../audio/wavRender (shared across every chapter with a download button).

function dbToLinear(db: number): number { return Math.pow(10, db / 20); }

// Schedules the GainNode's value properly (cancel + setValueAtTime + a short
// ramp) instead of a bare `.gain.value = x` assignment — the correct way to
// change an AudioParam live per the Web Audio spec, and it avoids any click
// or "value doesn't stick" edge case a plain assignment can hit while audio
// is actively rendering.
function applyOutputGain(node: GainNode, db: number, ctx: AudioContext | null): void {
  const target = dbToLinear(db);
  if (!ctx) { node.gain.value = target; return; }
  const now = ctx.currentTime;
  node.gain.cancelScheduledValues(now);
  node.gain.setValueAtTime(node.gain.value, now);
  node.gain.linearRampToValueAtTime(target, now + 0.03);
}

async function renderParamEQOffline(
  generator: FaustMonoDspGenerator,
  meta: FaustDspMeta,
  dspModule: WebAssembly.Module,
  source: AudioBuffer,
  bands: ParamEQBands,
  outputGainDb = 0,
): Promise<AudioBuffer> {
  const offlineCtx = new OfflineAudioContext(source.numberOfChannels, source.length, source.sampleRate);
  const factory = { module: dspModule, json: JSON.stringify(meta), soundfiles: {} };
  const node = await generator.createNode(
    offlineCtx as unknown as AudioContext, meta.name, factory, false, 512,
  ) as unknown as FaustNodeLike;
  applyBandsToNode(node, bands);

  const outputGain = offlineCtx.createGain();
  outputGain.gain.value = dbToLinear(outputGainDb);

  const src = offlineCtx.createBufferSource();
  src.buffer = source;
  src.connect(node as unknown as AudioNode);
  (node as unknown as AudioNode).connect(outputGain);
  outputGain.connect(offlineCtx.destination);
  src.start();
  return offlineCtx.startRendering();
}

// ── Demo loop (used until the user uploads their own audio) ─────────────────
// A short pad + bass + hat pulse — enough spectral content across the band to
// make every ParamEQ move audible, without needing an uploaded file.
function normAndFade(buf: AudioBuffer, peakTarget = 0.3): void {
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  let peak = 0;
  for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const scale = peakTarget / Math.max(peak, 0.001);
  for (let i = 0; i < L.length; i++) { L[i] *= scale; R[i] *= scale; }
  const sr = buf.sampleRate;
  const fadeN = Math.round(sr * 0.02);
  for (let i = 0; i < fadeN; i++) {
    const f = i / fadeN;
    L[i] *= f; R[i] *= f;
    const idx = L.length - 1 - i;
    L[idx] *= f; R[idx] *= f;
  }
}

function createDemoLoopBuffer(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const dur = 4;
  const buf = ctx.createBuffer(2, sr * dur, sr);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);

  // Sustained Am7 pad (harmonic series, slow attack)
  const padNotes = [110.0, 130.81, 164.81, 196.0, 261.63];
  const harmonics: [number, number][] = [[1, 1.0], [2, 0.35], [3, 0.18], [4, 0.09], [5, 0.05]];
  for (const fund of padNotes) {
    for (const [ratio, amp] of harmonics) {
      const freq = fund * ratio;
      if (freq > sr / 2) continue;
      for (let n = 0; n < L.length; n++) {
        const t = n / sr;
        const env = Math.min(1, t / 0.4) * amp * 0.22;
        const s = Math.sin(2 * Math.PI * freq * t) * env;
        L[n] += s * 0.9; R[n] += s * 1.1;
      }
    }
  }

  // Bass pulse every 0.5s (E1/A1 alternating)
  const bassFreqs = [41.2, 55.0];
  for (let beat = 0; beat < 8; beat++) {
    const start = Math.round(beat * 0.5 * sr);
    const freq = bassFreqs[beat % 2];
    for (let i = 0; i < Math.round(0.45 * sr) && start + i < L.length; i++) {
      const t = i / sr;
      const env = Math.exp(-t * 4) * 0.5;
      const s = Math.sin(2 * Math.PI * freq * t) * env;
      L[start + i] += s; R[start + i] += s;
    }
  }

  // Hat pulse every eighth note for high-frequency content
  for (let e = 0; e < 32; e++) {
    const start = Math.round(e * 0.25 * sr);
    let prev = 0;
    for (let i = 0; i < Math.round(sr * 0.05) && start + i < L.length; i++) {
      const t = i / sr;
      const env = Math.exp(-t * 45) * 0.18;
      const n = Math.random() * 2 - 1;
      const hp = n - prev * 0.94; prev = n;
      L[start + i] += hp * env; R[start + i] += hp * env;
    }
  }

  normAndFade(buf);
  return buf;
}

// ── HiDPI canvas helper ───────────────────────────────────────────────────────
function hiDpi(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; W: number; H: number } | null {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || canvas.width;
  const H = canvas.clientHeight || canvas.height;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, W, H };
}

// ── Combined EQ graph — curve + live spectrum on one shared plot ────────────
// FabFilter-style: the frequency response curve and the live/dry spectrum
// analyzer are drawn on the *same* canvas, sharing one log-frequency x-axis.
// They still read off two different dB scales (the curve is EQ gain,
// GMIN..GMAX; the spectrum is real signal level, ANALYSER_MIN_DB..
// ANALYSER_MAX_DB) — rather than force them onto one scale, each horizontal
// gridline is dual-labeled: gain on the left (in the curve's blue-ish tone),
// live level on the right (in the spectrum's red tone), same as the two
// stacked number columns on a Pro-Q graph. The spectrum is drawn first so
// the curve sits visually on top of it, exactly like the reference.
const GAIN_GRID_DB = [18, 12, 6, 0, -6, -12, -18];

function drawEQGraph(
  canvas: HTMLCanvasElement,
  opts: {
    bands: ParamEQBands;
    targetBands?: ParamEQBands;
    showTarget: boolean;
    outputGainDb: number;
    analyserData: Uint8Array | null;
    dryAnalyserData: Uint8Array | null;
    sampleRate: number;
  },
): void {
  const { bands, targetBands, showTarget, outputGainDb, analyserData, dryAnalyserData, sampleRate } = opts;
  const hd = hiDpi(canvas); if (!hd) return;
  const { ctx, W, H } = hd;

  ctx.fillStyle = '#0A0A0C';
  ctx.fillRect(0, 0, W, H);

  // Vertical frequency grid — shared x-axis for curve + spectrum.
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  const freqLines: [number, string][] = [
    [30, '30'], [50, '50'], [100, '100'], [200, '200'], [500, '500'],
    [1000, '1k'], [2000, '2k'], [5000, '5k'], [10000, '10k'], [20000, '20k'],
  ];
  for (const [f] of freqLines) {
    const x = fToFrac(f) * W;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }

  // Horizontal grid, dual-labeled: left = EQ gain (this row's y, straight off
  // the gain axis), right = the live-level dB that happens to fall at that
  // same pixel row on the spectrum's own (wider) scale.
  ctx.font = '9px "JetBrains Mono", monospace';
  for (const g of GAIN_GRID_DB) {
    const y = gainToFrac(g) * H;
    ctx.strokeStyle = g === 0 ? '#2E2E3D' : 'rgba(255,255,255,0.04)';
    ctx.lineWidth = g === 0 ? 1.5 : 1;
    ctx.setLineDash(g === 0 ? [5, 5] : []);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(120,170,255,0.55)';
    ctx.textAlign = 'left';
    ctx.fillText(`${g > 0 ? '+' : ''}${g}`, 4, y + 3);

    const levelAtY = ANALYSER_MAX_DB - (y / H) * (ANALYSER_MAX_DB - ANALYSER_MIN_DB);
    ctx.fillStyle = 'rgba(255,77,106,0.5)';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(levelAtY)}`, W - 4, y + 3);
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  for (const [f, l] of freqLines) ctx.fillText(l, fToFrac(f) * W - 6, H - 3);

  // ---- Spectrum (drawn first, so the curve sits on top of it) ----
  const levelToY = (db: number) =>
    H - clamp((db - ANALYSER_MIN_DB) / (ANALYSER_MAX_DB - ANALYSER_MIN_DB), 0, 1) * H;
  const toSpectrumPts = (data: Uint8Array): { x: number; y: number }[] => {
    const pts: { x: number; y: number }[] = [];
    const nyquist = sampleRate / 2;
    const binCount = data.length;
    for (let i = 1; i < binCount; i++) {
      const f = (i / binCount) * nyquist;
      if (f < FMIN || f > FMAX) continue;
      const db = ANALYSER_MIN_DB + (data[i] / 255) * (ANALYSER_MAX_DB - ANALYSER_MIN_DB);
      pts.push({ x: fToFrac(f) * W, y: levelToY(db) });
    }
    return pts;
  };

  // Original (pre-EQ / dry) spectrum — tapped straight off the source, before
  // the Faust node, so it never reflects any band's freq/gain/bypass state.
  // Drawn as a plain dashed outline (no fill), purely as a reference shape.
  if (dryAnalyserData) {
    const dryPts = toSpectrumPts(dryAnalyserData);
    if (dryPts.length > 1) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#E5E7EB';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(dryPts[0].x, dryPts[0].y);
      for (const p of dryPts.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.restore();
      ctx.setLineDash([]);
    }
  }

  // Live analyzer (post-EQ spectrum). getByteFrequencyData() returns bytes
  // already mapped *linearly* between the AnalyserNode's own
  // minDecibels/maxDecibels (see ANALYSER_MIN_DB/ANALYSER_MAX_DB, set to
  // match on the node itself) — applying another log10() on top of that
  // would double-transform the value and warp the shape.
  if (analyserData) {
    const levelPts = toSpectrumPts(analyserData);
    if (levelPts.length > 1) {
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#FF4D6A';
      ctx.beginPath();
      ctx.moveTo(levelPts[0].x, H); ctx.lineTo(levelPts[0].x, levelPts[0].y);
      for (const p of levelPts.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.lineTo(levelPts[levelPts.length - 1].x, H);
      ctx.closePath(); ctx.fill(); ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = '#FF4D6A';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(levelPts[0].x, levelPts[0].y);
      for (const p of levelPts.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---- EQ curve(s) — drawn on top of the spectrum ----
  const y0 = gainToFrac(0) * H;
  const sampleResponse = (b: ParamEQBands, responseFn: (bands: ParamEQBands, f: number) => number): { x: number; y: number }[] => {
    const N = 160;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const f = fracToF(t);
      const db = responseFn(b, f);
      pts.push({ x: t * W, y: gainToFrac(clamp(db, GMIN, GMAX)) * H });
    }
    return pts;
  };

  // Fill only covers the gap between the *gain-only* response and the 0 dB
  // line — i.e. only where an actual gain control is boosting/cutting. HPF
  // and LPF are excluded from this (see gainOnlyResponseDB), so a fully flat
  // setting (all gain knobs at 0) shows no shading at all, even if HPF/LPF
  // are dialed somewhere and shaping the line itself.
  const strokeCurve = (b: ParamEQBands, color: string, alpha: number, fillAlpha: number, outputGain = 0) => {
    if (fillAlpha > 0) {
      const fillPts = sampleResponse(b, gainOnlyResponseDB);
      ctx.save(); ctx.globalAlpha = fillAlpha; ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(fillPts[0].x, y0); ctx.lineTo(fillPts[0].x, fillPts[0].y);
      for (const p of fillPts.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.lineTo(fillPts[fillPts.length - 1].x, y0);
      ctx.closePath(); ctx.fill(); ctx.restore();
    }

    // Master/output Gain band — a second, differently-colored shaded ribbon
    // between the EQ's own response and that same response shifted by the
    // output Gain slider (e.g. a peak at +6 dB with +3 dB of output Gain
    // shades 0→6 in the EQ color and 6→9 in this one), since that extra
    // boost/cut is coming from the broadband Gain control, not the band.
    if (outputGain !== 0) {
      const basePts = sampleResponse(b, totalResponseDB);
      const shiftedPts = sampleResponse(b, (bb: ParamEQBands, f: number) => totalResponseDB(bb, f) + outputGain);
      ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = '#A78BFA';
      ctx.beginPath();
      ctx.moveTo(basePts[0].x, basePts[0].y);
      for (const p of basePts.slice(1)) ctx.lineTo(p.x, p.y);
      for (let i = shiftedPts.length - 1; i >= 0; i--) ctx.lineTo(shiftedPts[i].x, shiftedPts[i].y);
      ctx.closePath(); ctx.fill(); ctx.restore();
    }

    // The stroked line is the *true* response — the EQ curve (incl. HPF/LPF)
    // shifted by the output Gain, since that's what actually reaches the ear.
    const linePts = sampleResponse(b, (bb: ParamEQBands, f: number) => totalResponseDB(bb, f) + outputGain);
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(linePts[0].x, linePts[0].y);
    for (const p of linePts.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke(); ctx.restore();
  };

  // Dynamic-range preview — dashed line showing where the curve would settle
  // if every dynamic-armed band were fully engaged (signal continuously past
  // Threshold). Only drawn once at least one band has Dynamic On, using the
  // same signed-Range math as the Faust DSP (see dynamicExtremeGain).
  const anyDynamic = BAND_DEFS.some(def => getDynamicOn(bands, def));
  if (anyDynamic) {
    const dynPts = sampleResponse(bands, (bb, f) => totalResponseDB(bb, f, true) + outputGainDb);
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = '#2DD4BF';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(dynPts[0].x, dynPts[0].y);
    for (const p of dynPts.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);
  }

  if (targetBands && showTarget) {
    strokeCurve(targetBands, '#F5A623', 0.9, 0.16);
  } else if (targetBands && !showTarget) {
    ctx.fillStyle = 'rgba(245,166,35,0.3)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText('TARGET HIDDEN — LISTEN & MATCH BY EAR', W / 2 - 150, 14);
  }

  strokeCurve(bands, '#4D9EFF', 0.95, 0.22, outputGainDb);
}

// ── Interactive band node (drag = freq/gain, wheel = Q) ──────────────────────
function EQNode({
  def, bands, containerRef, onChange, editable, selected, onSelect,
}: {
  def: BandDef;
  bands: ParamEQBands;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onChange?: (b: ParamEQBands) => void;
  editable: boolean;
  // Clicking a node selects its band in the BandEditPanel below — the graph
  // and the edit panel share one "which band am I looking at" selection,
  // same as clicking a band's node in FabFilter Pro-Q jumps its bottom panel
  // to that band.
  selected?: boolean;
  onSelect?: () => void;
}) {
  const dragRef = useRef(false);
  const freq = getFreq(bands, def);
  const gain = getGain(bands, def);
  // Every node's position depends only on *this band's own* parameters —
  // never on any other band's freq/gain/Q. That's the only way to guarantee
  // that changing one dot never moves another: HPF/LPF sit on the 0 dB
  // reference line (they have no gain of their own), and shelves/peaks sit
  // at their own gain value, full stop. The drawn curve (the sum of every
  // band) will only coincide with a given dot when that's the only band
  // doing anything — completely normal for a multi-band EQ.
  const xPct = fToFrac(freq) * 100;
  const yPct = gainToFrac(def.gainKey ? gain : 0) * 100;

  const updateFromPointer = useCallback((clientX: number, clientY: number) => {
    if (!onChange || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const xFrac = clamp((clientX - rect.left) / rect.width, 0, 1);
    const newFreq = clamp(fracToF(xFrac), FMIN, FMAX);
    let next = withFreq(bands, def, newFreq);
    if (def.gainKey) {
      const yFrac = clamp((clientY - rect.top) / rect.height, 0, 1);
      next = withGain(next, def, clamp(fracToGain(yFrac), GMIN, GMAX));
    }
    onChange(next);
  }, [bands, def, onChange, containerRef]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    onSelect?.();
    if (!editable || !onChange) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = true;
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    updateFromPointer(e.clientX, e.clientY);
  };
  const handlePointerUp = () => { dragRef.current = false; };
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!editable || !onChange || !def.qKey) return;
    e.preventDefault();
    const q = getQ(bands, def) ?? 1;
    onChange(withQ(bands, def, clamp(q - Math.sign(e.deltaY) * 0.1, 0.1, 10)));
  };

  const q = getQ(bands, def);
  const bypassed = getBypass(bands, def);
  // Off bands stay clickable (so you can still select + turn one on from
  // the graph) but sit small, dashed and faint — since every band starts
  // OFF, this keeps 8 idle markers from cluttering the flat 0 dB line while
  // still hinting they're there. Once turned on, a node grows, fills solid,
  // and gets its color's glow, so the graph reads at a glance which bands
  // are actually shaping the sound.
  const size = bypassed ? 9 : 14;
  const title = `${def.label}: ${freq >= 1000 ? (freq / 1000).toFixed(2) + 'k' : Math.round(freq)}Hz`
    + (def.gainKey ? ` · ${gain > 0 ? '+' : ''}${gain.toFixed(1)}dB` : '')
    + (q !== undefined ? ` · Q ${q.toFixed(2)} (scroll to adjust)` : '')
    + (bypassed ? ' · OFF (click to select, then turn ON below)' : '');

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      title={title}
      style={{
        position: 'absolute',
        left: `${xPct}%`,
        top: `${yPct}%`,
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        borderRadius: '50%',
        background: bypassed ? 'transparent' : def.color,
        border: `${selected ? 2 : bypassed ? 1 : 2}px ${bypassed ? 'dashed' : 'solid'} ${selected ? '#fff' : bypassed ? def.color : 'rgba(0,0,0,0.5)'}`,
        boxShadow: selected
          ? `0 0 0 3px ${def.color}55, 0 0 10px ${def.color}cc`
          : bypassed ? 'none' : `0 0 8px ${def.color}88`,
        opacity: bypassed ? 0.5 : 1,
        cursor: editable ? 'grab' : 'default',
        touchAction: 'none',
        zIndex: selected ? 3 : 2,
      }}
    />
  );
}

// ── Output (makeup) gain — a plain vertical slider, not a knob, matching the
// thin fader-style "Gain" control on a real Channel EQ. Drag anywhere on the
// track to jump/scrub to that value; a small tick ruler (15/10/5/0/5/10/15)
// runs alongside it, same as the reference screenshot.
function OutputGainSlider({
  value, onChange, min = -15, max = 15,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(false);

  const pctFromValue = (v: number) => ((max - v) / (max - min)) * 100;
  const valueFromClientY = (clientY: number) => {
    if (!trackRef.current) return value;
    const rect = trackRef.current.getBoundingClientRect();
    const frac = clamp((clientY - rect.top) / rect.height, 0, 1);
    return max - frac * (max - min);
  };
  const commit = (v: number) => onChange(clamp(roundTo(v, 1), min, max));

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = true;
    commit(valueFromClientY(e.clientY));
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    commit(valueFromClientY(e.clientY));
  };
  const handlePointerUp = () => { dragRef.current = false; };

  const clamped = clamp(value, min, max);
  const pct = pctFromValue(clamped);
  const ticks = [15, 10, 5, 0, -5, -10, -15].filter(t => t <= max && t >= min);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem', width: 40, flexShrink: 0 }}>
      <div style={{ display: 'flex', gap: '0.25rem', flex: 1, minHeight: 160, width: '100%', justifyContent: 'center' }}>
        <div style={{
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          fontFamily: 'var(--mono)', fontSize: '0.45rem', color: 'var(--text-faint)', textAlign: 'right',
        }}>
          {ticks.map(t => <div key={t}>{Math.abs(t)}</div>)}
        </div>
        {/* Slightly wider invisible hit-area so a thin visual track is still easy to grab */}
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          title={`Output gain: ${clamped > 0 ? '+' : ''}${clamped.toFixed(1)} dB`}
          style={{
            position: 'relative',
            width: 16,
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            cursor: 'ns-resize',
            touchAction: 'none',
          }}
        >
          <div
            ref={trackRef}
            style={{
              position: 'relative',
              width: 3,
              height: '100%',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 2,
            }}
          >
            <div style={{ position: 'absolute', left: -4, right: -4, top: `${pctFromValue(0)}%`, height: 1, background: 'var(--border-bright)' }} />
            <div
              style={{
                position: 'absolute', left: '50%', top: `${pct}%`, transform: 'translate(-50%, -50%)',
                width: 12, height: 6, borderRadius: 2, background: 'var(--purple)',
                boxShadow: '0 0 6px rgba(167,139,250,0.6)', border: '1px solid rgba(0,0,0,0.4)',
              }}
            />
          </div>
        </div>
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '0.5rem', color: 'var(--text-faint)', letterSpacing: '0.06em' }}>GAIN</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '0.58rem', color: 'var(--text)' }}>
        {clamped > 0 ? '+' : ''}{clamped.toFixed(1)}dB
      </div>
    </div>
  );
}

// ── Reusable curve widget ─────────────────────────────────────────────────────
// One combined canvas (see drawEQGraph) — the curve and the live/dry
// spectrum share the same plot instead of two stacked canvases, so the
// waveform and the response curve are always on one screen together.
function ParamEQCurve({
  bands, onChange, targetBands, showTarget, analyserRef, dryAnalyserRef, analyserActive, sampleRate,
  outputGainDb, onOutputGainChange, selectedBandId, onSelectBand,
}: {
  bands: ParamEQBands;
  onChange?: (b: ParamEQBands) => void;
  targetBands?: ParamEQBands;
  showTarget?: boolean;
  analyserRef?: React.RefObject<AnalyserNode | null>;
  // Second, pre-EQ tap on the same source signal — lets the canvas overlay
  // the untouched spectrum alongside the post-EQ one so changes are easy to
  // spot at a glance instead of having to remember what the input looked
  // like before you started dragging nodes.
  dryAnalyserRef?: React.RefObject<AnalyserNode | null>;
  analyserActive?: boolean;
  sampleRate: number;
  outputGainDb?: number;
  onOutputGainChange?: (v: number) => void;
  // Which band's node is highlighted / drives the BandEditPanel below.
  selectedBandId?: string;
  onSelectBand?: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<Uint8Array | null>(null);
  const dryDataRef = useRef<Uint8Array | null>(null);
  const rafRef = useRef<number | null>(null);

  // Latest props mirrored into refs so the RAF loop below (which only
  // restarts when analyserActive/analyserRef/sampleRate change) always draws
  // with up-to-date bands/target/gain instead of a stale closure.
  const bandsRef = useRef(bands); useEffect(() => { bandsRef.current = bands; }, [bands]);
  const targetRef = useRef(targetBands); useEffect(() => { targetRef.current = targetBands; }, [targetBands]);
  const showTargetRef = useRef(showTarget); useEffect(() => { showTargetRef.current = showTarget; }, [showTarget]);
  const outputGainRef = useRef(outputGainDb); useEffect(() => { outputGainRef.current = outputGainDb; }, [outputGainDb]);

  // Immediate redraw whenever bands/target/gain change — covers dragging a
  // node while audio isn't playing (no RAF loop running in that case).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawEQGraph(canvas, {
      bands, targetBands, showTarget: !!showTarget, outputGainDb: outputGainDb ?? 0,
      analyserData: dataRef.current, dryAnalyserData: dryDataRef.current, sampleRate,
    });
  }, [bands, targetBands, showTarget, outputGainDb, sampleRate]);

  // Live RAF loop while audio is playing — animates the spectrum and keeps
  // redrawing the curve every frame too, so drags made mid-playback track
  // just as responsively as when stopped.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!(analyserActive && analyserRef?.current)) {
      drawEQGraph(canvas, {
        bands: bandsRef.current, targetBands: targetRef.current, showTarget: !!showTargetRef.current,
        outputGainDb: outputGainRef.current ?? 0, analyserData: null, dryAnalyserData: null, sampleRate,
      });
      return undefined;
    }

    const analyser = analyserRef.current;
    if (!dataRef.current || dataRef.current.length !== analyser.frequencyBinCount) {
      dataRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
    const tick = () => {
      if (!analyserRef.current) return;
      const buf = dataRef.current!;
      analyserRef.current.getByteFrequencyData(buf as unknown as Uint8Array<ArrayBuffer>);

      let dryBuf: Uint8Array | null = null;
      const dryAnalyser = dryAnalyserRef?.current;
      if (dryAnalyser) {
        if (!dryDataRef.current || dryDataRef.current.length !== dryAnalyser.frequencyBinCount) {
          dryDataRef.current = new Uint8Array(dryAnalyser.frequencyBinCount);
        }
        dryAnalyser.getByteFrequencyData(dryDataRef.current as unknown as Uint8Array<ArrayBuffer>);
        dryBuf = dryDataRef.current;
      }

      drawEQGraph(canvas, {
        bands: bandsRef.current, targetBands: targetRef.current, showTarget: !!showTargetRef.current,
        outputGainDb: outputGainRef.current ?? 0, analyserData: buf, dryAnalyserData: dryBuf, sampleRate,
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [analyserActive, analyserRef, dryAnalyserRef, sampleRate]);

  return (
    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'stretch' }}>
      <div ref={containerRef} className="spectrum-display" style={{ height: 320, flex: 1, marginBottom: 0 }}>
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        {BAND_DEFS.map(def => (
          <EQNode
            key={def.id}
            def={def}
            bands={bands}
            containerRef={containerRef}
            onChange={onChange}
            editable={!!onChange}
            selected={selectedBandId === def.id}
            onSelect={onSelectBand ? () => onSelectBand(def.id) : undefined}
          />
        ))}
      </div>
      {onOutputGainChange && (
        <OutputGainSlider value={outputGainDb ?? 0} onChange={onOutputGainChange} />
      )}
    </div>
  );
}

function roundTo(v: number, decimals: number): number {
  const p = Math.pow(10, decimals);
  return Math.round(v * p) / p;
}

// Small themed numeric input — types a value directly instead of dragging.
// Commits live on every keystroke that parses to a number (so the curve,
// dot, and audio all update as you type), while keeping its own draft
// string while focused so the *displayed* text isn't clobbered mid-type by
// the clamped value bouncing back (e.g. typing "1" then "10" then "100").
// On blur, the display snaps to the final clamped value.
function NumberField({
  value, onChange, min, max, step, disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
}) {
  const [local, setLocal] = useState(String(value));
  const focusedRef = useRef(false);
  useEffect(() => { if (!focusedRef.current) setLocal(String(value)); }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setLocal(text);
    const n = parseFloat(text);
    if (!Number.isNaN(n)) onChange(clamp(n, min, max));
  };

  const handleBlur = () => {
    focusedRef.current = false;
    const n = parseFloat(local);
    const clamped = Number.isNaN(n) ? value : clamp(n, min, max);
    onChange(clamped);
    setLocal(String(clamped));
  };

  return (
    <input
      type="number"
      value={local}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onFocus={() => { focusedRef.current = true; }}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      style={{
        width: '100%',
        background: disabled ? 'transparent' : 'var(--surface)',
        border: `1px solid ${disabled ? 'transparent' : 'var(--border)'}`,
        borderRadius: '3px',
        color: disabled ? 'var(--text-faint)' : 'var(--text)',
        fontFamily: 'var(--mono)',
        fontSize: '0.6rem',
        textAlign: 'center',
        padding: '0.1rem 0.15rem',
        outline: 'none',
      }}
    />
  );
}

// ── Rotary knob — the FabFilter-style round control ──────────────────────────
// Drag vertically (up = increase) or scroll to nudge; both work purely in
// fraction-of-range space (0..1) so the same component handles a log-scale
// control (Freq) and a linear one (Gain/Q/Threshold/Range/Attack/Release)
// identically — only valueToFrac/fracToValue below know about the log curve.
// A 270° arc (-135°..+135°) fills to show the current value at a glance,
// same sweep as a hardware-style knob.
function valueToFrac(v: number, min: number, max: number, log: boolean): number {
  if (log) {
    const lv = Math.log10(Math.max(v, 1e-6)), lmin = Math.log10(min), lmax = Math.log10(max);
    return clamp((lv - lmin) / (lmax - lmin), 0, 1);
  }
  return clamp((v - min) / (max - min), 0, 1);
}
function fracToValue(f: number, min: number, max: number, log: boolean): number {
  const frac = clamp(f, 0, 1);
  if (log) {
    const lmin = Math.log10(min), lmax = Math.log10(max);
    return Math.pow(10, lmin + frac * (lmax - lmin));
  }
  return min + frac * (max - min);
}

const KNOB_SWEEP_DEG = 270;
const KNOB_START_DEG = -135;
const KNOB_DRAG_PX = 170; // vertical pixels for a full 0..1 sweep

function Knob({
  value, onChange, min, max, disabled, color = 'var(--blue)', log = false, size = 56,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  disabled?: boolean;
  color?: string;
  log?: boolean;
  size?: number;
}) {
  const dragRef = useRef<{ startY: number; startFrac: number } | null>(null);
  const frac = valueToFrac(value, min, max, log);
  const angle = KNOB_START_DEG + frac * KNOB_SWEEP_DEG;

  const r = size / 2 - 3;
  const circumference = 2 * Math.PI * r;
  const arcLen = circumference * (KNOB_SWEEP_DEG / 360);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startFrac: frac };
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || disabled) return;
    const dy = dragRef.current.startY - e.clientY;
    const nextFrac = clamp(dragRef.current.startFrac + dy / KNOB_DRAG_PX, 0, 1);
    onChange(fracToValue(nextFrac, min, max, log));
  };
  const handlePointerUp = () => { dragRef.current = null; };
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    const nextFrac = clamp(frac - Math.sign(e.deltaY) * 0.015, 0, 1);
    onChange(fracToValue(nextFrac, min, max, log));
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      style={{
        position: 'relative', width: size, height: size, borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 30%, #2b2b32, #131316 75%)',
        boxShadow: disabled ? 'none' : 'inset 0 1px 2px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.04)',
        cursor: disabled ? 'default' : 'ns-resize',
        touchAction: 'none',
        opacity: disabled ? 0.4 : 1,
        flexShrink: 0,
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={3.5}
          strokeDasharray={`${arcLen} ${circumference}`} strokeLinecap="round"
          transform={`rotate(${KNOB_START_DEG} ${size / 2} ${size / 2})`}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={disabled ? 'var(--text-faint)' : color} strokeWidth={3.5}
          strokeDasharray={`${arcLen * frac} ${circumference}`} strokeLinecap="round"
          transform={`rotate(${KNOB_START_DEG} ${size / 2} ${size / 2})`}
        />
      </svg>
      <div style={{
        position: 'absolute', left: '50%', top: '50%', width: 3, height: size / 2 - 10,
        background: disabled ? 'var(--text-faint)' : color, borderRadius: 1.5,
        transformOrigin: 'top center', transform: `translate(-50%, 0) rotate(${angle}deg)`,
      }} />
    </div>
  );
}

// Knob + label + precise numeric entry, stacked — used identically for both
// the Standard EQ row (Freq/Gain/Q) and the Dynamic EQ row (Threshold/Range/
// Attack/Release) in BandEditPanel, so the two sections read as one family
// of controls rather than two differently-styled UIs.
function KnobField({
  label, value, onChange, min, max, step, disabled, color, log, decimals = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  color?: string;
  log?: boolean;
  decimals?: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
      <span style={{ fontSize: '0.55rem', color: 'var(--text-faint)', fontFamily: 'var(--mono)', letterSpacing: '0.05em' }}>{label}</span>
      <Knob value={value} onChange={onChange} min={min} max={max} disabled={disabled} color={color} log={log} />
      <div style={{ width: 66 }}>
        <NumberField value={roundTo(value, decimals)} onChange={onChange} min={min} max={max} step={step} disabled={disabled} />
      </div>
    </div>
  );
}

// ── Small labeled field wrapper used throughout BandEditPanel ────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'center' }}>
      <span style={{ fontSize: '0.55rem', color: 'var(--text-faint)', fontFamily: 'var(--mono)', letterSpacing: '0.05em' }}>{label}</span>
      {children}
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  width: 22, height: 22, borderRadius: '3px', cursor: 'pointer',
  border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)',
  fontFamily: 'var(--mono)', fontSize: '0.75rem', lineHeight: 1, flexShrink: 0,
};

const SHAPE_LABEL: Record<BandKind, string> = {
  hpf: 'LOW CUT', lowshelf: 'LOW SHELF', peak: 'BELL', highshelf: 'HIGH SHELF', lpf: 'HIGH CUT',
};

// Standard EQ / Dynamic EQ / Both — a band's gain can come purely from its
// static Gain knob (Standard), purely from the level-triggered Range once
// Threshold is crossed with static Gain pinned to 0 (Dynamic), or both
// added together (Both), matching how the Faust engine actually sums them
// (gain = static Gain + dyn_gain_db(...)).
type DynModeUI = 'static' | 'dynamic' | 'both';

// Gain alone can't always tell "Dynamic" and "Both" apart — Both with Gain
// dialed back to 0 looks identical, in terms of stored params, to plain
// Dynamic. This is only a fallback for bands whose mode was never explicitly
// picked in this panel (e.g. loaded from a preset); BandEditPanel below
// remembers the user's actual button choice per band so BOTH stays selected
// even while Gain sits at 0.
function getDynModeUI(bands: ParamEQBands, def: BandDef): DynModeUI {
  if (!getDynamicOn(bands, def)) return 'static';
  return getGain(bands, def) === 0 ? 'dynamic' : 'both';
}

function withDynModeUI(bands: ParamEQBands, def: BandDef, mode: DynModeUI): ParamEQBands {
  if (mode === 'static') return withDynamicOn(bands, def, false);
  if (mode === 'dynamic') return withGain(withDynamicOn(bands, def, true), def, 0);
  return withDynamicOn(bands, def, true); // 'both' — leave Gain wherever it is
}

// ── Band edit panel ──────────────────────────────────────────────────────────
// A single-band editor, FabFilter Pro-Q-style: pick a band (tabs, prev/next
// arrows, or click its node on the graph above) and edit everything about it
// — Freq/Gain/Q (or slope for HPF/LPF), Bypass, and, for the six bands Faust
// gives level-dependent processing to, a Standard/Dynamic/Both mode selector
// plus Threshold/Range/Attack/Release. Replaces the old all-bands-at-once
// BandReadout grid + separate DynamicEQPanel list with one focused panel.
function BandEditPanel({
  bands, onChange, selectedId, onSelect,
}: {
  bands: ParamEQBands;
  onChange: (b: ParamEQBands) => void;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  // Explicit per-band mode choice, so BOTH sticks even while Gain sits at 0
  // (see getDynModeUI above) — falls back to the gain-based heuristic for
  // any band whose mode hasn't been explicitly clicked in this panel yet.
  const [modeOverride, setModeOverride] = useState<Record<string, DynModeUI>>({});

  const idx = Math.max(0, BAND_DEFS.findIndex(d => d.id === selectedId));
  const def = BAND_DEFS[idx] ?? BAND_DEFS[0];
  const bypassed = getBypass(bands, def);
  const freq = getFreq(bands, def);
  const gain = getGain(bands, def);
  const q = getQ(bands, def);
  const dynCapable = !!def.dynamicOnKey;
  const dynamicOn = dynCapable && getDynamicOn(bands, def);
  // Dynamic Off always wins regardless of any remembered override — flipping
  // MODE back on later should re-derive from scratch, not resurrect a stale
  // choice from before it was switched off.
  const dynMode: DynModeUI = !dynCapable ? 'static'
    : !dynamicOn ? 'static'
      : (modeOverride[def.id] ?? getDynModeUI(bands, def));
  const threshold = getThreshold(bands, def);
  const range = getRange(bands, def);
  const attack = getAttack(bands, def);
  const release = getRelease(bands, def);

  const goto = (delta: number) => {
    const next = (idx + delta + BAND_DEFS.length) % BAND_DEFS.length;
    onSelect(BAND_DEFS[next].id);
  };

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: '8px',
      background: 'rgba(255,255,255,0.02)', padding: '1rem 1.4rem', marginTop: '0.75rem',
    }}>
      {/* Band selector — also click a node on the graph above to jump here */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {BAND_DEFS.map(d => {
          const active = d.id === selectedId;
          const bandOn = !getBypass(bands, d);
          return (
            <button
              key={d.id}
              onClick={() => onSelect(d.id)}
              title={d.label}
              style={{
                padding: '0.32rem 0.7rem', borderRadius: '4px', cursor: 'pointer',
                border: `1px solid ${active ? d.color : 'var(--border)'}`,
                background: active ? `${d.color}22` : 'transparent',
                color: active ? d.color : bandOn ? 'var(--text-dim)' : 'var(--text-faint)',
                fontFamily: 'var(--mono)', fontSize: '0.64rem', letterSpacing: '0.04em',
                opacity: bandOn ? 1 : 0.5,
              }}
            >
              {d.short}
            </button>
          );
        })}
      </div>

      {/* Aligned control groups — same knob widget, same row layout, side
          by side in a single row (scrolls horizontally rather than
          wrapping, so Dynamic EQ's 4 knobs never drop to a second line
          under Freq/Gain) — so Standard EQ and Dynamic EQ read as one
          family of controls instead of two differently-styled UIs. */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: '1.5rem', flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: '0.3rem' }}>
        {/* Band identity + nav + on/off */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem',
          paddingRight: '1.8rem', borderRight: '1px solid var(--border)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <button onClick={() => goto(-1)} title="Previous band" style={navBtnStyle}>‹</button>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 92 }}>
              <span style={{ fontSize: '0.68rem', color: def.color, fontFamily: 'var(--mono)', letterSpacing: '0.05em' }}>{def.label}</span>
              <span style={{ fontSize: '0.5rem', color: 'var(--text-faint)', fontFamily: 'var(--mono)', letterSpacing: '0.05em' }}>{SHAPE_LABEL[def.kind]}</span>
            </div>
            <button onClick={() => goto(1)} title="Next band" style={navBtnStyle}>›</button>
          </div>
          <button
            onClick={() => onChange(withBypass(bands, def, !bypassed))}
            title={bypassed ? 'Off — click to turn this band on' : 'On — click to turn it off'}
            style={{
              width: '100%', fontSize: '0.62rem', fontFamily: 'var(--mono)', letterSpacing: '0.06em', fontWeight: 600,
              padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer',
              border: `1px solid ${bypassed ? 'var(--border)' : 'var(--green, #22C55E)'}`,
              background: bypassed ? 'transparent' : 'rgba(34,197,94,0.15)',
              color: bypassed ? 'var(--text-faint)' : 'var(--green, #22C55E)',
            }}
          >
            {bypassed ? 'OFF' : '● ON'}
          </button>
        </div>

        {/* FREQUENCY group — Freq/Q (or Slope) are shared: the same knobs
            shape the static peak/shelf AND set the center + width of the
            dynamic engine's own level-detection filter (see fc/q in
            dyn_gain_db, ParamEQDynamic.dsp). Kept neutral-colored and
            separate from STANDARD EQ so it doesn't read as "these belong to
            Standard EQ" while Dynamic (or Both) is active — they apply
            either way. */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '0.7rem', flexShrink: 0,
          paddingRight: (def.gainKey || dynCapable) ? '1.8rem' : 0,
          borderRight: (def.gainKey || dynCapable) ? '1px solid var(--border)' : 'none',
        }}>
          <div style={{ display: 'flex', gap: '1.4rem' }}>
            <KnobField
              label="FREQ (Hz)" value={freq} min={FMIN} max={FMAX} step={1} decimals={0} log color="#9AA5B1"
              disabled={bypassed} onChange={v => onChange(withFreq(bands, def, clamp(v, FMIN, FMAX)))}
            />
            {def.orderKey ? (
              <Field label="SLOPE">
                <select
                  value={getOrder(bands, def)}
                  disabled={bypassed}
                  onChange={e => onChange(withOrder(bands, def, Number(e.target.value)))}
                  style={{
                    background: bypassed ? 'transparent' : 'var(--surface)',
                    border: `1px solid ${bypassed ? 'transparent' : 'var(--border)'}`,
                    borderRadius: '3px', color: bypassed ? 'var(--text-faint)' : 'var(--text)',
                    fontFamily: 'var(--mono)', fontSize: '0.6rem', textAlign: 'center',
                    padding: '0.1rem 0.15rem', outline: 'none',
                  }}
                >
                  <option value={2}>12dB</option>
                  <option value={4}>24dB</option>
                  <option value={6}>36dB</option>
                  <option value={8}>48dB</option>
                </select>
              </Field>
            ) : def.qKey ? (
              <KnobField
                label="Q" value={q ?? 1} min={0.1} max={10} step={0.01} decimals={2} color="#9AA5B1"
                disabled={bypassed} onChange={v => onChange(withQ(bands, def, clamp(v, 0.1, 10)))}
              />
            ) : null}
          </div>
        </div>

        {/* STANDARD EQ group — just the static Gain knob now; Freq/Q moved
            to the shared FREQUENCY group above since Dynamic EQ uses them
            too (see comment there). */}
        {def.gainKey && (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: '0.7rem', flexShrink: 0,
            paddingRight: dynCapable ? '1.8rem' : 0, borderRight: dynCapable ? '1px solid var(--border)' : 'none',
          }}>
            <span style={{ fontSize: '0.58rem', color: 'var(--blue)', fontFamily: 'var(--mono)', letterSpacing: '0.08em', fontWeight: 600 }}>
              STANDARD EQ
            </span>
            <div style={{ display: 'flex', gap: '1.4rem' }}>
              <KnobField
                label="GAIN (dB)" value={gain} min={GMIN} max={GMAX} step={0.1} decimals={1} color="var(--blue)"
                disabled={bypassed || dynMode === 'dynamic'} onChange={v => onChange(withGain(bands, def, clamp(v, GMIN, GMAX)))}
              />
            </div>
          </div>
        )}

        {/* DYNAMIC EQ group — same row shape as Standard EQ above, in teal */}
        {dynCapable && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.58rem', color: 'var(--teal)', fontFamily: 'var(--mono)', letterSpacing: '0.08em', fontWeight: 600 }}>
                DYNAMIC EQ
              </span>
              {(['static', 'dynamic', 'both'] as DynModeUI[]).map(m => (
                <button
                  key={m}
                  onClick={() => {
                    setModeOverride(prev => ({ ...prev, [def.id]: m }));
                    onChange(withDynModeUI(bands, def, m));
                  }}
                  disabled={bypassed}
                  style={{
                    padding: '0.24rem 0.6rem', borderRadius: '4px', cursor: bypassed ? 'default' : 'pointer',
                    fontFamily: 'var(--mono)', fontSize: '0.58rem', letterSpacing: '0.02em',
                    border: `1px solid ${dynMode === m ? 'var(--teal)' : 'var(--border)'}`,
                    background: dynMode === m ? 'rgba(45,212,191,0.15)' : 'transparent',
                    color: dynMode === m ? 'var(--teal)' : 'var(--text-faint)',
                    opacity: bypassed ? 0.5 : 1,
                  }}
                >
                  {m === 'static' ? 'OFF' : m === 'dynamic' ? 'DYNAMIC' : 'BOTH'}
                </button>
              ))}
            </div>

            {dynMode !== 'static' ? (
              <div style={{ display: 'flex', gap: '1.4rem' }}>
                <KnobField
                  label="THRESH (dB)" value={threshold} min={-60} max={0} step={0.1} decimals={1} color="var(--teal)"
                  disabled={bypassed} onChange={v => onChange(withThreshold(bands, def, clamp(v, -60, 0)))}
                />
                <KnobField
                  label="RANGE (dB)" value={range} min={-24} max={24} step={0.1} decimals={1} color="var(--teal)"
                  disabled={bypassed} onChange={v => onChange(withRange(bands, def, clamp(v, -24, 24)))}
                />
                <KnobField
                  label="ATTACK (s)" value={attack} min={0.001} max={0.5} step={0.001} decimals={3} color="var(--teal)"
                  disabled={bypassed} onChange={v => onChange(withAttack(bands, def, clamp(v, 0.001, 0.5)))}
                />
                <KnobField
                  label="RELEASE (s)" value={release} min={0.01} max={2} step={0.01} decimals={2} color="var(--teal)"
                  disabled={bypassed} onChange={v => onChange(withRelease(bands, def, clamp(v, 0.01, 2)))}
                />
              </div>
            ) : (
              <div style={{ fontSize: '0.56rem', color: 'var(--text-faint)', fontFamily: 'var(--mono)', maxWidth: 280, lineHeight: 1.5 }}>
                Pick DYNAMIC or BOTH to arm level-dependent movement on this band.
              </div>
            )}
          </div>
        )}
      </div>

      {dynCapable && dynMode !== 'static' && (
        <div style={{ fontSize: '0.56rem', color: 'var(--text-faint)', fontFamily: 'var(--mono)', marginTop: '0.85rem', paddingTop: '0.7rem', borderTop: '1px solid var(--border)', lineHeight: 1.6, maxWidth: 620 }}>
          {dynMode === 'dynamic' && 'Gain stays at 0 dB until the signal crosses Threshold, then moves toward Range — negative cuts, positive boosts. Freq/Q above still shape it — they set the center and width of both the static peak and the level detector this is watching. Only audible during playback.'}
          {dynMode === 'both' && 'Static Gain always applies; Range adds to it once the signal crosses Threshold, during playback. Freq/Q above apply to both.'}
        </div>
      )}
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
type TabId = 'bench' | 'ear';
type PlaySource = 'idle' | 'bench' | 'mine' | 'target';

export default function Chapter2b() {
  const [tab, setTab] = useState<TabId>('bench');

  // ── Faust engine (loaded once) ─────────────────────────────────────────────
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('idle');
  const [engineError, setEngineError] = useState<string | null>(null);
  const dspMetaRef = useRef<FaustDspMeta | null>(null);
  const dspModuleRef = useRef<WebAssembly.Module | null>(null);
  const generatorRef = useRef<FaustMonoDspGenerator | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEngineStatus('loading');
    setEngineError(null);
    (async () => {
      try {
        const meta: FaustDspMeta = await (await fetch(`${FAUST_BASE_PATH}/dsp-meta.json`)).json();
        const mod = await compileFaustWasm(`${FAUST_BASE_PATH}/dsp-module.wasm`);
        if (cancelled) return;
        dspMetaRef.current = meta;
        dspModuleRef.current = mod;
        generatorRef.current = new FaustMonoDspGenerator();
        setEngineStatus('ready');
      } catch (err) {
        if (cancelled) return;
        console.error('[Chapter2b] failed to load Faust ParamEQ DSP', err);
        setEngineError(err instanceof Error ? err.message : String(err));
        setEngineStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Shared audio engine — one Faust node / source / analyser at a time ─────
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const activeNodeRef = useRef<FaustNodeLike | null>(null);
  const outputGainNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  // Second analyser tapped straight off the source, before the Faust node —
  // never connected onward to the destination, so it's silent/inaudible and
  // exists purely to let the canvas draw the original (pre-EQ) spectrum
  // alongside the live, post-EQ one.
  const dryAnalyserRef = useRef<AnalyserNode | null>(null);
  const demoBufferRef = useRef<AudioBuffer | null>(null);
  const [playSource, setPlaySource] = useState<PlaySource>('idle');
  const [playError, setPlayError] = useState('');
  const [sampleRate, setSampleRate] = useState(44100);

  const ensureAudioCtx = useCallback((): AudioContext => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
      setSampleRate(audioCtxRef.current.sampleRate);
    }
    return audioCtxRef.current;
  }, []);

  const ensureDemoBuffer = useCallback((ctx: AudioContext): AudioBuffer => {
    if (!demoBufferRef.current) demoBufferRef.current = createDemoLoopBuffer(ctx);
    return demoBufferRef.current;
  }, []);

  // ── Test Bench state ────────────────────────────────────────────────────────
  const [benchBands, setBenchBands] = useState<ParamEQBands>(DEFAULT_BANDS);
  const benchBandsRef = useRef(benchBands);
  useEffect(() => { benchBandsRef.current = benchBands; }, [benchBands]);
  const [benchOutputGain, setBenchOutputGain] = useState(0);
  const benchOutputGainRef = useRef(benchOutputGain);
  useEffect(() => { benchOutputGainRef.current = benchOutputGain; }, [benchOutputGain]);
  const [benchBuffer, setBenchBuffer] = useState<AudioBuffer | null>(null);
  const [benchFileName, setBenchFileName] = useState('');
  const [benchDecoding, setBenchDecoding] = useState(false);
  const [benchUploadError, setBenchUploadError] = useState('');
  const benchFileInputRef = useRef<HTMLInputElement>(null);
  const [benchDownloading, setBenchDownloading] = useState(false);
  // Multiple uploaded tracks — each upload adds a new track instead of
  // replacing the last one, so you can switch between several files.
  const [benchTracks, setBenchTracks] = useState<UploadedAudioTrack[]>([]);
  const [benchActiveTrackId, setBenchActiveTrackId] = useState<number | null>(null);
  const benchUploadIdSeqRef = useRef(0);
  // Which band the BandEditPanel below the graph is currently showing —
  // also settable by clicking a node directly on the curve.
  const [benchSelectedBandId, setBenchSelectedBandId] = useState<string>('peak1');

  // ── Ear Training state ──────────────────────────────────────────────────────
  const [targetPreset, setTargetPreset] = useState<EQPreset>(() => pickRandomPreset());
  const targetBands = applyPreset(DEFAULT_BANDS, targetPreset);
  const targetBandsRef = useRef(targetBands);
  useEffect(() => { targetBandsRef.current = targetBands; });
  const [myBands, setMyBands] = useState<ParamEQBands>(DEFAULT_BANDS);
  const myBandsRef = useRef(myBands);
  useEffect(() => { myBandsRef.current = myBands; }, [myBands]);
  const [myOutputGain, setMyOutputGain] = useState(0);
  const myOutputGainRef = useRef(myOutputGain);
  useEffect(() => { myOutputGainRef.current = myOutputGain; }, [myOutputGain]);
  const [earBuffer, setEarBuffer] = useState<AudioBuffer | null>(null);
  const [earFileName, setEarFileName] = useState('');
  const [earDecoding, setEarDecoding] = useState(false);
  const [earUploadError, setEarUploadError] = useState('');
  const earFileInputRef = useRef<HTMLInputElement>(null);
  const [revealed, setRevealed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [earDownloading, setEarDownloading] = useState<'mine' | 'target' | null>(null);
  const [earSelectedBandId, setEarSelectedBandId] = useState<string>('peak1');

  // ── Playback ────────────────────────────────────────────────────────────────
  const stopAudio = useCallback(() => {
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch { /* already stopped */ }
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (activeNodeRef.current) {
      try { (activeNodeRef.current as unknown as AudioNode).disconnect(); } catch { /* ok */ }
      activeNodeRef.current = null;
    }
    if (outputGainNodeRef.current) {
      try { outputGainNodeRef.current.disconnect(); } catch { /* ok */ }
      outputGainNodeRef.current = null;
    }
    if (analyserRef.current) {
      try { analyserRef.current.disconnect(); } catch { /* ok */ }
      analyserRef.current = null;
    }
    if (dryAnalyserRef.current) {
      try { dryAnalyserRef.current.disconnect(); } catch { /* ok */ }
      dryAnalyserRef.current = null;
    }
    setPlaySource('idle');
  }, []);

  const play = useCallback(async (which: Exclude<PlaySource, 'idle'>) => {
    if (playSource === which) { stopAudio(); return; }
    stopAudio();

    if (engineStatus !== 'ready' || !generatorRef.current || !dspMetaRef.current || !dspModuleRef.current) {
      setPlayError('Faust ParamEQ engine is still loading — try again in a moment.');
      return;
    }
    setPlayError('');

    const ctx = ensureAudioCtx();
    if (ctx.state === 'suspended') await ctx.resume();

    let buffer: AudioBuffer;
    let bands: ParamEQBands;
    let outputGainDb: number;
    if (which === 'bench') {
      buffer = benchBuffer ?? ensureDemoBuffer(ctx);
      bands = benchBandsRef.current;
      outputGainDb = benchOutputGainRef.current;
    } else if (which === 'mine') {
      buffer = earBuffer ?? ensureDemoBuffer(ctx);
      bands = myBandsRef.current;
      outputGainDb = myOutputGainRef.current;
    } else {
      buffer = earBuffer ?? ensureDemoBuffer(ctx);
      bands = targetBandsRef.current;
      outputGainDb = 0;
    }

    const factory = { module: dspModuleRef.current, json: JSON.stringify(dspMetaRef.current), soundfiles: {} };
    let node: FaustNodeLike;
    try {
      node = await generatorRef.current.createNode(
        ctx, dspMetaRef.current.name, factory, false, 512,
      ) as unknown as FaustNodeLike;
    } catch (err) {
      console.error('[Chapter2b] failed to build Faust ParamEQ node', err);
      setPlayError('Could not start the Faust ParamEQ engine — see console for details.');
      return;
    }
    applyBandsToNode(node, bands);

    const outputGain = ctx.createGain();
    applyOutputGain(outputGain, outputGainDb, ctx);

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.78;
    analyser.minDecibels = ANALYSER_MIN_DB;
    analyser.maxDecibels = ANALYSER_MAX_DB;

    // Dry (pre-EQ) analyser — tapped directly off the source, in parallel
    // with the signal chain into the Faust node, and never connected onward
    // to the destination, so it's silent and doesn't change what's heard.
    // Same decibel range/smoothing as the post-EQ analyser above so the two
    // traces are directly comparable on the same canvas.
    const dryAnalyser = ctx.createAnalyser();
    dryAnalyser.fftSize = 2048;
    dryAnalyser.smoothingTimeConstant = 0.78;
    dryAnalyser.minDecibels = ANALYSER_MIN_DB;
    dryAnalyser.maxDecibels = ANALYSER_MAX_DB;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(node as unknown as AudioNode);
    src.connect(dryAnalyser);
    (node as unknown as AudioNode).connect(outputGain);
    outputGain.connect(analyser);
    analyser.connect(ctx.destination);
    src.start();

    sourceNodeRef.current = src;
    activeNodeRef.current = node;
    outputGainNodeRef.current = outputGain;
    analyserRef.current = analyser;
    dryAnalyserRef.current = dryAnalyser;
    setPlaySource(which);
  }, [playSource, stopAudio, engineStatus, benchBuffer, earBuffer, ensureAudioCtx, ensureDemoBuffer]);

  // Live param updates while playing
  useEffect(() => {
    if (playSource === 'bench' && activeNodeRef.current) applyBandsToNode(activeNodeRef.current, benchBands);
  }, [benchBands, playSource]);
  useEffect(() => {
    if (playSource === 'bench' && outputGainNodeRef.current) applyOutputGain(outputGainNodeRef.current, benchOutputGain, audioCtxRef.current);
  }, [benchOutputGain, playSource]);
  useEffect(() => {
    if (playSource === 'mine' && outputGainNodeRef.current) applyOutputGain(outputGainNodeRef.current, myOutputGain, audioCtxRef.current);
  }, [myOutputGain, playSource]);
  useEffect(() => {
    if (playSource === 'mine' && activeNodeRef.current) applyBandsToNode(activeNodeRef.current, myBands);
  }, [myBands, playSource]);

  // Stop playback + reset engine state when switching tabs
  const handleTabChange = useCallback((next: TabId) => {
    stopAudio();
    setTab(next);
  }, [stopAudio]);

  useEffect(() => () => {
    try { sourceNodeRef.current?.stop(); } catch { /* ok */ }
    sourceNodeRef.current?.disconnect();
    try { (activeNodeRef.current as unknown as AudioNode)?.disconnect(); } catch { /* ok */ }
    outputGainNodeRef.current?.disconnect();
    analyserRef.current?.disconnect();
    dryAnalyserRef.current?.disconnect();
    audioCtxRef.current?.close();
  }, []);

  // ── Test Bench actions ──────────────────────────────────────────────────────
  const handleBenchUploadClick = useCallback(() => { benchFileInputRef.current?.click(); }, []);

  const handleBenchFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    stopAudio();
    setBenchUploadError('');
    setBenchDecoding(true);
    try {
      const ctx = ensureAudioCtx();
      if (ctx.state === 'suspended') await ctx.resume();
      const newTracks: UploadedAudioTrack[] = [];
      let failures = 0;
      for (const file of files) {
        try {
          const arrayBuf = await file.arrayBuffer();
          const decoded = await ctx.decodeAudioData(arrayBuf);
          newTracks.push({
            id: ++benchUploadIdSeqRef.current,
            name: file.name.replace(/\.[^/.]+$/, ''),
            buffer: decoded,
          });
        } catch (err) {
          console.error('Failed to decode audio file', file.name, err);
          failures++;
        }
      }
      if (newTracks.length > 0) {
        setBenchTracks(prev => [...prev, ...newTracks]);
        const last = newTracks[newTracks.length - 1];
        setBenchActiveTrackId(last.id);
        setBenchBuffer(last.buffer);
        setBenchFileName(last.name);
      }
      if (failures > 0) {
        setBenchUploadError(
          newTracks.length > 0
            ? `${failures} file${failures > 1 ? 's' : ''} could not be read — try mp3, wav, or m4a.`
            : 'Could not read that file — try an mp3, wav, or m4a.'
        );
      }
    } finally {
      setBenchDecoding(false);
    }
  }, [stopAudio, ensureAudioCtx]);

  // Switch the active Test Bench source between the demo loop and any of the
  // previously uploaded tracks, without needing to re-upload.
  const handleBenchSelectTrack = useCallback((id: number | null) => {
    stopAudio();
    setBenchActiveTrackId(id);
    if (id === null) {
      setBenchBuffer(null);
      setBenchFileName('');
      return;
    }
    const track = benchTracks.find(t => t.id === id);
    if (track) {
      setBenchBuffer(track.buffer);
      setBenchFileName(track.name);
    }
  }, [stopAudio, benchTracks]);

  const handleBenchReset = useCallback(() => {
    stopAudio();
    setBenchBands(DEFAULT_BANDS);
    setBenchOutputGain(0);
  }, [stopAudio]);

  const handleBenchDownload = useCallback(async () => {
    if (engineStatus !== 'ready' || !generatorRef.current || !dspMetaRef.current || !dspModuleRef.current) {
      setPlayError('Faust ParamEQ engine is still loading — try again in a moment.');
      return;
    }
    setBenchDownloading(true);
    setPlayError('');
    try {
      const ctx = ensureAudioCtx();
      const source = benchBuffer ?? ensureDemoBuffer(ctx);
      const rendered = await renderParamEQOffline(
        generatorRef.current, dspMetaRef.current, dspModuleRef.current, source, benchBands, benchOutputGain,
      );
      const blob = audioBufferToWavBlob(rendered);
      downloadBlob(blob, `${benchFileName || 'paramEQ-test-bench'}-eq.wav`);
    } catch (err) {
      console.error('[Chapter2b] offline render failed', err);
      setPlayError('Could not render the audio for download — see console for details.');
    } finally {
      setBenchDownloading(false);
    }
  }, [engineStatus, benchBuffer, benchBands, benchOutputGain, benchFileName, ensureAudioCtx, ensureDemoBuffer]);

  // ── Ear Training actions ────────────────────────────────────────────────────
  const handleEarUploadClick = useCallback(() => { earFileInputRef.current?.click(); }, []);

  const handleEarFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    stopAudio();
    setEarUploadError('');
    setEarDecoding(true);
    try {
      const ctx = ensureAudioCtx();
      if (ctx.state === 'suspended') await ctx.resume();
      const arrayBuf = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuf);
      setEarBuffer(decoded);
      setEarFileName(file.name.replace(/\.[^/.]+$/, ''));
      setTargetPreset(pickRandomPreset());
      setMyBands(DEFAULT_BANDS);
      setRevealed(false);
      setSubmitted(false);
      setHintUsed(false);
    } catch (err) {
      console.error('Failed to decode audio file', err);
      setEarUploadError('Could not read that file — try an mp3, wav, or m4a.');
    } finally {
      setEarDecoding(false);
    }
  }, [stopAudio, ensureAudioCtx]);

  const handleEarReset = useCallback(() => {
    stopAudio();
    setMyBands(DEFAULT_BANDS);
    setMyOutputGain(0);
    setTargetPreset(pickRandomPreset());
    setRevealed(false);
    setSubmitted(false);
    setHintUsed(false);
  }, [stopAudio]);

  const handleEarSubmit = useCallback(() => {
    stopAudio();
    setRevealed(true);
    setSubmitted(true);
  }, [stopAudio]);

  const handleEarHint = useCallback(() => {
    setRevealed(true);
    setHintUsed(true);
  }, []);

  const handleEarDownload = useCallback(async (which: 'mine' | 'target') => {
    if (engineStatus !== 'ready' || !generatorRef.current || !dspMetaRef.current || !dspModuleRef.current) {
      setPlayError('Faust ParamEQ engine is still loading — try again in a moment.');
      return;
    }
    setEarDownloading(which);
    setPlayError('');
    try {
      const ctx = ensureAudioCtx();
      const source = earBuffer ?? ensureDemoBuffer(ctx);
      const bands = which === 'mine' ? myBands : targetBands;
      const outputGainDb = which === 'mine' ? myOutputGain : 0;
      const rendered = await renderParamEQOffline(
        generatorRef.current, dspMetaRef.current, dspModuleRef.current, source, bands, outputGainDb,
      );
      const blob = audioBufferToWavBlob(rendered);
      downloadBlob(blob, `paramEQ-${which}.wav`);
    } catch (err) {
      console.error('[Chapter2b] offline render failed', err);
      setPlayError('Could not render the audio for download — see console for details.');
    } finally {
      setEarDownloading(null);
    }
  }, [engineStatus, earBuffer, myBands, targetBands, myOutputGain, ensureAudioCtx, ensureDemoBuffer]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const rms = curveRMSErrorDB(myBands, targetBands);
  const score = scoreFromRMS(rms);
  const scoreColor = score >= 90 ? 'var(--green)' : score >= 60 ? 'var(--amber)' : 'var(--red)';

  const bandDiagnostics = BAND_DEFS.map(def => {
    const f = getFreq(targetBands, def);
    const t = totalResponseDB(targetBands, f);
    const u = totalResponseDB(myBands, f);
    const diff = u - t;
    const color = Math.abs(diff) < 1.5 ? 'var(--green)' : Math.abs(diff) < 4 ? 'var(--amber)' : 'var(--red)';
    const acc = clamp(1 - Math.abs(diff) / 10, 0, 1);
    return { def, diff, color, acc };
  });
  const engineBadge: Record<EngineStatus, { bg: string; border: string; fg: string; text: string }> = {
    idle: { bg: 'var(--surface)', border: 'var(--border)', fg: 'var(--text-faint)', text: '○ IDLE' },
    loading: { bg: 'rgba(245,166,35,0.15)', border: 'rgba(245,166,35,0.4)', fg: 'var(--amber)', text: '◌ LOADING DSP…' },
    ready: { bg: 'rgba(45,212,191,0.15)', border: 'rgba(45,212,191,0.4)', fg: 'var(--teal)', text: '● FAUST WASM' },
    error: { bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)', fg: '#EF4444', text: '✕ ENGINE ERROR' },
  };
  const eb = engineBadge[engineStatus];
  const engineReady = engineStatus === 'ready';

  return (
    <div className="eq-lab">
      {/* Top bar */}
      <div className="lab-topbar">
        <div className="lab-title-row">
          <div className="lab-icon" style={{ background: 'var(--purple-dim)', borderColor: 'rgba(167,139,250,0.4)' }}>
            〰
          </div>
          <div>
            <div className="lab-name">ParamEQ</div>
            <div className="lab-subtitle">8-BAND PARAMETRIC · FAUST WASM</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {tab === 'bench' && (
            <>
              <input ref={benchFileInputRef} type="file" accept="audio/*" multiple onChange={handleBenchFileSelected} style={{ display: 'none' }} />
              <button
                className="btn-secondary"
                onClick={handleBenchUploadClick}
                disabled={benchDecoding}
                title="Upload one or more audio files — pick multiple in the file dialog to load them all"
                style={{
                  fontSize: '0.65rem',
                  padding: '0.4rem 0.8rem',
                  fontWeight: 600,
                  borderColor: 'rgba(167,139,250,0.5)',
                  color: 'var(--purple)',
                  background: 'rgba(167,139,250,0.1)',
                }}
              >
                {benchDecoding ? '⏳ Decoding…' : '⬆ Upload Audio'}
              </button>
              {benchUploadError && <span style={{ fontSize: '0.6rem', color: 'var(--red)', fontFamily: 'var(--mono)' }}>{benchUploadError}</span>}
            </>
          )}
          <span className="badge" style={{ background: eb.bg, borderColor: eb.border, color: eb.fg, fontFamily: 'var(--mono)', fontSize: '0.55rem', letterSpacing: '0.06em' }}>
            {eb.text}
          </span>
          <div className="lab-status" style={{ color: 'var(--purple)' }}>
            <div className="status-dot" style={{ background: 'var(--purple)', boxShadow: '0 0 6px var(--purple)' }} />
            {tab === 'bench' ? 'TEST BENCH' : (submitted ? `SCORE: ${score}%` : 'MATCHING')}
          </div>
        </div>
      </div>

      {engineStatus === 'error' && (
        <div className="concept-callout" style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)', margin: '1rem 1.25rem 0' }}>
          <strong style={{ color: '#EF4444' }}>Failed to load Faust ParamEQ DSP:</strong> {engineError}
          <br />
          Check that <code>dsp-module.wasm</code> and <code>dsp-meta.json</code> are present at{' '}
          <code>public/faust/ParamEQ/</code>.
        </div>
      )}

      {/* Tab row */}
      <div className="eq-tabrow" style={{ display: 'flex', gap: '0.4rem', padding: '0.55rem 1rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {([
          { id: 'bench' as const, label: '🧪 TEST BENCH', color: 'var(--blue)' },
          { id: 'ear' as const, label: '🎧 EAR TRAINING', color: 'var(--amber)' },
        ]).map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => handleTabChange(t.id)}
              style={{
                padding: '0.35rem 0.8rem',
                background: active ? 'rgba(167,139,250,0.13)' : 'var(--surface)',
                border: `1px solid ${active ? 'rgba(167,139,250,0.5)' : 'var(--border)'}`,
                borderRadius: '3px',
                color: active ? 'var(--purple)' : 'var(--text-dim)',
                fontFamily: 'var(--mono)',
                fontSize: '0.62rem',
                letterSpacing: '0.06em',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Source row — switch between the demo loop and any uploaded tracks */}
      {tab === 'bench' && benchTracks.length > 0 && (
        <div style={{
          display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center',
          padding: '0.5rem 1rem 0',
        }}>
          <span style={{ fontSize: '0.55rem', color: 'var(--text-faint)', fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>
            SOURCE:
          </span>
          <button
            onClick={() => handleBenchSelectTrack(null)}
            title="Built-in demo loop"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.65rem',
              background: benchActiveTrackId === null ? 'rgba(167,139,250,0.13)' : 'var(--surface)',
              border: `1px solid ${benchActiveTrackId === null ? 'rgba(167,139,250,0.5)' : 'var(--border)'}`,
              borderRadius: '3px', color: benchActiveTrackId === null ? 'var(--purple)' : 'var(--text-dim)',
              fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.06em',
              cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
            }}
          >
            🎵 Demo Loop
          </button>
          {benchTracks.map(track => {
            const active = benchActiveTrackId === track.id;
            return (
              <button
                key={track.id}
                onClick={() => handleBenchSelectTrack(track.id)}
                title={track.name}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.65rem',
                  background: active ? 'rgba(167,139,250,0.13)' : 'var(--surface)',
                  border: `1px solid ${active ? 'rgba(167,139,250,0.5)' : 'var(--border)'}`,
                  borderRadius: '3px', color: active ? 'var(--purple)' : 'var(--text-dim)',
                  fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.06em',
                  cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
                  maxWidth: '10rem', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
              >
                📁 {track.name}
              </button>
            );
          })}
        </div>
      )}

      {/* ═══ TEST BENCH ═══ */}
      {tab === 'bench' && (
        <>
          <div className="eq-body" style={{ gridTemplateColumns: '1fr' }}>
            <div className="eq-main" style={{ borderRight: 'none' }}>
              <div className="legend-row">
                <div className="legend-item"><div className="legend-line" style={{ background: 'var(--blue)' }} />YOUR CURVE (DRAG NODES)</div>
                <div className="legend-item"><div className="legend-line" style={{ background: 'var(--text-faint)', height: '1px' }} />FLAT (0 dB)</div>
                {playSource === 'bench' && (
                  <>
                    <div className="legend-item">
                      <div className="legend-line" style={{ background: 'repeating-linear-gradient(90deg, #E5E7EB 0 2px, transparent 2px 4px)' }} />
                      ORIGINAL (PRE-EQ)
                    </div>
                    <div className="legend-item">
                      <div className="legend-line" style={{ background: '#FF4D6A' }} />
                      LIVE SIGNAL (POST-EQ)
                    </div>
                  </>
                )}
                {BAND_DEFS.some(def => getDynamicOn(benchBands, def)) && (
                  <div className="legend-item">
                    <div className="legend-line" style={{ background: 'repeating-linear-gradient(90deg, var(--teal) 0 5px, transparent 5px 9px)' }} />
                    DYNAMIC RANGE (ONLY AUDIBLE PAST THRESHOLD, DURING PLAYBACK)
                  </div>
                )}
              </div>

              <ParamEQCurve
                bands={benchBands}
                onChange={setBenchBands}
                analyserRef={analyserRef}
                dryAnalyserRef={dryAnalyserRef}
                analyserActive={playSource === 'bench'}
                sampleRate={sampleRate}
                outputGainDb={benchOutputGain}
                onOutputGainChange={setBenchOutputGain}
                selectedBandId={benchSelectedBandId}
                onSelectBand={setBenchSelectedBandId}
              />
              <BandEditPanel
                bands={benchBands}
                onChange={setBenchBands}
                selectedId={benchSelectedBandId}
                onSelect={setBenchSelectedBandId}
              />

              <div className="canvas-label" style={{ margin: '1rem 0 0.5rem' }}>QUICK PRESETS</div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {EQ_PRESETS.map(p => (
                  <button
                    key={p.name}
                    className="btn-secondary"
                    style={{ fontSize: '0.6rem', padding: '0.35rem 0.6rem' }}
                    onClick={() => setBenchBands(applyPreset(DEFAULT_BANDS, p))}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lab-footer">
            <div className="hint-text">
              {playError
                ? <span style={{ color: '#EF4444' }}>{playError}</span>
                : <>Drag nodes on the curve, then <strong style={{ color: 'var(--blue)', margin: '0 0.25rem' }}>Play</strong> to hear it.</>}
            </div>
            <div className="btn-row">
              <button className="btn-secondary" onClick={handleBenchReset}>Reset</button>
              <button
                className="btn-secondary"
                onClick={() => play('bench')}
                disabled={!engineReady}
                title={engineReady ? '' : 'Loading Faust ParamEQ engine…'}
                style={playSource === 'bench' ? { borderColor: 'var(--blue)', color: 'var(--blue)' } : {}}
              >
                {playSource === 'bench' ? '⏸ Stop' : '▶ Play'}
              </button>
              <button className="btn-primary" onClick={handleBenchDownload} disabled={benchDownloading || !engineReady}>
                {benchDownloading ? 'Rendering…' : '⬇ Download EQ\'d Audio'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ═══ EAR TRAINING ═══ */}
      {tab === 'ear' && (
        <>
          <div className="eq-body">
            <div className="eq-main">
              <div className="legend-row">
                <div className="legend-item">
                  <div className="legend-line" style={{ background: revealed ? 'var(--amber)' : 'var(--text-faint)', opacity: revealed ? 1 : 0.4 }} />
                  {revealed ? 'TARGET CURVE' : 'TARGET (HIDDEN)'}
                </div>
                <div className="legend-item"><div className="legend-line" style={{ background: 'var(--blue)' }} />YOUR EQ</div>
                {(playSource === 'mine' || playSource === 'target') && (
                  <>
                    <div className="legend-item">
                      <div className="legend-line" style={{ background: 'repeating-linear-gradient(90deg, #E5E7EB 0 2px, transparent 2px 4px)' }} />
                      ORIGINAL (PRE-EQ)
                    </div>
                    <div className="legend-item">
                      <div className="legend-line" style={{ background: '#FF4D6A' }} />
                      LIVE SIGNAL (POST-EQ)
                    </div>
                  </>
                )}
                {BAND_DEFS.some(def => getDynamicOn(myBands, def)) && (
                  <div className="legend-item">
                    <div className="legend-line" style={{ background: 'repeating-linear-gradient(90deg, var(--teal) 0 5px, transparent 5px 9px)' }} />
                    DYNAMIC RANGE (ONLY AUDIBLE PAST THRESHOLD, DURING PLAYBACK)
                  </div>
                )}
              </div>

              <ParamEQCurve
                bands={myBands}
                onChange={setMyBands}
                targetBands={targetBands}
                showTarget={revealed}
                analyserRef={analyserRef}
                dryAnalyserRef={dryAnalyserRef}
                analyserActive={playSource === 'mine' || playSource === 'target'}
                sampleRate={sampleRate}
                outputGainDb={myOutputGain}
                onOutputGainChange={setMyOutputGain}
                selectedBandId={earSelectedBandId}
                onSelectBand={setEarSelectedBandId}
              />
              <BandEditPanel
                bands={myBands}
                onChange={setMyBands}
                selectedId={earSelectedBandId}
                onSelect={setEarSelectedBandId}
              />
            </div>

            <div className="eq-sidebar">
              {submitted && (
                <div className="score-ring-wrap">
                  <div className="score-ring" style={{ background: `conic-gradient(${scoreColor} 0% ${score}%, var(--surface) ${score}% 100%)` }}>
                    <div className="score-ring-inner">
                      <div className="score-num" style={{ color: scoreColor }}>{score}</div>
                      <div className="score-lbl">SCORE</div>
                    </div>
                  </div>
                  <div className="score-label">CURVE MATCH ACCURACY</div>
                  <div style={{ fontSize: '0.55rem', color: 'var(--text-faint)', fontFamily: 'var(--mono)', marginTop: '0.2rem' }}>
                    TARGET WAS: {targetPreset.name}
                  </div>
                  {hintUsed && <div style={{ fontSize: '0.55rem', color: 'var(--red)', fontFamily: 'var(--mono)', marginTop: '0.2rem' }}>HINT USED</div>}
                </div>
              )}

              {submitted && (
                <div className="band-analysis">
                  <div className="canvas-label">BAND ACCURACY (AT TARGET FREQ)</div>
                  {bandDiagnostics.map(({ def, diff, color, acc }) => (
                    <div className="band-item" key={def.id}>
                      <div className="band-name">{def.short}</div>
                      <div className="band-bar-track"><div className="band-bar-fill" style={{ width: `${acc * 100}%`, background: color }} /></div>
                      <div className="band-diff" style={{ color }}>{diff > 0 ? '+' : ''}{diff.toFixed(1)}</div>
                    </div>
                  ))}
                </div>
              )}

              <input ref={earFileInputRef} type="file" accept="audio/*" onChange={handleEarFileSelected} style={{ display: 'none' }} />
              <button className="btn-secondary" onClick={handleEarUploadClick} disabled={earDecoding} style={{ fontSize: '0.68rem' }}>
                {earDecoding ? '⏳ Decoding…' : (earBuffer ? `📁 ${earFileName}` : '+ Use My Own Audio')}
              </button>
              {earUploadError && <span style={{ fontSize: '0.6rem', color: 'var(--red)', fontFamily: 'var(--mono)' }}>{earUploadError}</span>}

              {!submitted && !revealed && (
                <button className="btn-secondary" onClick={handleEarHint} style={{ fontSize: '0.7rem', borderColor: 'rgba(245,166,35,0.3)', color: 'var(--amber)' }}>
                  👁 Show Target Curve (reveals answer)
                </button>
              )}
            </div>
          </div>

          <div className="lab-footer">
            <div className="hint-text">
              {playError
                ? <span style={{ color: '#EF4444' }}>{playError}</span>
                : submitted
                  ? (score >= 90
                    ? <span style={{ color: 'var(--green)' }}>✓ Excellent ear! Orange curve shows the target.</span>
                    : 'Orange curve shows the target shape. Retry to improve.')
                  : <>Press <strong style={{ color: 'var(--amber)', margin: '0 0.25rem' }}>Hear Target / Mine</strong> — tap again to switch and drag until they match.</>}
            </div>
            <div className="btn-row">
              <button className="btn-secondary" onClick={handleEarReset}>Reset</button>
              <button
                className="btn-secondary"
                onClick={() => play(playSource === 'target' ? 'mine' : 'target')}
                disabled={!engineReady}
                title={engineReady ? '' : 'Loading Faust ParamEQ engine…'}
                style={
                  playSource === 'target' ? { borderColor: 'var(--amber)', color: 'var(--amber)' }
                    : playSource === 'mine' ? { borderColor: 'var(--blue)', color: 'var(--blue)' }
                      : {}
                }
              >
                {playSource === 'target' ? '⏸ Target · Tap for Mine'
                  : playSource === 'mine' ? '⏸ Mine · Tap for Target'
                    : '▶ Hear Target / Mine'}
              </button>
              <button
                className="btn-secondary"
                onClick={stopAudio}
                disabled={playSource === 'idle'}
              >
                ■ Stop
              </button>
              <button
                className="btn-secondary"
                onClick={() => handleEarDownload('target')}
                disabled={earDownloading !== null || !engineReady}
              >
                {earDownloading === 'target' ? 'Rendering…' : '⬇ Target WAV'}
              </button>
              <button
                className="btn-secondary"
                onClick={() => handleEarDownload('mine')}
                disabled={earDownloading !== null || !engineReady}
              >
                {earDownloading === 'mine' ? 'Rendering…' : '⬇ Mine WAV'}
              </button>
              <button className="btn-primary" onClick={handleEarSubmit} disabled={submitted && score >= 90}>
                {submitted && score >= 90 ? '✓ Passed →' : 'Submit Score →'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
