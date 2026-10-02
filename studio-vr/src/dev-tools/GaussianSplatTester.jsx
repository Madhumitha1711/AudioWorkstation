import { useEffect, useRef, useState } from "react";
import * as GaussianSplats3D from "@mkkellogg/gaussian-splats-3d";
import { TesterShell, HelpText } from "./TesterShell";

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
  const loadTokenRef = useRef(0);

  const [fileName, setFileName] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);
  const [status, setStatus] = useState("empty");
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

    if (viewerRef.current) {
      await viewerRef.current.dispose();
      if (token !== loadTokenRef.current) return;
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
      if (token !== loadTokenRef.current) return;
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

  return (
    <TesterShell
      containerRef={containerRef}
      onFile={loadFile}
      title="Gaussian Splat Quality Tester"
      buttonLabel="Upload splat scene"
      accept=".ply,.splat,.ksplat,.spz"
      hint=".ply, .splat, .ksplat, or .spz — or drag & drop anywhere on the viewer"
      fileName={fileName}
      status={status}
      errorMsg={errorMsg}
      emptyText="Upload a .ply/.splat/.ksplat/.spz file to preview it as a Gaussian splat scene"
      info={<>
        {fileInfo && <div>{fileInfo.sizeMB} MB</div>}
        {status === "loading" && <div style={{ color: "#ffb84d" }}>Loading &amp; sorting splats&hellip;</div>}
        {status === "ready" && <div style={{ color: "#7CFC9A" }}>Loaded</div>}
      </>}
      footer={status === "ready" && (
        <HelpText>
          Drag to orbit &middot; scroll to zoom &middot; right-drag to pan
          <br />
          Press "I" for a live debug/FPS panel, "P" for point-cloud mode
        </HelpText>
      )}
    />
  );
}

export default GaussianSplatTester;
