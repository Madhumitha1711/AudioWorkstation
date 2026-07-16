import { useEffect, useRef, useState } from 'react';
import { FaustMonoDspGenerator } from '@grame/faustwasm';
import { compileFaustWasm } from './faustTypes';
/**
 * Loads a Faust IDE "wasm" export — just `dsp-module.wasm` + `dsp-meta.json`,
 * copied straight from the IDE's Export button into `public/<basePath>/` —
 * and instantiates it as a mono AudioWorkletNode on the given AudioContext.
 *
 * Uses the `@grame/faustwasm` npm package (same library the IDE bundles)
 * rather than importing any JS from /public: Vite's dev server refuses to
 * serve public-folder .js files through ESM import(), so the DSP loading
 * code has to live in src/ and be bundled normally, while the wasm/json
 * assets stay in public/ and are loaded via plain fetch().
 */
export function useFaustDsp(audioContext, basePath) {
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState(null);
    const [meta, setMeta] = useState(null);
    const [node, setNode] = useState(null);
    const loadedForCtx = useRef(null);
    useEffect(() => {
        if (!audioContext)
            return;
        if (loadedForCtx.current === audioContext)
            return;
        loadedForCtx.current = audioContext;
        let cancelled = false;
        setStatus('loading');
        setError(null);
        (async () => {
            try {
                const dspMeta = await (await fetch(`${basePath}/dsp-meta.json`)).json();
                const dspModule = await compileFaustWasm(`${basePath}/dsp-module.wasm`);
                const generator = new FaustMonoDspGenerator();
                const faustNode = await generator.createNode(audioContext, dspMeta.name, { module: dspModule, json: JSON.stringify(dspMeta), soundfiles: {} }, false, 512);
                if (cancelled)
                    return;
                if (!faustNode)
                    throw new Error('createNode returned no node — check dsp-module.wasm / dsp-meta.json at ' + basePath);
                setNode(faustNode);
                setMeta(dspMeta);
                setStatus('ready');
            }
            catch (err) {
                if (cancelled)
                    return;
                console.error('[useFaustDsp] failed to load', basePath, err);
                setError(err instanceof Error ? err.message : String(err));
                setStatus('error');
            }
        })();
        return () => { cancelled = true; };
    }, [audioContext, basePath]);
    return { node, meta, status, error };
}
