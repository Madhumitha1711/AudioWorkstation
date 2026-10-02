import { useEffect, useRef, useState } from "react";
import { Viewer } from "@photo-sphere-viewer/core";
import "@photo-sphere-viewer/core/index.css";
import { TesterShell } from "./TesterShell";

function PanoramaImageTester() {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const objectUrlRef = useRef(null);

  const [fileName, setFileName] = useState(null);
  const [imageInfo, setImageInfo] = useState(null);
  const [status, setStatus] = useState("empty");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!containerRef.current) return;

    const viewer = new Viewer({
      container: containerRef.current,
      navbar: ["zoom", "move", "caption", "fullscreen"],
      defaultZoomLvl: 0,
      minFov: 10,
      maxFov: 100,
    });
    viewerRef.current = viewer;

    viewer.addEventListener("panorama-error", (e) => {
      console.error("Panorama load error:", e);
      setErrorMsg(
        "Could not load this image as a 360 panorama. Make sure it's a single equirectangular JPG/PNG (2:1 aspect ratio works best).",
      );
      setStatus("error");
    });

    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      viewer.destroy();
    };
  }, []);

  const handleFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrorMsg("That's not an image file.");
      setStatus("error");
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = url;

      const ratio = img.naturalWidth / img.naturalHeight;
      setImageInfo({
        width: img.naturalWidth,
        height: img.naturalHeight,
        ratio: ratio.toFixed(2),
        isStandardRatio: Math.abs(ratio - 2) < 0.05,
        sizeKB: Math.round(file.size / 1024),
      });
      setFileName(file.name);
      setStatus("loading");
      setErrorMsg("");

      viewerRef.current
        ?.setPanorama(url, { transition: false, showLoader: true })
        .then(() => setStatus("ready"))
        .catch((e) => {
          console.error(e);
          setErrorMsg("Failed to render this image as a panorama.");
          setStatus("error");
        });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setErrorMsg("Couldn't read that image file.");
      setStatus("error");
    };
    img.src = url;
  };

  return (
    <TesterShell
      containerRef={containerRef}
      onFile={handleFile}
      title="360° Image Quality Tester"
      buttonLabel="Upload panorama"
      accept="image/*"
      hint="or drag & drop an image anywhere on the viewer"
      fileName={fileName}
      status={status}
      errorMsg={errorMsg}
      emptyText="Upload a panorama image to preview it in 360°"
      info={imageInfo && (
        <>
          <div>{imageInfo.width} &times; {imageInfo.height}px &middot; {imageInfo.sizeKB} KB</div>
          <div style={{ color: imageInfo.isStandardRatio ? "#7CFC9A" : "#ffb84d" }}>
            Aspect ratio {imageInfo.ratio}:1
            {imageInfo.isStandardRatio ? " (equirectangular)" : " — expected 2:1 for a full sphere"}
          </div>
        </>
      )}
    />
  );
}

export default PanoramaImageTester;
