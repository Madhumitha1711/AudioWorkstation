// ═══════════════════════════════════════════════════════════════════════════
// DAW Workstation — synthetic fallback buffer + waveform peak computation
// ═══════════════════════════════════════════════════════════════════════════

// ── Synthetic fallback (used only if a real demo clip above fails to load
// — e.g. offline — so the DAW isn't left completely broken) ───────────────
export function normAndFade(buf, peakTarget = 0.3) {
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  let peak = 0;
  for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const scale = peakTarget / Math.max(peak, 0.001);
  for (let i = 0; i < L.length; i++) {
    L[i] *= scale;
    R[i] *= scale;
  }
  const sr = buf.sampleRate;
  const fadeN = Math.round(sr * 0.02);
  for (let i = 0; i < fadeN; i++) {
    const f = i / fadeN;
    L[i] *= f;
    R[i] *= f;
    const idx = L.length - 1 - i;
    L[idx] *= f;
    R[idx] *= f;
  }
}
export function createDemoLoopBuffer(ctx) {
  const sr = ctx.sampleRate;
  const dur = 6;
  const buf = ctx.createBuffer(2, sr * dur, sr);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const padNotes = [110.0, 130.81, 164.81, 196.0, 261.63];
  const harmonics = [
    [1, 1.0],
    [2, 0.35],
    [3, 0.18],
    [4, 0.09],
    [5, 0.05],
  ];
  for (const fund of padNotes) {
    for (const [ratio, amp] of harmonics) {
      const freq = fund * ratio;
      if (freq > sr / 2) continue;
      for (let n = 0; n < L.length; n++) {
        const t = n / sr;
        const env = Math.min(1, t / 0.4) * amp * 0.22;
        const s = Math.sin(2 * Math.PI * freq * t) * env;
        L[n] += s * 0.9;
        R[n] += s * 1.1;
      }
    }
  }
  const bassFreqs = [41.2, 55.0];
  for (let beat = 0; beat < 12; beat++) {
    const start = Math.round(beat * 0.5 * sr);
    const freq = bassFreqs[beat % 2];
    for (let i = 0; i < Math.round(0.45 * sr) && start + i < L.length; i++) {
      const t = i / sr;
      const env = Math.exp(-t * 4) * 0.5;
      const s = Math.sin(2 * Math.PI * freq * t) * env;
      L[start + i] += s;
      R[start + i] += s;
    }
  }
  for (let e = 0; e < 48; e++) {
    const start = Math.round(e * 0.25 * sr);
    let prev = 0;
    for (let i = 0; i < Math.round(sr * 0.05) && start + i < L.length; i++) {
      const t = i / sr;
      const env = Math.exp(-t * 45) * 0.18;
      const n = Math.random() * 2 - 1;
      const hp = n - prev * 0.94;
      prev = n;
      L[start + i] += hp * env;
      R[start + i] += hp * env;
    }
  }
  normAndFade(buf);
  return buf;
}

export function computePeaks(buffer, buckets = 220) {
  const chans = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) chans.push(buffer.getChannelData(c));
  const len = buffer.length;
  const perBucket = Math.max(1, Math.floor(len / buckets));
  const peaks = new Array(buckets);
  for (let b = 0; b < buckets; b++) {
    const start = b * perBucket;
    const end = Math.min(len, start + perBucket);
    let min = 0,
      max = 0;
    for (let i = start; i < end; i++) {
      let v = 0;
      for (let c = 0; c < chans.length; c++) v += chans[c][i];
      v /= chans.length;
      if (v > max) max = v;
      if (v < min) min = v;
    }
    peaks[b] = [min, max];
  }
  return peaks;
}
