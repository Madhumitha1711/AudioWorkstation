import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FaustMonoDspGenerator } from "@grame/faustwasm";
import { compileFaustWasm } from "../../../audio/faust/faustTypes";
import {
  initAudio,
  resumeAudio,
  getAudioContext,
  createStudioSpeakerBus,
} from "../../../audio/spatialAudioEngine";
import { ADDR as DEESS_ADDR, pushFaustParams as pushDeEsserParams, analyserPeakDb } from "../../../audio/effects/deEsserEngine";
import { pushFaustParams as pushGateParams } from "../../../audio/effects/gateEngine";
import { BAND_IDS as COMP_BAND_IDS, ADDR as COMP_ADDR, pushFaustParams as pushCompParams } from "../../../audio/effects/compressorEngine";
import { ADDR as LIMITER_ADDR, pushFaustParams as pushLimiterParams } from "../../../audio/effects/limiterEngine";
import { pushFaustParams as pushDelayParams, analyserPeakLinear } from "../../../audio/effects/delayEngine";
import { pushFaustParams as pushReverbParams } from "../../../audio/effects/reverbEngine";
import {
  LIVE_GAIN_ADDR_TO_BAND,
  applyBandsToNode as applyEqBandsToNode,
  applyOutputGain as applyEqOutputGain,
} from "../../../audio/effects/equalizerEngine";
import { downloadAudioBufferAsWav } from "../../../audio/wavRender";
import "../../gear-studio/chapters.css";
import "./DawWorkstationScreen.css";

import { PLUGIN_DEFS, TRACK_COLORS, MIN_REGION_LEN, TRACK_CHAIN_SCOPE, DEMO_CLIPS, VIEW_TABS } from "./lib/constants";
import { clamp, pickRulerStep } from "./lib/format";
import { trackIsAudible, computeDryScale, outerScopeId, isOuterScope, baseRegionId } from "./lib/trackHelpers";
import { createDemoLoopBuffer, computePeaks } from "./engine/audioBuffers";
import { computeSegments, getChainArray, withChainArray, disconnectChainSlots, wireLiveChain, collectMeters, defaultSlotExtras } from "./engine/chainGraph";
import { renderTrackOffline, renderMixOffline } from "./engine/offlineRender";
import { TopBar } from "./components/TopBar";
import { useTabTransition } from "../../../components/Tabs";
import { TrackList } from "./components/TrackList";
import { Arrangement } from "./components/Arrangement";
import { EditorDock } from "./components/EditorDock";
import { MixerView } from "./components/MixerView";
import { AddTrackDialog } from "./components/AddTrackDialog";
import { PluginEditorPopup } from "./components/PluginEditorPopup";

