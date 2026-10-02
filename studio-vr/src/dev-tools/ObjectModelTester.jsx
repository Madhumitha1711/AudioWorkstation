import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { TesterShell, HelpText } from "./TesterShell";

const SUPPORTED_EXTENSIONS = ["glb", "gltf", "obj"];

function extensionOf(name) {
  return name.split(".").pop()?.toLowerCase();
}

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
  const [status, setStatus] = useState("empty");
  const [errorMsg, setErrorMsg] = useState("");
  const [wireframe, setWireframe] = useState(false);

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
      if (token !== loadTokenRef.current) return;
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

  return (
    <TesterShell
      containerRef={containerRef}
      onFile={loadFile}
      title="3D Model Quality Tester"
      buttonLabel="Upload model"
      accept=".glb,.gltf,.obj"
      hint=".glb, .gltf, or .obj — or drag & drop anywhere on the viewer"
      fileName={fileName}
      status={status}
      errorMsg={errorMsg}
      emptyText="Upload a .glb/.gltf/.obj scan to preview it in 3D"
      info={<>
        {fileInfo && <div>{fileInfo.sizeMB} MB</div>}
        {status === "loading" && <div style={{ color: "#ffb84d" }}>Loading&hellip;</div>}
        {status === "ready" && modelStats && (
          <div style={{ color: "#7CFC9A" }}>
            {modelStats.triangles.toLocaleString()} triangles &middot;{" "}
            {modelStats.vertices.toLocaleString()} vertices
            {modelStats.meshCount > 1 && ` · ${modelStats.meshCount} meshes`}
          </div>
        )}
      </>}
      footer={status === "ready" && (
        <>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "14px", fontSize: "12px", cursor: "pointer" }}>
            <input type="checkbox" checked={wireframe} onChange={(e) => setWireframe(e.target.checked)} />
            Wireframe
          </label>
          <HelpText style={{ marginTop: "12px" }}>Drag to orbit &middot; scroll to zoom</HelpText>
        </>
      )}
    />
  );
}

export default ObjectModelTester;
