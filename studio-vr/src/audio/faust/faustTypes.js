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
