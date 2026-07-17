import { useEffect, useRef, useState } from "react";
import { Viewer } from "@photo-sphere-viewer/core";
import "@photo-sphere-viewer/core/index.css";

// Standalone 360 image quality tester — not part of the studio tour.
// Upload any equirectangular (2:1) panorama and inspect it in a full
// 360-degree viewer: check for stitching seams, resolution, noise,
// compression artifacts, etc. before committing to a shot for the real tour.
function PanoramaImageTester() {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const objectUrlRef = useRef(null);

  const [fileName, setFileName] = useState(null);
  const [imageInfo, setImageInfo] = useState(null);
  const [status, setStatus] = useState("empty"); // empty | loading | ready | error
  const [errorMsg, setErrorMsg] = useState("");

  // Create the viewer once, mounted on an empty container. panorama gets
  // set/swapped later via viewer.setPanorama() as the user uploads images.
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

    // Read natural dimensions first so we can flag non-2:1 images —
    // photo-sphere-viewer will still render them, but quality/stretch
    // assessment is more meaningful on a properly equirectangular source.
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

  const onInputChange = (e) => handleFile(e.target.files?.[0]);

  const onDrop = (e) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div
        ref={containerRef}
        // isolation: "isolate" pins photo-sphere-viewer's internal z-index
        // stack (its navbar, notifications, fullscreen layer, etc. go as
        // high as z-index 9999) inside its own stacking context, so none of
        // it can paint above our sibling panel/button below regardless of
        // those internal values.
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
          360&deg; Image Quality Tester
        </div>

        <label style={uploadButtonStyle}>
          Upload panorama
          <input
            type="file"
            accept="image/*"
            onChange={onInputChange}
            style={{ display: "none" }}
          />
        </label>

        <div style={{ fontSize: "11px", opacity: 0.55, marginTop: "8px" }}>
          or drag &amp; drop an image anywhere on the viewer
        </div>

        {fileName && (
          <div style={{ marginTop: "14px", fontSize: "12px", lineHeight: 1.6 }}>
            <div style={{ opacity: 0.7 }}>{fileName}</div>
            {imageInfo && (
              <>
                <div>
                  {imageInfo.width} &times; {imageInfo.height}px &middot;{" "}
                  {imageInfo.sizeKB} KB
                </div>
                <div
                  style={{
                    color: imageInfo.isStandardRatio ? "#7CFC9A" : "#ffb84d",
                  }}
                >
                  Aspect ratio {imageInfo.ratio}:1
                  {imageInfo.isStandardRatio
                    ? " (equirectangular)"
                    : " — expected 2:1 for a full sphere"}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {status === "empty" && (
        <div style={overlayCenterStyle}>
          Upload a panorama image to preview it in 360&deg;
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

export default PanoramaImageTester;
