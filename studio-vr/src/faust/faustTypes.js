// ── Faust DSP metadata types ─────────────────────────────────────────────────
// Shape of the dsp-meta.json produced by the Faust IDE / faust2wasm export.
// Used to drive a fully data-driven UI (see components/FaustPanel.tsx) so any
// future Faust patch works without writing per-chapter param lists by hand.
/** Narrow a FaustUIItem down to a group (has nested items). */
export function isFaustGroup(item) {
    return 'items' in item;
}
/** Look up a meta value (e.g. "unit", "scale") from a control's meta array. */
export function faustMetaValue(metaArr, key) {
    if (!metaArr)
        return undefined;
    for (const m of metaArr)
        if (key in m)
            return m[key];
    return undefined;
}
/**
 * Minimal shape of the node returned by @faustwasm's DSP generators that we
 * rely on: connect/disconnect, setParamValue(address, value), and optionally
 * getParamValue(address) / setOutputParamHandler(handler).
 *
 * Faust's getParamValue() only reads from the node's registered AudioParams,
 * which only cover *input* controls (sliders/checkboxes) — read-only UI
 * outputs like an hbargraph (e.g. a limiter's live Gain_Reduction meter)
 * are never registered as AudioParams, so getParamValue() on one of those
 * addresses always returns the 0 fallback. The DSP posts those output
 * values from the audio thread instead; setOutputParamHandler registers a
 * callback that fires with (address, value) whenever one updates.
 */
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
export async function compileFaustWasm(url) {
    const res = await fetch(url);
    if (!res.ok)
        throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
    try {
        return await WebAssembly.compileStreaming(res.clone());
    }
    catch (err) {
        console.warn(`[compileFaustWasm] compileStreaming failed for ${url}, falling back to buffered compile`, err);
        return WebAssembly.compile(await res.arrayBuffer());
    }
}
