import { useEffect, useRef, useState } from 'react';
import { FaustMonoDspGenerator } from '@grame/faustwasm';
import type { FaustDspMeta, FaustNodeLike } from './faustTypes';

export type FaustDspStatus = 'idle' | 'loading' | 'ready' | 'error';

interface UseFaustDspResult {
  node: FaustNodeLike | null;
  meta: FaustDspMeta | null;
  status: FaustDspStatus;
  error: string | null;
}

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
export function useFaustDsp(audioContext: AudioContext | null, basePath: string): UseFaustDspResult {
  const [status, setStatus] = useState<FaustDspStatus>('idle');
  const [error, setError]   = useState<string | null>(null);
  const [meta, setMeta]     = useState<FaustDspMeta | null>(null);
  const [node, setNode]     = useState<FaustNodeLike | null>(null);
  const loadedForCtx = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!audioContext) return;
    if (loadedForCtx.current === audioContext) return;
    loadedForCtx.current = audioContext;

    let cancelled = false;
    setStatus('loading');
    setError(null);

    (async () => {
      try {
        const dspMeta: FaustDspMeta = await (await fetch(`${basePath}/dsp-meta.json`)).json();
        const dspModule = await WebAssembly.compileStreaming(fetch(`${basePath}/dsp-module.wasm`));

        const generator = new FaustMonoDspGenerator();
        const faustNode = await generator.createNode(
          audioContext,
          dspMeta.name,
          { module: dspModule, json: JSON.stringify(dspMeta), soundfiles: {} },
          false,
          512,
        );
        if (cancelled) return;
        if (!faustNode) throw new Error('createNode returned no node — check dsp-module.wasm / dsp-meta.json at ' + basePath);
        setNode(faustNode as unknown as FaustNodeLike);
        setMeta(dspMeta);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        console.error('[useFaustDsp] failed to load', basePath, err);
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    })();

    return () => { cancelled = true; };
  }, [audioContext, basePath]);

  return { node, meta, status, error };
}
