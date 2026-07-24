import { useEffect, useRef, useState } from "react";
import * as GaussianSplats3D from "@mkkellogg/gaussian-splats-3d";

// Standalone Gaussian splat quality tester — same purpose as
// PanoramaImageTester, but for 3D Gaussian splat scenes instead of 360
// photos: upload a .ply / .splat / .ksplat / .spz capture and inspect it
// in real time (orbit, pan, zoom) to judge reconstruction quality before
// committing to a capture for the real studio scene.
//
// Blob URLs from an uploaded File have no file extension for the library
// to sniff (blob:http://...), so the format is derived from the uploaded
// file's own name and passed explicitly to addSplatScene().
const EXTENSION_TO_FORMAT = {
  ply: GaussianSplats3D.SceneFormat.Ply,
  splat: GaussianSplats3D.SceneFormat.Splat,
  ksplat: GaussianSplats3D.SceneFormat.KSplat,
  spz: GaussianSplats3D.SceneFormat.Spz,
};

function formatFromFileName(name) {
  const ext = name.split(".").pop()?.toLowerCase();
  return EXTENSION_TO_FORMAT[ext] ?? null;
}

function GaussianSplatTester() {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const objectUrlRef = useRef(null);
  // Guards against a slow/aborted load from an earlier upload resolving
  // after a newer one has already started — mirrors the same pattern used
  // in PanoramaTour for hotspot requests.
  const loadTokenRef = useRef(0);

  const [fileName, setFileName] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);
  const [status, setStatus] = useState("empty"); // empty | loading | ready | error
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      viewerRef.current?.dispose();
    };
  }, []);

  const loadFile = async (file) => {
    if (!file) return;

    const format = formatFromFileName(file.name);
    if (format === null) {
      setErrorMsg(
        "Unrecognized file type. Upload a .ply, .splat, .ksplat, or .spz Gaussian splat file.",
      );
      setStatus("error");
      return;
    }

    const token = ++loadTokenRef.current;
    setStatus("loading");
    setErrorMsg("");
    setFileName(file.name);
    setFileInfo({ sizeMB: (file.size / (1024 * 1024)).toFixed(2) });

    // A fresh Viewer per upload — simplest reliable way to swap scenes
    // with this library, since it doesn't expose a "clear and reload"
    // primitive as clean as photo-sphere-viewer's setPanorama().
    if (viewerRef.current) {
      await viewerRef.current.dispose();
      if (token !== loadTokenRef.current) return; // superseded mid-dispose
      viewerRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;

    const viewer = new GaussianSplats3D.Viewer({
      rootElement: containerRef.current,
      cameraUp: [0, -1, -0.6],
      initialCameraPosition: [-1, -4, 6],
      initialCameraLookAt: [0, 1, 0],
      sharedMemoryForWorkers: false,
    });
    viewerRef.current = viewer;

    try {
      await viewer.addSplatScene(url, {
        format,
        splatAlphaRemovalThreshold: 5,
        showLoadingUI: true,
        progressiveLoad: true,
      });
      if (token !== loadTokenRef.current) return; // superseded while loading
      viewer.start();
      setStatus("ready");
    } catch (e) {
      console.error("Splat scene load error:", e);
      if (token !== loadTokenRef.current) return;
      setErrorMsg(
        "Failed to load this file as a Gaussian splat scene. It may be corrupt or in an unsupported variant of the format.",
      );
      setStatus("error");
    }
  };

  const onInputChange = (e) => loadFile(e.target.files?.[0]);

  const onDrop = (e) => {
    e.preventDefault();
    loadFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div
        ref={containerRef}
        // isolation: "isolate" keeps the viewer's own canvas/UI in its own
        // stacking context so it can never paint above the sibling upload
        // panel below (see PanoramaImageTester for the same fix/reasoning).
        style={{
          width: "100%",
          height: "100%",
          background: "#111",
          isolation: "isolate",
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      />

      <div style={panelStyle}>
        <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "10px" }}>
          Gaussian Splat Quality Tester
        </div>

        <label style={uploadButtonStyle}>
          Upload splat scene
          <input
            type="file"
            accept=".ply,.splat,.ksplat,.spz"
            onChange={onInputChange}
            style={{ display: "none" }}
          />
        </label>

        <div style={{ fontSize: "11px", opacity: 0.55, marginTop: "8px" }}>
          .ply, .splat, .ksplat, or .spz — or drag &amp; drop anywhere on the
          viewer
        </div>

        {fileName && (
          <div style={{ marginTop: "14px", fontSize: "12px", lineHeight: 1.6 }}>
            <div style={{ opacity: 0.7 }}>{fileName}</div>
            {fileInfo && <div>{fileInfo.sizeMB} MB</div>}
            {status === "loading" && (
              <div style={{ color: "#ffb84d" }}>Loading &amp; sorting splats&hellip;</div>
            )}
            {status === "ready" && (
              <div style={{ color: "#7CFC9A" }}>Loaded</div>
            )}
          </div>
        )}

        {status === "ready" && (
          <div
            style={{
              marginTop: "14px",
              fontSize: "11px",
              lineHeight: 1.6,
              opacity: 0.6,
              borderTop: "1px solid rgba(255,255,255,0.15)",
              paddingTop: "10px",
            }}
          >
            Drag to orbit &middot; scroll to zoom &middot; right-drag to pan
            <br />
            Press "I" for a live debug/FPS panel, "P" for point-cloud mode
          </div>
        )}
      </div>

      {status === "empty" && (
        <div style={overlayCenterStyle}>
          Upload a .ply/.splat/.ksplat/.spz file to preview it as a Gaussian
          splat scene
        </div>
      )}

      {status === "error" && (
        <div style={{ ...overlayCenterStyle, color: "#f66", maxWidth: "360px" }}>
          {errorMsg}
        </div>
      )}
    </div>
  );
}

const panelStyle = {
  position: "absolute",
  top: "16px",
  left: "16px",
  width: "240px",
  background: "rgba(20,20,20,0.85)",
  color: "#fff",
  fontFamily: "sans-serif",
  padding: "14px 16px",
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.15)",
  zIndex: 10,
  pointerEvents: "auto",
};

const uploadButtonStyle = {
  display: "inline-block",
  padding: "9px 14px",
  background: "#22ff55",
  color: "#0a0a0a",
  borderRadius: "6px",
  fontWeight: 700,
  fontSize: "12.5px",
  cursor: "pointer",
};

const overlayCenterStyle = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  color: "#fff",
  fontFamily: "sans-serif",
  fontSize: "15px",
  textAlign: "center",
  pointerEvents: "none",
};

export default GaussianSplatTester;
