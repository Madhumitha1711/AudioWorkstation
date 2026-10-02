import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Viewer } from "@photo-sphere-viewer/core";
import { VirtualTourPlugin } from "@photo-sphere-viewer/virtual-tour-plugin";
import { MarkersPlugin } from "@photo-sphere-viewer/markers-plugin";
import "@photo-sphere-viewer/core/index.css";
import "@photo-sphere-viewer/markers-plugin/index.css";
import "@photo-sphere-viewer/virtual-tour-plugin/index.css";
import { ROOMS, START_NODE_ID } from "./data/roomsData";
import {
  initAudio,
  resumeAudio,
  updateListenerOrientation,
  stopHotspotNarration,
  setMuted,
  isMuted,
  setBinauralEnabled,
  isBinauralEnabled,
} from "../../audio/spatialAudioEngine";
import DawWorkstationScreen from "./daw/DawWorkstationScreen";
import SpeakerListeningLab from "./hotspot-labs/SpeakerListeningLab";
import MixingConsoleLab from "./hotspot-labs/MixingConsoleLab";
import SoundCardLab from "./hotspot-labs/SoundCardLab";
import PatchbayLab from "./hotspot-labs/PatchbayLab";
import PreampRackLab from "./hotspot-labs/PreampRackLab";
import LfEmitterLab from "./hotspot-labs/LfEmitterLab";
import DiffuserPanelLab from "./hotspot-labs/DiffuserPanelLab";
import StudioHotspotsPanel from "./components/StudioHotspotsPanel";
import HotspotKnowledgeCheck from "./components/HotspotPrecheck";
import { TOPICS } from "../course/data/courseData";
import QuickHelpPanel from "./help/QuickHelpPanel";
import { quickHelpHoverProps } from "./help/helpHover";
import WelcomeVideoDialog from "./components/WelcomeVideoDialog";
import "./PanoramaTour.css";

const REST_ZOOM_LVL = 5;

const WELCOME_VIDEO_SEEN_KEY = "svr-welcome-video-seen";

const deg = (value) => `${value}deg`;

const markerHtml = (number) => `
  <div class="hotspot-marker">
    <span class="hotspot-marker__ring"></span>
    <span class="hotspot-marker__ring hotspot-marker__ring--delayed"></span>
    <span class="hotspot-marker__dot">${number}</span>
  </div>
`;

const doorMarkerHtml = () => `
  <div class="hotspot-marker hotspot-marker--door">
    <span class="hotspot-marker__ring hotspot-marker__ring--door"></span>
    <span class="hotspot-marker__ring hotspot-marker__ring--door hotspot-marker__ring--delayed"></span>
    <span class="hotspot-marker__dot hotspot-marker__dot--door">🚪</span>
  </div>
`;

const interactiveMarkerHtml = (icon, variant) => `
  <div class="hotspot-marker${variant ? ` hotspot-marker--${variant}` : ""}">
    <span class="hotspot-marker__ring${variant ? ` hotspot-marker__ring--${variant}` : ""}"></span>
    <span class="hotspot-marker__ring${variant ? ` hotspot-marker__ring--${variant}` : ""} hotspot-marker__ring--delayed"></span>
    <span class="hotspot-marker__dot${variant ? ` hotspot-marker__dot--${variant}` : ""}">${icon}</span>
  </div>
`;

function buildNodes() {
  let hotspotNumber = 0;
  return ROOMS.map((room) => ({
    id: room.id,
    name: room.name,
    panorama: room.panorama,
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
          zoomLvl: marker.zoomLvl ?? 60,
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
    ],
  }));
}

function findHotspotLocation(hotspotId) {
  for (const room of ROOMS) {
    if ((room.markers || []).some((m) => m.id === hotspotId)) {
      return { roomId: room.id, kind: "gear" };
    }
    if ((room.interactiveMarkers || []).some((m) => m.id === hotspotId)) {
      return { roomId: room.id, kind: "interactive" };
    }
  }
  return null;
}

function describeMarkerHelp(data) {
  if (!data) return null;
  if (data.kind === "door") {
    return "Doorway — click to walk through to the next room.";
  }
  if (data.kind === "interactive") {
    return `${data.title} — click to open this interactive module.`;
  }
  return data.description ? `${data.title} — ${data.description}` : data.title;
}

