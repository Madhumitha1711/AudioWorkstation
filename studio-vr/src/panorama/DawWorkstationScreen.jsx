import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FaustMonoDspGenerator } from "@grame/faustwasm";
import { compileFaustWasm } from "../faust/faustTypes";
import {
  initAudio,
  resumeAudio,
  getAudioContext,
  createStudioSpeakerBus,
  stopAmbientBed,
  setRoomAmbience,
  stopRoomBleed,
  startRoomBleed,
} from "../audio/spatialAudioEngine";
import { ADDR as DEESS_ADDR, pushFaustParams as pushDeEsserParams, analyserPeakDb } from "../chapters/deEsserEngine";
import { pushFaustParams as pushGateParams } from "../chapters/gateEngine";
import { BAND_IDS as COMP_BAND_IDS, ADDR as COMP_ADDR, pushFaustParams as pushCompParams } from "../chapters/compressorEngine";
import { ADDR as LIMITER_ADDR, pushFaustParams as pushLimiterParams } from "../chapters/limiterEngine";
import { pushFaustParams as pushDelayParams, analyserPeakLinear } from "../chapters/delayEngine";
import { pushFaustParams as pushReverbParams } from "../chapters/reverbEngine";
import {
  LIVE_GAIN_ADDR_TO_BAND,
  applyBandsToNode as applyEqBandsToNode,
  applyOutputGain as applyEqOutputGain,
} from "../chapters/equalizerEngine";
import { downloadAudioBufferAsWav } from "../audio/wavRender";
import "../chapters/chapters.css";
import "./dawWorkstationScreen.css";

// ── DAW-local modules — split out of this file (once 4800+ lines) for
// maintainability. See src/panorama/daw/ for plain constants, formatting
// helpers, the live/offline audio-graph builders, and every presentational
// piece of the screen (InsertRack/SendRack, TopBar, TrackList, Arrangement,
// EditorDock, MixerView, AddTrackDialog, PluginEditorPopup). This file keeps
// the state/audio-engine "controller" — the tracks/transport/chain
// management hooks below — and composes those pieces in its render.
import { PLUGIN_DEFS, TRACK_COLORS, MIN_REGION_LEN, TRACK_CHAIN_SCOPE, DEFAULT_AMBIENCE, ROOM_BLEED, DEMO_CLIPS } from "./daw/constants";
import { clamp, pickRulerStep } from "./daw/format";
import { trackIsAudible, computeDryScale, outerScopeId, isOuterScope, baseRegionId } from "./daw/trackHelpers";
import { createDemoLoopBuffer, computePeaks } from "./daw/audioBuffers";
import { computeSegments, getChainArray, withChainArray, disconnectChainSlots, wireLiveChain, collectMeters, defaultSlotExtras } from "./daw/chainGraph";
import { renderTrackOffline, renderMixOffline } from "./daw/offlineRender";
import { TopBar } from "./daw/TopBar";
import { TrackList } from "./daw/TrackList";
import { Arrangement } from "./daw/Arrangement";
import { EditorDock } from "./daw/EditorDock";
import { MixerView } from "./daw/MixerView";
import { AddTrackDialog } from "./daw/AddTrackDialog";
import { PluginEditorPopup } from "./daw/PluginEditorPopup";

