import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Viewer } from "@photo-sphere-viewer/core";
import { VirtualTourPlugin } from "@photo-sphere-viewer/virtual-tour-plugin";
import { MarkersPlugin } from "@photo-sphere-viewer/markers-plugin";
import "@photo-sphere-viewer/core/index.css";
import "@photo-sphere-viewer/markers-plugin/index.css";
import "@photo-sphere-viewer/virtual-tour-plugin/index.css";
import { ROOMS, START_NODE_ID } from "./roomsData";
import {
  initAudio,
  resumeAudio,
  updateListenerOrientation,
  stopHotspotNarration,
  setRoomAmbience,
  stopAmbientBed,
  setMuted,
  isMuted,
  setBinauralEnabled,
  isBinauralEnabled,
  startRoomBleed,
  stopRoomBleed,
  setRoomBleedVolume,
  getRoomBleedVolume,
  setRoomBleedMuted,
  isRoomBleedMuted,
} from "../audio/spatialAudioEngine";
import DawWorkstationScreen from "./DawWorkstationScreen";

const DEFAULT_AMBIENCE = { filterFreq: 500, gain: 0.03, gustDepth: 0.015 };
// The wide, "standing in the middle of the room" resting view — used both
// for the first-arrival reveal and to zoom back out whenever a hotspot's
// gear panel is closed, so the camera doesn't just stay parked at whatever
// hotspot zoomLvl it walked up to.
const REST_ZOOM_LVL = 5;

const deg = (value) => `${value}deg`;

// Numbered badge with a double pulsing ring, used for every gear hotspot.
// The rings are pure CSS animation (see the <style> block rendered below)
// so there's no JS animation loop involved.
const markerHtml = (number) => `
  <div class="hotspot-marker">
    <span class="hotspot-marker__ring"></span>
    <span class="hotspot-marker__ring hotspot-marker__ring--delayed"></span>
    <span class="hotspot-marker__dot">${number}</span>
  </div>
`;

// Same pulsing-badge treatment, but in blue with a door icon instead of a
// number — used for doorways. Rendered as a regular MarkersPlugin hotspot
// fixed at a specific yaw/pitch (not the virtual-tour plugin's own 3D floor
// arrows, which drift across the screen as the camera turns).
const doorMarkerHtml = () => `
  <div class="hotspot-marker hotspot-marker--door">
    <span class="hotspot-marker__ring hotspot-marker__ring--door"></span>
    <span class="hotspot-marker__ring hotspot-marker__ring--door hotspot-marker__ring--delayed"></span>
    <span class="hotspot-marker__dot hotspot-marker__dot--door">🚪</span>
  </div>
`;

// Icon badge (no number) for functional processing hotspots — instead of
// the numbered/lettered treatment gear markers get. The icon itself is what
// signals "this opens a live, interactive module" rather than "read more
// about this piece of gear"; unlike gear/door markers there's currently
// only one of these (the DAW workstation) so it just uses the same green
// ring/dot as the plain gear hotspots below — pass `variant` if a future
// interactive marker needs a distinct color.
const interactiveMarkerHtml = (icon, variant) => `
  <div class="hotspot-marker${variant ? ` hotspot-marker--${variant}` : ""}">
    <span class="hotspot-marker__ring${variant ? ` hotspot-marker__ring--${variant}` : ""}"></span>
    <span class="hotspot-marker__ring${variant ? ` hotspot-marker__ring--${variant}` : ""} hotspot-marker__ring--delayed"></span>
    <span class="hotspot-marker__dot${variant ? ` hotspot-marker__dot--${variant}` : ""}">${icon}</span>
  </div>
`;

// Amber speaker-icon badge for a room's `volumeControls` hotspots — opens a
// small slider + mute panel for an adjustable background bed (e.g. the
// recording-room bleed) instead of a gear/course info panel, so it reads as
// "audio control" at a glance rather than another piece of gear to learn
// about.
const volumeMarkerHtml = () => `
  <div class="hotspot-marker hotspot-marker--volume">
    <span class="hotspot-marker__ring hotspot-marker__ring--volume"></span>
    <span class="hotspot-marker__ring hotspot-marker__ring--volume hotspot-marker__ring--delayed"></span>
    <span class="hotspot-marker__dot hotspot-marker__dot--volume">🔊</span>
  </div>
`;

