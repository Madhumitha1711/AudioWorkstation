import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";

// Standalone photogrammetry/3D-model quality tester — the third leg
// alongside PanoramaImageTester (360 stills) and GaussianSplatTester
// (radiance fields): upload a scanned .glb/.gltf/.obj of a single piece of
// gear and inspect it up close (orbit, zoom) to judge scan quality before
// wiring it into a hotspot's GearModelViewer.
//
// .glb is the safest format for this drag-and-drop flow since it bundles
// geometry + textures into one binary file. A .gltf will only work here if
// it was exported "embedded" (base64 data URIs) rather than referencing
// separate .bin/texture files, since there's no second file to resolve
// those references against. .obj loads geometry only (no embedded
// material/texture support via a lone .obj — pair it with its .mtl in a
// future pass if that turns out to matter).
const SUPPORTED_EXTENSIONS = ["glb", "gltf", "obj"];

function extensionOf(name) {
  return name.split(".").pop()?.toLowerCase();
}

// Centers + uniformly scales the loaded object so it fills a consistent
// amount of the viewport regardless of the source model's own units/origin.
function frameObject(object, camera, controls, targetSize = 2.4) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetSize / maxDim;

  object.position.sub(center.multiplyScalar(scale));
  object.scale.setScalar(scale);

  camera.position.set(0, targetSize * 0.35, targetSize * 1.6);
  controls.target.set(0, 0, 0);
  controls.minDistance = targetSize * 0.6;
  controls.maxDistance = targetSize * 4;
  controls.update();
}

function collectStats(object) {
  let triangles = 0;
  let vertices = 0;
  let meshCount = 0;

  object.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    meshCount += 1;
    const geo = child.geometry;
    const posAttr = geo.attributes?.position;
    if (posAttr) vertices += posAttr.count;
    if (geo.index) triangles += geo.index.count / 3;
    else if (posAttr) triangles += posAttr.count / 3;
  });

  return { triangles: Math.round(triangles), vertices, meshCount };
}

function ObjectModelTester() {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const currentObjectRef = useRef(null);
  const objectUrlRef = useRef(null);
  const loadTokenRef = useRef(0);

  const [fileName, setFileName] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);
  const [modelStats, setModelStats] = useState(null);
  const [status, setStatus] = useState("empty"); // empty | loading | ready | error
  const [errorMsg, setErrorMsg] = useState("");
  const [wireframe, setWireframe] = useState(false);

  // Set up the persistent scene/renderer/controls once.
  useEffect(() => {
    const mount = containerRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.05, 200);
    camera.position.set(0, 1, 4);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x111111, 1);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.3);
    key.position.set(4, 6, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8fb8ff, 0.5);
    fill.position.set(-5, -1, -3);
    scene.add(fill);
    const grid = new THREE.GridHelper(10, 20, 0x333333, 0x222222);
    grid.position.y = -1.2;
    scene.add(grid);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controlsRef.current = controls;

    let frameId;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(mount);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          materials.forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  // Toggle wireframe on whatever's currently loaded — handy for spotting
  // topology/mesh-density issues that don't show up in shaded view.
  useEffect(() => {
    const object = currentObjectRef.current;
    if (!object) return;
    object.traverse((child) => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((m) => {
        if (m) m.wireframe = wireframe;
      });
    });
  }, [wireframe]);

  const loadFile = (file) => {
    if (!file) return;
    const ext = extensionOf(file.name);
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      setErrorMsg("Unsupported file type. Upload a .glb, .gltf, or .obj model.");
      setStatus("error");
      return;
    }

    const token = ++loadTokenRef.current;
    setStatus("loading");
    setErrorMsg("");
    setFileName(file.name);
    setFileInfo({ sizeMB: (file.size / (1024 * 1024)).toFixed(2), ext });
    setModelStats(null);

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;

    const onLoaded = (object) => {
      if (token !== loadTokenRef.current) return; // superseded by a newer upload
      const scene = sceneRef.current;
      if (currentObjectRef.current) {
        scene.remove(currentObjectRef.current);
      }
      object.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = false;
          if (!child.material) {
            child.material = new THREE.MeshStandardMaterial({ color: 0x9a9a9a });
          }
        }
      });
      scene.add(object);
      currentObjectRef.current = object;
      frameObject(object, cameraRef.current, controlsRef.current);
      setModelStats(collectStats(object));
      setStatus("ready");
    };

    const onError = (err) => {
      if (token !== loadTokenRef.current) return;
      console.error("Model load error:", err);
      setErrorMsg(
        `Failed to load this ${ext.toUpperCase()} file. ${
          ext === "gltf"
            ? "Separate .gltf files need their .bin/texture files alongside them — try exporting as .glb (self-contained) instead."
            : "It may be corrupt or use an unsupported feature."
        }`,
      );
      setStatus("error");
    };

    if (ext === "glb" || ext === "gltf") {
      new GLTFLoader().load(url, (gltf) => onLoaded(gltf.scene), undefined, onError);
    } else if (ext === "obj") {
      new OBJLoader().load(url, onLoaded, undefined, onError);
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
          3D Model Quality Tester
        </div>

        <label style={uploadButtonStyle}>
          Upload model
          <input
            type="file"
            accept=".glb,.gltf,.obj"
            onChange={onInputChange}
            style={{ display: "none" }}
          />
        </label>

        <div style={{ fontSize: "11px", opacity: 0.55, marginTop: "8px" }}>
          .glb, .gltf, or .obj &mdash; or drag &amp; drop anywhere on the
          viewer
        </div>

        {fileName && (
          <div style={{ marginTop: "14px", fontSize: "12px", lineHeight: 1.6 }}>
            <div style={{ opacity: 0.7 }}>{fileName}</div>
            {fileInfo && <div>{fileInfo.sizeMB} MB</div>}
            {status === "loading" && (
              <div style={{ color: "#ffb84d" }}>Loading&hellip;</div>
            )}
            {status === "ready" && modelStats && (
              <div style={{ color: "#7CFC9A" }}>
                {modelStats.triangles.toLocaleString()} triangles &middot;{" "}
                {modelStats.vertices.toLocaleString()} vertices
                {modelStats.meshCount > 1 && ` · ${modelStats.meshCount} meshes`}
              </div>
            )}
          </div>
        )}

        {status === "ready" && (
          <>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                marginTop: "14px",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={wireframe}
                onChange={(e) => setWireframe(e.target.checked)}
              />
              Wireframe
            </label>

            <div
              style={{
                marginTop: "12px",
                fontSize: "11px",
                lineHeight: 1.6,
                opacity: 0.6,
                borderTop: "1px solid rgba(255,255,255,0.15)",
                paddingTop: "10px",
              }}
            >
              Drag to orbit &middot; scroll to zoom
            </div>
          </>
        )}
      </div>

      {status === "empty" && (
        <div style={overlayCenterStyle}>
          Upload a .glb/.gltf/.obj scan to preview it in 3D
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

export default ObjectModelTester;
