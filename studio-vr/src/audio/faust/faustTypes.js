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

// AudioWorklet only exists in secure contexts (HTTPS/localhost). On plain HTTP
// fall back to a ScriptProcessorNode: it runs on the main thread, so it gets a
// larger buffer to make UI-stall clicks less likely.
export function createFaustMonoNode(generator, ctx, name, factory, processorName) {
  const sp = !ctx.audioWorklet;
  return generator.createNode(ctx, name, factory, sp, sp ? 4096 : 512, processorName);
}
