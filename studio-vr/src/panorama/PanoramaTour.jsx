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
import SpeakerListeningLab from "./SpeakerListeningLab";
import MixingConsoleLab from "./MixingConsoleLab";
import SoundCardLab from "./SoundCardLab";
import PatchbayLab from "./PatchbayLab";
import PreampRackLab from "./PreampRackLab";
import LfEmitterLab from "./LfEmitterLab";
import DiffuserPanelLab from "./DiffuserPanelLab";
import StudioHotspotsPanel from "./StudioHotspotsPanel";
// Only used here to build the "Try Game mode" tour step's correct-order
// hint (see tourStepsForCard below) — StudioHotspotsPanel already imports
// this same helper independently for its own device list.
import { buildDeviceList } from "./hotspotDevices";
// Component is HotspotKnowledgeCheck; the file itself is still named
// HotspotPrecheck.jsx — see the note at the top of that file.
import HotspotKnowledgeCheck from "./HotspotPrecheck";
import { TOPICS } from "../course/courseData";
import OnboardingTour from "../tour/OnboardingTour";
import { TOUR_STEPS } from "../tour/tourSteps";
import "./panoramaTour.css";

// First-time-visitor onboarding tour (see src/tour/). One flag for the
// whole tour, not per-room/per-topic — walking through the Studio's rig
// once is enough to have "seen" the tour, so this never re-triggers itself
// on later visits or room changes. A visitor can still restart it any time
// via the toolbar's replay button (see handleTourReplay below).
const TOUR_STORAGE_KEY = "studioVrTourCompleted";
function hasCompletedTour() {
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY) === "true";
  } catch (e) {
    return false;
  }
}
function markTourCompleted() {
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, "true");
  } catch (e) {
    /* storage unavailable */
  }
}

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
// about this piece of gear", and the "interactive" variant passed below
// (orange ring/dot, see panoramaTour.css) reinforces the same distinction
// visually against the green numbered gear badges. A room can carry more
// than one of these pointing at the same module (e.g. the DAW's
// monitor-height and desk-height hotspots), so each also carries its own
// `icon` (see that field on roomsData.js interactiveMarkers entries) rather
// than always sharing one glyph per `type` — that's what keeps two hotspots
// for the same device from rendering as visually identical, unlabeled
// duplicates.
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
          size: { width: 26, height: 26 },
          anchor: "center center",
          // Zoom level applied by markers.gotoMarker() so selecting a hotspot
          // feels like walking up to it rather than just glancing over.
          zoomLvl: marker.zoomLvl ?? 60,
          // Hover tooltip, same pattern as the door/volume hotspots below —
          // the library auto-flips it above/below the icon depending on
          // available screen space, which can read as "the info card jumps
          // around" near screen edges, but it gives a quick name-on-hover
          // before committing to a click. The full write-up still only shows
          // in the fixed panel (.svr-tour-gear-panel) opened on click.
          tooltip: {
            content: marker.title,
            trigger: "hover",
          },
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
          size: { width: 26, height: 26 },
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
        html: interactiveMarkerHtml(
          marker.icon ?? (marker.type === "daw" ? "🖥" : "⚡"),
          "interactive",
        ),
        size: { width: 26, height: 26 },
        anchor: "center center",
        zoomLvl: marker.zoomLvl ?? 60,
        tooltip: {
          content: marker.title,
          trigger: "hover",
        },
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
        size: { width: 26, height: 26 },
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
  // Same purpose as goToMarkerRef, for interactive hotspots (e.g. the DAW
  // workstation) — exposed so the left-docked StudioHotspotsPanel can drive
  // real navigation for those too, not just plain gear hotspots.
  const goToInteractiveMarkerRef = useRef(null);
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
  // Same stale-closure fix as activeModuleRef, for the mount-only
  // onNodeChanged handler below, which needs to read the Studio's *current*
  // Game/Classic mode (reported live via handleGameModeChange, from
  // StudioHotspotsPanel's onGameModeChange — see that effect's comment) to
  // decide whether re-arriving at the Studio should re-lock the scene.
  // Defaults true (Game mode) so behavior is unchanged — re-lock on
  // re-entry — until the panel has actually reported the room's real mode.
  const studioGameModeRef = useRef(true);

  const [currentRoomName, setCurrentRoomName] = useState("");
  const [currentRoomId, setCurrentRoomId] = useState(START_NODE_ID);
  const [activeGear, setActiveGear] = useState(null);
  // Whether the currently-open gear panel (activeGear) is showing the
  // optional 5-question "Test your knowledge" quiz (HotspotKnowledgeCheck,
  // exported from HotspotPrecheck.jsx) instead of its "choose how to start"
  // view. Selecting a hotspot always opens straight to the choice screen
  // first — this only flips true once the student clicks "Test your
  // knowledge" there, and flips back on skip/close/picking a different
  // hotspot. See the gear-panel body below for where it's set. Never used
  // for the Speakers hotspot, which offers its own "Listening Lab" instead
  // — see listeningLabOpen just below.
  const [quizActive, setQuizActive] = useState(false);
  // Whether the Speakers hotspot's "Listening Lab" (SpeakerListeningLab,
  // ./SpeakerListeningLab.jsx) is currently open — the speaker-specific
  // replacement for the generic "Test your knowledge" quiz above (see the
  // gear-panel body below, and the design/speakek-listening-lab.html this
  // was ported from). Kept as its own flag rather than folded into
  // quizActive since only the "speaker" hotspot ever offers this — every
  // other hotspot keeps the ordinary quiz — and because the lab renders as
  // its own full-screen overlay instead of swapping out the compact gear
  // panel the way HotspotKnowledgeCheck does. Reset to false everywhere
  // quizActive already gets reset (room changes, closing the panel,
  // selecting a different hotspot, etc.) so it can't stay open across those.
  const [listeningLabOpen, setListeningLabOpen] = useState(false);
  // Same idea as listeningLabOpen just above, but for the Mixing Console and
  // Sound Card hotspots' own labs (MixingConsoleLab.jsx / SoundCardLab.jsx,
  // ported from design/mixing-console-lab.html and design/sound-card-lab.html
  // respectively) instead of the Speakers' Listening Lab. Kept as their own
  // flags rather than folded into listeningLabOpen since each renders a
  // different component and only its own hotspot ever offers it — every
  // other hotspot still keeps the ordinary quiz. Reset everywhere
  // listeningLabOpen already gets reset, for the same reason.
  const [mixingConsoleLabOpen, setMixingConsoleLabOpen] = useState(false);
  const [soundCardLabOpen, setSoundCardLabOpen] = useState(false);
  // Same idea again, for the Patch Bay, Preamp Rack, LF Emitter, and
  // Diffuser Panel hotspots' own labs (PatchbayLab.jsx / PreampRackLab.jsx /
  // LfEmitterLab.jsx / DiffuserPanelLab.jsx, ported from
  // design/patchbay-lab.html, design/preamp-rack-lab.html,
  // design/lf-emitter-lab.html, and design/diffuser-panel-lab.html
  // respectively). Reset everywhere every other *LabOpen flag is reset, for
  // the same reason.
  const [patchbayLabOpen, setPatchbayLabOpen] = useState(false);
  const [preampRackLabOpen, setPreampRackLabOpen] = useState(false);
  const [lfEmitterLabOpen, setLfEmitterLabOpen] = useState(false);
  const [diffuserPanelLabOpen, setDiffuserPanelLabOpen] = useState(false);
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
  // Gates the entire scene (viewer, doors, gear/interactive/volume hotspots
  // and their panels) behind the Studio's power-up game, which lives in the
  // side panel — see StudioHotspotsPanel's onPoweredChange. Starts locked;
  // StudioHotspotsPanel flips this true live once every device in the
  // Studio's chain is "on" (Game or Classic mode, either way — see that
  // component), and false again the moment a device gets switched back off.
  // Only the Studio room has a chain/panel today, so this is only ever
  // driven from there — it simply carries over unchanged while the visitor
  // is elsewhere (e.g. the Recording Room), and gets reset to locked below
  // every time the Studio is (re-)entered, fresh load included.
  const [poweredOn, setPoweredOn] = useState(false);

  // First-time-visitor onboarding tour state (see src/tour/). `tourActive`
  // is whether the guide card is currently showing at all; `tourStepIndex`
  // is which step (of the dynamically-built tourStepsForCard, see below)
  // it's on. `selectedHotspotId` tracks the "select a hotspot" mandatory
  // step — it's only ever set inside onSelectMarker below, on a genuine
  // marker click in the 3D scene (never by handlePanelSelectDevice, i.e.
  // never by clicking a device row in the side panel), so that step can't
  // be satisfied by the side-panel shortcut the tour specifically doesn't
  // want used here; it holds the specific device id clicked (not just a
  // boolean) so the step can require hotspot #1 specifically once
  // gameModeToggledOn is true (see tourStepsForCard). `gameModeToggledOn`
  // records whether the visitor flipped Game mode on during the mandatory
  // "Try Game mode" step — see handleGameModeChange — which is what decides
  // whether the extra "power the rig back up" step gets inserted and
  // whether "select a hotspot" narrows to hotspot #1 (in practice, always,
  // since that step can't be passed without flipping the switch).
  const [tourActive, setTourActive] = useState(false);
  const [tourStepIndex, setTourStepIndex] = useState(0);
  const [selectedHotspotId, setSelectedHotspotId] = useState(null);
  const [gameModeToggledOn, setGameModeToggledOn] = useState(false);

  // Forces the master output off for as long as the scene is locked, on top
  // of whatever the visitor's own mute preference (audioMuted) is — the
  // ambient bed and any room bleed both auto-start on room entry via
  // activateRoomAudio() below regardless of lock state, so without this
  // they'd stay audible even though everything is grayed out and silent to
  // interaction. setMuted() drives a single output-stage gain shared by the
  // ambient bed, room bleed, and hotspot narration (see spatialAudioEngine.js)
  // — the DAW workstation deliberately opts OUT of this shared stage (see
  // its own `independent: true` createStudioSpeakerBus() call) since it's a
  // focused work surface with its own transport/mute controls, not part of
  // this ambient mix, so this call never reaches in and silences it.
  // Restores to the visitor's actual preference the moment the scene
  // unlocks — this never touches audioMuted itself, only the engine.
  useEffect(() => {
    setMuted(audioMuted || !poweredOn);
  }, [audioMuted, poweredOn]);

  // Auto-starts the onboarding tour the first time this screen ever
  // reaches "ready" for a visitor who hasn't completed (or skipped) it
  // before. `status` flips to "ready" on every room change (see
  // onNodeChanged below), not just the very first load, so this is guarded
  // on `!tourActive` too — otherwise walking through a doorway mid-tour
  // would reset it back to step 1. Once the tour is completed or skipped,
  // markTourCompleted() persists that immediately, so this simply never
  // fires again on later visits.
  useEffect(() => {
    if (status === "ready" && !tourActive && !hasCompletedTour()) {
      setTourActive(true);
      setTourStepIndex(0);
      setSelectedHotspotId(null);
      setGameModeToggledOn(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

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
      // Initial camera direction the very first panorama (the studio room,
      // per START_NODE_ID) loads facing — yaw 61.6, pitch -10.8, for the
      // first-arrival reveal.
      defaultYaw: "61.6deg",
      defaultPitch: "-10.8deg",
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
      maxFov: 113,
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
      setQuizActive(false);
      setListeningLabOpen(false);
      setMixingConsoleLabOpen(false);
      setSoundCardLabOpen(false);
      setPatchbayLabOpen(false);
      setPreampRackLabOpen(false);
      setLfEmitterLabOpen(false);
      setDiffuserPanelLabOpen(false);
      setActiveModule(null);
      setActiveVolumeControl(null);
      latestRequestRef.current = null;
      clearSelectedMarkerEl();
      setStatus("ready");

      // Every (re-)arrival at the Studio — the fresh page load included,
      // since the virtual-tour plugin fires node-changed for the initial
      // node too — re-locks the scene *while the room is in Game mode*, so
      // powering up the shuffle challenge isn't a one-time unlock for the
      // whole session: walking to the Recording Room and back is exactly
      // how a visitor would trigger this mid-session.
      //
      // In Classic mode (game mode off) this is deliberately skipped: once
      // the rig is powered up in Classic mode, it's meant to stay on
      // through every scenario — including this same walk to the Recording
      // Room and back — until the visitor either logs out (which unmounts
      // this whole screen, so poweredOn resets on its own next visit) or
      // explicitly hits Power down in the panel (which already reports
      // itself through here via onPoweredChange/allDevicesOn, no special
      // case needed). See studioGameModeRef's own comment for how this
      // stays live despite onNodeChanged being set up once on mount.
      if (e.node.id === START_NODE_ID && studioGameModeRef.current) {
        setPoweredOn(false);
      }

      // Walking through a doorway should land the student facing into the
      // new room with the door they just came through behind them, not
      // wherever the rotation-during-transition (transitionOptions.rotation)
      // happened to leave the camera pointed — that only faces the door in
      // the *origin* room's photo, which has no relation to this room's
      // layout once the texture swaps. The origin room's link entry for
      // this destination carries the calibrated arrivalYaw/arrivalPitch for
      // exactly this doorway, so snap to it instantly (no animation) before
      // the fade-in reveals the new panorama, so the "already standing
      // inside, door behind you" framing is there from the first frame
      // rather than a visible extra turn after arriving.
      const fromNodeId = e.data?.fromNode?.id;
      if (fromNodeId) {
        const originRoom = ROOMS.find((r) => r.id === fromNodeId);
        const arrivalLink = originRoom?.links.find(
          (link) => link.nodeId === e.node.id,
        );
        if (
          arrivalLink &&
          typeof arrivalLink.arrivalYaw === "number" &&
          typeof arrivalLink.arrivalPitch === "number"
        ) {
          viewer.rotate({
            yaw: deg(arrivalLink.arrivalYaw),
            pitch: deg(arrivalLink.arrivalPitch),
          });
        }
      }

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
        // Selecting a hotspot always opens straight to its "choose how to
        // start" panel (Test your knowledge / Start course) — the optional
        // quiz is a detour the student opts into from there, not something
        // that gates anything. See the gear-panel body below.
        setActiveGear(marker.data);
        setQuizActive(false);
        setListeningLabOpen(false);
        setMixingConsoleLabOpen(false);
        setSoundCardLabOpen(false);
        setPatchbayLabOpen(false);
        setPreampRackLabOpen(false);
        setLfEmitterLabOpen(false);
        setDiffuserPanelLabOpen(false);
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
        setQuizActive(false);
        setListeningLabOpen(false);
        setMixingConsoleLabOpen(false);
        setSoundCardLabOpen(false);
        setPatchbayLabOpen(false);
        setPreampRackLabOpen(false);
        setLfEmitterLabOpen(false);
        setDiffuserPanelLabOpen(false);
        setActiveVolumeControl(null);
        setActiveModule(data);
        setSelectedMarkerEl(markerId);
      });
    };
    goToInteractiveMarkerRef.current = goToInteractiveMarker;

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
      setQuizActive(false);
      setListeningLabOpen(false);
      setMixingConsoleLabOpen(false);
      setSoundCardLabOpen(false);
      setPatchbayLabOpen(false);
      setPreampRackLabOpen(false);
      setLfEmitterLabOpen(false);
      setDiffuserPanelLabOpen(false);
      setActiveModule(null);
      setActiveVolumeControl(data);
      setSelectedMarkerEl(markerId);
    };

    const onSelectMarker = (e) => {
      if (e.marker.data?.kind === "door") {
        goToRoom(e.marker.data.nodeId);
      } else if (e.marker.data?.kind === "interactive") {
        // Records which device the onboarding tour's "select a hotspot"
        // step actually got clicked directly in the scene — this event
        // only fires from a genuine click on a marker's own rendered icon
        // (see the markers-plugin source), never from gotoMarker()'s camera
        // animation, so this can't be satisfied by handlePanelSelectDevice
        // routing a side-panel click through goToInteractiveMarker instead.
        setSelectedHotspotId(e.marker.id);
        goToInteractiveMarker(e.marker.id, e.marker.data);
      } else if (e.marker.data?.kind === "volume") {
        goToVolumeMarker(e.marker.id, e.marker.data);
      } else {
        // Same "clicked directly in the scene" recording as the
        // "interactive" branch above, for ordinary gear hotspots — this is
        // also how the tour's "select a hotspot" step recognizes hotspot #1
        // specifically once gameModeToggledOn is true (see
        // tourRequiredHotspotId in the derived state below).
        setSelectedHotspotId(e.marker.id);
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
  // Works the same whether the choice screen, the quiz, or the Listening
  // Lab is showing — either way, from the student's point of view this
  // hotspot is closing.
  const closeGearPanel = () => {
    stopHotspotNarration();
    setActiveGear(null);
    setQuizActive(false);
    setListeningLabOpen(false);
    setMixingConsoleLabOpen(false);
    setSoundCardLabOpen(false);
    setPatchbayLabOpen(false);
    setPreampRackLabOpen(false);
    setLfEmitterLabOpen(false);
    setDiffuserPanelLabOpen(false);
    clearSelectedMarkerEl();
    viewerRef.current?.animate({ zoom: REST_ZOOM_LVL, speed: "10rpm" });
  };

  // Steps back from whichever gear-hotspot lab is currently open (Listening
  // Lab, Mixing Console Lab, Sound Card Lab, Patchbay Lab, Preamp Rack Lab,
  // LF Emitter Lab, or Diffuser Panel Lab) to that hotspot's own "Choose how
  // to start" overview screen, without closing the hotspot itself — same
  // idea as HotspotKnowledgeCheck's onBackToOverview (setQuizActive(false))
  // just below, shared across all seven *LabOpen flags since only one of
  // them (or the quiz) is ever open at a time. activeGear/the camera/the
  // selected marker are left alone; only closeGearPanel above tears those
  // down, for the "×" close button and the "Next" hotspot flow.
  const backToGearOverview = () => {
    setQuizActive(false);
    setListeningLabOpen(false);
    setMixingConsoleLabOpen(false);
    setSoundCardLabOpen(false);
    setPatchbayLabOpen(false);
    setPreampRackLabOpen(false);
    setLfEmitterLabOpen(false);
    setDiffuserPanelLabOpen(false);
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
  //
  // Only flips the visitor's own preference — the effect above is what
  // actually calls setMuted(), combining this with the scene's lock state,
  // so this can't be read via isMuted() here (that may currently be true
  // just because the scene is locked, not because the visitor chose mute).
  // The toolbar button itself is unreachable while locked anyway (see
  // svr-tour-locked), so this only ever fires while poweredOn is true.
  const toggleMasterMute = () => {
    setAudioMuted((prev) => !prev);
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
    setQuizActive(false);
    setListeningLabOpen(false);
    setMixingConsoleLabOpen(false);
    setSoundCardLabOpen(false);
    setPatchbayLabOpen(false);
    setPreampRackLabOpen(false);
    setLfEmitterLabOpen(false);
    setDiffuserPanelLabOpen(false);
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

  // Wired into StudioHotspotsPanel (the left-docked "Hotspots" panel) below
  // — clicking a device row there should behave exactly like clicking its
  // marker directly in the scene, just routed through the same
  // goToMarker/goToInteractiveMarker paths instead of a marker click event.
  //
  // Guarded on poweredOn: this drives the camera and opens gear/interactive
  // panels via direct function calls, not a real DOM click on the (CSS
  // pointer-events: none, see svr-tour-locked) viewer — so without this
  // check, a visitor could still "walk over" to a hotspot and pop its panel
  // open from the panel while the rest of the scene reads as locked, which
  // would defeat the point of gating it behind the power-up game.
  const handlePanelSelectDevice = (kind, id) => {
    if (!poweredOn) return;
    // Deliberately does NOT record this as satisfying the onboarding tour's
    // "select a hotspot" step — that step now specifically asks the visitor
    // to click a device directly in the studio scene (see onSelectMarker
    // above, the only place selectedHotspotId gets set), not to use this
    // side-panel shortcut. The panel click still works normally otherwise —
    // it just doesn't count toward the tour.
    if (kind === "interactive") {
      const marker = markersRef.current?.getMarker(id);
      if (marker) goToInteractiveMarkerRef.current?.(id, marker.data);
    } else {
      goToMarkerRef.current?.(id);
    }
  };

  // Reports the Studio's actual current Game/Classic mode from
  // StudioHotspotsPanel — fired on every change (initial load, per-room
  // switch, and manual toggles; see that effect's own comment). Two
  // separate concerns live here:
  //
  // 1. studioGameModeRef always mirrors the live value, so onNodeChanged
  //    (mount-only, can't read state directly — see that ref's comment)
  //    knows whether to re-lock the scene on Studio re-entry.
  //
  // 2. gameModeToggledOn only cares about flips to Game mode ON, and only
  //    while the tour is actually on the "Try Game mode" step — guarding on
  //    currentTourStep here (rather than just tourActive) means a visitor
  //    who's already moved past that step can't retroactively change which
  //    steps get inserted ahead of where they currently are by fiddling
  //    with the switch later on. Once set, this is never reset back to
  //    false by toggling off again — "did they try it" is a one-time fact
  //    for the rest of this tour, not a live reflection of the switch's
  //    current position (see tourStepsForCard).
  const handleGameModeChange = (isOn) => {
    studioGameModeRef.current = isOn;
    if (isOn && currentTourStep?.id === "game-mode") setGameModeToggledOn(true);
  };

  // Advances the onboarding tour to its next step — only ever called by the
  // tour card's own "Next"/"Continue" button, which is itself disabled for
  // a pending mandatory step (see tourCanContinue below), so this never
  // needs to re-check that here.
  const handleTourAdvance = () => {
    setTourStepIndex((i) => Math.min(i + 1, tourStepsForCard.length - 1));
  };

  // Dismisses the tour entirely (the card's "Skip tour" link) and marks it
  // completed so it doesn't auto-start again on a later visit or room
  // change. Deliberately always available, even mid-mandatory-step — a
  // guided tour that traps the visitor until they perform an action isn't
  // a good look, mandatory here only means "the Continue button won't
  // enable on its own", not "there's no way out".
  const handleTourSkip = () => {
    setTourActive(false);
    markTourCompleted();
  };

  // Ends the tour from its own last step's "Finish tour" button (see
  // OnboardingTour's `isLast` branch) — functionally identical to
  // handleTourSkip above (same "dismiss and mark completed" behavior), kept
  // as its own named handler because at this point it isn't a skip: the
  // visitor has been through every step, and this is the tour's own
  // intended finish line for anyone who doesn't go on to click "Start
  // course" itself (which ends it too, via finishTourIfActive below).
  const handleTourFinish = () => {
    setTourActive(false);
    markTourCompleted();
  };

  // Restarts the tour from the toolbar's replay button, any time — most
  // useful for a visitor who skipped it earlier (or completed it long ago)
  // and wants a refresher.
  const handleTourReplay = () => {
    setSelectedHotspotId(null);
    setGameModeToggledOn(false);
    setTourStepIndex(0);
    setTourActive(true);
  };

  // Called from every "Start course" click site below (the gear panel's
  // choice card, and the quiz results screen's own button) — starting the
  // course is the natural finish line for the tour regardless of which
  // step it's currently on, so this always ends it rather than only doing
  // so if the visitor happened to reach the final step first.
  const finishTourIfActive = () => {
    if (tourActive) {
      setTourActive(false);
      markTourCompleted();
    }
  };

  const currentRoom = ROOMS.find((room) => room.id === currentRoomId);
  // The topic behind the currently-open gear hotspot, if any — used to look
  // up this topic's 5-question assessment bank for the optional "Test your
  // knowledge" quiz. Only ready topics have an assessment; everything else
  // (locked/"coming soon" gear) simply won't show the quiz option, and the
  // choice panel below falls back to "Start course" alone.
  const activeTopic = activeGear ? TOPICS.find((t) => t.id === activeGear.id) : null;
  const quizQuestions = activeTopic?.assessment?.questions ?? [];
  // Maps a gear hotspot id to its own hands-on lab's choice-card content and
  // opener, for the three hotspots that swap out the generic quiz (see the
  // choice panel body below). Defined here (not at module scope) since each
  // `onOpen` needs to close over this render's state setters.
  const GEAR_LAB = {
    speaker: {
      icon: "🎧",
      title: "Listening Lab",
      subtitle: "Three quick ear-training experiments — optional",
      onOpen: () => setListeningLabOpen(true),
    },
    "mixing-console": {
      icon: "🎚️",
      title: "Mixing Console Lab",
      subtitle: "Two quick mixing experiments — optional",
      onOpen: () => setMixingConsoleLabOpen(true),
    },
    "sound-card": {
      icon: "🔌",
      title: "Sound Card Lab",
      subtitle: "Two quick conversion experiments — optional",
      onOpen: () => setSoundCardLabOpen(true),
    },
    "patch-bay": {
      icon: "🔀",
      title: "Patchbay Lab",
      subtitle: "Two quick routing experiments — optional",
      onOpen: () => setPatchbayLabOpen(true),
    },
    "preamp-rack": {
      icon: "🎙️",
      title: "Preamp Rack Lab",
      subtitle: "Two quick gain-staging experiments — optional",
      onOpen: () => setPreampRackLabOpen(true),
    },
    "lf-emitter": {
      icon: "🔊",
      title: "LF Emitter Lab",
      subtitle: "Two quick low-end experiments — optional",
      onOpen: () => setLfEmitterLabOpen(true),
    },
    "diffuser-panel": {
      icon: "🪩",
      title: "Diffuser Panel Lab",
      subtitle: "Two quick echo experiments — optional",
      onOpen: () => setDiffuserPanelLabOpen(true),
    },
  };
  // What the mute button should actually show — audioMuted is only the
  // visitor's own preference, but the room reads as (and is) silent
  // whenever it's locked too (see the setMuted effect above), so the icon
  // should reflect that combined, real state rather than just the
  // preference alone.
  const effectiveAudioMuted = audioMuted || !poweredOn;

  // Onboarding tour derived state — see src/tour/tourSteps.js for the step
  // script and the state block above for tourActive/tourStepIndex/
  // selectedHotspotId/gameModeToggledOn. Kept here, alongside the rest of
  // this component's derived render values, since every mandatory step's
  // "has this actually happened yet" check reads state that only
  // PanoramaTour has — OnboardingTour itself stays a dumb display
  // component driven entirely by the `steps`/`canContinue` props built here.

  // The "Bring the rig back online" step's correct power-on order, spelled
  // out for the tour card (as a real ordered list — see hintSteps below,
  // rendered by OnboardingTour's .svr-onb-tour__hint-list — rather than one
  // dense arrow-joined sentence) so resetting the rig to all-off when Game
  // mode gets switched on (see toggleGameMode in StudioHotspotsPanel — Game
  // mode always powers the rig down now, tour step or not) doesn't leave
  // the visitor guessing blind — Game mode's own hint button only reveals
  // one station at a time, which
  // is deliberately slow for a real playthrough but not what a brief tour
  // detour needs. Built fresh per room from the same device list
  // StudioHotspotsPanel itself uses, so it can't drift out of sync with the
  // actual signal chain.
  const gameModeSequenceDevices = buildDeviceList(currentRoom).map((d) => d.title);
  // "Hotspot #1" for whichever room the tour is running in — the numbered
  // badge seen in the scene is assigned by iterating each room's raw
  // `markers` array in order (see buildNodes()'s hotspotNumber counter
  // above), so the first entry of that array is always the one labeled
  // "1". Used only once the visitor has toggled Game mode on (see
  // tourRequiredHotspotId below) — that branch asks for hotspot #1
  // specifically instead of "any device".
  const firstHotspot = currentRoom?.markers?.[0] ?? null;
  const tourRequiredHotspotId = gameModeToggledOn && firstHotspot ? firstHotspot.id : null;
  const tourRequiredHotspotLabel = firstHotspot
    ? `hotspot #1 (${firstHotspot.title})`
    : "hotspot #1";

  // The actual per-visit step sequence handed to the tour card — branches
  // on gameModeToggledOn (see tourSteps.js's own header comment for the
  // full rationale). Once toggled on, "power-up-sequence" is inserted right
  // after "game-mode" and carries the correct-order hint (deliberately NOT
  // shown on "game-mode" itself — see that step's comment in tourSteps.js),
  // and "select-hotspot" narrows to hotspot #1 specifically — and since the
  // "game-mode" step can't be passed without flipping the switch (it's
  // mandatory), this is what every visitor sees by the time they reach
  // those later steps. Still read off the live state rather than assumed,
  // though: at earlier steps (e.g. still on "power-up") gameModeToggledOn
  // is genuinely still false, so this array is shorter until it flips, and
  // a room with no markers at all (tourRequiredHotspotId null) still falls
  // back to the plain, unnarrowed "select-hotspot" copy below. Built fresh
  // every render (a handful of small objects, not worth memoizing) rather
  // than mutating TOUR_STEPS itself, which stays plain, static,
  // per-room-agnostic copy.
  const tourStepsById = Object.fromEntries(TOUR_STEPS.map((s) => [s.id, s]));
  const tourStepsForCard = [
    tourStepsById["power-up"],
    tourStepsById["game-mode"],
    ...(gameModeToggledOn
      ? [
          {
            ...tourStepsById["power-up-sequence"],
            hint: gameModeSequenceDevices.length ? "Correct power-on order" : undefined,
            hintSteps: gameModeSequenceDevices.length ? gameModeSequenceDevices : undefined,
          },
        ]
      : []),
    tourRequiredHotspotId
      ? {
          ...tourStepsById["select-hotspot"],
          body: `Click ${tourRequiredHotspotLabel} — the one marked "1" — directly in the studio to walk the camera over to it and open its info panel.`,
          pendingHint: `Click ${tourRequiredHotspotLabel} in the studio scene to continue.`,
        }
      : tourStepsById["select-hotspot"],
    tourStepsById["test-knowledge"],
    tourStepsById["start-course"],
  ];

  const currentTourStep = tourActive ? tourStepsForCard[tourStepIndex] : null;
  const tourCanContinue = currentTourStep
    ? currentTourStep.id === "power-up" || currentTourStep.id === "power-up-sequence"
      ? poweredOn
      : currentTourStep.id === "game-mode"
        ? gameModeToggledOn
        : currentTourStep.id === "select-hotspot"
          ? tourRequiredHotspotId
            ? selectedHotspotId === tourRequiredHotspotId
            : selectedHotspotId !== null
          : currentTourStep.id === "start-course"
            ? // Never "done" via this flag — the last step has no Continue
              // button (see OnboardingTour's `isLast` branch), so this only
              // controls whether its pendingHint text shows, not any button
              // state. The real completion is finishTourIfActive() firing
              // when the actual "Start course" button is clicked.
              false
            : true
    : true;
  // Which real element the current step should glow (see .svr-tour-glow in
  // src/tour/onboardingTour.css) — null outside the tour or on a step that
  // doesn't point at the side panel at all. "power-button" is specifically
  // the "Power up in order" button rather than the whole rail — with Game
  // mode locked off for this step (see tourForceClassicMode below), that
  // button is the one and only thing on the panel this step actually asks
  // the visitor to click, so the glow points at it directly instead of the
  // panel as a whole. "game-mode" points at the mode switch itself, since
  // flipping it is the one action that step asks for. "power-up-sequence"
  // points at "devices" instead — the device grid/list at the bottom of the
  // panel, where the actual power-on clicks happen once Game mode is
  // already on — rather than the switch above it, which was already used a
  // step ago and isn't the target of this one. "select-hotspot" no longer
  // highlights anything on this panel at all — see the tourGlowMarkerId
  // effect below, which glows the actual hotspot marker in the scene
  // instead, since that step now asks the visitor to click directly in the
  // studio rather than use this panel.
  const tourPanelHighlight = currentTourStep
    ? currentTourStep.id === "power-up"
      ? "power-button"
      : currentTourStep.id === "game-mode"
        ? "mode"
        : currentTourStep.id === "power-up-sequence"
          ? "devices"
          : null
    : null;
  // Locks StudioHotspotsPanel's Game/Classic switch to Classic mode for
  // exactly the "power up the rig" step — see tourForceClassicMode's own
  // comment in that component for why (Game mode defaults on and would
  // turn this mandatory first step into an unintroduced guessing game).
  const tourForceClassicMode = tourPanelHighlight === "power-button";
  // The one hotspot marker the "select-hotspot" step wants the visitor to
  // click directly in the scene, or null the rest of the time.
  const tourGlowMarkerId =
    currentTourStep?.id === "select-hotspot" ? tourRequiredHotspotId : null;

  // Applies the same `.svr-tour-glow` class (see onboardingTour.css) used
  // everywhere else in this tour to the actual marker element for
  // tourGlowMarkerId, so the guide card comes to rest right beside the real
  // hotspot in the panorama instead of a side-panel row — this step now
  // asks the visitor to find it in the studio, not in a list. Marker DOM
  // elements are owned by the photo-sphere-viewer markers plugin, not
  // React (same as setSelectedMarkerEl above), so this reaches into them
  // directly rather than through props/className. Polls briefly rather
  // than measuring once, in case the target marker hasn't rendered yet the
  // instant this step becomes current (e.g. right after a room change).
  useEffect(() => {
    if (!tourGlowMarkerId) return undefined;
    let glowedEl = null;
    const applyGlow = () => {
      const marker = markersRef.current?.getMarker(tourGlowMarkerId);
      const el = marker?.domElement?.querySelector(".hotspot-marker");
      if (el && el !== glowedEl) {
        glowedEl?.classList.remove("svr-tour-glow");
        el.classList.add("svr-tour-glow");
        glowedEl = el;
      }
    };
    applyGlow();
    const id = setInterval(applyGlow, 150);
    return () => {
      clearInterval(id);
      glowedEl?.classList.remove("svr-tour-glow");
    };
  }, [tourGlowMarkerId, currentRoomId]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* Everything below except StudioHotspotsPanel lives inside this
          wrapper, which is what actually gets grayed out / locked down —
          the panorama viewer itself (drag-to-look, scroll-to-zoom, all
          markers) plus every panel it can open. `pointer-events: none` when
          locked (see panoramaTour.css) blocks clicks, drags, and wheel
          input on everything inside, including the photo-sphere-viewer's
          own internal handlers, since CSS pointer-events on an ancestor
          suppresses hit-testing for its descendants too unless a descendant
          explicitly opts back in — nothing here does. The side panel stays
          outside this wrapper on purpose: it's the one thing that has to
          stay interactive so the visitor can actually power the rig up in
          the first place. */}
      <div
        className={"svr-tour-lockable" + (poweredOn ? "" : " svr-tour-locked")}
      >
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
              {/* With more than one room, this labeled segmented toggle
                  replaces both the plain room-name text and the old
                  unlabeled 6px dots (svr-tour-room-dot) — those were hard
                  to actually aim at and gave no clue what clicking one did
                  until you tried. Each segment is a full-size button
                  showing the room's own name, so the current room and
                  where a click lands are both obvious at a glance. Falls
                  back to plain text for a single-room tour, where there's
                  nothing to switch between anyway. */}
              {ROOMS.length > 1 ? (
                <div className="svr-tour-room-toggle" role="group" aria-label="Choose room">
                  {ROOMS.map((room) => (
                    <button
                      key={room.id}
                      type="button"
                      className={
                        "svr-tour-room-toggle__opt" +
                        (room.id === currentRoomId ? " current" : "")
                      }
                      onClick={() => goToRoom(room.id)}
                      aria-pressed={room.id === currentRoomId}
                      title={`Go to ${room.name}`}
                    >
                      {room.name}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="svr-tour-room-name">{currentRoomName}</div>
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
              aria-label={effectiveAudioMuted ? "Unmute audio" : "Mute audio"}
              title={effectiveAudioMuted ? "Unmute" : "Mute"}
            >
              {effectiveAudioMuted ? "🔇" : "🔊"}
            </button>
            <button
              onClick={handleTourReplay}
              className={"svr-tour-icon-btn svr-tour-replay-btn" + (tourActive ? " active" : "")}
              aria-label="Restart the studio tour"
              title="Restart the studio tour"
            >
              🧭
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

        {activeGear &&
          !quizActive &&
          !listeningLabOpen &&
          !mixingConsoleLabOpen &&
          !soundCardLabOpen &&
          !patchbayLabOpen &&
          !preampRackLabOpen &&
          !lfEmitterLabOpen &&
          !diffuserPanelLabOpen && (
          <div className="svr-tour-gear-panel">
            <div className="svr-tour-gear-panel__head">
              <span className="svr-tour-gear-badge">{activeGear.number}</span>
              <div className="svr-tour-gear-panel__titles">
                <div className="svr-tour-gear-panel__title">
                  {activeGear.title}
                </div>
                <div className="svr-tour-gear-panel__kicker">Choose how to start</div>
              </div>
              <button
                onClick={closeGearPanel}
                className="svr-tour-gear-panel__close"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="svr-tour-gear-panel__body svr-tour-choice-body">
              {/* Brief "what you'll learn" line for this hotspot's topic —
                  reuses TOPICS[].intro (courseData.js), the same one-line
                  tagline the course page's own hero already shows for this
                  topic, so this doesn't fork into a second, separately
                  maintained blurb. Shown above both choice cards, before
                  either is picked — see the .svr-tour-choice-body comment in
                  panoramaTour.css for why the fuller checklist this used to
                  be got trimmed down to just this one line instead. */}
              {activeTopic?.intro && (
                <p className="svr-tour-choice-intro">
                  <b>What you&apos;ll learn:</b> {activeTopic.intro}
                </p>
              )}

              {quizQuestions.length === 0 && !activeGear.course?.id && (
                // Neither a quiz nor a course exists yet for this hotspot —
                // every gear marker in roomsData.js currently ships a
                // course.id, so this is only a defensive fallback for future
                // hotspots added without one, not something students see today.
                <p className="svr-tour-choice-empty">
                  Course content for {activeGear.title} is coming soon.
                </p>
              )}

              {/* Seven hotspots swap the generic "Test your knowledge" quiz
                  for their own hands-on lab instead — Speakers get the
                  three-experiment Listening Lab (SpeakerListeningLab.jsx,
                  ported from design/speakek-listening-lab.html); Mixing
                  Console, Sound Card, Patch Bay, Preamp Rack, LF Emitter,
                  and Diffuser Panel each get their own two-experiment lab
                  (MixingConsoleLab.jsx / SoundCardLab.jsx / PatchbayLab.jsx /
                  PreampRackLab.jsx / LfEmitterLab.jsx / DiffuserPanelLab.jsx,
                  ported from design/mixing-console-lab.html,
                  design/sound-card-lab.html, design/patchbay-lab.html,
                  design/preamp-rack-lab.html, design/lf-emitter-lab.html,
                  and design/diffuser-panel-lab.html respectively). GEAR_LAB
                  below maps each of those hotspot ids to the
                  emoji/title/subtitle/opener for its choice card; every
                  other hotspot keeps the ordinary quiz below, unchanged. */}
              {GEAR_LAB[activeGear.id] ? (
                <button
                  type="button"
                  onClick={GEAR_LAB[activeGear.id].onOpen}
                  className={
                    "svr-tour-choice-card svr-tour-choice-card--quiz" +
                    (currentTourStep?.id === "test-knowledge" ? " svr-tour-glow" : "")
                  }
                >
                  <span className="svr-tour-choice-card-icon" aria-hidden="true">
                    {GEAR_LAB[activeGear.id].icon}
                  </span>
                  <span className="svr-tour-choice-card-text">
                    <span className="svr-tour-choice-card-title">
                      {GEAR_LAB[activeGear.id].title}
                    </span>
                    <span className="svr-tour-choice-card-sub">
                      {GEAR_LAB[activeGear.id].subtitle}
                    </span>
                  </span>
                </button>
              ) : (
                quizQuestions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setQuizActive(true)}
                    className={
                      "svr-tour-choice-card svr-tour-choice-card--quiz" +
                      (currentTourStep?.id === "test-knowledge" ? " svr-tour-glow" : "")
                    }
                  >
                    <span className="svr-tour-choice-card-icon" aria-hidden="true">🧠</span>
                    <span className="svr-tour-choice-card-text">
                      <span className="svr-tour-choice-card-title">Test your knowledge</span>
                      <span className="svr-tour-choice-card-sub">
                        {quizQuestions.length} quick questions on {activeGear.title.toLowerCase()} — optional
                      </span>
                    </span>
                  </button>
                )
              )}

              {activeGear.course?.id && (
                <button
                  type="button"
                  onClick={() => {
                    // Ends the onboarding tour (if it's running) before
                    // navigating away — starting the course is the natural
                    // finish line for it regardless of which step it's on.
                    finishTourIfActive();
                    // activeGear.id is the hotspot's marker id (e.g. "speaker"),
                    // which is also the topic id in src/course/courseData.js —
                    // CoursePage reads this route state to open directly on
                    // the right topic instead of the default one.
                    navigate("/course", { state: { topicId: activeGear.id } });
                  }}
                  className={
                    "svr-tour-choice-card svr-tour-choice-card--course" +
                    (currentTourStep?.id === "start-course" ? " svr-tour-glow" : "")
                  }
                >
                  <span className="svr-tour-choice-card-icon" aria-hidden="true">▶</span>
                  <span className="svr-tour-choice-card-text">
                    <span className="svr-tour-choice-card-title">Start course</span>
                    <span className="svr-tour-choice-card-sub">Jump straight into the lesson</span>
                  </span>
                </button>
              )}
            </div>

            <div className="svr-tour-gear-panel__footer">
              <button
                onClick={goToNextMarker}
                className="svr-tour-btn svr-tour-btn-secondary"
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {activeGear && quizActive && (
          <HotspotKnowledgeCheck
            key={activeGear.id}
            gear={activeGear}
            questions={quizQuestions}
            onSkip={() => setQuizActive(false)}
            onBackToOverview={() => setQuizActive(false)}
            onStartCourse={() => {
              finishTourIfActive();
              navigate("/course", { state: { topicId: activeGear.id } });
            }}
            onClose={closeGearPanel}
            tourHighlightStartCourse={currentTourStep?.id === "start-course"}
            tourAnchorPanel={currentTourStep?.id === "test-knowledge"}
          />
        )}

        {/* Speakers-only Listening Lab — see the GEAR_LAB choice card above
            and the `listeningLabOpen` state's own comment. Renders its own
            .svr-tour-gear-panel shell (same docked rail as the choice panel
            and HotspotKnowledgeCheck above), just with a tab bar and
            different content inside — not a full-screen takeover like
            DawWorkstationScreen below. */}
        <SpeakerListeningLab
          open={Boolean(activeGear && listeningLabOpen)}
          onClose={closeGearPanel}
          onBackToOverview={backToGearOverview}
          onStartCourse={() => {
            finishTourIfActive();
            navigate("/course", { state: { topicId: activeGear?.id } });
          }}
        />

        {/* Mixing Console and Sound Card hotspots' own labs — same pattern
            as the Speakers' Listening Lab just above, just a different
            component per hotspot (see GEAR_LAB and each state's own
            comment). */}
        <MixingConsoleLab
          open={Boolean(activeGear && mixingConsoleLabOpen)}
          onClose={closeGearPanel}
          onBackToOverview={backToGearOverview}
          onStartCourse={() => {
            finishTourIfActive();
            navigate("/course", { state: { topicId: activeGear?.id } });
          }}
        />
        <SoundCardLab
          open={Boolean(activeGear && soundCardLabOpen)}
          onClose={closeGearPanel}
          onBackToOverview={backToGearOverview}
          onStartCourse={() => {
            finishTourIfActive();
            navigate("/course", { state: { topicId: activeGear?.id } });
          }}
        />

        {/* Patch Bay, Preamp Rack, LF Emitter, and Diffuser Panel hotspots'
            own labs — same pattern as the Speakers' Listening Lab above,
            just a different component per hotspot (see GEAR_LAB and each
            state's own comment). */}
        <PatchbayLab
          open={Boolean(activeGear && patchbayLabOpen)}
          onClose={closeGearPanel}
          onBackToOverview={backToGearOverview}
          onStartCourse={() => {
            finishTourIfActive();
            navigate("/course", { state: { topicId: activeGear?.id } });
          }}
        />
        <PreampRackLab
          open={Boolean(activeGear && preampRackLabOpen)}
          onClose={closeGearPanel}
          onBackToOverview={backToGearOverview}
          onStartCourse={() => {
            finishTourIfActive();
            navigate("/course", { state: { topicId: activeGear?.id } });
          }}
        />
        <LfEmitterLab
          open={Boolean(activeGear && lfEmitterLabOpen)}
          onClose={closeGearPanel}
          onBackToOverview={backToGearOverview}
          onStartCourse={() => {
            finishTourIfActive();
            navigate("/course", { state: { topicId: activeGear?.id } });
          }}
        />
        <DiffuserPanelLab
          open={Boolean(activeGear && diffuserPanelLabOpen)}
          onClose={closeGearPanel}
          onBackToOverview={backToGearOverview}
          onStartCourse={() => {
            finishTourIfActive();
            navigate("/course", { state: { topicId: activeGear?.id } });
          }}
        />

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

      {/* Deliberately outside the lockable wrapper above — this is the one
          control surface that must stay usable while everything else is
          grayed out, since it's the only way to power the rig up in the
          first place. */}
      {status === "ready" && (
        <StudioHotspotsPanel
          room={currentRoom}
          activeGear={activeGear}
          activeModule={activeModule}
          onSelectDevice={handlePanelSelectDevice}
          onPoweredChange={setPoweredOn}
          tourHighlight={tourPanelHighlight}
          tourForceClassicMode={tourForceClassicMode}
          onGameModeChange={handleGameModeChange}
        />
      )}

      {status === "ready" && !poweredOn && (
        <div className="svr-tour-locked-banner">
          Power up the Control Room rig in the panel to explore →
        </div>
      )}

      {/* Onboarding tour guide card — see src/tour/. Deliberately rendered
          at the very end, outside every other panel/wrapper here, so its
          z-index: 80 (see onboardingTour.css) always wins and it's never
          hidden behind whatever it's currently pointing at. */}
      {status === "ready" && tourActive && currentTourStep && (
        <OnboardingTour
          steps={tourStepsForCard}
          stepIndex={tourStepIndex}
          canContinue={tourCanContinue}
          onAdvance={handleTourAdvance}
          onSkip={handleTourSkip}
          onFinish={handleTourFinish}
        />
      )}
    </div>
  );
}

export default PanoramaTour;
