// ── Faust DSP metadata types ─────────────────────────────────────────────────
// Shape of the dsp-meta.json produced by the Faust IDE / faust2wasm export.
// Used to drive a fully data-driven UI (see components/FaustPanel.tsx) so any
// future Faust patch works without writing per-chapter param lists by hand.

export type FaustMetaEntry = Record<string, string>;

export interface FaustUIGroup {
  type: 'vgroup' | 'hgroup' | 'tgroup';
  label: string;
  items: FaustUIItem[];
  meta?: FaustMetaEntry[];
}

export interface FaustUIControl {
  type: 'hslider' | 'vslider' | 'nentry' | 'button' | 'checkbox' | 'hbargraph' | 'vbargraph';
  label: string;
  varname?: string;
  shortname?: string;
  address: string;
  index?: number;
  meta?: FaustMetaEntry[];
  init?: number;
  min?: number;
  max?: number;
  step?: number;
}

export type FaustUIItem = FaustUIGroup | FaustUIControl;

export interface FaustDspMeta {
  name: string;
  filename?: string;
  version?: string;
  compile_options?: string;
  size: number;
  code: string;
  inputs: number;
  outputs: number;
  meta?: FaustMetaEntry[];
  ui: FaustUIItem[];
}

/** Narrow a FaustUIItem down to a group (has nested items). */
export function isFaustGroup(item: FaustUIItem): item is FaustUIGroup {
  return 'items' in item;
}

/** Look up a meta value (e.g. "unit", "scale") from a control's meta array. */
export function faustMetaValue(metaArr: FaustMetaEntry[] | undefined, key: string): string | undefined {
  if (!metaArr) return undefined;
  for (const m of metaArr) if (key in m) return m[key];
  return undefined;
}

/** Minimal shape of the node returned by @faustwasm's DSP generators that we rely on. */
export interface FaustNodeLike {
  connect(destination: AudioNode): AudioNode;
  disconnect(destination?: AudioNode): void;
  setParamValue(address: string, value: number): void;
  getParamValue?(address: string): number;
}

/**
 * Compile a `dsp-module.wasm` file, preferring the fast streaming path but
 * falling back to buffered compilation if it fails.
 *
 * `WebAssembly.compileStreaming()` requires the HTTP response to be served
 * with `Content-Type: application/wasm` — Vite's dev server sets this
 * automatically, but static hosts (e.g. Vercel) don't always guarantee it
 * for files copied verbatim from `public/`, which throws:
 *   "Failed to execute 'compile' on 'WebAssembly': Incorrect response MIME
 *    type. Expected 'application/wasm'."
 * even though the file itself is fine. `WebAssembly.compile()` on a raw
 * ArrayBuffer ignores Content-Type entirely, so it works regardless of how
 * the host serves the file.
 */
export async function compileFaustWasm(url: string): Promise<WebAssembly.Module> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  try {
    return await WebAssembly.compileStreaming(res.clone());
  } catch (err) {
    console.warn(`[compileFaustWasm] compileStreaming failed for ${url}, falling back to buffered compile`, err);
    return WebAssembly.compile(await res.arrayBuffer());
  }
}