// ═══════════════════════════════════════════════════════════════════════════
// DAW Workstation hotspot — panorama/DawWorkstationScreen.jsx
// ═══════════════════════════════════════════════════════════════════════════
// A multi-track MIX workstation: any number of real audio tracks (each a
// built-in demo loop, or a file the student uploads) sit side-by-side as
// mixer channel strips. Each track owns its own ordered insert chain (the
// same seven Faust-WASM plugin inserts the single-track version used —
// public/faust/ParamEQ, compressor, limiter, Gate, deesser, delay, reverb —
// see PLUGIN_DEFS below), applied to the WHOLE track, exactly like the
// original single-chain version of this screen — click a track in the
// tracklist to edit it in the bottom dock. On top of that, a track can also
// have any number of independent, non-overlapping PORTIONS — drag directly
// on the clip's waveform body to mark one (see
// beginRegionDrag/onRegionPointerMove/endRegionDrag below) — each with its
// OWN separate chain that runs IN SERIES AFTER the track's own chain, and
// ONLY within that portion's own time range (see
// computeSegments/wireLiveChain below for how the live graph layers these,
// and buildOfflineTrackOutput for the offline/download equivalent). Both
// scopes — the track's own chain, and any one of its portions' — are edited
// through the exact same dock/popup UI and the exact same
// (trackId, regionId) addressing (see TRACK_CHAIN_SCOPE/getChainArray),
// just pointed at different chain arrays. Clicking a portion selects it —
// highlighting it, switching the dock to its own chain, and scoping the
// transport to a preview loop of just that portion (see
// getPreviewWindow/playFrom); "✕ Exit Selection" (in the dock or the
// topbar, or Escape) deselects it, switches the dock back to the track's
// own whole-track chain, and returns Play to the whole arrangement. The
// thin strip at the top of each clip (.clip-header) is the drag handle for
// moving the track's own start position — dragging anywhere in the
// waveform body below it instead draws a new portion. Tracks can be added
// (upload or demo), removed, or have their audio replaced at any time
// (which clears that track's portions, since their time ranges wouldn't
// line up with new audio — the track's own whole-track chain isn't
// time-indexed, so it's left alone); each one plays back in sync with the
// others through its own chain(s) into a shared master bus. Clicking a
// chain chip opens that plugin's full editor in a popup: each plugin
// reuses its own standalone chapter lab's exact *EditorPanel component
// (GateEditorPanel, DeEsserEditorPanel, CompressorEditorPanel,
// LimiterEditorPanel, DelayEditorPanel, ReverbEditorPanel,
// EqualizerEditorPanel) — the real controls, curves, meters and live scope
// each lab already has — driven by this screen's own per-track/per-scope/
// per-slot Faust node/audio graph (see wireLiveChain/playFrom below)
// instead of a generic knob renderer. Opening a popup auto-previews by
// looping the mix (or just the selected portion) so the change is audible
// immediately.
function DawWorkstationScreen({ open, onClose }) {
  const isOpen = open?.type === "daw";

  // ── Tracks (multi-track mix) ────────────────────────────────────────────
  // Each track: { id, name, color, buffer, peaks, duration, loadError,
  //               regions: [portion...], volume, muted, startAt }. startAt
  //               (seconds) is where this track's clip begins in the
  //               arrangement — dragged via its clip's header strip (see
  //               beginClipDrag et al below). Each portion is
  //               { id, start, end, chain: [slot...] } — start/end are
  //               buffer-relative seconds (so a portion stays anchored to
  //               the same audio content if the clip is later moved), and
  //               each chain slot carries its own typed params (see
  //               defaultSlotExtras) so two portions — even on the same
  //               track — can each run their own independent instance of
  //               the same plugin. A track with no portions plays back dry.
  const [tracks, setTracks] = useState([]);
  const tracksRef = useRef([]);
  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);
  const trackIdRef = useRef(0);
  const regionIdRef = useRef(0);
  const demoBufferRef = useRef(null); // synthetic fallback buffer (see createDemoLoopBuffer), lazily created only if a real DEMO_CLIPS fetch fails
  const demoClipBuffersRef = useRef(new Map()); // DEMO_CLIPS id -> decoded AudioBuffer, so re-picking/re-seeding the same ~20-45MB stem doesn't re-fetch/re-decode it

  // Each track's own clip can start anywhere in the arrangement (see
  // track.startAt, seconds — dragged via the clip's header in the
  // arrangement pane below), so the arrangement's total length is the
  // latest of every track's own END point (startAt + its own duration), not
  // just the longest buffer.
  const arrangementDuration = useMemo(
    () => tracks.reduce((max, t) => Math.max(max, (t.startAt ?? 0) + (t.buffer?.duration ?? 0)), 0),
    [tracks],
  );

  // Whether anything in the mix is currently soloed — dims every non-soloed
  // track row so it's visually obvious why they've gone quiet, same as a
  // real console's solo-in-place indicator.
  const anySoloed = useMemo(() => tracks.some((t) => t.solo), [tracks]);

  // ── Track selection (the tracklist row that drives which track's clip is
  // in focus — like clicking a channel in a real DAW) ────────────────────
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const selectedTrackIdRef = useRef(null);
  useEffect(() => {
    selectedTrackIdRef.current = selectedTrackId;
  }, [selectedTrackId]);

  // ── View: Arrange (tracklist + waveform arrangement, the default) or
  // Mixer (Logic-style vertical channel strips) — toggled from the topbar
  // or the X key (same shortcut Logic itself uses for its Mixer). ────────
  const [viewMode, setViewMode] = useState("arrange"); // "arrange" | "mixer"

  // ── "New Track" dialog — Logic Pro's own New Track sheet lets you pick a
  // type/input/color/name before the track is created; this app is
  // audio-only (no MIDI/instrument tracks), so the dialog collects the part
  // that's actually meaningful here — name, color, and a cosmetic source
  // icon — then creates an empty track exactly like the old one-click
  // "+ Add Track" row did (upload/demo still happen afterwards, from the
  // track row itself, same as before). ───────────────────────────────────
  const [addTrackDialogOpen, setAddTrackDialogOpen] = useState(false);
  const [newTrackDraft, setNewTrackDraft] = useState({ name: "", color: TRACK_COLORS[0], icon: "audio", kind: "audio" });
  const openAddTrackDialog = useCallback(() => {
    const n = trackIdRef.current + 1;
    setNewTrackDraft({ name: `Track ${n}`, color: TRACK_COLORS[(n - 1) % TRACK_COLORS.length], icon: "audio", kind: "audio" });
    setAddTrackDialogOpen(true);
  }, []);
  // confirmAddTrack is defined right after addEmptyTrack below (it closes
  // over that callback, which isn't declared yet at this point in the
  // component body).

  // ── Portion (region) selection — the highlighted portion whose own chain
  // drives the bottom dock's editor. Selecting a portion also scopes the
  // transport to a preview loop of just that portion (see
  // getPreviewWindow/playFrom below); "Exit Selection" (or Escape) clears
  // this and returns Play to the whole arrangement. ──────────────────────
  const [selectedRegion, setSelectedRegion] = useState(null); // { trackId, regionId } | null
  const selectedRegionRef = useRef(null);
  useEffect(() => {
    selectedRegionRef.current = selectedRegion;
  }, [selectedRegion]);

  // While a portion is selected, the dock can point at either that
  // portion's own chain ("portion") or the track's outer whole-track chain
  // ("track") without losing the portion highlight/preview-loop — see the
  // scope tabs in the dock header. Reset to "portion" whenever selection
  // changes so the dock always opens on the portion you just picked.
  const [dockScope, setDockScope] = useState("portion"); // "portion" | "track"

  // The portion currently being drawn by dragging on a clip's waveform body
  // — see beginRegionDrag/onRegionPointerMove/endRegionDrag below.
  const [draftRegion, setDraftRegion] = useState(null); // { trackId, start, end } | null

  // Drag-to-reorder the selected portion's insert chain (the ‹ › buttons on
  // each chip still work too — this is just a faster way to do the same
  // reorder).
  const [draggingKey, setDraggingKey] = useState(null);

  // Keeps the tracklist (left) and arrangement (right) scrolled together —
  // they're two independent scroll containers, same as the design mockup.
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

  // ── Row-height sync: each .arr-row (right pane) is set to the ACTUAL
  // measured height of its matching .track-row (left pane), not a shared
  // guessed constant — a track row's real height can vary slightly (aux vs
  // audio tracks have a different button count, an error message can wrap
  // to two lines, fonts/zoom render text at slightly different heights
  // across machines) and any mismatch, even a couple px, drifts further
  // apart with every row down the list since the two panes are two
  // independently-scrolled elements kept in lockstep by copying scrollTop
  // 1:1 (onTracklistScroll/onArrangementScroll above). --track-row-h in the
  // CSS is only the fallback used for the very first paint, before this
  // effect has measured anything. trackRowRefs collects each rendered
  // .track-row DOM node (see the ref callback on that div below); a
  // ResizeObserver on every one of them re-measures whenever a row's real
  // height changes for any reason, and rowSlotHeights[track.id] — the
  // measured height plus that row's own margin-bottom, i.e. the full
  // vertical slot it occupies before the next row starts — gets applied as
  // an inline height on the matching .arr-row (see the arr-rows map below).
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

  // ── Plugin editor popup (which track + portion + plugin is open) ───────
  const [activeEditor, setActiveEditor] = useState(null); // { trackId, regionId, key } | null
  const activeEditorRef = useRef(null);
  useEffect(() => {
    activeEditorRef.current = activeEditor;
  }, [activeEditor]);
  // Snapshot of every track's `solo` flag from just before the popup
  // auto-isolated the track being edited (see the isolation effect below,
  // near handleProcess/handleApply/handleCancel) — restored the moment the
  // popup closes or switches to a different track, so temporarily isolating
  // a track to preview its plugin never clobbers whatever solo state the
  // user actually had set. `null` while no isolation is active.
  const preIsolateSoloRef = useRef(null);

  const engineCacheRef = useRef(new Map()); // plugin key -> compiled Faust factory (shared across all tracks/portions)
  const slotRuntimeRef = useRef(new Map()); // `${trackId}:${regionId}:${key}` -> { bypassGain, wetGain, scopeAnalyser, inputAnalyser, outputAnalyser } (live, only while playing)
  const meterValuesRef = useRef(new Map()); // `${trackId}:${regionId}:${key}` -> { [address]: value }
  const sendIdRef = useRef(0); // per-session unique id counter for sends (see addSend)
  const sendRuntimeRef = useRef(new Map()); // `${trackId}:${sendId}` -> { sendPanner, sendGain } (live, only while playing — see playFrom's Aux/Sends pass)
  const eqRuntimeRef = useRef(new Map()); // `${trackId}:${regionId}` -> { outputGainNode, analyser, dryAnalyser } (EQ's extra nodes, live, only while playing)
  const eqAnalyserRef = useRef(null); // pointed at whichever portion's EQ analyser is currently open in the popup
  const eqDryAnalyserRef = useRef(null);
  const eqLiveDynGainRef = useRef({});

  // Small transient UI-only state for whichever plugin's popup is currently
  // open (only one popup is open at a time, so these don't need to be
  // per-track/per-portion/per-slot like the audio-affecting params above).
  const [gateIsOpen, setGateIsOpen] = useState(true);
  const [compSelectedBand, setCompSelectedBand] = useState("low");
  const [, setLimiterGainReduction] = useState(0);
  const [delayLink, setDelayLink] = useState(false);
  const [eqSelectedBandId, setEqSelectedBandId] = useState("peak1");
  const [eqSampleRate, setEqSampleRate] = useState(48000);

  // ── Transport (plays every track in the mix together, in sync) ─────────
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
  const endTimeoutRef = useRef(null); // fires when a non-looping mix reaches the end of the longest track
  const playCallTokenRef = useRef(0); // guards against two concurrent playFrom() calls racing (see playFrom)
  const [meterLevel, setMeterLevel] = useState(0);

  // ── Download (individual track / full mix), offline-rendered — see
  // renderTrackOffline/renderMixOffline above ─────────────────────────────
  const [downloadingTrackId, setDownloadingTrackId] = useState(null); // id of the track currently being rendered, or null
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
    const node = await generator.createNode(ctx, cached.meta.name, cached.factory, false, 512);
    return { node, meta: cached.meta };
  }, []);

  // Resolves the currently-selected portion (if any) into an absolute
  // [start, end) window in ARRANGEMENT seconds (i.e. that portion's own
  // buffer-relative bounds shifted by its track's current startAt) — read
  // fresh from tracksRef/selectedRegionRef every call, so it never goes
  // stale if the clip is dragged after the portion was selected.
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
    // No portion selected — while a track's whole-track chain popup is open
    // (see the isolation effect near handleProcess), that track is the only
    // audible one, so scope the loop to just its own duration instead of
    // the whole arrangement; otherwise a shorter isolated track would keep
    // "looping" silence for however much longer the longest track in the
    // arrangement runs before the window wraps back around.
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

  // currentOffset() reports the shared transport position — a straight line
  // from startOffset for a single pass, wrapped within [loopStart, loopEnd)
  // when looping. loopStart/loopEnd span the whole arrangement normally, or
  // just the selected portion's own window while one is selected (see
  // getPreviewWindow/playFrom) — the whole arrangement restarts (or the
  // selected portion loops) together once that window's end is reached (see
  // the end-of-window timer in playFrom), rather than each track's own
  // AudioBufferSourceNode looping at its own buffer length; this is just the
  // shared playhead/scrub clock.
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
          /* already stopped */
        }
        try {
          source.disconnect();
        } catch {
          /* ok */
        }
      });
      extraNodes.forEach((n) => {
        try {
          n.disconnect();
        } catch {
          /* ok */
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
      /* ok */
    }
    try {
      g.meterAnalyser.disconnect();
    } catch {
      /* ok */
    }
    g.speakerBus?.dispose();
    graphRef.current = null;
    slotRuntimeRef.current.clear();
    eqRuntimeRef.current.clear();
    eqAnalyserRef.current = null;
    eqDryAnalyserRef.current = null;
  }, []);

  // Builds a fresh playback graph for every track that has audio loaded and
  // starts them all at the same instant. Each track gets a single source
  // spanning its whole buffer, run through that track's own whole-track
  // chain (the "outer" layer, in order, skipping bypassed slots — see
  // wireLiveChain) — then fanned out into one gated path per portion (each
  // running that portion's own chain, layered AFTER the track chain — the
  // "inner" layer) plus one gated "no portion" path carrying the track-chain
  // output straight through, so exactly one of those paths is open at any
  // given moment depending on where the transport is relative to that
  // track's own portions (see computeSegments) — all summed into that
  // track's own volume/mute gain, then into a shared master bus. Each
  // track's clip can start at its own point in the arrangement
  // (track.startAt, seconds — see setTrackStartAt/the clip drag handlers
  // below), so where in ITS OWN buffer a track needs to be at the shared
  // transport position `offset` depends on that track's own startAt: not
  // started yet (schedule it to begin later), partway through (start now,
  // partway into the buffer), or already finished this pass (skip it
  // entirely) — the same reasoning applies to each portion gate's own
  // on/off schedule. When a portion is selected (see getPreviewWindow), the
  // transport loops just that portion's own window instead of the whole
  // arrangement — otherwise it spans [0, arrangementDuration) and follows
  // the Loop toggle. A single pass plays and, once the loop window's end is
  // reached, a timer either flips the transport back to stopped (Loop off,
  // no portion selected) or restarts from the window's start (Loop on, or
  // any portion selected).
  const playFrom = useCallback(
    async (offset) => {
      const token = ++playCallTokenRef.current;
      const list = tracksRef.current.filter((t) => t.buffer);
      if (list.length === 0) return;
      const ctx = await ensureContext();
      if (!ctx) return;
      // If another playFrom() call was made while this one was waiting on
      // ensureContext(), let that newer call own the rebuild — otherwise
      // two overlapping calls each tear down and rebuild the graph, and
      // whichever finishes its (synchronous, post-await) work last wins in
      // a way that isn't predictable. This is what let adding several
      // plugins in a row race each other into a silent/inconsistent graph.
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
      const speakerBus = createStudioSpeakerBus();
      if (speakerBus) masterGain.connect(speakerBus.input);
      else masterGain.connect(ctx.destination);

      const trackNodes = new Map();

      const refs = { slotRuntimeRef, eqRuntimeRef, activeEditorRef, eqAnalyserRef, eqDryAnalyserRef };

      list.forEach((track) => {
        const buffer = track.buffer;
        const startAt = track.startAt ?? 0;
        // This track's clip has already fully played out by the current
        // transport position — nothing to schedule for it this pass.
        if (clampedOffset >= startAt + buffer.duration) return;

        // A single source spans the WHOLE buffer (same scheduling as
        // before portions existed) — the track's own chain (the "outer"
        // layer) runs on it in full, start to finish; there's no need to
        // slice the buffer per-portion any more, because a portion's own
        // chain (the "inner" layer, see below) needs to process the
        // ALREADY track-chain-processed signal, not a fresh copy of the
        // raw audio.
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

        // Fan the track-chain output into one path per portion (each
        // running that portion's own PRIVATE outer chain — see
        // outerScopeId/OUTER_CHAIN_SUFFIX — then that portion's own chain,
        // the "inner" layer, both layered AFTER the track's whole-track
        // chain but never heard outside this one portion) plus one "no
        // portion" dry-of-the-whole-track-chain path, then gate each path
        // so only the one matching wherever the transport currently is is
        // actually audible — see computeSegments for the ordered time
        // windows these gates follow.
        const dryGate = ctx.createGain();
        dryGate.gain.value = 0;
        trackChainOut.connect(dryGate);
        dryGate.connect(trackGain);
        extraNodes.push(dryGate);

        const segments = computeSegments(track);
        const portionGates = new Map(); // regionId -> gate GainNode
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

        // Schedule each gate's on/off automation across the segments still
        // ahead of (or straddling) the current transport position — same
        // "skip anything already fully past, otherwise schedule relative to
        // ctx.currentTime" reasoning the old per-segment source scheduling
        // used, just driving gain automation instead of a source's own
        // start() now that every portion shares the single upstream source.
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

        // Dry/direct path to master — scaled down by however much of this
        // track's signal its own post-fader Sends are currently diverting
        // (see computeDryScale), so a send crossfades its portion away from
        // here instead of just adding a copy on top of an unchanged direct
        // signal. Live-nudged by updateSend whenever a send's level/mute
        // changes without a full rebuild — see applyDryGain.
        const dryGain = ctx.createGain();
        dryGain.gain.value = computeDryScale(track);
        extraNodes.push(dryGain);

        // Pan (a channel-strip property, set from the Mixer view's Knob) and
        // a small per-track analyser (the Mixer view's own meter) both sit
        // after the volume fader, same position a real channel strip puts
        // them — see setTrackPan and the mixer-meter poll below.
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

      // ── Aux buses + Sends ────────────────────────────────────────────────
      // Every Aux track (see addEmptyTrack's `kind: "aux"`) gets its own
      // summing input — a plain GainNode nothing but this track's own Sends
      // feed into — created up front so the loop above's Sends have
      // somewhere to connect to regardless of tracklist order (an Aux can
      // sit above or below the tracks that feed it). A track with no buffer
      // never entered `list`/`trackNodes` above, so Aux tracks are wired in
      // this second pass instead, reusing the exact same
      // chain → volume/mute → pan → masterGain pipeline as a real track,
      // just fed from its input gain instead of an AudioBufferSourceNode.
      const auxTracks = tracksRef.current.filter((t) => t.kind === "aux");
      const auxInputGains = new Map();
      auxTracks.forEach((auxTrack) => auxInputGains.set(auxTrack.id, ctx.createGain()));

      list.forEach((track) => {
        const nodes = trackNodes.get(track.id);
        if (!nodes) return; // this track's clip hadn't started/hasn't finished this pass — see the early `return` above
        (track.sends || []).forEach((send) => {
          const targetInput = auxInputGains.get(send.busId);
          if (!targetInput) return; // its target Aux was removed, or hasn't loaded yet
          const tap = send.prePost === "pre" ? nodes.trackChainOut : nodes.trackGain;
          const sendPanner = ctx.createStereoPanner();
          // FMP ("Follow Main Pan") — this send's pan mirrors the track's
          // own Pan knob live instead of holding an independent value (see
          // the send-window's FMP toggle, and setTrackPan's own nudge of
          // any fmp sends when the track's pan itself moves).
          sendPanner.pan.value = send.fmp ? (track.pan ?? 0) : (send.pan ?? 0);
          const sendGain = ctx.createGain();
          // Muted still gets a real node graph (gain just parked at 0)
          // rather than being skipped outright — same "keep the plumbing,
          // zero the gain" treatment insert Bypass gets (see wireLiveChain's
          // bypassGain/wetGain) — so un-muting later (see updateSend) can
          // just ramp this same node back up instead of needing a full
          // playFrom rebuild to even have a node to ramp.
          sendGain.gain.value = send.muted ? 0 : (send.level ?? 1);
          // Post-fader tap for the send window's own level meter (see
          // getSendMeterLevel below) — a small analyser of the actual
          // signal reaching the bus, the same "tap the node, read it in a
          // poll" trick trackAnalyser/meterAnalyser already use elsewhere.
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

      // Fires once the loop window's end (the whole arrangement, or just
      // the selected portion — see loopStart/loopEnd above) is reached.
      // Loop off (and no portion selected) stops the transport there.
      // Otherwise it restarts from the window's start.
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

  // Loop on/off is baked into the end-of-window timer at graph-build time
  // (see the setTimeout in playFrom) — flipping the loopOn state alone
  // doesn't touch a timer that's already scheduled, which is why the button
  // used to look like it had no effect on live playback (turning it off
  // didn't stop an already-looping mix, turning it on didn't make a
  // single-pass mix start looping). Update loopOnRef synchronously (state
  // updates apply on the next render, too late for the rebuild below to see
  // them) and, if already playing, rebuild the graph from the current
  // position so the new setting takes effect immediately. Has no effect
  // while a portion is selected — previewing a portion always loops (see
  // playFrom) until you Exit Selection.
  const toggleLoop = useCallback(() => {
    const next = !loopOnRef.current;
    loopOnRef.current = next;
    setLoopOn(next);
    if (isPlayingRef.current) playFrom(currentOffset());
  }, [playFrom, currentOffset]);

  // Playhead + master meter — each open plugin popup reads its own live
  // scope/meters directly (via getXLevels/getInputPeak-style host callbacks
  // called from that plugin's own *EditorPanel animation loop), so this poll
  // only needs to drive the main transport. Also drives each track's own
  // little Mixer-view meter (see trackAnalyser in playFrom) — only computed
  // while the Mixer is actually visible, since nothing else reads it.
  const [trackLevels, setTrackLevels] = useState({});
  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      // Skip while a playhead scrub is in progress — the drag handlers own
      // `playhead` exclusively during that window (see
      // beginPlayheadDrag/onPlayheadPointerMove below); overwriting it here
      // with the still-playing-at-the-old-position live clock would fight
      // the drag and make the line jitter.
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

  // (Escape-to-exit-selection, plus the rest of the transport/mixer
  // shortcuts, now live in one combined keydown effect further down — see
  // the "Transport/mixer keyboard shortcuts" comment below, right before
  // this component's own `if (!isOpen) return null;`.)

  // ── Track management (add / remove / upload / demo / volume) ───────────
  const addTrackWithBuffer = useCallback(
    (buffer, name) => {
      const n = ++trackIdRef.current;
      const id = `t${n}`;
      const color = TRACK_COLORS[(n - 1) % TRACK_COLORS.length];
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

  // Backs both the plain "+ Add Track" row (no options) and the Logic-style
  // New Track dialog (name/color/icon chosen there) — see
  // addTrackDialogOpen/newTrackDraft/confirmAddTrack below.
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

  // See addTrackDialogOpen/newTrackDraft/openAddTrackDialog above — the New
  // Track dialog's own "Create Track" button.
  const confirmAddTrack = useCallback(() => {
    addEmptyTrack(newTrackDraft);
    setAddTrackDialogOpen(false);
  }, [addEmptyTrack, newTrackDraft]);

  const removeTrack = useCallback(
    (id) => {
      const track = tracksRef.current.find((t) => t.id === id);
      // Dropping a track (an Aux bus, most commonly) also has to drop every
      // OTHER track's send that was routed at it — otherwise those sends
      // would silently point at a bus id nothing owns any more.
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

  // Fetches + decodes one of DEMO_CLIPS (cached by id — these are real
  // 20-45MB WAV stems, not worth re-downloading/re-decoding every time the
  // same one is picked again).
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

  // Disconnects every plugin node in a track's own portions and clears any
  // selection/editor pointed at it — used right before that track's audio
  // is replaced (see loadDemoForTrack/handleTrackFile below), since a new
  // buffer invalidates the old portions' buffer-relative time ranges.
  const releaseTrackRegions = useCallback((id) => {
    const track = tracksRef.current.find((t) => t.id === id);
    track?.regions.forEach((region) => {
      disconnectChainSlots(region.chain);
      disconnectChainSlots(region.outerChain || []);
    });
    // Only close the popup if it was editing one of THIS track's portions
    // (which are about to be cleared) — the track's own whole-track chain
    // isn't time-indexed against the old audio, so it (and its popup, if
    // that's what's open) is left alone.
    if (activeEditorRef.current?.trackId === id && activeEditorRef.current?.regionId !== TRACK_CHAIN_SCOPE) {
      setActiveEditor(null);
    }
    if (selectedRegionRef.current?.trackId === id) {
      selectedRegionRef.current = null;
      setSelectedRegion(null);
    }
  }, []);

  // Loads one of DEMO_CLIPS onto a track — the per-track "D" demo dropdown.
  // Falls back to the synthetic pad (with a loadError note) if the real
  // clip can't be fetched/decoded, same spirit as handleTrackFile's own
  // error handling below.
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

  // Re-applies every LIVE track's own trackGain from scratch against the
  // just-updated track list — needed for both Mute and Solo, because
  // (un)soloing or (un)muting any one track can change whether every OTHER
  // track is audible too (see trackIsAudible), not just the one that was
  // clicked.
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

  // Solo works exactly like every other DAW's: soloing any track(s) silences
  // every non-soloed track in the mix (Mute stays independent — a muted
  // track stays silent even if it's also soloed).
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
    // Any of this track's sends with FMP ("Follow Main Pan") on mirror this
    // same pan value instead of an independent one — see the send-window's
    // FMP toggle. Nudge their already-wired panners the same way, rather
    // than waiting on a full playFrom rebuild to pick the new value up.
    if (g) {
      const track = next.find((t) => t.id === id);
      (track?.sends || []).forEach((s) => {
        if (!s.fmp) return;
        const rt = sendRuntimeRef.current.get(`${id}:${s.id}`);
        if (rt) rt.sendPanner.pan.setTargetAtTime(pan, g.ctx.currentTime, 0.01);
      });
    }
  }, []);

  // ── Move a track's clip start position (drag it anywhere in the
  // arrangement, like a real DAW) ─────────────────────────────────────────
  // Plain state update — no live graph rebuild here. A position drag can
  // fire many times a second; tearing down/rebuilding the whole playback
  // graph (every track's chains, every Faust node reconnected) on each of
  // those would be both wasteful and audibly glitchy. Whatever's already
  // playing keeps playing at its old position until the drag actually ends
  // (see endClipDrag below), then the graph rebuilds once from the current
  // transport position with the new startAt baked in.
  const setTrackStartAt = useCallback((id, startAt) => {
    const clamped = Math.max(0, startAt);
    const next = tracksRef.current.map((t) => (t.id === id ? { ...t, startAt: clamped } : t));
    tracksRef.current = next;
    setTracks(next);
  }, []);

  // { trackId, pointerId, startClientX, startAt, secondsPerPixel } while a
  // clip drag is in progress, else null. secondsPerPixel is snapshotted
  // once at drag start (from the arrangement pane's current width and the
  // arrangement's current duration) rather than recomputed every move —
  // the arrangement can get longer as you drag a clip further right, and
  // recomputing against that growing length mid-drag would make the clip
  // fight your own cursor instead of tracking it 1:1.
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
        /* ok — dragging still works without capture, just less robust if the pointer leaves the element */
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
        /* ok */
      }
      if (isPlayingRef.current) playFrom(currentOffset());
    },
    [playFrom, currentOffset],
  );

  // ── Portion selection & management ──────────────────────────────────────
  // Selecting a portion highlights it, points the dock's chain editor at
  // it, and (if the mix is already playing) immediately switches the
  // transport to loop just that portion's own window.
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

  // "✕ Exit Selection" (and Escape) — deselects the portion and returns Play
  // to covering the whole arrangement again.
  const exitSelection = useCallback(() => {
    selectedRegionRef.current = null;
    setSelectedRegion(null);
    setDockScope("portion");
    if (isPlayingRef.current) playFrom(currentOffset());
  }, [playFrom, currentOffset]);

  // Carves a new portion out of whichever dry gap (see computeSegments)
  // contains the drag's anchor point, clamped to that gap so it can never
  // overlap an existing portion on the same track. Auto-selects the new
  // portion once created.
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
      // outerCustomized: false — a fresh portion's "Outer" scope just reads
      // through to the track's own chain (see getChainArray) until someone
      // actually edits it there, at which point forkOuterChainIfNeeded
      // snapshots a private copy into outerChain and flips this to true.
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
          /* ok */
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

  // { trackId, pointerId, rectLeft, secondsPerPixel, anchor, duration }
  // while a portion is being drawn, else null. `anchor` is the buffer-
  // relative second where the drag started; the draft portion's start/end
  // are [min, max] of that anchor and the pointer's current position, so
  // dragging either left or right from the anchor both work.
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
      /* ok — dragging still works without capture, just less robust if the pointer leaves the element */
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
        /* ok */
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

  // ── Scrub: drag the red playhead line to seek to any position ──────────
  // Same "update visually every move, only touch the live audio graph once
  // the drag ends" split as the clip drag above — the mix keeps playing at
  // wherever it already was while you drag (rebuilding the whole playback
  // graph on every pointermove would glitch), and jumps to the new
  // position the moment you let go. Clamped to the selected portion's own
  // window while one is selected, same as playFrom's own loop bounds.
  // { pointerId, startClientX, startOffset, secondsPerPixel } while a scrub
  // is in progress, else null — also checked by the playhead-poll effect
  // above so it doesn't fight the drag by overwriting `playhead` with the
  // (stale, pre-seek) live position every tick.
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
        /* ok — dragging still works without capture, just less robust if the pointer leaves the element */
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
        /* ok */
      }
      if (isPlayingRef.current) playFrom(pausedOffsetRef.current);
    },
    [playFrom],
  );

  // Renders one track through its own portions + volume (offline, not the
  // live playback graph) and downloads the result as a WAV — the per-track
  // "Download" button in the tracklist.
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

  // Renders every track (its own portions + volume + mute) summed into one
  // mixdown (offline) and downloads it as a WAV — the topbar's "Download
  // Mix" button.
  const handleDownloadMix = useCallback(async () => {
    // renderMixOffline does its own filtering (audio tracks with a buffer,
    // plus every Aux bus any of them sends to) — it needs the FULL track
    // list, not pre-filtered down to just the buffered ones, or every Aux's
    // own inserts (e.g. a shared Reverb) would silently drop out of the
    // download even though they're audible live.
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

  // The panorama's ambient "mild air" room tone AND the recording-room
  // bleed (both spatialAudioEngine module-level singletons — see
  // PanoramaTour.jsx) play continuously underneath the whole VR tour and
  // keep running even while this overlay is open on top of them, since
  // opening the DAW doesn't unmount PanoramaTour. Left alone, either would
  // bleed into the mix the whole time you're working here (ironic, for the
  // bleed one) — silence both for the duration the DAW is open, and restore
  // them (to generic defaults; see DEFAULT_AMBIENCE/ROOM_BLEED above — this
  // screen doesn't know the current room's own custom profiles) once you
  // exit back to the studio.
  useEffect(() => {
    if (isOpen) {
      stopAmbientBed();
      stopRoomBleed();
    } else {
      setRoomAmbience(DEFAULT_AMBIENCE);
      startRoomBleed(ROOM_BLEED.audio, ROOM_BLEED.yaw, ROOM_BLEED.pitch);
    }
  }, [isOpen]);

  // Seed the mix with all three Hungarian Dance No. 5 stems as its default
  // tracks the first time the screen opens — fetched in parallel (they're
  // real ~20-45MB files), then added as tracks in a fixed order so the
  // tracklist/colors come out the same every time regardless of which
  // fetch happens to resolve first.
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
        const id = addTrackWithBuffer(buffer, name);
        if (firstId === null) firstId = id;
      });
      if (firstId !== null) setSelectedTrackId(firstId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Tear everything down on every open<->close transition (unconditional
  // cleanup keyed on `isOpen` — React runs it right BEFORE re-running this
  // effect for the new value, i.e. exactly on the open->closed transition
  // and again on unmount, not lazily on the next reopen).
  useEffect(() => {
    return () => {
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

  // ── Per-portion insert chain management ─────────────────────────────────
  // Every function below addresses a chain through the same
  // `(trackId, regionId)` pair — `regionId === TRACK_CHAIN_SCOPE` targets
  // the track's own whole-track chain, any other regionId targets that
  // portion's own chain (layered after the track's) — via
  // getChainArray/withChainArray, so the whole-track chain and every
  // portion's chain share one implementation instead of two parallel ones.

  // Awaits a plugin's Faust engine, then flips its (already-present, status
  // "loading") chain slot to "ready" (or "error") in place. Shared by
  // addOrSelectPlugin (loading a brand-new slot the user just added) and
  // forkOuterChainIfNeeded (loading fresh engine instances for a portion's
  // private copy of the track's chain — a live Faust node holds its own
  // parameter state, so it can't be shared between the track's own signal
  // path and a portion's forked one; each scope needs its own instance).
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
            /* ok */
          }
          return;
        }
        const flatItems = meta.ui?.[0]?.items ?? [];
        const meters = collectMeters(flatItems);
        const addressKey = `${trackId}:${regionId}:${def.key}`;
        // EQ gets its own dedicated handler straight into eqLiveDynGainRef
        // (bandId-keyed, matching EqualizerEditorPanel's contract) instead
        // of the generic address-keyed meterValuesRef every other plugin
        // here uses for its own getXLevels reads.
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
        // Auto-rebuild the live graph once this plugin's Faust engine is
        // ready, so a plugin added while the mix is already playing becomes
        // audible immediately without a manual Process click. This used to
        // race when several plugins were added in a row (each resolving
        // this success path independently and each tearing down the
        // previous call's half-built graph); playFrom() is now guarded by
        // playCallTokenRef so only the most recent call actually rebuilds,
        // making it safe to trigger from here again.
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

  // A portion's outer scope starts as a live read-through of the track's own
  // chain (see getChainArray) rather than an actually-private array — so a
  // portion nobody has customized still exactly tracks whatever the track
  // chain becomes later, and nothing needs forking just to look at it. The
  // first real edit from inside that scope — every mutator below
  // (addOrSelectPlugin, removePlugin, movePlugin, reorderPlugin,
  // toggleBypass, updateSlot) calls this first — snapshots the CURRENT
  // track chain into this portion's own `outerChain`, marks it
  // `outerCustomized`, and kicks off fresh engine loads for each cloned
  // slot (the track's own live nodes stay wired into the track's own path
  // and can't be reused here). After this, the portion's outer chain is
  // fully independent: it can be edited or have plugins removed freely
  // without touching the track chain or any other portion, or simply left
  // alone to keep following the track chain forever. No-ops if already
  // customized, or if `regionId` isn't an outer scope at all.
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
        // Just opening the popup on a plugin that's already there (whether
        // inherited from the track chain or already private to this
        // portion) is a look, not an edit — no fork here. Actually changing
        // anything from inside that popup goes through updateSlot, which
        // forks on its own the moment a real change happens.
        setActiveEditor({ trackId, regionId, key: def.key });
        return;
      }
      // A genuinely new plugin (not already inherited or private) is
      // unambiguously a customization — fork this portion's outer chain
      // first (a no-op everywhere else, and if it's already customized) so
      // the new plugin lands in a private copy instead of the track's own.
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
      // Removing an inherited (not-yet-customized) plugin from a portion's
      // outer scope is still a customization — it means "not for this
      // portion" — so fork first, same as every other mutator here.
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
        /* ok */
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

  // Drag-and-drop reorder: moves `fromKey` to sit where `toKey` currently is.
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

  // Generic setter used by every *EditorPanel below to patch fields on
  // whichever track/portion + plugin slot is open in the popup (mirrors the
  // plain useState setters the standalone chapter labs pass their own
  // panels).
  const updateSlot = useCallback(
    (trackId, regionId, key, patch) => {
      // A param tweak from inside the popup is exactly the kind of edit that
      // should fork an inherited outer chain into a private one — do it
      // first so the patch below lands on the portion's own copy, not the
      // track's.
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

  // ── Sends — each send routes a copy of a track's signal (post- or
  // pre-fader, per that send's own PRE toggle) at an adjustable level/pan
  // into an Aux track's own input, exactly like a real console's Aux Sends
  // section: the Aux itself is just another track (see addEmptyTrack's
  // `kind: "aux"`) with its own inserts, volume and pan, so "sending" to one
  // means routing INTO its chain rather than in series with the sending
  // track's own. Unlike the insert chain, sends have no meaningful order (each
  // is an independent path to a different bus), so there's no move/reorder
  // here — just add, remove, and per-send level/pan/pre-post/mute (see
  // sendRuntimeRef/playFrom for how these become live nodes, and
  // buildOfflineTrackOutput/renderMixOffline for the offline-render
  // counterpart). See sendIdRef/sendRuntimeRef, declared earlier alongside
  // this screen's other per-plugin runtime refs. ─────────────────────────

  const addSend = useCallback(
    (trackId, busId) => {
      const next = tracksRef.current.map((t) => {
        if (t.id !== trackId) return t;
        if ((t.sends || []).some((s) => s.busId === busId)) return t; // already sending to this bus
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

  // Patches a send's fields in state. `live` (default true) additionally
  // nudges the already-wired send nodes directly — same "don't tear down the
  // whole graph for a fader drag" treatment setTrackVolume/setTrackPan give
  // the channel-strip controls — for level/pan/mute, which don't change the
  // graph's topology; changing `prePost` DOES (it moves which node the send
  // taps from), so that one always goes through the full playFrom rebuild
  // instead.
  const updateSend = useCallback((trackId, sendId, patch, { live = true } = {}) => {
    const next = tracksRef.current.map((t) =>
      t.id === trackId ? { ...t, sends: (t.sends || []).map((s) => (s.id === sendId ? { ...s, ...(typeof patch === "function" ? patch(s) : patch) } : s)) } : t,
    );
    tracksRef.current = next;
    setTracks(next);
    const g = graphRef.current;
    const track = next.find((t) => t.id === trackId);
    // The dry/direct path's own gain crossfades against however much this
    // track's post-fader sends now add up to (see computeDryScale) — nudge
    // it live any time a send's level/mute/prePost changes, same as the
    // send's own gain/pan just below, so a fader drag doesn't need a full
    // playFrom rebuild to be heard at the main output.
    const trackNodes = g?.trackNodes.get(trackId);
    if (g && track && trackNodes?.dryGain) {
      trackNodes.dryGain.gain.setTargetAtTime(computeDryScale(track), g.ctx.currentTime, 0.01);
    }
    const rt = sendRuntimeRef.current.get(`${trackId}:${sendId}`);
    if (live && g && rt) {
      const updated = track?.sends.find((s) => s.id === sendId);
      if (updated) {
        rt.sendGain.gain.setTargetAtTime(updated.muted ? 0 : updated.level, g.ctx.currentTime, 0.01);
        // FMP sends track the channel's own pan, not their own `pan` field
        // — see the send-window's FMP toggle and setTrackPan's own nudge.
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

  // Send-window level meter — reads the send's own post-sendGain analyser
  // (see the sendAnalyser tapped in playFrom's sends pass) the same
  // "grab a Uint8Array off an AnalyserNode, RMS it" way the Mixer view's
  // own per-track meter and the master meter already do, just on demand
  // (called from SendRack's own poll while a send window is open) rather
  // than folded into the always-on trackLevels interval, since only one
  // send window can be open at a time and it's usually none.
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

  // Push every chain's (the track's own, and every one of its portions')
  // per-slot typed params onto its live Faust node, via each plugin's own
  // pushFaustParams (the same functions the standalone chapter labs use) —
  // runs across the whole mix on every params change.
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

  // Point the EQ popup's analyser refs at whichever portion's live EQ nodes
  // are currently playing (or clear them when no EQ popup is open).
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

  // ── Live level getters for whichever plugin popup is open ──────────────
  // Stable identities (useCallback with no deps, reading activeEditorRef at
  // call time) — every *EditorPanel's own animation-frame effect lists
  // these in its dependency array, so a fresh function reference every
  // render would restart that loop constantly.
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

  // Opening (or switching between) plugin popups used to auto-start/stop a
  // preview loop via an effect keyed on `activeEditor`. That fired on EVERY
  // popup switch — not just open/close — and raced with the plugin-load
  // completion path below, so adding several plugins in a row and clicking
  // between their editors could trigger two overlapping playFrom() calls
  // (each tearing down the other's half-built graph), which is what made
  // playback appear to "pause" when switching. A new plugin now auto-joins
  // an already-playing mix as soon as its engine finishes loading (see the
  // success path in addOrSelectPlugin, guarded by playCallTokenRef so it
  // can't race), so nothing needs to be clicked for it to become audible.
  // Process/Apply remain as explicit manual controls: Process (re)starts
  // the looped preview from the current position, Apply pushes the current
  // chain/params into an already-playing mix and closes the popup.
  const handleProcess = useCallback(() => {
    if (!loopOnRef.current) {
      setLoopOn(true);
      loopOnRef.current = true;
    }
    playFrom(pausedOffsetRef.current);
  }, [playFrom]);

  // Apply confirms the plugin (pushing it into an already-playing mix if
  // needed) and closes the popup.
  const handleApply = useCallback(() => {
    if (isPlayingRef.current) playFrom(currentOffset());
    setActiveEditor(null);
  }, [playFrom, currentOffset]);

  // Cancel just closes the popup without applying any pending changes — it
  // never removes the plugin from the chain, even if it was only just
  // added, since the plugin auto-processes into the live mix as soon as its
  // engine is ready. The only way to remove a plugin from the chain is the
  // explicit Remove button. This same handler backs the × close button and
  // clicking the backdrop, so every way of dismissing the popup behaves the
  // same way.
  const handleCancel = useCallback(() => {
    setActiveEditor(null);
  }, []);

  // While the plugin popup is open, temporarily solo the track it belongs
  // to (see trackIsAudible) so Process/auto-join previews ONLY that track,
  // not the whole mix — matches the popup's own "so you can hear this
  // track" copy, and is what makes a short track's preview actually loop
  // just itself instead of running for however long the longest OTHER
  // track in the arrangement happens to be (see the loopEnd fallback fix
  // in getPreviewWindow above). Keyed on the trackId (not the whole
  // activeEditor, which also changes when switching plugins/portions
  // within the same track — that shouldn't re-isolate). Snapshots every
  // track's real `solo` flag right before overriding it, and restores that
  // exact snapshot the moment the popup closes or moves to a different
  // track, so this never clobbers a solo the user actually set.
  useEffect(() => {
    const trackId = activeEditor?.trackId;
    if (!trackId) return undefined;
    const prevSolo = new Map(tracksRef.current.map((t) => [t.id, t.solo]));
    preIsolateSoloRef.current = prevSolo;
    // An Aux bus has no audio of its own — every sample it ever plays comes
    // from some OTHER track's Send. Isolating it the same way as a real
    // track (solo just this one, un-solo everything else) starves it of
    // every one of those feeds, so its own insert editor's scope/waveform
    // and Process preview would always show silence. A PRE-fader send taps
    // its track's chain before trackGain (see playFrom's `tap` — same node
    // solo/mute silence to isolate everything else), so it keeps reaching
    // the bus either way and needs no help here; only POST-fader feeders
    // (the default) actually go quiet when un-soloed, so only those need
    // forcing back on — soloing a pre-only feeder too would just add its
    // own dry signal straight to master, on top of the Aux preview.
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

  // ── Transport/mixer keyboard shortcuts — same keys Logic Pro itself uses
  // (Space play/pause, Home return-to-start, M/S mute/solo the selected
  // track, X toggle the Mixer). Ignored while a text field, the New Track
  // dialog, or the plugin popup has focus/is open, and while any menu-style
  // element (select, button in a form) is focused, so typing a track name
  // or a number field never gets hijacked. Re-subscribes whenever any of
  // the actions below change identity (isPlaying/loopOn changing is what
  // makes togglePlay/rewind/toggleLoop change) so it never fires a stale
  // closure — cheap, since this is just an addEventListener swap. ────────
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
  // `activeRegion` is only set for a REAL portion's popup — null for the
  // track's own whole-track chain (activeEditor.regionId === TRACK_CHAIN_SCOPE),
  // which the popup below uses to pick its tag text. `activeSlot` itself
  // resolves through getChainArray so it works for all three scopes.
  // baseRegionId un-suffixes an outer-scope id back to its region, so a
  // portion's private outer-chain popup still resolves to that portion.
  const activeRegion =
    activeEditor && activeEditor.regionId !== TRACK_CHAIN_SCOPE
      ? activeTrack?.regions.find((r) => r.id === baseRegionId(activeEditor.regionId))
      : null;
  const activeIsPortionOuter = !!(activeEditor && isOuterScope(activeEditor.regionId));
  const activeSlot = activeEditor ? getChainArray(activeTrack, activeEditor.regionId)?.find((s) => s.key === activeEditor.key) : undefined;
  const selectedTrack = tracks.find((t) => t.id === selectedTrackId) || null;
  const selectedRegionTrack = selectedRegion ? tracks.find((t) => t.id === selectedRegion.trackId) || null : null;
  const selectedRegionObj = selectedRegionTrack?.regions.find((r) => r.id === selectedRegion.regionId) || null;
  // The dock always edits ONE scope at a time. With a portion selected, the
  // "This portion" / "Track chain" tabs (dockScope) let you flip between
  // that portion's own chain and that SAME portion's own private outer
  // chain (outerScopeId — layered before the portion's own chain, after the
  // track's real whole-track chain, but never heard in gaps or other
  // portions) WITHOUT losing the portion highlight or preview loop; with no
  // portion selected there's only one scope, the selected track's real
  // whole-track chain (TRACK_CHAIN_SCOPE, heard everywhere on the track).
  const dockTrack = selectedRegionObj ? selectedRegionTrack : selectedTrack;
  const dockRegionId = selectedRegionObj
    ? dockScope === "track"
      ? outerScopeId(selectedRegionObj.id)
      : selectedRegionObj.id
    : TRACK_CHAIN_SCOPE;
  const dockChain = dockTrack ? getChainArray(dockTrack, dockRegionId) : undefined;
  // True only while the dock is showing a selected portion's PRIVATE outer
  // chain (the "Outer" tab) rather than its own chain or (with nothing
  // selected) the track's real whole-track chain.
  const dockOnPortionOuterScope = !!selectedRegionObj && dockScope === "track";
  const rulerStep = pickRulerStep(Math.max(1, arrangementDuration));
  const rulerMarks = Array.from(
    { length: Math.floor(Math.max(1, Math.ceil(arrangementDuration)) / rulerStep) + 1 },
    (_, i) => i * rulerStep,
  );

  // ── Shared prop bundles for the presentational subcomponents below (see
  // src/panorama/daw/) — TrackList, MixerView and EditorDock all wire the
  // same InsertRack, and TrackList/MixerView both wire the same SendRack, so
  // the underlying chain/send-management functions are grouped here once
  // instead of being re-listed as a dozen individual props in each.
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

            {viewMode === "arrange" ? (
              <>
                {/* Body: tracklist (left) + arrangement/waveforms (right) —
                    same layout as design/daw-workstation-screen-ui.html, just
                    driven by the real multi-track state instead of mock data. */}
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