function DawWorkstationScreen({ open, onClose }) {
  const isOpen = open?.type === "daw";

  const [tracks, setTracks] = useState([]);
  const tracksRef = useRef([]);
  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);
  const trackIdRef = useRef(0);
  const regionIdRef = useRef(0);
  const demoBufferRef = useRef(null);
  const demoClipBuffersRef = useRef(new Map());

  const [recordingTrackId, setRecordingTrackId] = useState(null);
  const recordingTrackIdRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordingCounterRef = useRef(0);

  const arrangementDuration = useMemo(
    () => tracks.reduce((max, t) => Math.max(max, (t.startAt ?? 0) + (t.buffer?.duration ?? 0)), 0),
    [tracks],
  );

  const anySoloed = useMemo(() => tracks.some((t) => t.solo), [tracks]);

  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const selectedTrackIdRef = useRef(null);
  useEffect(() => {
    selectedTrackIdRef.current = selectedTrackId;
  }, [selectedTrackId]);

  const [viewMode, setViewMode] = useState("arrange");
  const viewRef = useRef(null);
  useTabTransition(viewRef, viewMode, VIEW_TABS.findIndex((t) => t.id === viewMode));

  const [addTrackDialogOpen, setAddTrackDialogOpen] = useState(false);
  const [newTrackDraft, setNewTrackDraft] = useState({ name: "", color: TRACK_COLORS[0], icon: "audio", kind: "audio" });
  const openAddTrackDialog = useCallback(() => {
    const n = trackIdRef.current + 1;
    setNewTrackDraft({ name: `Track ${n}`, color: TRACK_COLORS[(n - 1) % TRACK_COLORS.length], icon: "audio", kind: "audio" });
    setAddTrackDialogOpen(true);
  }, []);

  const [selectedRegion, setSelectedRegion] = useState(null);
  const selectedRegionRef = useRef(null);
  useEffect(() => {
    selectedRegionRef.current = selectedRegion;
  }, [selectedRegion]);

  const [dockScope, setDockScope] = useState("portion");

  const [draftRegion, setDraftRegion] = useState(null);

  const [draggingKey, setDraggingKey] = useState(null);

  const tracklistRef = useRef(null);
  const arrangementRef = useRef(null);
  const syncingScrollRef = useRef(false);
  const onTracklistScroll = useCallback(() => {
    if (syncingScrollRef.current) {
      syncingScrollRef.current = false;
      return;
    }
    if (arrangementRef.current && tracklistRef.current) {
      syncingScrollRef.current = true;
      arrangementRef.current.scrollTop = tracklistRef.current.scrollTop;
    }
  }, []);
  const onArrangementScroll = useCallback(() => {
    if (syncingScrollRef.current) {
      syncingScrollRef.current = false;
      return;
    }
    if (tracklistRef.current && arrangementRef.current) {
      syncingScrollRef.current = true;
      tracklistRef.current.scrollTop = arrangementRef.current.scrollTop;
    }
  }, []);

  const trackRowRefs = useRef(new Map());
  const [rowSlotHeights, setRowSlotHeights] = useState({});
  useLayoutEffect(() => {
    const rowEls = trackRowRefs.current;
    if (rowEls.size === 0) return undefined;
    const remeasure = () => {
      setRowSlotHeights((prev) => {
        let changed = false;
        const next = { ...prev };
        rowEls.forEach((el, id) => {
          const marginBottom = parseFloat(getComputedStyle(el).marginBottom) || 0;
          const slot = Math.round(el.getBoundingClientRect().height + marginBottom);
          if (slot > 0 && next[id] !== slot) {
            next[id] = slot;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    };
    remeasure();
    const ro = new ResizeObserver(remeasure);
    rowEls.forEach((el) => ro.observe(el));
    window.addEventListener("resize", remeasure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", remeasure);
    };
  }, [tracks, viewMode]);

  const [activeEditor, setActiveEditor] = useState(null);
  const activeEditorRef = useRef(null);
  useEffect(() => {
    activeEditorRef.current = activeEditor;
  }, [activeEditor]);
  const preIsolateSoloRef = useRef(null);

  const engineCacheRef = useRef(new Map());
  const slotRuntimeRef = useRef(new Map());
  const meterValuesRef = useRef(new Map());
  const sendIdRef = useRef(0);
  const sendRuntimeRef = useRef(new Map());
  const eqRuntimeRef = useRef(new Map());
  const eqAnalyserRef = useRef(null);
  const eqDryAnalyserRef = useRef(null);
  const eqLiveDynGainRef = useRef({});

  const [gateIsOpen, setGateIsOpen] = useState(true);
  const [compSelectedBand, setCompSelectedBand] = useState("low");
  const [, setLimiterGainReduction] = useState(0);
  const [delayLink, setDelayLink] = useState(false);
  const [eqSelectedBandId, setEqSelectedBandId] = useState("peak1");
  const [eqSampleRate, setEqSampleRate] = useState(48000);

  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  const [loopOn, setLoopOn] = useState(true);
  const loopOnRef = useRef(loopOn);
  useEffect(() => {
    loopOnRef.current = loopOn;
  }, [loopOn]);
  const [playhead, setPlayhead] = useState(0);
  const graphRef = useRef(null);
  const pausedOffsetRef = useRef(0);
  const endTimeoutRef = useRef(null);
  const playCallTokenRef = useRef(0);
  const [meterLevel, setMeterLevel] = useState(0);

  const [downloadingTrackId, setDownloadingTrackId] = useState(null);
  const [downloadingMix, setDownloadingMix] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  const ensureContext = useCallback(async () => {
    initAudio();
    resumeAudio();
    const ctx = getAudioContext();
    if (!ctx) return null;
    if (ctx.state === "suspended") await ctx.resume();
    return ctx;
  }, []);

  const loadPluginEngine = useCallback(async (ctx, def) => {
    let cached = engineCacheRef.current.get(def.key);
    if (!cached) {
      const metaJson = await (await fetch(`${def.basePath}/dsp-meta.json`)).json();
      const mod = await compileFaustWasm(`${def.basePath}/dsp-module.wasm`);
      cached = { factory: { module: mod, json: JSON.stringify(metaJson), soundfiles: {} }, meta: metaJson };
      engineCacheRef.current.set(def.key, cached);
    }
    const generator = new FaustMonoDspGenerator();
    const node = await generator.createNode(ctx, cached.meta.name, cached.factory, true, 512);
    return { node, meta: cached.meta };
  }, []);

  const getPreviewWindow = useCallback(() => {
    const sel = selectedRegionRef.current;
    if (sel) {
      const track = tracksRef.current.find((t) => t.id === sel.trackId);
      const region = track?.regions.find((r) => r.id === sel.regionId);
      if (track && region) {
        const startAt = track.startAt ?? 0;
        return { start: startAt + region.start, end: startAt + region.end };
      }
    }
    const ed = activeEditorRef.current;
    if (ed && ed.regionId === TRACK_CHAIN_SCOPE) {
      const track = tracksRef.current.find((t) => t.id === ed.trackId);
      if (track?.buffer) {
        const startAt = track.startAt ?? 0;
        return { start: startAt, end: startAt + track.buffer.duration };
      }
    }
    return null;
  }, []);

  const currentOffset = useCallback(() => {
    if (!isPlayingRef.current) return pausedOffsetRef.current;
    const ctx = getAudioContext();
    const g = graphRef.current;
    if (!ctx || !g) return pausedOffsetRef.current;
    const raw = g.startOffset + (ctx.currentTime - g.startCtxTime);
    if (g.loopEnabled) {
      const span = g.loopEnd - g.loopStart;
      if (span > 0) return g.loopStart + (((raw - g.loopStart) % span) + span) % span;
    }
    return raw;
  }, []);

  const teardownPlaybackGraph = useCallback(() => {
    if (endTimeoutRef.current) {
      clearTimeout(endTimeoutRef.current);
      endTimeoutRef.current = null;
    }
    const g = graphRef.current;
    if (!g) return;
    g.trackNodes.forEach(({ sources, extraNodes }) => {
      sources.forEach((source) => {
        try {
          source.stop();
        } catch {
        }
        try {
          source.disconnect();
        } catch {
        }
      });
      extraNodes.forEach((n) => {
        try {
          n.disconnect();
        } catch {
        }
      });
    });
    tracksRef.current.forEach((t) => {
      disconnectChainSlots(t.chain);
      t.regions.forEach((region) => {
        disconnectChainSlots(region.chain);
        disconnectChainSlots(region.outerChain || []);
      });
    });
    try {
      g.masterGain.disconnect();
    } catch {
    }
    try {
      g.meterAnalyser.disconnect();
    } catch {
    }
    g.speakerBus?.dispose();
    graphRef.current = null;
    slotRuntimeRef.current.clear();
    eqRuntimeRef.current.clear();
    eqAnalyserRef.current = null;
    eqDryAnalyserRef.current = null;
  }, []);

  const playFrom = useCallback(
    async (offset) => {
      const token = ++playCallTokenRef.current;
      const list = tracksRef.current.filter((t) => t.buffer);
      if (list.length === 0) return;
      const ctx = await ensureContext();
      if (!ctx) return;
      if (token !== playCallTokenRef.current) return;
      teardownPlaybackGraph();
      setEqSampleRate(ctx.sampleRate);

      const arrDur = list.reduce((max, t) => Math.max(max, (t.startAt ?? 0) + t.buffer.duration), 0);
      const pw = getPreviewWindow();
      const loopStart = pw ? clamp(pw.start, 0, arrDur) : 0;
      const loopEnd = pw ? clamp(pw.end, 0, arrDur) : arrDur;
      const useLoop = pw ? true : loopOnRef.current;
      const clampedOffset = clamp(offset, loopStart, Math.max(loopStart, loopEnd));

      const masterGain = ctx.createGain();
      const meterAnalyser = ctx.createAnalyser();
      meterAnalyser.fftSize = 512;
      masterGain.connect(meterAnalyser);
      const speakerBus = createStudioSpeakerBus({ independent: true });
      if (speakerBus) masterGain.connect(speakerBus.input);
      else masterGain.connect(ctx.destination);

      const trackNodes = new Map();

      const refs = { slotRuntimeRef, eqRuntimeRef, activeEditorRef, eqAnalyserRef, eqDryAnalyserRef };

      list.forEach((track) => {
        const buffer = track.buffer;
        const startAt = track.startAt ?? 0;
        if (clampedOffset >= startAt + buffer.duration) return;

        let bufferOffset = 0;
        let when = ctx.currentTime;
        if (clampedOffset < startAt) {
          when = ctx.currentTime + (startAt - clampedOffset);
        } else {
          bufferOffset = clampedOffset - startAt;
        }
        const playDuration = buffer.duration - bufferOffset;
        if (playDuration <= 0) return;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.start(when, bufferOffset, playDuration);

        const extraNodes = [];
        const { chainOut: trackChainOut, extraNodes: trackExtra } = wireLiveChain(
          ctx,
          source,
          track.chain,
          track.id,
          TRACK_CHAIN_SCOPE,
          refs,
        );
        extraNodes.push(...trackExtra);

        const trackGain = ctx.createGain();
        trackGain.gain.value = trackIsAudible(track, tracksRef.current) ? (track.volume ?? 1) : 0;

        const dryGate = ctx.createGain();
        dryGate.gain.value = 0;
        trackChainOut.connect(dryGate);
        dryGate.connect(trackGain);
        extraNodes.push(dryGate);

        const segments = computeSegments(track);
        const portionGates = new Map();
        segments.forEach((seg) => {
          if (seg.region && !portionGates.has(seg.region.id)) {
            const { chainOut: portionOuterOut, extraNodes: portionOuterExtra } = wireLiveChain(
              ctx,
              trackChainOut,
              seg.region.outerChain || [],
              track.id,
              outerScopeId(seg.region.id),
              refs,
            );
            const { chainOut: portionOut, extraNodes: portionExtra } = wireLiveChain(
              ctx,
              portionOuterOut,
              seg.region.chain,
              track.id,
              seg.region.id,
              refs,
            );
            const gateGain = ctx.createGain();
            gateGain.gain.value = 0;
            portionOut.connect(gateGain);
            gateGain.connect(trackGain);
            extraNodes.push(...portionOuterExtra, ...portionExtra, gateGain);
            portionGates.set(seg.region.id, gateGain);
          }
        });

        const allGates = [{ id: null, gain: dryGate }, ...Array.from(portionGates, ([id, gain]) => ({ id, gain }))];
        segments.forEach((seg) => {
          const segAbsStart = startAt + seg.start;
          const segAbsEnd = startAt + seg.end;
          if (clampedOffset >= segAbsEnd) return;
          const atStart = clampedOffset < segAbsStart ? ctx.currentTime + (segAbsStart - clampedOffset) : ctx.currentTime;
          const activeId = seg.region ? seg.region.id : null;
          allGates.forEach(({ id, gain }) => {
            gain.gain.setValueAtTime(id === activeId ? 1 : 0, atStart);
          });
        });

        const dryGain = ctx.createGain();
        dryGain.gain.value = computeDryScale(track);
        extraNodes.push(dryGain);

        const pannerNode = ctx.createStereoPanner();
        pannerNode.pan.value = track.pan ?? 0;
        const trackAnalyser = ctx.createAnalyser();
        trackAnalyser.fftSize = 256;
        trackGain.connect(dryGain);
        dryGain.connect(pannerNode);
        pannerNode.connect(masterGain);
        pannerNode.connect(trackAnalyser);
        trackNodes.set(track.id, { sources: [source], extraNodes, trackGain, dryGain, pannerNode, trackAnalyser, trackChainOut });
      });

      const auxTracks = tracksRef.current.filter((t) => t.kind === "aux");
      const auxInputGains = new Map();
      auxTracks.forEach((auxTrack) => auxInputGains.set(auxTrack.id, ctx.createGain()));

      list.forEach((track) => {
        const nodes = trackNodes.get(track.id);
        if (!nodes) return;
        (track.sends || []).forEach((send) => {
          const targetInput = auxInputGains.get(send.busId);
          if (!targetInput) return;
          const tap = send.prePost === "pre" ? nodes.trackChainOut : nodes.trackGain;
          const sendPanner = ctx.createStereoPanner();
          sendPanner.pan.value = send.fmp ? (track.pan ?? 0) : (send.pan ?? 0);
          const sendGain = ctx.createGain();
          sendGain.gain.value = send.muted ? 0 : (send.level ?? 1);
          const sendAnalyser = ctx.createAnalyser();
          sendAnalyser.fftSize = 256;
          tap.connect(sendPanner);
          sendPanner.connect(sendGain);
          sendGain.connect(targetInput);
          sendGain.connect(sendAnalyser);
          nodes.extraNodes.push(sendPanner, sendGain, sendAnalyser);
          sendRuntimeRef.current.set(`${track.id}:${send.id}`, { sendPanner, sendGain, sendAnalyser });
        });
      });

      auxTracks.forEach((auxTrack) => {
        const auxInput = auxInputGains.get(auxTrack.id);
        const { chainOut: auxChainOut, extraNodes: auxExtra } = wireLiveChain(ctx, auxInput, auxTrack.chain, auxTrack.id, TRACK_CHAIN_SCOPE, refs);
        const auxGain = ctx.createGain();
        auxGain.gain.value = trackIsAudible(auxTrack, tracksRef.current) ? (auxTrack.volume ?? 1) : 0;
        auxChainOut.connect(auxGain);
        const auxPanner = ctx.createStereoPanner();
        auxPanner.pan.value = auxTrack.pan ?? 0;
        const auxAnalyser = ctx.createAnalyser();
        auxAnalyser.fftSize = 256;
        auxGain.connect(auxPanner);
        auxPanner.connect(masterGain);
        auxPanner.connect(auxAnalyser);
        trackNodes.set(auxTrack.id, {
          sources: [],
          extraNodes: [auxInput, ...auxExtra],
          trackGain: auxGain,
          pannerNode: auxPanner,
          trackAnalyser: auxAnalyser,
          trackChainOut: auxChainOut,
        });
      });

      graphRef.current = {
        ctx,
        masterGain,
        meterAnalyser,
        speakerBus,
        trackNodes,
        loopEnabled: useLoop,
        loopStart,
        loopEnd,
        arrangementDuration: arrDur,
        startCtxTime: ctx.currentTime,
        startOffset: clampedOffset,
      };
      setIsPlaying(true);

      const remaining = Math.max(0, loopEnd - clampedOffset);
      endTimeoutRef.current = setTimeout(() => {
        endTimeoutRef.current = null;
        if (useLoop) {
          playFrom(loopStart);
        } else {
          pausedOffsetRef.current = loopStart;
          setPlayhead(loopStart);
          setIsPlaying(false);
        }
      }, remaining * 1000 + 40);
    },
    [ensureContext, teardownPlaybackGraph, getPreviewWindow],
  );

  const pause = useCallback(() => {
    if (!graphRef.current) return;
    pausedOffsetRef.current = clamp(currentOffset(), 0, arrangementDuration);
    teardownPlaybackGraph();
    setIsPlaying(false);
    setPlayhead(pausedOffsetRef.current);
  }, [currentOffset, arrangementDuration, teardownPlaybackGraph]);

  const stop = useCallback(() => {
    teardownPlaybackGraph();
    pausedOffsetRef.current = 0;
    setIsPlaying(false);
    setPlayhead(0);
  }, [teardownPlaybackGraph]);

  const togglePlay = useCallback(() => {
    if (isPlaying) pause();
    else playFrom(pausedOffsetRef.current);
  }, [isPlaying, pause, playFrom]);

  const rewind = useCallback(() => {
    if (isPlaying) playFrom(0);
    else {
      pausedOffsetRef.current = 0;
      setPlayhead(0);
    }
  }, [isPlaying, playFrom]);

  const toggleLoop = useCallback(() => {
    const next = !loopOnRef.current;
    loopOnRef.current = next;
    setLoopOn(next);
    if (isPlayingRef.current) playFrom(currentOffset());
  }, [playFrom, currentOffset]);

  const [trackLevels, setTrackLevels] = useState({});
  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      if (!dragPlayheadRef.current) setPlayhead(clamp(currentOffset(), 0, arrangementDuration));
      const g = graphRef.current;
      if (g?.meterAnalyser) {
        const data = new Uint8Array(g.meterAnalyser.fftSize);
        g.meterAnalyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        setMeterLevel(Math.sqrt(sum / data.length));
      }
      if (viewMode === "mixer" && g) {
        const levels = {};
        g.trackNodes.forEach((nodes, trackId) => {
          if (!nodes.trackAnalyser) return;
          const data = new Uint8Array(nodes.trackAnalyser.fftSize);
          nodes.trackAnalyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          levels[trackId] = Math.sqrt(sum / data.length);
        });
        setTrackLevels(levels);
      }
    }, 90);
    return () => clearInterval(id);
  }, [isPlaying, currentOffset, arrangementDuration, viewMode]);
  useEffect(() => {
    if (!isPlaying) setTrackLevels({});
  }, [isPlaying]);

  const addTrackWithBuffer = useCallback(
    (buffer, name, fixedColor) => {
      const n = ++trackIdRef.current;
      const id = `t${n}`;
      const color = fixedColor || TRACK_COLORS[(n - 1) % TRACK_COLORS.length];
      const peaks = computePeaks(buffer);
      const track = {
        id, name, color, icon: "audio", kind: "audio", buffer, peaks, duration: buffer.duration, loadError: "",
        chain: [], regions: [], sends: [], volume: 1, pan: 0, muted: false, solo: false, startAt: 0,
      };
      const next = [...tracksRef.current, track];
      tracksRef.current = next;
      setTracks(next);
      setSelectedTrackId(id);
      if (isPlayingRef.current) playFrom(currentOffset());
      return id;
    },
    [playFrom, currentOffset],
  );

  const addEmptyTrack = useCallback((opts) => {
    const n = ++trackIdRef.current;
    const id = `t${n}`;
    const kind = opts?.kind === "aux" ? "aux" : "audio";
    const color = opts?.color || TRACK_COLORS[(n - 1) % TRACK_COLORS.length];
    const name = opts?.name?.trim() || (kind === "aux" ? `Aux ${n}` : `Track ${n}`);
    const icon = kind === "aux" ? "aux" : opts?.icon || "audio";
    const track = {
      id, name, color, icon, kind, buffer: null, peaks: null, duration: 0, loadError: "",
      chain: [], regions: [], sends: [], volume: 1, pan: 0, muted: false, solo: false, startAt: 0,
    };
    const next = [...tracksRef.current, track];
    tracksRef.current = next;
    setTracks(next);
    setSelectedTrackId(id);
    return id;
  }, []);

  const confirmAddTrack = useCallback(() => {
    addEmptyTrack(newTrackDraft);
    setAddTrackDialogOpen(false);
  }, [addEmptyTrack, newTrackDraft]);

  const removeTrack = useCallback(
    (id) => {
      const track = tracksRef.current.find((t) => t.id === id);
      if (recordingTrackIdRef.current === id) {
        if (mediaRecorderRef.current) mediaRecorderRef.current.onstop = null;
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        recordedChunksRef.current = [];
        recordingTrackIdRef.current = null;
        setRecordingTrackId(null);
      }
      const next = tracksRef.current
        .filter((t) => t.id !== id)
        .map((t) => (t.sends?.some((s) => s.busId === id) ? { ...t, sends: t.sends.filter((s) => s.busId !== id) } : t));
      tracksRef.current = next;
      setTracks(next);
      if (activeEditorRef.current?.trackId === id) setActiveEditor(null);
      if (selectedRegionRef.current?.trackId === id) {
        selectedRegionRef.current = null;
        setSelectedRegion(null);
      }
      if (selectedTrackIdRef.current === id) setSelectedTrackId(next.length > 0 ? next[0].id : null);
      if (track) {
        disconnectChainSlots(track.chain);
        track.regions.forEach((region) => {
          disconnectChainSlots(region.chain);
          disconnectChainSlots(region.outerChain || []);
        });
      }
      if (isPlayingRef.current) {
        if (next.length === 0) stop();
        else playFrom(currentOffset());
      }
    },
    [playFrom, currentOffset, stop],
  );

  const loadDemoClip = useCallback(async (ctx, clip) => {
    const cached = demoClipBuffersRef.current.get(clip.id);
    if (cached) return cached;
    const res = await fetch(clip.url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const arrayBuffer = await res.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    demoClipBuffersRef.current.set(clip.id, decoded);
    return decoded;
  }, []);

  const releaseTrackRegions = useCallback((id) => {
    const track = tracksRef.current.find((t) => t.id === id);
    track?.regions.forEach((region) => {
      disconnectChainSlots(region.chain);
      disconnectChainSlots(region.outerChain || []);
    });
    if (activeEditorRef.current?.trackId === id && activeEditorRef.current?.regionId !== TRACK_CHAIN_SCOPE) {
      setActiveEditor(null);
    }
    if (selectedRegionRef.current?.trackId === id) {
      selectedRegionRef.current = null;
      setSelectedRegion(null);
    }
  }, []);

  const loadDemoForTrack = useCallback(
    async (id, clip) => {
      const ctx = await ensureContext();
      if (!ctx) return;
      let buffer;
      let name = clip.name;
      let loadError = "";
      try {
        buffer = await loadDemoClip(ctx, clip);
      } catch (err) {
        console.error("[DawWorkstationScreen] failed to load demo clip", clip.id, err);
        if (!demoBufferRef.current) demoBufferRef.current = createDemoLoopBuffer(ctx);
        buffer = demoBufferRef.current;
        name = "Demo Loop";
        loadError = `Couldn't load "${clip.name}" — using a synthetic pad instead.`;
      }
      const peaks = computePeaks(buffer);
      releaseTrackRegions(id);
      const next = tracksRef.current.map((t) =>
        t.id === id ? { ...t, buffer, peaks, duration: buffer.duration, name, loadError, regions: [] } : t,
      );
      tracksRef.current = next;
      setTracks(next);
      if (isPlayingRef.current) playFrom(currentOffset());
    },
    [ensureContext, loadDemoClip, releaseTrackRegions, playFrom, currentOffset],
  );

  const handleTrackFile = useCallback(
    async (id, e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const ctx = await ensureContext();
      if (!ctx) {
        setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, loadError: "Could not start the audio engine." } : t)));
        return;
      }
      try {
        const arrayBuffer = await file.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arrayBuffer);
        const peaks = computePeaks(decoded);
        releaseTrackRegions(id);
        const next = tracksRef.current.map((t) =>
          t.id === id ? { ...t, buffer: decoded, peaks, duration: decoded.duration, name: file.name, loadError: "", regions: [] } : t,
        );
        tracksRef.current = next;
        setTracks(next);
        if (isPlayingRef.current) playFrom(currentOffset());
      } catch (err) {
        console.error("[DawWorkstationScreen] upload failed", err);
        setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, loadError: "Could not decode that audio file." } : t)));
      }
    },
    [ensureContext, releaseTrackRegions, playFrom, currentOffset],
  );

  const teardownRecording = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];
    recordingTrackIdRef.current = null;
    setRecordingTrackId(null);
  }, []);

  const startRecording = useCallback(
    async (id) => {
      if (recordingTrackIdRef.current) return;
      const ctx = await ensureContext();
      if (!ctx) {
        setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, loadError: "Could not start the audio engine." } : t)));
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, loadError: "Recording isn't supported in this browser." } : t)));
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        recordedChunksRef.current = [];
        const recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
        };
        recorder.onstop = async () => {
          const chunks = recordedChunksRef.current;
          const mimeType = recorder.mimeType || "audio/webm";
          teardownRecording();
          if (!chunks.length) return;
          try {
            const blob = new Blob(chunks, { type: mimeType });
            const arrayBuffer = await blob.arrayBuffer();
            const decoded = await ctx.decodeAudioData(arrayBuffer);
            const peaks = computePeaks(decoded);
            recordingCounterRef.current += 1;
            releaseTrackRegions(id);
            const next = tracksRef.current.map((t) =>
              t.id === id
                ? { ...t, buffer: decoded, peaks, duration: decoded.duration, name: `Recording ${recordingCounterRef.current}`, loadError: "", regions: [] }
                : t,
            );
            tracksRef.current = next;
            setTracks(next);
            if (isPlayingRef.current) playFrom(currentOffset());
          } catch (err) {
            console.error("[DawWorkstationScreen] recording decode failed", err);
            setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, loadError: "Could not process the recording." } : t)));
          }
        };
        mediaRecorderRef.current = recorder;
        recordingTrackIdRef.current = id;
        setRecordingTrackId(id);
        recorder.start();
      } catch (err) {
        console.error("[DawWorkstationScreen] mic access failed", err);
        setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, loadError: "Microphone access was denied." } : t)));
      }
    },
    [ensureContext, releaseTrackRegions, teardownRecording, playFrom, currentOffset],
  );

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    } else {
      teardownRecording();
    }
  }, [teardownRecording]);

  const setTrackVolume = useCallback((id, volume) => {
    const next = tracksRef.current.map((t) => (t.id === id ? { ...t, volume } : t));
    tracksRef.current = next;
    setTracks(next);
    const track = next.find((t) => t.id === id);
    const nodes = graphRef.current?.trackNodes.get(id);
    if (nodes && graphRef.current && track && !track.muted) {
      nodes.trackGain.gain.setTargetAtTime(volume, graphRef.current.ctx.currentTime, 0.01);
    }
  }, []);

  const applyMuteSoloGains = useCallback((allTracks) => {
    const g = graphRef.current;
    if (!g) return;
    allTracks.forEach((t) => {
      const nodes = g.trackNodes.get(t.id);
      if (!nodes) return;
      nodes.trackGain.gain.setTargetAtTime(trackIsAudible(t, allTracks) ? (t.volume ?? 1) : 0, g.ctx.currentTime, 0.01);
    });
  }, []);

  const toggleTrackMute = useCallback(
    (id) => {
      const next = tracksRef.current.map((t) => (t.id === id ? { ...t, muted: !t.muted } : t));
      tracksRef.current = next;
      setTracks(next);
      applyMuteSoloGains(next);
    },
    [applyMuteSoloGains],
  );

  const toggleTrackSolo = useCallback(
    (id) => {
      const next = tracksRef.current.map((t) => (t.id === id ? { ...t, solo: !t.solo } : t));
      tracksRef.current = next;
      setTracks(next);
      applyMuteSoloGains(next);
    },
    [applyMuteSoloGains],
  );

  const setTrackPan = useCallback((id, pan) => {
    const next = tracksRef.current.map((t) => (t.id === id ? { ...t, pan } : t));
    tracksRef.current = next;
    setTracks(next);
    const g = graphRef.current;
    const nodes = g?.trackNodes.get(id);
    if (nodes?.pannerNode && g) {
      nodes.pannerNode.pan.setTargetAtTime(pan, g.ctx.currentTime, 0.01);
    }
    if (g) {
      const track = next.find((t) => t.id === id);
      (track?.sends || []).forEach((s) => {
        if (!s.fmp) return;
        const rt = sendRuntimeRef.current.get(`${id}:${s.id}`);
        if (rt) rt.sendPanner.pan.setTargetAtTime(pan, g.ctx.currentTime, 0.01);
      });
    }
  }, []);

  const setTrackStartAt = useCallback((id, startAt) => {
    const clamped = Math.max(0, startAt);
    const next = tracksRef.current.map((t) => (t.id === id ? { ...t, startAt: clamped } : t));
    tracksRef.current = next;
    setTracks(next);
  }, []);

  const dragClipRef = useRef(null);

  const beginClipDrag = useCallback(
    (e, track) => {
      const container = arrangementRef.current;
      if (!container) return;
      e.stopPropagation();
      const containerWidth = container.clientWidth || 1;
      const secondsPerPixel = Math.max(arrangementDuration, 1) / containerWidth;
      dragClipRef.current = {
        trackId: track.id,
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startAt: track.startAt ?? 0,
        secondsPerPixel,
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
      }
      setSelectedTrackId(track.id);
    },
    [arrangementDuration],
  );

  const onClipPointerMove = useCallback(
    (e) => {
      const drag = dragClipRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      const deltaSec = (e.clientX - drag.startClientX) * drag.secondsPerPixel;
      setTrackStartAt(drag.trackId, drag.startAt + deltaSec);
    },
    [setTrackStartAt],
  );

  const endClipDrag = useCallback(
    (e) => {
      const drag = dragClipRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      dragClipRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
      }
      if (isPlayingRef.current) playFrom(currentOffset());
    },
    [playFrom, currentOffset],
  );

  const selectRegion = useCallback(
    (trackId, regionId) => {
      selectedRegionRef.current = { trackId, regionId };
      setSelectedRegion({ trackId, regionId });
      setSelectedTrackId(trackId);
      setDockScope("portion");
      if (isPlayingRef.current) playFrom(currentOffset());
    },
    [playFrom, currentOffset],
  );

  const exitSelection = useCallback(() => {
    selectedRegionRef.current = null;
    setSelectedRegion(null);
    setDockScope("portion");
    if (isPlayingRef.current) playFrom(currentOffset());
  }, [playFrom, currentOffset]);

  const createRegion = useCallback(
    (trackId, start, end) => {
      const track = tracksRef.current.find((t) => t.id === trackId);
      if (!track) return;
      const segments = computeSegments(track);
      const gap = segments.find((s) => s.region === null && start >= s.start - 1e-6 && start <= s.end + 1e-6);
      if (!gap) return;
      const s = Math.max(start, gap.start);
      const e = Math.min(end, gap.end);
      if (e - s < MIN_REGION_LEN) return;
      const id = `${trackId}-r${++regionIdRef.current}`;
      const region = { id, start: s, end: e, chain: [], outerChain: [], outerCustomized: false };
      const next = tracksRef.current.map((t) => (t.id === trackId ? { ...t, regions: [...t.regions, region] } : t));
      tracksRef.current = next;
      setTracks(next);
      selectRegion(trackId, id);
    },
    [selectRegion],
  );

  const removeRegion = useCallback(
    (trackId, regionId) => {
      const track = tracksRef.current.find((t) => t.id === trackId);
      const region = track?.regions.find((r) => r.id === regionId);
      const next = tracksRef.current.map((t) =>
        t.id === trackId ? { ...t, regions: t.regions.filter((r) => r.id !== regionId) } : t,
      );
      tracksRef.current = next;
      setTracks(next);
      region?.chain.forEach((slot) => {
        try {
          slot.node?.disconnect();
        } catch {
        }
      });
      if (activeEditorRef.current?.trackId === trackId && activeEditorRef.current?.regionId === regionId) setActiveEditor(null);
      if (selectedRegionRef.current?.trackId === trackId && selectedRegionRef.current?.regionId === regionId) {
        selectedRegionRef.current = null;
        setSelectedRegion(null);
      }
      if (isPlayingRef.current) playFrom(currentOffset());
    },
    [currentOffset, playFrom],
  );

  const dragRegionRef = useRef(null);

  const beginRegionDrag = useCallback((e, track) => {
    if (!track.buffer) return;
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width || 1;
    const secondsPerPixel = track.duration / width;
    const anchor = clamp((e.clientX - rect.left) * secondsPerPixel, 0, track.duration);
    dragRegionRef.current = { trackId: track.id, pointerId: e.pointerId, rectLeft: rect.left, secondsPerPixel, anchor, duration: track.duration };
    setDraftRegion({ trackId: track.id, start: anchor, end: anchor });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
    }
  }, []);

  const onRegionPointerMove = useCallback((e) => {
    const drag = dragRegionRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const cur = clamp((e.clientX - drag.rectLeft) * drag.secondsPerPixel, 0, drag.duration);
    const start = Math.min(drag.anchor, cur);
    const end = Math.max(drag.anchor, cur);
    setDraftRegion({ trackId: drag.trackId, start, end });
  }, []);

  const endRegionDrag = useCallback(
    (e) => {
      const drag = dragRegionRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      dragRegionRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
      }
      setDraftRegion((current) => {
        if (current && current.trackId === drag.trackId && current.end - current.start >= MIN_REGION_LEN) {
          createRegion(current.trackId, current.start, current.end);
        }
        return null;
      });
    },
    [createRegion],
  );

  const dragPlayheadRef = useRef(null);

  const beginPlayheadDrag = useCallback(
    (e) => {
      const container = arrangementRef.current;
      if (!container || arrangementDuration <= 0) return;
      e.stopPropagation();
      const containerWidth = container.clientWidth || 1;
      dragPlayheadRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startOffset: currentOffset(),
        secondsPerPixel: arrangementDuration / containerWidth,
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
      }
    },
    [arrangementDuration, currentOffset],
  );

  const onPlayheadPointerMove = useCallback(
    (e) => {
      const drag = dragPlayheadRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      const deltaSec = (e.clientX - drag.startClientX) * drag.secondsPerPixel;
      const pw = getPreviewWindow();
      const lo = pw ? pw.start : 0;
      const hi = pw ? pw.end : arrangementDuration;
      const next = clamp(drag.startOffset + deltaSec, lo, hi);
      pausedOffsetRef.current = next;
      setPlayhead(next);
    },
    [arrangementDuration, getPreviewWindow],
  );

  const endPlayheadDrag = useCallback(
    (e) => {
      const drag = dragPlayheadRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      dragPlayheadRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
      }
      if (isPlayingRef.current) playFrom(pausedOffsetRef.current);
    },
    [playFrom],
  );

  const handleDownloadTrack = useCallback(async (id) => {
    const track = tracksRef.current.find((t) => t.id === id);
    if (!track || !track.buffer) return;
    setDownloadError("");
    setDownloadingTrackId(id);
    try {
      const rendered = await renderTrackOffline(engineCacheRef.current, track);
      downloadAudioBufferAsWav(rendered, `${track.name || "track"}.wav`);
    } catch (err) {
      console.error("[DawWorkstationScreen] failed to render track for download", err);
      setDownloadError("Could not render that track for download — see console for details.");
    } finally {
      setDownloadingTrackId(null);
    }
  }, []);

  const handleDownloadMix = useCallback(async () => {
    const all = tracksRef.current;
    if (!all.some((t) => t.buffer)) return;
    const ctx = await ensureContext();
    if (!ctx) return;
    setDownloadError("");
    setDownloadingMix(true);
    try {
      const rendered = await renderMixOffline(engineCacheRef.current, all, ctx.sampleRate);
      if (rendered) downloadAudioBufferAsWav(rendered, "studio-vr-mix.wav");
    } catch (err) {
      console.error("[DawWorkstationScreen] failed to render mix for download", err);
      setDownloadError("Could not render the mix for download — see console for details.");
    } finally {
      setDownloadingMix(false);
    }
  }, [ensureContext]);

  useEffect(() => {
    if (!isOpen || tracksRef.current.length > 0) return;
    (async () => {
      const ctx = await ensureContext();
      if (!ctx) return;
      const buffers = await Promise.all(
        DEMO_CLIPS.map((clip) =>
          loadDemoClip(ctx, clip).catch((err) => {
            console.error("[DawWorkstationScreen] failed to load default demo track", clip.id, err);
            return null;
          }),
        ),
      );
      let firstId = null;
      DEMO_CLIPS.forEach((clip, i) => {
        let buffer = buffers[i];
        let name = clip.name;
        if (!buffer) {
          if (!demoBufferRef.current) demoBufferRef.current = createDemoLoopBuffer(ctx);
          buffer = demoBufferRef.current;
          name = "Demo Loop";
        }
        const id = addTrackWithBuffer(buffer, name, clip.color);
        if (firstId === null) firstId = id;
      });
      if (firstId !== null) setSelectedTrackId(firstId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (recordingTrackIdRef.current) {
        if (mediaRecorderRef.current) mediaRecorderRef.current.onstop = null;
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        recordedChunksRef.current = [];
        recordingTrackIdRef.current = null;
        setRecordingTrackId(null);
      }
      teardownPlaybackGraph();
      tracksRef.current.forEach((t) => {
        disconnectChainSlots(t.chain);
        t.regions.forEach((region) => {
        disconnectChainSlots(region.chain);
        disconnectChainSlots(region.outerChain || []);
      });
      });
      tracksRef.current = [];
      setTracks([]);
      setActiveEditor(null);
      selectedRegionRef.current = null;
      setSelectedRegion(null);
      setDraftRegion(null);
      pausedOffsetRef.current = 0;
      setPlayhead(0);
      setIsPlaying(false);
    };
  }, [isOpen, teardownPlaybackGraph]);

  const loadSlotEngineFor = useCallback(
    async (trackId, regionId, def) => {
      const ctx = await ensureContext();
      if (!ctx) {
        const errored = tracksRef.current.map((t) =>
          t.id === trackId
            ? withChainArray(t, regionId, getChainArray(t, regionId).map((s) => (s.key === def.key ? { ...s, status: "error" } : s)))
            : t,
        );
        tracksRef.current = errored;
        setTracks(errored);
        return;
      }
      try {
        const { node, meta } = await loadPluginEngine(ctx, def);
        const stillTrack = tracksRef.current.find((t) => t.id === trackId);
        const stillChain = getChainArray(stillTrack, regionId);
        const stillSlot = stillChain?.find((s) => s.key === def.key);
        if (!stillSlot) {
          try {
            node.disconnect();
          } catch {
          }
          return;
        }
        const flatItems = meta.ui?.[0]?.items ?? [];
        const meters = collectMeters(flatItems);
        const addressKey = `${trackId}:${regionId}:${def.key}`;
        if (def.key === "eq") {
          node.setOutputParamHandler?.((address, value) => {
            const bandId = LIVE_GAIN_ADDR_TO_BAND[address];
            if (bandId) eqLiveDynGainRef.current[bandId] = value;
          });
        } else if (meters.length && node.setOutputParamHandler) {
          node.setOutputParamHandler((address, value) => {
            const m = meterValuesRef.current.get(addressKey) || {};
            m[address] = value;
            meterValuesRef.current.set(addressKey, m);
          });
        }
        const ready = tracksRef.current.map((t) =>
          t.id === trackId
            ? withChainArray(
                t,
                regionId,
                getChainArray(t, regionId).map((s) => (s.key === def.key ? { ...s, node, meta, meters, status: "ready" } : s)),
              )
            : t,
        );
        tracksRef.current = ready;
        setTracks(ready);
        if (isPlayingRef.current) playFrom(currentOffset());
      } catch (err) {
        console.error("[DawWorkstationScreen] failed to load plugin", def.key, err);
        const errored = tracksRef.current.map((t) =>
          t.id === trackId
            ? withChainArray(
                t,
                regionId,
                getChainArray(t, regionId).map((s) => (s.key === def.key ? { ...s, status: "error" } : s)),
              )
            : t,
        );
        tracksRef.current = errored;
        setTracks(errored);
      }
    },
    [ensureContext, loadPluginEngine, currentOffset, playFrom],
  );

  const forkOuterChainIfNeeded = useCallback(
    (trackId, regionId) => {
      if (!isOuterScope(regionId)) return;
      const track = tracksRef.current.find((t) => t.id === trackId);
      const region = track?.regions.find((r) => r.id === baseRegionId(regionId));
      if (!track || !region || region.outerCustomized) return;
      const clonedChain = track.chain.map((slot) => ({
        ...slot,
        node: null,
        meta: null,
        meters: [],
        status: "loading",
      }));
      const next = tracksRef.current.map((t) =>
        t.id === trackId
          ? { ...t, regions: t.regions.map((r) => (r.id === region.id ? { ...r, outerChain: clonedChain, outerCustomized: true } : r)) }
          : t,
      );
      tracksRef.current = next;
      setTracks(next);
      clonedChain.forEach((slot) => {
        const def = PLUGIN_DEFS.find((d) => d.key === slot.key);
        if (def) void loadSlotEngineFor(trackId, regionId, def);
      });
    },
    [loadSlotEngineFor],
  );

  const addOrSelectPlugin = useCallback(
    async (trackId, regionId, def) => {
      const track = tracksRef.current.find((t) => t.id === trackId);
      const chainArr = getChainArray(track, regionId);
      if (!track || !chainArr) return;
      const existing = chainArr.find((s) => s.key === def.key);
      if (existing) {
        setActiveEditor({ trackId, regionId, key: def.key });
        return;
      }
      forkOuterChainIfNeeded(trackId, regionId);
      const loadingSlot = {
        key: def.key,
        name: def.name,
        color: def.color,
        tag: def.tag,
        wiring: def.wiring,
        node: null,
        meta: null,
        meters: [],
        status: "loading",
        bypassed: false,
        ...defaultSlotExtras(def.key),
      };
      const next = tracksRef.current.map((t) =>
        t.id === trackId ? withChainArray(t, regionId, [...getChainArray(t, regionId), loadingSlot]) : t,
      );
      tracksRef.current = next;
      setTracks(next);
      setActiveEditor({ trackId, regionId, key: def.key });
      await loadSlotEngineFor(trackId, regionId, def);
    },
    [forkOuterChainIfNeeded, loadSlotEngineFor],
  );

  const removePlugin = useCallback(
    (trackId, regionId, key) => {
      forkOuterChainIfNeeded(trackId, regionId);
      const track = tracksRef.current.find((t) => t.id === trackId);
      const chainArr = getChainArray(track, regionId);
      const slot = chainArr?.find((s) => s.key === key);
      const next = tracksRef.current.map((t) =>
        t.id === trackId ? withChainArray(t, regionId, getChainArray(t, regionId).filter((s) => s.key !== key)) : t,
      );
      tracksRef.current = next;
      setTracks(next);
      if (
        activeEditorRef.current?.trackId === trackId &&
        activeEditorRef.current?.regionId === regionId &&
        activeEditorRef.current?.key === key
      ) {
        setActiveEditor(null);
      }
      try {
        slot?.node?.disconnect();
      } catch {
      }
      if (isPlayingRef.current) playFrom(currentOffset());
    },
    [forkOuterChainIfNeeded, currentOffset, playFrom],
  );

  const movePlugin = useCallback(
    (trackId, regionId, key, dir) => {
      forkOuterChainIfNeeded(trackId, regionId);
      const track = tracksRef.current.find((t) => t.id === trackId);
      const chainArr = getChainArray(track, regionId);
      if (!chainArr) return;
      const idx = chainArr.findIndex((s) => s.key === key);
      const j = idx + dir;
      if (idx === -1 || j < 0 || j >= chainArr.length) return;
      const chain = [...chainArr];
      [chain[idx], chain[j]] = [chain[j], chain[idx]];
      const next = tracksRef.current.map((t) => (t.id === trackId ? withChainArray(t, regionId, chain) : t));
      tracksRef.current = next;
      setTracks(next);
      if (isPlayingRef.current) playFrom(currentOffset());
    },
    [forkOuterChainIfNeeded, currentOffset, playFrom],
  );

  const reorderPlugin = useCallback(
    (trackId, regionId, fromKey, toKey) => {
      if (fromKey === toKey) return;
      forkOuterChainIfNeeded(trackId, regionId);
      const track = tracksRef.current.find((t) => t.id === trackId);
      const chainArr = getChainArray(track, regionId);
      if (!chainArr) return;
      const fromIdx = chainArr.findIndex((s) => s.key === fromKey);
      const toIdx = chainArr.findIndex((s) => s.key === toKey);
      if (fromIdx === -1 || toIdx === -1) return;
      const chain = [...chainArr];
      const [moved] = chain.splice(fromIdx, 1);
      chain.splice(toIdx, 0, moved);
      const next = tracksRef.current.map((t) => (t.id === trackId ? withChainArray(t, regionId, chain) : t));
      tracksRef.current = next;
      setTracks(next);
      if (isPlayingRef.current) playFrom(currentOffset());
    },
    [forkOuterChainIfNeeded, currentOffset, playFrom],
  );

  const toggleBypass = useCallback(
    (trackId, regionId, key) => {
      forkOuterChainIfNeeded(trackId, regionId);
      let bypassedNow = false;
      const next = tracksRef.current.map((t) => {
        if (t.id !== trackId) return t;
        const chainArr = getChainArray(t, regionId);
        if (!chainArr) return t;
        const chain = chainArr.map((s) => {
          if (s.key !== key) return s;
          bypassedNow = !s.bypassed;
          return { ...s, bypassed: bypassedNow };
        });
        return withChainArray(t, regionId, chain);
      });
      tracksRef.current = next;
      setTracks(next);
      const live = slotRuntimeRef.current.get(`${trackId}:${regionId}:${key}`);
      if (live && graphRef.current) {
        const ctx = graphRef.current.ctx;
        live.bypassGain.gain.setTargetAtTime(bypassedNow ? 1 : 0, ctx.currentTime, 0.01);
        live.wetGain.gain.setTargetAtTime(bypassedNow ? 0 : 1, ctx.currentTime, 0.01);
      }
    },
    [forkOuterChainIfNeeded],
  );

  const updateSlot = useCallback(
    (trackId, regionId, key, patch) => {
      forkOuterChainIfNeeded(trackId, regionId);
      setTracks((prev) => {
        const next = prev.map((t) => {
          if (t.id !== trackId) return t;
          const chainArr = getChainArray(t, regionId);
          if (!chainArr) return t;
          const chain = chainArr.map((s) => (s.key !== key ? s : { ...s, ...(typeof patch === "function" ? patch(s) : patch) }));
          return withChainArray(t, regionId, chain);
        });
        tracksRef.current = next;
        return next;
      });
    },
    [forkOuterChainIfNeeded],
  );

  const addSend = useCallback(
    (trackId, busId) => {
      const next = tracksRef.current.map((t) => {
        if (t.id !== trackId) return t;
        if ((t.sends || []).some((s) => s.busId === busId)) return t;
        const send = { id: `snd${++sendIdRef.current}`, busId, level: 1, pan: 0, prePost: "post", muted: false, fmp: false };
        return { ...t, sends: [...(t.sends || []), send] };
      });
      tracksRef.current = next;
      setTracks(next);
      if (isPlayingRef.current) playFrom(currentOffset());
    },
    [currentOffset, playFrom],
  );

  const removeSend = useCallback(
    (trackId, sendId) => {
      const next = tracksRef.current.map((t) => (t.id === trackId ? { ...t, sends: (t.sends || []).filter((s) => s.id !== sendId) } : t));
      tracksRef.current = next;
      setTracks(next);
      sendRuntimeRef.current.delete(`${trackId}:${sendId}`);
      if (isPlayingRef.current) playFrom(currentOffset());
    },
    [currentOffset, playFrom],
  );

  const updateSend = useCallback((trackId, sendId, patch, { live = true } = {}) => {
    const next = tracksRef.current.map((t) =>
      t.id === trackId ? { ...t, sends: (t.sends || []).map((s) => (s.id === sendId ? { ...s, ...(typeof patch === "function" ? patch(s) : patch) } : s)) } : t,
    );
    tracksRef.current = next;
    setTracks(next);
    const g = graphRef.current;
    const track = next.find((t) => t.id === trackId);
    const trackNodes = g?.trackNodes.get(trackId);
    if (g && track && trackNodes?.dryGain) {
      trackNodes.dryGain.gain.setTargetAtTime(computeDryScale(track), g.ctx.currentTime, 0.01);
    }
    const rt = sendRuntimeRef.current.get(`${trackId}:${sendId}`);
    if (live && g && rt) {
      const updated = track?.sends.find((s) => s.id === sendId);
      if (updated) {
        rt.sendGain.gain.setTargetAtTime(updated.muted ? 0 : updated.level, g.ctx.currentTime, 0.01);
        const effectivePan = updated.fmp ? (track.pan ?? 0) : (updated.pan ?? 0);
        rt.sendPanner.pan.setTargetAtTime(effectivePan, g.ctx.currentTime, 0.01);
      }
    }
  }, []);

  const setSendPrePost = useCallback(
    (trackId, sendId, prePost) => {
      updateSend(trackId, sendId, { prePost }, { live: false });
      if (isPlayingRef.current) playFrom(currentOffset());
    },
    [updateSend, currentOffset, playFrom],
  );

  const getSendMeterLevel = useCallback((trackId, sendId) => {
    const rt = sendRuntimeRef.current.get(`${trackId}:${sendId}`);
    if (!rt?.sendAnalyser) return 0;
    const data = new Uint8Array(rt.sendAnalyser.fftSize);
    rt.sendAnalyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / data.length);
  }, []);

  useEffect(() => {
    tracks.forEach((t) => {
      const scopes = [
        { regionId: TRACK_CHAIN_SCOPE, chain: t.chain },
        ...t.regions.flatMap((r) => [
          { regionId: r.id, chain: r.chain },
          { regionId: outerScopeId(r.id), chain: r.outerChain || [] },
        ]),
      ];
      scopes.forEach(({ regionId, chain }) => {
        chain.forEach((slot) => {
          if (!slot.node || slot.status !== "ready") return;
          if (slot.key === "gate") pushGateParams(slot.node, slot.params, slot.sidechain);
          else if (slot.key === "deess") pushDeEsserParams(slot.node, slot.params);
          else if (slot.key === "comp") pushCompParams(slot.node, slot.bands, slot.crossover, slot.sidechain, slot.outputGainDb, false, slot.multiband);
          else if (slot.key === "limiter") pushLimiterParams(slot.node, slot.params);
          else if (slot.key === "delay") pushDelayParams(slot.node, slot.params);
          else if (slot.key === "reverb") pushReverbParams(slot.node, slot.params);
          else if (slot.key === "eq") applyEqBandsToNode(slot.node, slot.bands);
        });
        const eqSlot = chain.find((s) => s.key === "eq");
        if (eqSlot) {
          const rt = eqRuntimeRef.current.get(`${t.id}:${regionId}`);
          if (rt?.outputGainNode) applyEqOutputGain(rt.outputGainNode, eqSlot.outputGainDb ?? 0, graphRef.current?.ctx);
        }
      });
    });
  }, [tracks]);

  useEffect(() => {
    if (activeEditor?.key === "eq") {
      const rt = eqRuntimeRef.current.get(`${activeEditor.trackId}:${activeEditor.regionId}`);
      eqAnalyserRef.current = rt?.analyser ?? null;
      eqDryAnalyserRef.current = rt?.dryAnalyser ?? null;
      eqLiveDynGainRef.current = {};
    } else {
      eqAnalyserRef.current = null;
      eqDryAnalyserRef.current = null;
    }
  }, [activeEditor]);

  const getNow = useCallback(() => graphRef.current?.ctx.currentTime ?? 0, []);

  const getGateLevels = useCallback(() => {
    const ed = activeEditorRef.current;
    if (!ed) return null;
    const live = slotRuntimeRef.current.get(`${ed.trackId}:${ed.regionId}:gate`);
    if (!live) return null;
    const inputDb = analyserPeakDb(live.inputAnalyser);
    const outputDb = analyserPeakDb(live.outputAnalyser);
    if (inputDb === null || outputDb === null) return null;
    return { inputDb, outputDb, detectDb: inputDb };
  }, []);

  const getDeEsserInputDb = useCallback(() => {
    const ed = activeEditorRef.current;
    if (!ed) return null;
    const live = slotRuntimeRef.current.get(`${ed.trackId}:${ed.regionId}:deess`);
    return live ? analyserPeakDb(live.inputAnalyser) : null;
  }, []);
  const getDeEsserGainReductionDb = useCallback(() => {
    const ed = activeEditorRef.current;
    if (!ed) return 0;
    const mv = meterValuesRef.current.get(`${ed.trackId}:${ed.regionId}:deess`);
    return mv ? (mv[DEESS_ADDR.gainReduction] ?? 0) : 0;
  }, []);

  const getCompLevels = useCallback(() => {
    const ed = activeEditorRef.current;
    if (!ed) return null;
    const live = slotRuntimeRef.current.get(`${ed.trackId}:${ed.regionId}:comp`);
    if (!live) return null;
    const inputDb = analyserPeakDb(live.inputAnalyser);
    const outputDb = analyserPeakDb(live.outputAnalyser);
    if (inputDb === null || outputDb === null) return null;
    const mv = meterValuesRef.current.get(`${ed.trackId}:${ed.regionId}:comp`) || {};
    const bandGr = {};
    for (const b of COMP_BAND_IDS) {
      const v = mv[COMP_ADDR.band(b).gr];
      bandGr[b] = v !== undefined ? Math.max(0, -v) : 0;
    }
    return { inputDb, outputDb, bandGr };
  }, []);

  const getLimiterLevels = useCallback(() => {
    const ed = activeEditorRef.current;
    if (!ed) return null;
    const live = slotRuntimeRef.current.get(`${ed.trackId}:${ed.regionId}:limiter`);
    if (!live) return null;
    const inputDb = analyserPeakDb(live.inputAnalyser);
    const outputDb = analyserPeakDb(live.outputAnalyser);
    if (inputDb === null || outputDb === null) return null;
    const mv = meterValuesRef.current.get(`${ed.trackId}:${ed.regionId}:limiter`) || {};
    const gainReductionDb = mv[LIMITER_ADDR.gainReduction] ?? 0;
    return { inputDb, outputDb, gainReductionDb };
  }, []);

  const getDelayInputPeak = useCallback(() => {
    const ed = activeEditorRef.current;
    if (!ed) return null;
    const live = slotRuntimeRef.current.get(`${ed.trackId}:${ed.regionId}:delay`);
    return live ? analyserPeakLinear(live.inputAnalyser) : null;
  }, []);
  const getDelayOutputPeak = useCallback(() => {
    const ed = activeEditorRef.current;
    if (!ed) return null;
    const live = slotRuntimeRef.current.get(`${ed.trackId}:${ed.regionId}:delay`);
    return live ? analyserPeakLinear(live.outputAnalyser) : null;
  }, []);

  const getReverbInputPeak = useCallback(() => {
    const ed = activeEditorRef.current;
    if (!ed) return null;
    const live = slotRuntimeRef.current.get(`${ed.trackId}:${ed.regionId}:reverb`);
    return live ? analyserPeakLinear(live.inputAnalyser) : null;
  }, []);
  const getReverbOutputPeak = useCallback(() => {
    const ed = activeEditorRef.current;
    if (!ed) return null;
    const live = slotRuntimeRef.current.get(`${ed.trackId}:${ed.regionId}:reverb`);
    return live ? analyserPeakLinear(live.outputAnalyser) : null;
  }, []);

  const handleProcess = useCallback(() => {
    if (!loopOnRef.current) {
      setLoopOn(true);
      loopOnRef.current = true;
    }
    playFrom(pausedOffsetRef.current);
  }, [playFrom]);

  const handleApply = useCallback(() => {
    if (isPlayingRef.current) playFrom(currentOffset());
    setActiveEditor(null);
  }, [playFrom, currentOffset]);

  const handleCancel = useCallback(() => {
    setActiveEditor(null);
  }, []);

  useEffect(() => {
    const trackId = activeEditor?.trackId;
    if (!trackId) return undefined;
    const prevSolo = new Map(tracksRef.current.map((t) => [t.id, t.solo]));
    preIsolateSoloRef.current = prevSolo;
    const target = tracksRef.current.find((t) => t.id === trackId);
    const feederIds =
      target?.kind === "aux"
        ? new Set(
            tracksRef.current
              .filter((t) => (t.sends || []).some((s) => s.busId === trackId && !s.muted && s.prePost !== "pre"))
              .map((t) => t.id),
          )
        : null;
    const isolated = tracksRef.current.map((t) => {
      const shouldSolo = t.id === trackId || !!feederIds?.has(t.id);
      return t.solo === shouldSolo ? t : { ...t, solo: shouldSolo };
    });
    tracksRef.current = isolated;
    setTracks(isolated);
    if (isPlayingRef.current) playFrom(currentOffset());
    return () => {
      const prev = preIsolateSoloRef.current;
      preIsolateSoloRef.current = null;
      if (!prev) return;
      const restored = tracksRef.current.map((t) => {
        const prevVal = prev.has(t.id) ? prev.get(t.id) : t.solo;
        return t.solo === prevVal ? t : { ...t, solo: prevVal };
      });
      tracksRef.current = restored;
      setTracks(restored);
      if (isPlayingRef.current) playFrom(currentOffset());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEditor?.trackId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (addTrackDialogOpen || activeEditor) return;
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) return;
      switch (e.key) {
        case " ":
        case "Spacebar":
          if (e.repeat) return;
          e.preventDefault();
          togglePlay();
          break;
        case "Home":
        case "Enter":
          if (e.repeat) return;
          e.preventDefault();
          rewind();
          break;
        case "m":
        case "M":
          if (e.repeat || !selectedTrackIdRef.current) return;
          toggleTrackMute(selectedTrackIdRef.current);
          break;
        case "s":
        case "S":
          if (e.repeat || !selectedTrackIdRef.current) return;
          toggleTrackSolo(selectedTrackIdRef.current);
          break;
        case "l":
        case "L":
          if (e.repeat) return;
          toggleLoop();
          break;
        case "x":
        case "X":
          if (e.repeat) return;
          setViewMode((v) => (v === "mixer" ? "arrange" : "mixer"));
          break;
        case "Escape":
          if (selectedRegionRef.current) exitSelection();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, addTrackDialogOpen, activeEditor, togglePlay, rewind, toggleTrackMute, toggleTrackSolo, toggleLoop, exitSelection]);

  if (!isOpen) return null;

  const activeTrack = tracks.find((t) => t.id === activeEditor?.trackId);
  const activeRegion =
    activeEditor && activeEditor.regionId !== TRACK_CHAIN_SCOPE
      ? activeTrack?.regions.find((r) => r.id === baseRegionId(activeEditor.regionId))
      : null;
  const activeIsPortionOuter = !!(activeEditor && isOuterScope(activeEditor.regionId));
  const activeSlot = activeEditor ? getChainArray(activeTrack, activeEditor.regionId)?.find((s) => s.key === activeEditor.key) : undefined;
  const selectedTrack = tracks.find((t) => t.id === selectedTrackId) || null;
  const selectedRegionTrack = selectedRegion ? tracks.find((t) => t.id === selectedRegion.trackId) || null : null;
  const selectedRegionObj = selectedRegionTrack?.regions.find((r) => r.id === selectedRegion.regionId) || null;
  const dockTrack = selectedRegionObj ? selectedRegionTrack : selectedTrack;
  const dockRegionId = selectedRegionObj
    ? dockScope === "track"
      ? outerScopeId(selectedRegionObj.id)
      : selectedRegionObj.id
    : TRACK_CHAIN_SCOPE;
  const dockChain = dockTrack ? getChainArray(dockTrack, dockRegionId) : undefined;
  const dockOnPortionOuterScope = !!selectedRegionObj && dockScope === "track";
  const rulerStep = pickRulerStep(Math.max(1, arrangementDuration));
  const rulerMarks = Array.from(
    { length: Math.floor(Math.max(1, Math.ceil(arrangementDuration)) / rulerStep) + 1 },
    (_, i) => i * rulerStep,
  );

  const chainActions = {
    addOrSelectPlugin,
    setActiveEditor,
    toggleBypass,
    movePlugin,
    removePlugin,
    reorderPlugin,
    draggingKey,
    setDraggingKey,
  };
  const sendActions = {
    addSend,
    createAux: addEmptyTrack,
    removeSend,
    updateSend,
    setSendPrePost,
    getSendMeterLevel,
  };
  const meters = {
    getGateLevels,
    getDeEsserInputDb,
    getDeEsserGainReductionDb,
    getCompLevels,
    getLimiterLevels,
    getDelayInputPeak,
    getDelayOutputPeak,
    getReverbInputPeak,
    getReverbOutputPeak,
    getNow,
  };

  return (
    <div className="chapter-lab daw-root">
      <div className="daw-overlay is-open">
        <div className="daw-overlay-backdrop" />
        <div className="monitor-frame">
          <div className="daw-app">
            <TopBar
              onClose={onClose}
              viewMode={viewMode}
              setViewMode={setViewMode}
              tracks={tracks}
              isPlaying={isPlaying}
              onRewind={rewind}
              onTogglePlay={togglePlay}
              onStop={stop}
              loopOn={loopOn}
              onToggleLoop={toggleLoop}
              selectedRegionObj={selectedRegionObj}
              onExitSelection={exitSelection}
              playhead={playhead}
              arrangementDuration={arrangementDuration}
              downloadingMix={downloadingMix}
              onDownloadMix={handleDownloadMix}
              meterLevel={meterLevel}
            />

            <div ref={viewRef} className="daw-view">
            {viewMode === "arrange" ? (
              <>
                <div className="daw-body">
                  <TrackList
                    tracklistRef={tracklistRef}
                    onTracklistScroll={onTracklistScroll}
                    trackRowRefs={trackRowRefs}
                    tracks={tracks}
                    selectedTrackId={selectedTrackId}
                    setSelectedTrackId={setSelectedTrackId}
                    selectedRegion={selectedRegion}
                    exitSelection={exitSelection}
                    anySoloed={anySoloed}
                    setTrackVolume={setTrackVolume}
                    handleTrackFile={handleTrackFile}
                    loadDemoForTrack={loadDemoForTrack}
                    recordingTrackId={recordingTrackId}
                    onStartRecording={startRecording}
                    onStopRecording={stopRecording}
                    toggleTrackSolo={toggleTrackSolo}
                    toggleTrackMute={toggleTrackMute}
                    downloadingTrackId={downloadingTrackId}
                    handleDownloadTrack={handleDownloadTrack}
                    removeTrack={removeTrack}
                    chainActions={chainActions}
                    sendActions={sendActions}
                    openAddTrackDialog={openAddTrackDialog}
                  />

                  <Arrangement
                    arrangementRef={arrangementRef}
                    onArrangementScroll={onArrangementScroll}
                    rulerMarks={rulerMarks}
                    arrangementDuration={arrangementDuration}
                    tracks={tracks}
                    rowSlotHeights={rowSlotHeights}
                    beginClipDrag={beginClipDrag}
                    onClipPointerMove={onClipPointerMove}
                    endClipDrag={endClipDrag}
                    setTrackStartAt={setTrackStartAt}
                    isPlayingRef={isPlayingRef}
                    playFrom={playFrom}
                    currentOffset={currentOffset}
                    beginRegionDrag={beginRegionDrag}
                    onRegionPointerMove={onRegionPointerMove}
                    endRegionDrag={endRegionDrag}
                    selectedRegion={selectedRegion}
                    selectRegion={selectRegion}
                    removeRegion={removeRegion}
                    draftRegion={draftRegion}
                    beginPlayheadDrag={beginPlayheadDrag}
                    onPlayheadPointerMove={onPlayheadPointerMove}
                    endPlayheadDrag={endPlayheadDrag}
                    playhead={playhead}
                  />
                </div>

                <EditorDock
                  selectedRegionObj={selectedRegionObj}
                  selectedRegionTrack={selectedRegionTrack}
                  dockScope={dockScope}
                  setDockScope={setDockScope}
                  dockOnPortionOuterScope={dockOnPortionOuterScope}
                  downloadError={downloadError}
                  exitSelection={exitSelection}
                  dockTrack={dockTrack}
                  dockChain={dockChain}
                  dockRegionId={dockRegionId}
                  chainActions={chainActions}
                />
              </>
            ) : (
              <MixerView
                tracks={tracks}
                selectedTrackId={selectedTrackId}
                setSelectedTrackId={setSelectedTrackId}
                anySoloed={anySoloed}
                trackLevels={trackLevels}
                chainActions={chainActions}
                sendActions={sendActions}
                setTrackPan={setTrackPan}
                setTrackVolume={setTrackVolume}
                toggleTrackSolo={toggleTrackSolo}
                toggleTrackMute={toggleTrackMute}
              />
            )}
            </div>
          </div>
        </div>

        <AddTrackDialog
          open={addTrackDialogOpen}
          onClose={() => setAddTrackDialogOpen(false)}
          draft={newTrackDraft}
          setDraft={setNewTrackDraft}
          nextTrackNumber={trackIdRef.current + 1}
          onConfirm={confirmAddTrack}
        />

        <PluginEditorPopup
          activeSlot={activeSlot}
          activeTrack={activeTrack}
          activeRegion={activeRegion}
          activeIsPortionOuter={activeIsPortionOuter}
          activeEditor={activeEditor}
          isPlaying={isPlaying}
          gateIsOpen={gateIsOpen}
          setGateIsOpen={setGateIsOpen}
          onProcess={handleProcess}
          onApply={handleApply}
          onCancel={handleCancel}
          toggleBypass={toggleBypass}
          removePlugin={removePlugin}
          updateSlot={updateSlot}
          compSelectedBand={compSelectedBand}
          setCompSelectedBand={setCompSelectedBand}
          setLimiterGainReduction={setLimiterGainReduction}
          delayLink={delayLink}
          setDelayLink={setDelayLink}
          eqSelectedBandId={eqSelectedBandId}
          setEqSelectedBandId={setEqSelectedBandId}
          eqAnalyserRef={eqAnalyserRef}
          eqDryAnalyserRef={eqDryAnalyserRef}
          eqSampleRate={eqSampleRate}
          eqLiveDynGainRef={eqLiveDynGainRef}
          meters={meters}
        />
      </div>
    </div>
  );
}

export default DawWorkstationScreen;
