export function fmtRate(hz) {
  if (!hz) return "—";
  const k = hz / 1000;
  return `${Number.isInteger(k) ? k : k.toFixed(1)} kHz`;
}

function readStr(dv, off, len) {
  let s = "";
  for (let i = 0; i < len && off + i < dv.byteLength; i++) {
    s += String.fromCharCode(dv.getUint8(off + i));
  }
  return s;
}

function findBytes(u8, pattern, from = 0, to = u8.length) {
  const codes = [...pattern].map((c) => c.charCodeAt(0));
  const end = Math.min(to, u8.length) - codes.length;
  outer: for (let i = from; i <= end; i++) {
    for (let j = 0; j < codes.length; j++) {
      if (u8[i + j] !== codes[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function skipId3(dv) {
  if (dv.byteLength < 10 || readStr(dv, 0, 3) !== "ID3") return 0;
  const size =
    ((dv.getUint8(6) & 0x7f) << 21) |
    ((dv.getUint8(7) & 0x7f) << 14) |
    ((dv.getUint8(8) & 0x7f) << 7) |
    (dv.getUint8(9) & 0x7f);
  const footer = dv.getUint8(5) & 0x10 ? 10 : 0;
  return 10 + size + footer;
}

function readExtended(dv, off) {
  const expon = dv.getUint16(off) & 0x7fff;
  const hi = dv.getUint32(off + 2);
  const lo = dv.getUint32(off + 6);
  if (expon === 0 && hi === 0 && lo === 0) return 0;
  return Math.round((hi * 2 ** 32 + lo) * 2 ** (expon - 16383 - 63));
}

function parseWav(dv) {
  const riff = readStr(dv, 0, 4);
  if (!["RIFF", "RF64", "BW64"].includes(riff) || readStr(dv, 8, 4) !== "WAVE")
    return null;

  let off = 12;
  let fmt = null;
  let ds64DataSize = null;

  while (off + 8 <= dv.byteLength) {
    const id = readStr(dv, off, 4);
    let size = dv.getUint32(off + 4, true);
    const body = off + 8;

    if (id === "ds64" && body + 16 <= dv.byteLength) {
      ds64DataSize = Number(dv.getBigUint64(body + 8, true));
    } else if (id === "fmt ") {
      let code = dv.getUint16(body, true);
      const bits = dv.getUint16(body + 14, true);
      let validBits = bits;
      if (code === 0xfffe && size >= 40) {
        validBits = dv.getUint16(body + 18, true) || bits;
        code = dv.getUint16(body + 24, true);
      }
      fmt = {
        code,
        channels: dv.getUint16(body + 2, true),
        sampleRate: dv.getUint32(body + 4, true),
        bits,
        validBits,
      };
    } else if (id === "data") {
      if (size === 0xffffffff && ds64DataSize != null) size = ds64DataSize;
    }
    off = body + size + (size & 1);
  }

  if (!fmt) return null;

  const isFloat = fmt.code === 3;
  const isPcm = fmt.code === 1 || isFloat;
  let codec;
  if (fmt.code === 1) codec = "PCM (integer)";
  else if (isFloat) codec = "PCM (IEEE float)";
  else if (fmt.code === 6) codec = "A-law";
  else if (fmt.code === 7) codec = "µ-law";
  else codec = `WAV codec 0x${fmt.code.toString(16)}`;

  return {
    container: riff === "RIFF" ? "WAV" : `WAV (${riff})`,
    codec,
    sampleRate: fmt.sampleRate,
    channels: fmt.channels,
    bitDepth: isPcm ? fmt.validBits : fmt.bits,
    bitDepthLabel: isPcm
      ? `${fmt.validBits}-bit ${isFloat ? "float" : "integer"}${fmt.validBits !== fmt.bits ? ` (in ${fmt.bits}-bit container)` : ""
      }`
      : `${fmt.bits}-bit ${codec}`,
    isFloat,
    lossless: true,
  };
}

function parseAiff(dv) {
  if (readStr(dv, 0, 4) !== "FORM") return null;
  const type = readStr(dv, 8, 4);
  if (type !== "AIFF" && type !== "AIFC") return null;

  let off = 12;
  let comm = null;
  while (off + 8 <= dv.byteLength) {
    const id = readStr(dv, off, 4);
    const size = dv.getUint32(off + 4);
    const body = off + 8;
    if (id === "COMM") {
      comm = {
        channels: dv.getUint16(body),
        sampleSize: dv.getInt16(body + 6),
        sampleRate: readExtended(dv, body + 8),
        compression: type === "AIFC" && size >= 22 ? readStr(dv, body + 18, 4) : "NONE",
      };
    }
    off = body + size + (size & 1);
  }
  if (!comm) return null;

  const c = comm.compression.toLowerCase();
  let isFloat = false;
  let bits = comm.sampleSize;
  let isPcm = true;
  let littleEndian = false;
  if (c === "fl32") { isFloat = true; bits = 32; }
  else if (c === "fl64") { isFloat = true; bits = 64; }
  else if (c === "sowt") littleEndian = true;
  else if (c === "in24") bits = 24;
  else if (c === "in32") bits = 32;
  else if (c !== "none" && c !== "twos") isPcm = false;

  return {
    container: type,
    codec: isPcm ? `PCM (${isFloat ? "float" : "integer"}${littleEndian ? ", little-endian" : ""})` : comm.compression,
    sampleRate: comm.sampleRate,
    channels: comm.channels,
    bitDepth: bits,
    bitDepthLabel: `${bits}-bit ${isFloat ? "float" : "integer"}`,
    isFloat,
    lossless: isPcm,
  };
}

function parseFlac(dv) {
  const start = skipId3(dv);
  if (readStr(dv, start, 4) !== "fLaC") return null;
  const b = start + 8 + 10;
  const u = (i) => dv.getUint8(b + i);
  const sampleRate = (u(0) << 12) | (u(1) << 4) | (u(2) >> 4);
  const channels = ((u(2) >> 1) & 7) + 1;
  const bits = (((u(2) & 1) << 4) | (u(3) >> 4)) + 1;
  return {
    container: "FLAC",
    codec: "FLAC (lossless)",
    sampleRate,
    channels,
    bitDepth: bits,
    bitDepthLabel: `${bits}-bit integer`,
    isFloat: false,
    lossless: true,
  };
}

function parseMp3(dv) {
  const start = skipId3(dv);
  const end = Math.min(dv.byteLength - 4, start + 65536);
  const rates = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  for (let i = start; i < end; i++) {
    const b1 = dv.getUint8(i + 1);
    if (dv.getUint8(i) !== 0xff || (b1 & 0xe0) !== 0xe0) continue;
    const ver = (b1 >> 3) & 3;
    const layer = (b1 >> 1) & 3;
    const b2 = dv.getUint8(i + 2);
    const srIdx = (b2 >> 2) & 3;
    const brIdx = b2 >> 4;
    if (ver === 1 || layer === 0 || srIdx === 3 || brIdx === 0xf) continue;
    return {
      container: "MPEG audio",
      codec: `MP${4 - layer} (lossy)`,
      sampleRate: rates[ver][srIdx],
      channels: dv.getUint8(i + 3) >> 6 === 3 ? 1 : 2,
      bitDepth: null,
      bitDepthLabel: "n/a — lossy codec (no fixed bit depth)",
      isFloat: false,
      lossless: false,
    };
  }
  return null;
}

function parseOgg(dv, u8) {
  if (readStr(dv, 0, 4) !== "OggS") return null;
  const vorbis = findBytes(u8, "\x01vorbis", 0, 4096);
  if (vorbis >= 0) {
    return {
      container: "Ogg",
      codec: "Vorbis (lossy)",
      sampleRate: dv.getUint32(vorbis + 12, true),
      channels: dv.getUint8(vorbis + 11),
      bitDepth: null,
      bitDepthLabel: "n/a — lossy codec (no fixed bit depth)",
      isFloat: false,
      lossless: false,
    };
  }
  const opus = findBytes(u8, "OpusHead", 0, 4096);
  if (opus >= 0) {
    const inputRate = dv.getUint32(opus + 12, true);
    return {
      container: "Ogg",
      codec: "Opus (lossy)",
      sampleRate: 48000,
      note: inputRate ? `Opus always decodes at 48 kHz (encoder input was ${fmtRate(inputRate)})` : "Opus always decodes at 48 kHz",
      channels: dv.getUint8(opus + 9),
      bitDepth: null,
      bitDepthLabel: "n/a — lossy codec (no fixed bit depth)",
      isFloat: false,
      lossless: false,
    };
  }
  return null;
}

function parseMp4(dv, u8) {
  if (readStr(dv, 4, 4) !== "ftyp") return null;
  const alac = findBytes(u8, "alac");
  if (alac >= 0) {
    const inner = findBytes(u8, "alac", alac + 4);
    if (inner >= 0 && inner + 32 <= u8.length) {
      const cfg = inner + 8;
      const bits = dv.getUint8(cfg + 5);
      return {
        container: "MP4 / M4A",
        codec: "Apple Lossless (ALAC)",
        sampleRate: dv.getUint32(cfg + 20),
        channels: dv.getUint8(cfg + 9),
        bitDepth: bits,
        bitDepthLabel: `${bits}-bit integer`,
        isFloat: false,
        lossless: true,
      };
    }
  }
  const mp4a = findBytes(u8, "mp4a");
  if (mp4a >= 0 && mp4a + 32 <= u8.length) {
    return {
      container: "MP4 / M4A",
      codec: "AAC (lossy)",
      sampleRate: dv.getUint16(mp4a + 28),
      channels: dv.getUint16(mp4a + 20),
      bitDepth: null,
      bitDepthLabel: "n/a — lossy codec (no fixed bit depth)",
      isFloat: false,
      lossless: false,
    };
  }
  return null;
}

export function parseHeader(arrayBuffer) {
  const dv = new DataView(arrayBuffer);
  const u8 = new Uint8Array(arrayBuffer);
  const parsers = [
    () => parseWav(dv),
    () => parseAiff(dv),
    () => parseFlac(dv),
    () => parseOgg(dv, u8),
    () => parseMp4(dv, u8),
    () => parseMp3(dv),
  ];
  for (const p of parsers) {
    try {
      const r = p();
      if (r && r.sampleRate > 0) return r;
    } catch {
    }
  }
  return null;
}
