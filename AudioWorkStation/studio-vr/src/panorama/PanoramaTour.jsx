import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { Viewer } from "@photo-sphere-viewer/core";
import { VirtualTourPlugin } from "@photo-sphere-viewer/virtual-tour-plugin";
import { MarkersPlugin } from "@photo-sphere-viewer/markers-plugin";
import "@photo-sphere-viewer/core/index.css";
import "@photo-sphere-viewer/markers-plugin/index.css";
import "@photo-sphere-viewer/virtual-tour-plugin/index.css";
import { ROOMS, START_NODE_ID } from "./roomsData";
import { setScreen, setPendingTopic } from "../store/uiSlice";
import {
  initAudio,
  resumeAudio,
  updateListenerOrientation,
  playHotspotNarration,
  stopHotspotNarration,
  setRoomAmbience,
  setMuted,
  isMuted,
} from "../audio/spatialAudioEngine";

const DEFAULT_AMBIENCE = { filterFreq: 500, gain: 0.03, gustDepth: 0.015 };

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
          // information card is the fixed panel (gearPanelStyle) that opens
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
    ],
  }));
}

function PanoramaTour() {
  const dispatch = useDispatch();
  const containerRef = useRef(null);
  const placementModeRef = useRef(false);
  const viewerRef = useRef(null);
  const markersRef = useRef(null);
  const virtualTourRef = useRef(null);
  const goToMarkerRef = useRef(null);
  const hasArrivedRef = useRef(false);
  // Which room's ambient bed is currently active — so toggleMute() can
  // re-trigger it for the right room when binaural is switched back on,
  // without needing its own copy of the room-lookup logic.
  const currentRoomIdRef = useRef(null);
  const activateRoomAudioRef = useRef(null);
  // Tracks whichever hotspot was requested most recently, so that if a
  // second hotspot is clicked before the first one's arrival animation
  // finishes, the first one's now-stale ".then()" can't overwrite the panel
  // with the wrong content.
  const latestRequestRef = useRef(null);

  const [currentRoomName, setCurrentRoomName] = useState("");
  const [activeGear, setActiveGear] = useState(null);
  const [placementMode, setPlacementMode] = useState(false);
  const [lastPlacement, setLastPlacement] = useState(null);
  const [status, setStatus] = useState("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [audioMuted, setAudioMuted] = useState(isMuted());

  useEffect(() => {
    if (!containerRef.current) return;

    // Login already unlocks audio on a real user gesture, but do it again
    // here defensively in case this screen is ever reached another way.
    initAudio();
    resumeAudio();

    const viewer = new Viewer({
      container: containerRef.current,
      // Start zoomed in; on arrival we animate back out to zoomLvl 10 for a
      // "zoom out to normal position" reveal instead of just appearing.
      defaultZoomLvl: 75,
      // Lower than the library default (30deg) so full zoom-in (via the
      // navbar slider, scroll, or a hotspot's zoomLvl) gets noticeably
      // closer — gear reads as bigger/more detailed instead of capping out
      // at a fairly wide view.
      minFov: 15,
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
    // every room change, and again by toggleMute() when binaural is
    // switched back on (the bed is silenced, not stopped, while it's off —
    // see setMuted()).
    const activateRoomAudio = (room) => {
      if (!room) return;
      setRoomAmbience(room.ambience ?? DEFAULT_AMBIENCE);
    };
    activateRoomAudioRef.current = activateRoomAudio;

    const onNodeChanged = (e) => {
      setCurrentRoomName(e.node.name || e.node.id);
      setActiveGear(null);
      latestRequestRef.current = null;
      setStatus("ready");
      currentRoomIdRef.current = e.node.id;

      // Only on first arrival: reveal the room by zooming back out to the
      // normal establishing view, instead of just popping in already zoomed.
      if (!hasArrivedRef.current) {
        hasArrivedRef.current = true;
        viewer.animate({ zoom: 10, speed: "10rpm" });
      }

      // Don't re-tune the ambient bed if binaural is currently off — it's
      // deliberately silenced, and should stay that way until toggleMute()
      // re-enables it.
      if (!isMuted()) {
        activateRoomAudio(ROOMS.find((r) => r.id === e.node.id));
      }
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
        setActiveGear(marker.data);
        // Its recorded narration clip (if uploaded) plays through an HRTF
        // panner from the hotspot's direction — genuinely binaural, unlike
        // browser TTS.
        playHotspotNarration(marker.data.audio, marker.data.yaw, marker.data.pitch);
      });
    };
    goToMarkerRef.current = goToMarker;

    const onSelectMarker = (e) => {
      if (e.marker.data?.kind === "door") {
        goToRoom(e.marker.data.nodeId);
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

  // Just closes the panel — the camera stays wherever it currently is
  // (i.e. at the hotspot), it does not zoom back out.
  const closeGearPanel = () => {
    stopHotspotNarration();
    setActiveGear(null);
  };

  // Toggles binaural/spatial audio — NOT a full mute. setMuted() silences
  // the ambient bed; hotspot narration keeps playing regardless, just as
  // plain non-spatial audio while this is off (see
  // spatialAudioEngine.playHotspotNarration). Turning it back on re-tunes
  // the bed for whichever room the student is currently standing in.
  const toggleMute = () => {
    const next = !isMuted();
    setMuted(next);
    setAudioMuted(next);
    if (!next) {
      activateRoomAudioRef.current?.(
        ROOMS.find((r) => r.id === currentRoomIdRef.current),
      );
    }
  };

  // Selecting a door hotspot: walk through to the linked room. The
  // virtual-tour plugin's own transitionOptions (rotation: true) handles
  // turning to face the doorway before the fade.
  const goToRoom = (nodeId) => {
    stopHotspotNarration();
    setActiveGear(null);
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
    const all = markers.getMarkers();
    console.log(
      "[next-hotspot] registered marker ids:",
      all.map((m) => m.id),
      "current:",
      activeGear.id,
    );
    const currentIndex = all.findIndex((m) => m.id === activeGear.id);
    if (currentIndex === -1) {
      console.warn("[next-hotspot] blocked: current marker id not found in registered markers");
      return;
    }
    if (all.length < 2) {
      console.warn("[next-hotspot] blocked: only one marker registered, nothing to advance to");
      return;
    }
    const next = all[(currentIndex + 1) % all.length];
    console.log("[next-hotspot] advancing to:", next.id);
    goToMarkerRef.current?.(next.id);
  };

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <style>{hotspotStyles}</style>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {status === "loading" && (
        <div style={overlayCenterStyle}>Loading studio tour...</div>
      )}

      {status === "error" && (
        <div style={{ ...overlayCenterStyle, color: "#f66" }}>
          {errorMsg}
        </div>
      )}

      {status === "ready" && currentRoomName && (
        <div style={roomLabelStyle}>{currentRoomName}</div>
      )}

      {status === "ready" && (
        <button
          onClick={toggleMute}
          style={muteButtonStyle}
          aria-label={audioMuted ? "Unmute audio" : "Mute audio"}
        >
          {audioMuted ? "🔇" : "🔊"} Binaural audio (preview)
        </button>
      )}

      <div style={hintStyle}>
        Press "P" to toggle hotspot placement mode, then click a doorway or
        piece of gear to read its yaw/pitch (also logged to the console).
        {placementMode && (
          <div style={{ marginTop: "4px", color: "#7CFC9A" }}>
            Placement mode ON
            {lastPlacement &&
              ` — last click: yaw ${lastPlacement.yaw}deg, pitch ${lastPlacement.pitch}deg`}
          </div>
        )}
      </div>

      {activeGear && (
        <div style={gearPanelStyle}>
          <button
            onClick={closeGearPanel}
            style={closeButtonStyle}
            aria-label="Close"
          >
            ×
          </button>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "8px",
            }}
          >
            <span style={panelBadgeStyle}>{activeGear.number}</span>
            <span style={{ fontWeight: 700, fontSize: "15px" }}>
              {activeGear.title}
            </span>
          </div>
          <div style={{ fontSize: "13px", lineHeight: 1.5, opacity: 0.9 }}>
            {activeGear.description}
          </div>

          {activeGear.course?.objectives?.length > 0 && (
            <>
              <div
                style={{
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  opacity: 0.55,
                  margin: "14px 0 6px",
                }}
              >
                What you'll learn
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: "18px",
                  fontSize: "12.5px",
                  lineHeight: 1.6,
                  opacity: 0.9,
                }}
              >
                {activeGear.course.objectives.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            </>
          )}

          {activeGear.course?.id && (
            <button
              onClick={() => {
                // activeGear.id is the hotspot's marker id (e.g. "speaker",
                // "daw-screens"), which is also the topic id in
                // src/course/courseData.js — CoursePage uses this to open
                // directly on the right topic instead of the default one.
                dispatch(setPendingTopic(activeGear.id));
                dispatch(setScreen("course"));
              }}
              style={startCourseButtonStyle}
            >
              Start course
            </button>
          )}

          <button onClick={goToNextMarker} style={nextButtonStyle}>
            Next hotspot →
          </button>
        </div>
      )}
    </div>
  );
}

// Injected globally so the plain-HTML marker content (rendered by the
// markers plugin outside of React) can use these classes/keyframes.
const hotspotStyles = `
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
  }
  .hotspot-marker__ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 2px solid rgba(58, 255, 140, 0.85);
    animation: hotspot-pulse 2.2s ease-out infinite;
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
`;

const muteButtonStyle = {
  position: "absolute",
  top: "16px",
  right: "16px",
  background: "rgba(20,20,20,0.75)",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: "999px",
  padding: "6px 14px",
  fontSize: "12px",
  fontFamily: "sans-serif",
  cursor: "pointer",
};

const panelBadgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "22px",
  height: "22px",
  borderRadius: "50%",
  background: "radial-gradient(circle at 32% 28%, #7dffb8, #17c76a 70%)",
  color: "#04160a",
  fontSize: "12px",
  fontWeight: 700,
  flexShrink: 0,
};