const GEAR_LAB = {
  speaker: {
    icon: "🎧",
    title: "Listening Lab",
    subtitle: "Three quick ear-training experiments — optional",
    Lab: SpeakerListeningLab,
  },
  "mixing-console": {
    icon: "🎚️",
    title: "Mixing Console Lab",
    subtitle: "Two quick mixing experiments — optional",
    Lab: MixingConsoleLab,
  },
  "sound-card": {
    icon: "🔌",
    title: "Sound Card Lab",
    subtitle: "Two quick conversion experiments — optional",
    Lab: SoundCardLab,
  },
  "patch-bay": {
    icon: "🔀",
    title: "Patchbay Lab",
    subtitle: "Two quick routing experiments — optional",
    Lab: PatchbayLab,
  },
  "preamp-rack": {
    icon: "🎙️",
    title: "Preamp Rack Lab",
    subtitle: "Two quick gain-staging experiments — optional",
    Lab: PreampRackLab,
  },
  "lf-emitter": {
    icon: "🔊",
    title: "LF Emitter Lab",
    subtitle: "Two quick low-end experiments — optional",
    Lab: LfEmitterLab,
  },
  "diffuser-panel": {
    icon: "🪩",
    title: "Diffuser Panel Lab",
    subtitle: "Two quick echo experiments — optional",
    Lab: DiffuserPanelLab,
  },
};