function buildNodes() {
  let hotspotNumber = 0;
  return ROOMS.map((room) => ({
    id: room.id,
    name: room.name,
    panorama: room.panorama,
    // The virtual-tour plugin still needs `links` for room-to-room
    // transitions (and to know which way to rotate before the fade), but
    // its own arrow markers are hidden in CSS — doorways are instead
    // rendered as the hotspot markers below, right after gear markers.
    links: room.links.map((link) => ({
      nodeId: link.nodeId,
      position: { yaw: deg(link.yaw), pitch: deg(link.pitch) },
    })),
    markers: [
      ...room.markers.map((marker) => {
        hotspotNumber += 1;
        return {
          id: marker.id,
          position: { yaw: deg(marker.yaw), pitch: deg(marker.pitch) },
          html: markerHtml(hotspotNumber),
          size: { width: 34, height: 34 },
          anchor: "center center",
          // Zoom level applied by markers.gotoMarker() so selecting a hotspot
          // feels like walking up to it rather than just glancing over.
          zoomLvl: marker.zoomLvl ?? 60,
          // Deliberately no hover tooltip here: the library auto-flips it
          // above/below the icon depending on available screen space, which
          // reads as "the info card randomly jumps around". The real
          // information card is the fixed panel (.svr-tour-gear-panel) that opens
          // on click, always pinned to the same spot regardless of where
          // the marker lands on screen.
          data: {
            kind: "gear",
            id: marker.id,
            number: hotspotNumber,
            title: marker.title,
            description: marker.description,
            course: marker.course,
            yaw: marker.yaw,
            pitch: marker.pitch,
            audio: marker.audio,
          },
        };
      }),
      ...room.links.map((link) => {
        const destRoom = ROOMS.find((r) => r.id === link.nodeId);
        return {
          id: `door-${room.id}-${link.nodeId}`,
          position: { yaw: deg(link.yaw), pitch: deg(link.pitch) },
          html: doorMarkerHtml(),
          size: { width: 34, height: 34 },
          anchor: "center center",
          tooltip: {
            content: `Go to ${destRoom?.name || "next room"}`,
            trigger: "hover",
          },
          data: { kind: "door", nodeId: link.nodeId },
        };
      }),
      ...(room.interactiveMarkers || []).map((marker) => ({
        id: marker.id,
        position: { yaw: deg(marker.yaw), pitch: deg(marker.pitch) },
        html: interactiveMarkerHtml(marker.type === "daw" ? "🖥" : "⚡"),
        size: { width: 34, height: 34 },
        anchor: "center center",
        zoomLvl: marker.zoomLvl ?? 60,
        data: {
          kind: "interactive",
          id: marker.id,
          type: marker.type,
          title: marker.title,
          yaw: marker.yaw,
          pitch: marker.pitch,
        },
      })),
      ...(room.volumeControls || []).map((control) => ({
        id: control.id,
        position: { yaw: deg(control.yaw), pitch: deg(control.pitch) },
        html: volumeMarkerHtml(),
        size: { width: 34, height: 34 },
        anchor: "center center",
        tooltip: {
          content: control.title || "Volume",
          trigger: "hover",
        },
        data: {
          kind: "volume",
          id: control.id,
          title: control.title,
          target: control.target,
          yaw: control.yaw,
          pitch: control.pitch,
        },
      })),
    ],
  }));
}