const overlayCenterStyle = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  color: "#fff",
  fontFamily: "sans-serif",
  fontSize: "16px",
};

const roomLabelStyle = {
  position: "absolute",
  top: "16px",
  left: "50%",
  transform: "translateX(-50%)",
  background: "rgba(20,20,20,0.75)",
  color: "#fff",
  fontFamily: "sans-serif",
  fontSize: "14px",
  fontWeight: 600,
  padding: "6px 14px",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.15)",
  letterSpacing: "0.02em",
};

const hintStyle = {
  position: "absolute",
  bottom: "12px",
  left: "12px",
  maxWidth: "360px",
  color: "rgba(255,255,255,0.6)",
  fontFamily: "sans-serif",
  fontSize: "12px",
  lineHeight: 1.4,
};

const gearPanelStyle = {
  position: "absolute",
  top: "70px",
  right: "16px",
  width: "320px",
  maxHeight: "calc(100vh - 100px)",
  overflowY: "auto",
  background: "rgba(20,20,20,0.92)",
  color: "#fff",
  fontFamily: "sans-serif",
  padding: "16px 18px",
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.15)",
};

const startCourseButtonStyle = {
  marginTop: "16px",
  width: "100%",
  padding: "9px 0",
  background: "#22ff55",
  color: "#0a0a0a",
  border: "none",
  borderRadius: "6px",
  fontWeight: 700,
  fontSize: "13px",
  cursor: "pointer",
};

const nextButtonStyle = {
  marginTop: "8px",
  width: "100%",
  padding: "9px 0",
  background: "rgba(255,255,255,0.1)",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.25)",
  borderRadius: "6px",
  fontWeight: 600,
  fontSize: "13px",
  cursor: "pointer",
};

const closeButtonStyle = {
  position: "absolute",
  top: "8px",
  right: "10px",
  background: "none",
  border: "none",
  color: "rgba(255,255,255,0.7)",
  fontSize: "18px",
  cursor: "pointer",
  lineHeight: 1,
};

export default PanoramaTour;