function PanoramaTour() {
  const navigate = useNavigate();
  const location = useLocation();
  const containerRef = useRef(null);
  const placementModeRef = useRef(false);
  const viewerRef = useRef(null);
  const markersRef = useRef(null);
  const virtualTourRef = useRef(null);
  const goToMarkerRef = useRef(null);
  const goToInteractiveMarkerRef = useRef(null);
  const hasArrivedRef = useRef(false);
  const latestRequestRef = useRef(null);
  const selectedMarkerElRef = useRef(null);
  const activeModuleRef = useRef(null);
  const pendingFocusHotspotIdRef = useRef(location.state?.focusHotspotId ?? null);
  const [autoPowerUp, setAutoPowerUp] = useState(false);

  const [currentRoomName, setCurrentRoomName] = useState("");
  const [currentRoomId, setCurrentRoomId] = useState(START_NODE_ID);
  const [activeGear, setActiveGear] = useState(null);
  const [quizActive, setQuizActive] = useState(false);
  const [openLab, setOpenLab] = useState(null);
  const [activeModule, setActiveModule] = useState(null);
  const [placementMode, setPlacementMode] = useState(false);
  const [lastPlacement, setLastPlacement] = useState(null);
  const [status, setStatus] = useState("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [audioMuted, setAudioMuted] = useState(isMuted());
  const [binauralOn, setBinauralOn] = useState(isBinauralEnabled());
  const [hintOpen, setHintOpen] = useState(false);
  const [poweredOn, setPoweredOn] = useState(false);

  const [welcomeVideoOpen, setWelcomeVideoOpen] = useState(false);

  useEffect(() => {
    if (status !== "ready") return;
    let alreadySeen = false;
    try {
      alreadySeen = window.localStorage.getItem(WELCOME_VIDEO_SEEN_KEY) === "1";
    } catch {
    }
    if (!alreadySeen) setWelcomeVideoOpen(true);
  }, [status]);

  const closeWelcomeVideo = () => {
    setWelcomeVideoOpen(false);
    try {
      window.localStorage.setItem(WELCOME_VIDEO_SEEN_KEY, "1");
    } catch {
    }
  };

  const [helpModeOn, setHelpModeOn] = useState(false);
  const [panelOpenRequest, setPanelOpenRequest] = useState(0);
  const [helpMessage, setHelpMessage] = useState(null);

  useEffect(() => {
    setMuted(audioMuted || !poweredOn);
  }, [audioMuted, poweredOn]);

  useEffect(() => {
    activeModuleRef.current = activeModule;
  }, [activeModule]);

  useEffect(() => {
    if (!containerRef.current) return;

    initAudio();
    resumeAudio();

    const viewer = new Viewer({
      container: containerRef.current,
      defaultZoomLvl: 75,
      defaultYaw: "61.6deg",
      defaultPitch: "-10.8deg",
      minFov: 30,
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

    const onNodeChanged = (e) => {
      setCurrentRoomName(e.node.name || e.node.id);
      setCurrentRoomId(e.node.id);
      setActiveGear(null);
      setQuizActive(false);
      setOpenLab(null);
      setActiveModule(null);
      latestRequestRef.current = null;
      clearSelectedMarkerEl();
      setStatus("ready");

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

      if (!hasArrivedRef.current) {
        hasArrivedRef.current = true;
        viewer.animate({ zoom: REST_ZOOM_LVL, speed: "10rpm" });
      }
    };
    virtualTour.addEventListener("node-changed", onNodeChanged);

    const orientationInterval = setInterval(() => {
      const pos = viewer.getPosition();
      updateListenerOrientation(
        (pos.yaw * 180) / Math.PI,
        (pos.pitch * 180) / Math.PI,
      );
    }, 120);

    const goToMarker = (markerId) => {
      const marker = markers.getMarker(markerId);
      if (!marker) return;
      latestRequestRef.current = markerId;
      markers.gotoMarker(markerId, "8rpm").then(() => {
        if (latestRequestRef.current !== markerId) return;
        setActiveModule(null);
        setActiveGear(marker.data);
        setQuizActive(false);
        setOpenLab(null);
        setSelectedMarkerEl(markerId);
      });
    };
    goToMarkerRef.current = goToMarker;

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
        setOpenLab(null);
        setActiveModule(data);
        setSelectedMarkerEl(markerId);
      });
    };
    goToInteractiveMarkerRef.current = goToInteractiveMarker;

    const onSelectMarker = (e) => {
      if (e.marker.data?.kind === "door") {
        goToRoom(e.marker.data.nodeId);
      } else if (e.marker.data?.kind === "interactive") {
        goToInteractiveMarker(e.marker.id, e.marker.data);
      } else {
        goToMarker(e.marker.id);
      }
    };
    markers.addEventListener("select-marker", onSelectMarker);

    const onEnterMarker = (e) => setHelpMessage(describeMarkerHelp(e.marker.data));
    const onLeaveMarker = () => setHelpMessage(null);
    markers.addEventListener("enter-marker", onEnterMarker);
    markers.addEventListener("leave-marker", onLeaveMarker);

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
      viewer.destroy();
    };
  }, []);

  const clearSelectedMarkerEl = () => {
    if (selectedMarkerElRef.current) {
      selectedMarkerElRef.current.classList.remove("svr-hotspot-selected");
      selectedMarkerElRef.current = null;
    }
  };

  const setSelectedMarkerEl = (markerId) => {
    clearSelectedMarkerEl();
    const marker = markersRef.current?.getMarker(markerId);
    const el = marker?.domElement?.querySelector(".hotspot-marker");
    if (el) {
      el.classList.add("svr-hotspot-selected");
      selectedMarkerElRef.current = el;
    }
  };

  const closeGearPanel = () => {
    stopHotspotNarration();
    setActiveGear(null);
    setQuizActive(false);
    setOpenLab(null);
    clearSelectedMarkerEl();
    viewerRef.current?.animate({ zoom: REST_ZOOM_LVL, speed: "10rpm" });
  };

  const backToGearOverview = () => {
    setQuizActive(false);
    setOpenLab(null);
  };

  const closeModulePanel = () => {
    setActiveModule(null);
    clearSelectedMarkerEl();
    viewerRef.current?.animate({ zoom: REST_ZOOM_LVL, speed: "10rpm" });
  };

  const toggleMasterMute = () => {
    setAudioMuted((prev) => !prev);
  };

  const toggleBinaural = () => {
    const next = !isBinauralEnabled();
    setBinauralEnabled(next);
    setBinauralOn(next);
  };

  const goToRoom = (nodeId) => {
    stopHotspotNarration();
    setActiveGear(null);
    setQuizActive(false);
    setOpenLab(null);
    setActiveModule(null);
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

  const handlePanelSelectDevice = (kind, id) => {
    if (!poweredOn) return;
    if (kind === "interactive") {
      const marker = markersRef.current?.getMarker(id);
      if (marker) goToInteractiveMarkerRef.current?.(id, marker.data);
    } else {
      goToMarkerRef.current?.(id);
    }
  };

  useEffect(() => {
    const targetId = pendingFocusHotspotIdRef.current;
    if (!targetId || status !== "ready") return;

    const target = findHotspotLocation(targetId);
    if (!target) {
      pendingFocusHotspotIdRef.current = null;
      return;
    }

    if (currentRoomId !== target.roomId) {
      goToRoom(target.roomId);
      return;
    }

    if (!poweredOn) {
      setAutoPowerUp(true);
      return;
    }

    pendingFocusHotspotIdRef.current = null;
    setAutoPowerUp(false);
    if (target.kind === "interactive") {
      const marker = markersRef.current?.getMarker(targetId);
      goToInteractiveMarkerRef.current?.(targetId, marker?.data);
    } else {
      goToMarkerRef.current?.(targetId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- goToRoom is a
  }, [status, currentRoomId, poweredOn]);

  const toggleHelpMode = () => {
    setHelpModeOn((v) => !v);
    setHelpMessage(null);
  };

  const currentRoom = ROOMS.find((room) => room.id === currentRoomId);
  const activeTopic = activeGear ? TOPICS.find((t) => t.id === activeGear.id) : null;
  const quizQuestions = activeTopic?.assessment?.questions ?? [];
  const effectiveAudioMuted = audioMuted || !poweredOn;

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
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
                      {...quickHelpHoverProps(setHelpMessage, `Walk to the ${room.name}.`)}
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
              {...quickHelpHoverProps(
                setHelpMessage,
                "Toggles spatial (HRTF binaural) audio for hotspot narration on or off."
              )}
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
              {...quickHelpHoverProps(setHelpMessage, "Mutes or unmutes all studio audio.")}
            >
              {effectiveAudioMuted ? "🔇" : "🔊"}
            </button>
            <button
              onClick={() => setWelcomeVideoOpen(true)}
              className="svr-tour-icon-btn"
              aria-label="Watch the welcome video again"
              title="Watch the welcome video again"
              {...quickHelpHoverProps(
                setHelpMessage,
                "Replays the welcome video that explains how to use this studio."
              )}
            >
              🎬
            </button>
            <button
              onClick={toggleHelpMode}
              className={"svr-tour-icon-btn" + (helpModeOn ? " active" : "")}
              aria-pressed={helpModeOn}
              aria-label={helpModeOn ? "Turn off help mode" : "Turn on help mode"}
              title={helpModeOn ? "Help mode: on — click to turn off" : "Help mode: off — click to turn on"}
              {...quickHelpHoverProps(
                setHelpMessage,
                helpModeOn ? "Turn off help mode." : "Turn on help mode to get hints on hover."
              )}
            >
              🛟
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

        {activeGear && !quizActive && !openLab && (
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
                {...quickHelpHoverProps(setHelpMessage, "Close this panel and return to the control room.")}
              >
                ×
              </button>
            </div>

            <div className="svr-tour-gear-panel__body svr-tour-choice-body">
              {activeTopic?.intro && (
                <p className="svr-tour-choice-intro">
                  <b>What you&apos;ll learn:</b> {activeTopic.intro}
                </p>
              )}

              {quizQuestions.length === 0 && !activeGear.course?.id && (
                <p className="svr-tour-choice-empty">
                  Course content for {activeGear.title} is coming soon.
                </p>
              )}

              {GEAR_LAB[activeGear.id] ? (
                <button
                  type="button"
                  onClick={() => setOpenLab(activeGear.id)}
                  className="svr-tour-choice-card svr-tour-choice-card--quiz"
                  {...quickHelpHoverProps(setHelpMessage, GEAR_LAB[activeGear.id].subtitle)}
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
                    className="svr-tour-choice-card svr-tour-choice-card--quiz"
                    {...quickHelpHoverProps(
                      setHelpMessage,
                      `${quizQuestions.length} quick questions on ${activeGear.title.toLowerCase()} — optional.`
                    )}
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
                    navigate("/course", { state: { topicId: activeGear.id } });
                  }}
                  className="svr-tour-choice-card svr-tour-choice-card--course"
                  {...quickHelpHoverProps(setHelpMessage, "Jump straight into the full lesson for this topic.")}
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
                {...quickHelpHoverProps(setHelpMessage, "Jump to the next piece of gear in this room.")}
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
              navigate("/course", { state: { topicId: activeGear.id } });
            }}
            onClose={closeGearPanel}
            onQuickHelp={setHelpMessage}
          />
        )}

        {Object.entries(GEAR_LAB).map(([id, { Lab }]) => (
          <Lab
            key={id}
            open={Boolean(activeGear && openLab === id)}
            onClose={closeGearPanel}
            onBackToOverview={backToGearOverview}
            onQuickHelp={setHelpMessage}
            onStartCourse={() => navigate("/course", { state: { topicId: activeGear?.id } })}
          />
        ))}

        <DawWorkstationScreen open={activeModule} onClose={closeModulePanel} />
      </div>

      {status === "ready" && (
        <StudioHotspotsPanel
          room={currentRoom}
          activeGear={activeGear}
          activeModule={activeModule}
          onSelectDevice={handlePanelSelectDevice}
          onPoweredChange={setPoweredOn}
          autoPowerUp={autoPowerUp}
          onQuickHelp={setHelpMessage}
          openRequest={panelOpenRequest}
        />
      )}

      {status === "ready" && !poweredOn && (
        <button
          type="button"
          className="svr-tour-locked-banner"
          onClick={() => setPanelOpenRequest((n) => n + 1)}
        >
          <span className="svr-tour-locked-banner__desktop">
            Power up the Control Room rig in the panel to explore →
          </span>
          <span className="svr-tour-locked-banner__mobile">
            ☰ Tap to power up the Control Room rig
          </span>
        </button>
      )}

      {status === "ready" && helpModeOn && <QuickHelpPanel message={helpMessage} />}

      {status === "ready" && (
        <WelcomeVideoDialog open={welcomeVideoOpen} onClose={closeWelcomeVideo} />
      )}
    </div>
  );
}

export default PanoramaTour;