function PanoramaTour() {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const placementModeRef = useRef(false);
  const viewerRef = useRef(null);
  const markersRef = useRef(null);
  const virtualTourRef = useRef(null);
  const goToMarkerRef = useRef(null);
  const hasArrivedRef = useRef(false);
  // Tracks whichever hotspot was requested most recently, so that if a
  // second hotspot is clicked before the first one's arrival animation
  // finishes, the first one's now-stale ".then()" can't overwrite the panel
  // with the wrong content.
  const latestRequestRef = useRef(null);
  // Holds the .hotspot-marker DOM element (rendered by the markers plugin,
  // outside of React) that currently has the "svr-hotspot-selected" class —
  // i.e. whichever hotspot's panel is open. Tracked as a plain DOM ref
  // rather than React state since the marker HTML lives outside React's
  // render tree; toggling the class directly is how selection is reflected.
  const selectedMarkerElRef = useRef(null);
  // Mirrors activeModule (below) for the marker click handler, which lives
  // inside the mount-only viewer effect and would otherwise only ever see
  // the null it captured on the first render (the same stale-closure reason
  // latestRequestRef exists).
  const activeModuleRef = useRef(null);
  // Same stale-closure fix as activeModuleRef, for the volume-control marker
  // click handler.
  const activeVolumeControlRef = useRef(null);

  const [currentRoomName, setCurrentRoomName] = useState("");
  const [currentRoomId, setCurrentRoomId] = useState(START_NODE_ID);
  const [activeGear, setActiveGear] = useState(null);
  // Whichever EQ/Compressor interactive hotspot is currently open, or null.
  // Kept separate from activeGear (rather than folded into one "active
  // panel" union) since gear hotspots and interactive hotspots are opened by
  // completely different code paths below and only one panel is ever meant
  // to be visible at a time — each open path clears the other two.
  const [activeModule, setActiveModule] = useState(null);
  // Whichever "volume" hotspot (see roomsData.js volumeControls) currently
  // has its slider + mute panel open, or null. Same "only one panel visible
  // at a time" rule as activeModule/activeGear above — every path that opens
  // one of the other two panels also clears this.
  const [activeVolumeControl, setActiveVolumeControl] = useState(null);
  const [placementMode, setPlacementMode] = useState(false);
  const [lastPlacement, setLastPlacement] = useState(null);
  const [status, setStatus] = useState("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [audioMuted, setAudioMuted] = useState(isMuted());
  const [binauralOn, setBinauralOn] = useState(isBinauralEnabled());
  const [hintOpen, setHintOpen] = useState(false);
  // The recording-room bleed's own volume/mute (see spatialAudioEngine.js
  // setRoomBleedVolume()/setRoomBleedMuted()) — entirely separate from the
  // master mute and binaural toggle above. Initialized from the engine's
  // module-level state so the slider reflects the right position even if
  // this component remounts while a value was previously set.
  const [bleedVolume, setBleedVolumeState] = useState(() =>
    Math.round(getRoomBleedVolume() * 100),
  );
  const [bleedMuted, setBleedMutedState] = useState(() => isRoomBleedMuted());

  useEffect(() => {
    activeModuleRef.current = activeModule;
  }, [activeModule]);

  useEffect(() => {
    activeVolumeControlRef.current = activeVolumeControl;
  }, [activeVolumeControl]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Login already unlocks audio on a real user gesture, but do it again
    // here defensively in case this screen is ever reached another way.
    initAudio();
    resumeAudio();

    const viewer = new Viewer({
      container: containerRef.current,
      // Start zoomed in; on arrival we animate back out to zoomLvl 5 for a
      // "zoom out to normal position" reveal instead of just appearing.
      defaultZoomLvl: 75,
      // Caps how far zoom-in can go (via the navbar slider, scroll, or a
      // hotspot's zoomLvl). Raised back up from the library default of 30 —
      // it had been lowered to 15 to allow an extreme close-in, but that let
      // gear hotspots zoom in tight enough to feel disorienting/cropped.
      // Higher minFov = less maximum magnification.
      minFov: 30,
      // Higher than the library default (90deg) so the resting/establishing
      // view (see the zoomLvl: 5 reveal below) shows noticeably more of the
      // room at once — the room reads as bigger/more spacious instead of
      // feeling boxed in. There's no separate "sphere size" control in this
      // library (the panorama is projected on a fixed-radius sphere); a
      // wider max field of view is what actually makes the space feel
      // larger. Past ~120 the wide-angle distortion gets noticeable, so
      // this stays comfortably under that. Zoom-out/FOV is otherwise
      // unchanged — only the zoom-in ceiling above was tightened.
      maxFov: 118,
      navbar: ["zoom", "caption", "fullscreen"],
      plugins: [
        [
          VirtualTourPlugin,
          {
            positionMode: "manual",
            renderMode: "3d",
            nodes: buildNodes(),
            startNodeId: START_NODE_ID,
            // "Ultra realistic" navigation: fade out, turn to face the next
            // room's doorway, then fade in — feels like walking through it
            // rather than an abrupt cut.
            transitionOptions: {
              effect: "fade",
              speed: "12rpm",
              rotation: true,
              showLoader: true,
            },
          },
        ],
        [MarkersPlugin, {}],
      ],
    });

    viewerRef.current = viewer;
    const virtualTour = viewer.getPlugin(VirtualTourPlugin);
    virtualTourRef.current = virtualTour;
    const markers = viewer.getPlugin(MarkersPlugin);
    markersRef.current = markers;

    // Crossfades the ambient bed to this room's own character. Called on
    // every room change. The bed's audibility is governed solely by master
    // mute (setMuted()/isMuted()) further down the signal chain, so this
    // always re-tunes regardless of mute or binaural state.
    //
    // Also starts/stops this room's `roomBleed` loop, if it defines one — a
    // bleed source belongs to whichever room defined it (see roomsData.js),
    // so leaving that room stops it rather than letting it keep playing
    // wherever the student walks to next.
    const activateRoomAudio = (room) => {
      if (!room) return;
      setRoomAmbience(room.ambience ?? DEFAULT_AMBIENCE);
      if (room.roomBleed) {
        startRoomBleed(room.roomBleed.audio, room.roomBleed.yaw, room.roomBleed.pitch);
      } else {
        stopRoomBleed();
      }
    };

    const onNodeChanged = (e) => {
      setCurrentRoomName(e.node.name || e.node.id);
      setCurrentRoomId(e.node.id);
      setActiveGear(null);
      setActiveModule(null);
      setActiveVolumeControl(null);
      latestRequestRef.current = null;
      clearSelectedMarkerEl();
      setStatus("ready");

      // Only on first arrival: reveal the room by zooming back out to the
      // normal establishing view, instead of just popping in already zoomed.
      if (!hasArrivedRef.current) {
        hasArrivedRef.current = true;
        viewer.animate({ zoom: REST_ZOOM_LVL, speed: "10rpm" });
      }

      activateRoomAudio(ROOMS.find((r) => r.id === e.node.id));
    };
    virtualTour.addEventListener("node-changed", onNodeChanged);

    // Keeps the Web Audio listener facing the same direction as the camera
    // so spatialized hotspot cues correctly pan/rotate as you look around.
    const orientationInterval = setInterval(() => {
      const pos = viewer.getPosition();
      updateListenerOrientation(
        (pos.yaw * 180) / Math.PI,
        (pos.pitch * 180) / Math.PI,
      );
    }, 120);

    // Shared by both clicking a hotspot directly and the panel's "Next"
    // button: rotate + zoom toward the marker, then reveal its panel once
    // the camera settles — reads as "walking up to it".
    const goToMarker = (markerId) => {
      const marker = markers.getMarker(markerId);
      if (!marker) return;
      latestRequestRef.current = markerId;
      markers.gotoMarker(markerId, "8rpm").then(() => {
        // Ignore this result if a newer hotspot was requested in the
        // meantime — otherwise a slow/interrupted animation from an older
        // click can pop in and show the wrong hotspot's info.
        if (latestRequestRef.current !== markerId) return;
        setActiveModule(null);
        setActiveVolumeControl(null);
        setActiveGear(marker.data);
        setSelectedMarkerEl(markerId);
        // Narration audio is intentionally not played here — selecting a
        // hotspot only reveals its text panel (title/description below).
      });
    };
    goToMarkerRef.current = goToMarker;

    // Same "walk up to it" treatment as goToMarker, but for interactive
    // hotspots (currently just the DAW workstation): no narration (it's a
    // functional module, not a gear description), and clicking the SAME
    // module's marker again closes it instead of re-opening — mirrors
    // design/daw-workstation-screen-ui.html's marker toggle behavior.
    const goToInteractiveMarker = (markerId, data) => {
      const marker = markers.getMarker(markerId);
      if (!marker) return;
      if (activeModuleRef.current?.id === data.id) {
        setActiveModule(null);
        clearSelectedMarkerEl();
        return;
      }
      latestRequestRef.current = markerId;
      markers.gotoMarker(markerId, "8rpm").then(() => {
        if (latestRequestRef.current !== markerId) return;
        stopHotspotNarration();
        setActiveGear(null);
        setActiveVolumeControl(null);
        setActiveModule(data);
        setSelectedMarkerEl(markerId);
      });
    };

    // Unlike goToMarker/goToInteractiveMarker above, a `kind: "volume"`
    // hotspot (see roomsData.js `volumeControls`) does NOT walk the camera
    // up to it — it's a UI control for an audio bed, not a piece of gear or
    // a room feature to "arrive at", so the slider + mute panel opens
    // immediately in place, with no camera movement. Clicking the SAME
    // control's marker again still closes it, matching
    // goToInteractiveMarker's toggle behavior above.
    const goToVolumeMarker = (markerId, data) => {
      const marker = markers.getMarker(markerId);
      if (!marker) return;
      if (activeVolumeControlRef.current?.id === data.id) {
        setActiveVolumeControl(null);
        clearSelectedMarkerEl();
        return;
      }
      latestRequestRef.current = markerId;
      setActiveGear(null);
      setActiveModule(null);
      setActiveVolumeControl(data);
      setSelectedMarkerEl(markerId);
    };

    const onSelectMarker = (e) => {
      if (e.marker.data?.kind === "door") {
        goToRoom(e.marker.data.nodeId);
      } else if (e.marker.data?.kind === "interactive") {
        goToInteractiveMarker(e.marker.id, e.marker.data);
      } else if (e.marker.data?.kind === "volume") {
        goToVolumeMarker(e.marker.id, e.marker.data);
      } else {
        goToMarker(e.marker.id);
      }
    };
    markers.addEventListener("select-marker", onSelectMarker);

    const onClick = (e) => {
      if (!placementModeRef.current) return;
      const yawDeg = ((e.data.yaw * 180) / Math.PI).toFixed(1);
      const pitchDeg = ((e.data.pitch * 180) / Math.PI).toFixed(1);
      console.log(`[panorama] yaw: ${yawDeg}deg, pitch: ${pitchDeg}deg`);
      setLastPlacement({ yaw: yawDeg, pitch: pitchDeg });
    };
    viewer.addEventListener("click", onClick);

    const onKeyDown = (e) => {
      if (e.key.toLowerCase() !== "p") return;
      placementModeRef.current = !placementModeRef.current;
      setPlacementMode(placementModeRef.current);
      // Placement mode is a dev tool — surface the hint drawer automatically
      // so the yaw/pitch readout isn't hidden behind a collapsed chip.
      if (placementModeRef.current) setHintOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);

    viewer.addEventListener("panorama-error", (e) => {
      console.error("Panorama load error:", e);
      setErrorMsg("Failed to load a panorama image.");
      setStatus("error");
    });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearInterval(orientationInterval);
      stopHotspotNarration();
      // The ambient bed and room-bleed loop both live in a module-level
      // singleton (spatialAudioEngine), not React state, so they otherwise
      // keep playing after this screen unmounts — e.g. following "Start
      // course" into /course. Stop them here so leaving the VR tour
      // actually silences the room.
      stopAmbientBed();
      stopRoomBleed();
      viewer.destroy();
    };
  }, []);

  // Removes the "selected" highlight from whichever hotspot marker
  // currently has it (if any). Called any time a panel closes or a
  // different hotspot is selected, so exactly one marker (or none) ever
  // carries the selected animation at a time.
  const clearSelectedMarkerEl = () => {
    if (selectedMarkerElRef.current) {
      selectedMarkerElRef.current.classList.remove("svr-hotspot-selected");
      selectedMarkerElRef.current = null;
    }
  };

  // Adds the "selected" highlight to the given marker's rendered element.
  // The markers plugin renders `html` outside of React, so this reaches
  // into its DOM directly (via markers.getMarker().domElement) rather than
  // going through React state/props.
  const setSelectedMarkerEl = (markerId) => {
    clearSelectedMarkerEl();
    const marker = markersRef.current?.getMarker(markerId);
    const el = marker?.domElement?.querySelector(".hotspot-marker");
    if (el) {
      el.classList.add("svr-hotspot-selected");
      selectedMarkerElRef.current = el;
    }
  };

  // Closes the panel and eases the camera back out to the wide resting
  // view instead of leaving it parked at the hotspot's zoomed-in position.
  const closeGearPanel = () => {
    stopHotspotNarration();
    setActiveGear(null);
    clearSelectedMarkerEl();
    viewerRef.current?.animate({ zoom: REST_ZOOM_LVL, speed: "10rpm" });
  };

  // Same camera-ease-out treatment for the DAW workstation panel.
  // DawWorkstationScreen tears its own audio graph down when it closes (see
  // its `isOpen` effect), so nothing further needs to happen to audio here.
  const closeModulePanel = () => {
    setActiveModule(null);
    clearSelectedMarkerEl();
    viewerRef.current?.animate({ zoom: REST_ZOOM_LVL, speed: "10rpm" });
  };

  // Closes the volume-control panel. Unlike closeGearPanel/closeModulePanel
  // there's no camera animation to undo here — opening this panel never
  // moved the camera in the first place (see goToVolumeMarker above), so
  // closing it doesn't either. The room-bleed source itself keeps playing
  // (per its current volume/mute) — this only hides the slider.
  const closeVolumePanel = () => {
    setActiveVolumeControl(null);
    clearSelectedMarkerEl();
  };

  // Master mute — silences everything (ambient bed + narration, spatial or
  // not) via the single output stage in spatialAudioEngine. Fully
  // independent of the binaural toggle below.
  const toggleMasterMute = () => {
    const next = !isMuted();
    setMuted(next);
    setAudioMuted(next);
  };

  // Binaural/spatial toggle — does NOT mute or unmute anything. It only
  // decides whether the *next* hotspot narration plays HRTF-spatialized or
  // as plain stereo (see spatialAudioEngine.playHotspotNarration). The
  // ambient bed is unaffected either way.
  const toggleBinaural = () => {
    const next = !isBinauralEnabled();
    setBinauralEnabled(next);
    setBinauralOn(next);
  };

  // Drag handler for the recording-room bleed's volume slider (see the
  // `activeVolumeControl` panel below). Entirely separate from the master
  // mute/binaural toggle above — this only ever changes how loud this one
  // background bed is.
  const handleBleedVolumeChange = (e) => {
    const nextPercent = Number(e.target.value);
    setBleedVolumeState(nextPercent);
    setRoomBleedVolume(nextPercent / 100);
  };

  // Mutes/unmutes just the recording-room bleed — independent of the master
  // mute button in the toolbar, which still silences this too regardless.
  const toggleBleedMute = () => {
    const next = !bleedMuted;
    setRoomBleedMuted(next);
    setBleedMutedState(next);
  };

  // Selecting a door hotspot: walk through to the linked room. The
  // virtual-tour plugin's own transitionOptions (rotation: true) handles
  // turning to face the doorway before the fade.
  const goToRoom = (nodeId) => {
    stopHotspotNarration();
    setActiveGear(null);
    setActiveModule(null);
    setActiveVolumeControl(null);
    clearSelectedMarkerEl();
    virtualTourRef.current?.setCurrentNode(nodeId);
  };

  const goToNextMarker = () => {
    const markers = markersRef.current;
    if (!markers || !activeGear) {
      console.warn("[next-hotspot] blocked: missing markers plugin or activeGear", {
        hasMarkers: !!markers,
        activeGear,
      });
      return;
    }
    // getMarkers() returns every marker registered in the current room,
    // gear hotspots AND doorways alike. "Next" should only ever cycle
    // through gear — landing on a door marker here previously opened the
    // gear panel with a door's data (no title/description/course), showing
    // up as an empty info panel once you'd stepped through every real
    // hotspot.
    const gearMarkers = markers.getMarkers().filter((m) => m.data?.kind === "gear");
    console.log(
      "[next-hotspot] registered gear marker ids:",
      gearMarkers.map((m) => m.id),
      "current:",
      activeGear.id,
    );
    const currentIndex = gearMarkers.findIndex((m) => m.id === activeGear.id);
    if (currentIndex === -1) {
      console.warn("[next-hotspot] blocked: current marker id not found in registered gear markers");
      return;
    }
    if (gearMarkers.length < 2) {
      console.warn("[next-hotspot] blocked: only one gear marker registered, nothing to advance to");
      return;
    }
    const next = gearMarkers[(currentIndex + 1) % gearMarkers.length];
    console.log("[next-hotspot] advancing to:", next.id);
    goToMarkerRef.current?.(next.id);
  };

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <style>{tourStyles}</style>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {status === "loading" && (
        <div className="svr-tour-loading">
          <div className="svr-tour-spinner" />
          <div className="svr-tour-loading-text">Loading studio tour…</div>
        </div>
      )}

      {status === "error" && (
        <div className="svr-tour-loading">
          <div className="svr-tour-loading-text svr-tour-error-text">
            {errorMsg}
          </div>
        </div>
      )}

      {status === "ready" && (
        <div className="svr-tour-toolbar">
          <div className="svr-tour-room-block">
            <div className="svr-tour-room-name">{currentRoomName}</div>
            {ROOMS.length > 1 && (
              <div className="svr-tour-room-dots">
                {ROOMS.map((room) => (
                  <button
                    key={room.id}
                    className={
                      "svr-tour-room-dot" +
                      (room.id === currentRoomId ? " current" : "")
                    }
                    onClick={() => goToRoom(room.id)}
                    aria-label={`Go to ${room.name}`}
                    title={room.name}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="svr-tour-divider" />
          <button
            onClick={toggleBinaural}
            className={"svr-tour-binaural-btn" + (binauralOn ? " on" : " off")}
            aria-pressed={binauralOn}
            aria-label={binauralOn ? "Turn off binaural audio" : "Turn on binaural audio"}
            title={binauralOn ? "Binaural: on — click to turn off" : "Binaural: off — click to turn on"}
          >
            <span className="svr-tour-binaural-icon" aria-hidden="true">🎧</span>
            <span className="svr-tour-binaural-label">
              Binaural {binauralOn ? "on" : "off"}
            </span>
          </button>
          <button
            onClick={toggleMasterMute}
            className="svr-tour-icon-btn"
            aria-label={audioMuted ? "Unmute audio" : "Mute audio"}
            title={audioMuted ? "Unmute" : "Mute"}
          >
            {audioMuted ? "🔇" : "🔊"}
          </button>
        </div>
      )}

      {status === "ready" && (
        <div
          className={"svr-tour-hint-chip" + (hintOpen ? " open" : "")}
          onClick={() => setHintOpen((v) => !v)}
        >
          <button
            className="svr-tour-icon-btn active"
            style={{ pointerEvents: "none" }}
            aria-hidden="true"
            tabIndex={-1}
          >
            ?
          </button>
          <div className="svr-tour-hint-text">
            Press "P" to toggle hotspot placement mode, then click a doorway
            or piece of gear to read its yaw/pitch (also logged to the
            console).
            {placementMode && (
              <div className="svr-tour-hint-placement">
                Placement mode ON
                {lastPlacement &&
                  ` — last click: yaw ${lastPlacement.yaw}deg, pitch ${lastPlacement.pitch}deg`}
              </div>
            )}
          </div>
        </div>
      )}

      {activeGear && (
        <div className="svr-tour-gear-panel">
          <div className="svr-tour-gear-panel__head">
            <span className="svr-tour-gear-badge">{activeGear.number}</span>
            <div className="svr-tour-gear-panel__titles">
              <div className="svr-tour-gear-panel__title">
                {activeGear.title}
              </div>
              <div className="svr-tour-gear-panel__kicker">Gear info</div>
            </div>
            <button
              onClick={closeGearPanel}
              className="svr-tour-gear-panel__close"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="svr-tour-gear-panel__body">
            <div className="svr-tour-gear-panel__desc">
              {activeGear.description}
            </div>

            {activeGear.course?.objectives?.length > 0 && (
              <>
                <div className="svr-tour-section-label">
                  What you'll learn
                </div>
                <ul className="svr-tour-checklist">
                  {activeGear.course.objectives.map((point, i) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="svr-tour-gear-panel__footer">
            <button
              onClick={goToNextMarker}
              className="svr-tour-btn svr-tour-btn-secondary"
            >
              Next →
            </button>
            {activeGear.course?.id && (
              <button
                onClick={() => {
                  // activeGear.id is the hotspot's marker id (e.g. "speaker",
                  // "daw-screens"), which is also the topic id in
                  // src/course/courseData.js — CoursePage reads this route
                  // state to open directly on the right topic instead of the
                  // default one.
                  navigate("/course", { state: { topicId: activeGear.id } });
                }}
                className="svr-tour-btn svr-tour-btn-primary"
              >
                Start course
              </button>
            )}
          </div>
        </div>
      )}

      {activeVolumeControl && (
        <div className="svr-tour-volume-panel">
          <div className="svr-tour-volume-panel__head">
            <span className="svr-tour-volume-panel__icon" aria-hidden="true">
              🔊
            </span>
            <div className="svr-tour-volume-panel__title">
              {activeVolumeControl.title || "Volume"}
            </div>
            <button
              onClick={closeVolumePanel}
              className="svr-tour-gear-panel__close"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="svr-tour-volume-panel__body">
            <div className="svr-tour-volume-panel__desc">
              Faint audio bleeding through from a session in the recording
              room. This slider only adjusts how audible it is
              here.
            </div>

            <div className="svr-tour-volume-row">
              <button
                onClick={toggleBleedMute}
                className="svr-tour-icon-btn active"
                aria-pressed={bleedMuted}
                aria-label={bleedMuted ? "Unmute recording room bleed" : "Mute recording room bleed"}
                title={bleedMuted ? "Unmute" : "Mute"}
              >
                {bleedMuted ? "🔇" : "🔊"}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={bleedVolume}
                onChange={handleBleedVolumeChange}
                disabled={bleedMuted}
                className="svr-tour-volume-slider"
                aria-label="Recording room bleed volume"
              />
              <div className="svr-tour-volume-val">
                {bleedMuted ? "Muted" : `${bleedVolume}%`}
              </div>
            </div>
          </div>
        </div>
      )}

      <DawWorkstationScreen open={activeModule} onClose={closeModulePanel} />
    </div>
  );
}

// Injected globally so the plain-HTML marker content (rendered by the
// markers plugin outside of React) can use these classes/keyframes, plus
// every other floating piece of tour chrome (toolbar, hint chip, gear
// panel, loading state). Built on the app's own --shell-* tokens (see
// index.css) so this screen follows the light/dark theme toggle instead of
// hardcoding its own black.
const tourStyles = `
  /* The virtual-tour plugin's own floating 3D doorway arrows are hidden —
     they drift across the screen as the camera turns. Doorways are instead
     rendered as regular hotspot markers (.hotspot-marker--door below),
     fixed at a specific yaw/pitch just like the gear hotspots. */
  .psv-virtual-tour-link {
    display: none !important;
  }
  .hotspot-marker {
    position: relative;
    width: 100%;
    height: 100%;
    /* The markers plugin only auto-applies cursor:pointer to markers that
       use its own tooltip/content options (see .psv-marker--has-tooltip
       and --has-content in @photo-sphere-viewer/markers-plugin/index.css);
       these hotspots render their own html instead, so none of the
       gear/door/interactive markers picked that up for free — set it
       explicitly here so every hotspot reads as clickable on hover. */
    cursor: pointer;
  }
  .hotspot-marker__ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 2px solid rgba(58, 255, 140, 0.85);
    animation: hotspot-pulse 2.2s ease-out infinite;
    transition: animation-duration 0.15s ease;
  }
  .hotspot-marker__ring--delayed {
    animation-delay: 1.1s;
  }
  .hotspot-marker__dot {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font: 700 13px/1 sans-serif;
    color: #04160a;
    background: radial-gradient(circle at 32% 28%, #7dffb8, #17c76a 70%);
    border: 2px solid rgba(255, 255, 255, 0.9);
    box-shadow:
      0 0 10px rgba(34, 255, 130, 0.75),
      inset 0 0 5px rgba(255, 255, 255, 0.5);
    animation: hotspot-breathe 2.2s ease-in-out infinite;
    transition: transform 0.15s ease, filter 0.15s ease;
  }
  /* Hover: scale + brighten the badge and speed up its pulse rings, on top
     of the pointer cursor above, so a hotspot visibly "wakes up" under the
     cursor before it's even clicked. */
  .hotspot-marker:hover .hotspot-marker__dot {
    transform: scale(1.15);
    filter: brightness(1.12);
  }
  .hotspot-marker:hover .hotspot-marker__ring {
    animation-duration: 1.3s;
  }
  /* Selected: applied via JS (see setSelectedMarkerEl/clearSelectedMarkerEl
     in PanoramaTour's render body) to whichever hotspot's panel is
     currently open — a one-shot "pop" plus a faster, brighter breathing
     glow so the active hotspot stays visually distinct from the rest while
     its panel is up, independent of the color-specific badge styling
     (gear/interactive green, door blue). */
  .svr-hotspot-selected {
    animation: hotspot-select-pop 0.35s ease-out;
  }
  .svr-hotspot-selected .hotspot-marker__dot {
    animation: hotspot-breathe-selected 1.1s ease-in-out infinite;
    filter: brightness(1.2) saturate(1.15);
  }
  .svr-hotspot-selected .hotspot-marker__ring {
    animation-duration: 1.3s;
  }
  @keyframes hotspot-pulse {
    0% {
      transform: scale(0.9);
      opacity: 0.8;
    }
    100% {
      transform: scale(2.4);
      opacity: 0;
    }
  }
  @keyframes hotspot-breathe {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.08);
    }
  }
  @keyframes hotspot-breathe-selected {
    0%, 100% {
      transform: scale(1.08);
    }
    50% {
      transform: scale(1.22);
    }
  }
  @keyframes hotspot-select-pop {
    0% {
      transform: scale(1);
    }
    45% {
      transform: scale(1.3);
    }
    100% {
      transform: scale(1);
    }
  }
  /* Door hotspots: same pulsing-badge shape as gear hotspots, in blue with
     a door icon instead of a number, so they read as "go to another room"
     at a glance. */
  .hotspot-marker__ring--door {
    border-color: rgba(90, 170, 255, 0.85);
  }
  .hotspot-marker__dot--door {
    font-size: 15px;
    background: radial-gradient(circle at 32% 28%, #9fd3ff, #2e7fe0 70%);
    box-shadow:
      0 0 10px rgba(70, 150, 255, 0.75),
      inset 0 0 5px rgba(255, 255, 255, 0.5);
  }
  /* Volume-control hotspots (roomsData.js volumeControls): same
     pulsing-badge shape again, in amber with a speaker icon, so they read
     as "adjust audio" rather than "gear info" or "go to another room". */
  .hotspot-marker__ring--volume {
    border-color: rgba(255, 176, 59, 0.85);
  }
  .hotspot-marker__dot--volume {
    font-size: 14px;
    background: radial-gradient(circle at 32% 28%, #ffd699, #e08a1e 70%);
    box-shadow:
      0 0 10px rgba(255, 176, 59, 0.75),
      inset 0 0 5px rgba(255, 255, 255, 0.5);
  }

  /* ---------- Shared chrome (glass) ---------- */
  .svr-tour-icon-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 1px solid transparent;
    background: transparent;
    color: var(--shell-text);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 14px;
    flex-shrink: 0;
    transition: background 0.15s ease;
  }
  .svr-tour-icon-btn:hover {
    background: var(--shell-panel-hover);
  }
  .svr-tour-icon-btn.active {
    background: var(--shell-panel);
    border-color: var(--shell-border);
  }

  /* ---------- Top toolbar: room name + progress dots + audio ---------- */
  .svr-tour-toolbar {
    position: absolute;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--shell-bg);
    border: 1px solid var(--shell-border);
    border-radius: 999px;
    padding: 6px;
    backdrop-filter: blur(14px);
    box-shadow: var(--shadow);
    max-width: calc(100vw - 32px);
    font-family: sans-serif;
    z-index: 5;
  }
  .svr-tour-room-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0 8px;
    min-width: 0;
  }
  .svr-tour-room-name {
    color: var(--shell-text);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.01em;
    white-space: nowrap;
  }
  .svr-tour-room-dots {
    display: flex;
    gap: 5px;
    margin-top: 4px;
  }
  .svr-tour-room-dot {
    width: 6px;
    height: 6px;
    padding: 0;
    border-radius: 50%;
    border: none;
    background: var(--shell-border);
    cursor: pointer;
    transition: background 0.15s ease, transform 0.15s ease;
  }
  .svr-tour-room-dot:hover {
    background: var(--shell-text-dim);
  }
  .svr-tour-room-dot.current {
    background: #22ff88;
    transform: scale(1.3);
  }
  .svr-tour-divider {
    width: 1px;
    align-self: stretch;
    margin: 4px 0;
    background: var(--shell-border-soft);
  }

  /* ---------- Binaural toggle: a labeled, colored pill instead of a
     same-shaped icon button with only a subtle shading difference, so
     on/off reads at a glance. */
  .svr-tour-binaural-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 12px 0 10px;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }
  .svr-tour-binaural-icon {
    font-size: 14px;
    line-height: 1;
    transition: filter 0.15s ease, opacity 0.15s ease;
  }
  .svr-tour-binaural-btn.on {
    background: #22ff55;
    border: 1px solid transparent;
    color: #0a0a0a;
  }
  .svr-tour-binaural-btn.on:hover {
    opacity: 0.9;
  }
  .svr-tour-binaural-btn.off {
    background: transparent;
    border: 1px solid var(--shell-border);
    color: var(--shell-text-dimmer);
  }
  .svr-tour-binaural-btn.off .svr-tour-binaural-icon {
    filter: grayscale(1);
    opacity: 0.6;
  }
  .svr-tour-binaural-btn.off:hover {
    background: var(--shell-panel-hover);
    color: var(--shell-text-dim);
  }

  /* ---------- Collapsible hint chip ---------- */
  .svr-tour-hint-chip {
    position: absolute;
    bottom: 16px;
    left: 16px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    background: var(--shell-bg);
    border: 1px solid var(--shell-border);
    border-radius: 12px;
    backdrop-filter: blur(14px);
    padding: 6px;
    max-width: 320px;
    cursor: pointer;
    font-family: sans-serif;
    z-index: 5;
  }
  .svr-tour-hint-chip.open {
    padding: 8px 12px 10px 8px;
    cursor: default;
  }
  .svr-tour-hint-text {
    display: none;
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--shell-text-dim);
    padding-top: 5px;
  }
  .svr-tour-hint-chip.open .svr-tour-hint-text {
    display: block;
  }
  .svr-tour-hint-placement {
    margin-top: 4px;
    color: #7cfc9a;
  }

  /* ---------- Gear info panel ---------- */
  .svr-tour-gear-panel {
    position: absolute;
    top: 74px;
    right: 16px;
    width: 320px;
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 110px);
    background: var(--shell-bg);
    border: 1px solid var(--shell-border);
    border-radius: 14px;
    backdrop-filter: blur(14px);
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: sans-serif;
    color: var(--shell-text);
    animation: svr-tour-slide-in 0.2s ease-out;
    z-index: 5;
  }
  @keyframes svr-tour-slide-in {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .svr-tour-gear-panel__head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px 12px;
    border-bottom: 1px solid var(--shell-border-soft);
  }
  .svr-tour-gear-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: radial-gradient(circle at 32% 28%, #7dffb8, #17c76a 70%);
    color: #04160a;
    font-size: 12px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .svr-tour-gear-panel__titles {
    min-width: 0;
    flex: 1;
  }
  .svr-tour-gear-panel__title {
    font-size: 14.5px;
    font-weight: 700;
    line-height: 1.2;
  }
  .svr-tour-gear-panel__kicker {
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--shell-text-dimmer);
    margin-top: 2px;
  }
  .svr-tour-gear-panel__close {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--shell-text-dim);
    font-size: 16px;
    cursor: pointer;
    flex-shrink: 0;
    line-height: 1;
  }
  .svr-tour-gear-panel__close:hover {
    background: var(--shell-panel-hover);
    color: var(--shell-text);
  }
  .svr-tour-gear-panel__body {
    padding: 14px 16px;
    overflow-y: auto;
  }
  .svr-tour-gear-panel__desc {
    font-size: 13px;
    line-height: 1.55;
    color: var(--shell-text-dim);
  }
  .svr-tour-section-label {
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--shell-text-dimmer);
    margin: 16px 0 8px;
  }
  .svr-tour-checklist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .svr-tour-checklist li {
    display: flex;
    gap: 8px;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--shell-text);
  }
  .svr-tour-checklist li::before {
    content: "\\2713";
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: rgba(34, 255, 130, 0.15);
    color: #22c76a;
    font-size: 10px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 2px;
  }
  .svr-tour-gear-panel__footer {
    display: flex;
    gap: 8px;
    padding: 12px 16px 14px;
    border-top: 1px solid var(--shell-border-soft);
  }
  .svr-tour-btn {
    flex: 1;
    padding: 9px 0;
    border-radius: 8px;
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
    text-align: center;
    transition: opacity 0.15s ease, background 0.15s ease;
  }
  .svr-tour-btn-primary {
    background: #22ff55;
    color: #0a0a0a;
    border: none;
  }
  .svr-tour-btn-primary:hover {
    opacity: 0.9;
  }
  .svr-tour-btn-secondary {
    background: var(--shell-panel);
    color: var(--shell-text);
    border: 1px solid var(--shell-border);
  }
  .svr-tour-btn-secondary:hover {
    background: var(--shell-panel-hover);
  }

  /* ---------- Volume-control panel (roomsData.js volumeControls) ------
     Same floating-glass treatment as the gear panel, but compact — just a
     description, a mute button, and a slider, no course footer. */
  .svr-tour-volume-panel {
    position: absolute;
    top: 74px;
    right: 16px;
    width: 300px;
    max-width: calc(100vw - 32px);
    background: var(--shell-bg);
    border: 1px solid var(--shell-border);
    border-radius: 14px;
    backdrop-filter: blur(14px);
    box-shadow: var(--shadow);
    font-family: sans-serif;
    color: var(--shell-text);
    animation: svr-tour-slide-in 0.2s ease-out;
    z-index: 5;
  }
  .svr-tour-volume-panel__head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px 12px;
    border-bottom: 1px solid var(--shell-border-soft);
  }
  .svr-tour-volume-panel__icon {
    font-size: 15px;
    flex-shrink: 0;
  }
  .svr-tour-volume-panel__title {
    flex: 1;
    min-width: 0;
    font-size: 14.5px;
    font-weight: 700;
    line-height: 1.2;
  }
  .svr-tour-volume-panel__body {
    padding: 14px 16px 16px;
  }
  .svr-tour-volume-panel__desc {
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--shell-text-dim);
    margin-bottom: 14px;
  }
  .svr-tour-volume-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .svr-tour-volume-slider {
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    border-radius: 999px;
    background: var(--shell-border);
    outline: none;
    cursor: pointer;
  }
  .svr-tour-volume-slider:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .svr-tour-volume-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 15px;
    height: 15px;
    border-radius: 50%;
    background: #ffb03b;
    box-shadow: 0 0 6px rgba(255, 176, 59, 0.65);
    cursor: pointer;
    border: 2px solid #0a0a0a;
  }
  .svr-tour-volume-slider::-moz-range-thumb {
    width: 15px;
    height: 15px;
    border-radius: 50%;
    background: #ffb03b;
    box-shadow: 0 0 6px rgba(255, 176, 59, 0.65);
    cursor: pointer;
    border: 2px solid #0a0a0a;
  }
  .svr-tour-volume-val {
    min-width: 44px;
    text-align: right;
    font-size: 12px;
    font-weight: 700;
    color: var(--shell-text-dim);
    flex-shrink: 0;
  }

  /* ---------- Loading / error state ---------- */
  .svr-tour-loading {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    font-family: sans-serif;
    background: var(--shell-page-bg);
  }
  .svr-tour-spinner {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 3px solid var(--shell-border);
    border-top-color: #22ff88;
    animation: svr-tour-spin 0.9s linear infinite;
  }
  @keyframes svr-tour-spin {
    to {
      transform: rotate(360deg);
    }
  }
  .svr-tour-loading-text {
    font-size: 13px;
    color: var(--shell-text-dim);
  }
  .svr-tour-error-text {
    color: #f66;
  }
`;

export default PanoramaTour;
