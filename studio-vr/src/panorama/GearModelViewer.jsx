import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Small embedded, rotatable 3D preview shown inside a hotspot's info panel —
// the "pick this piece of gear up and look at it" companion to the flat
// description + audio narration.
//
// Pass `url` once a real photogrammetry scan (.glb/.gltf) exists for this
// piece of gear; until then, pass `kind` to fall back to a simple
// procedural placeholder mesh so the interaction (drag to rotate, scroll to
// zoom) can be evaluated end-to-end before any scan asset is ready.
function buildPlaceholder(kind) {
  const group = new THREE.Group();

  if (kind === "speaker") {
    const cabinet = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 2, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.85 }),
    );
    group.add(cabinet);

    const woofer = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 0.12, 32),
      new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.6 }),
    );
    woofer.rotation.x = Math.PI / 2;
    woofer.position.set(0, -0.4, 0.62);
    group.add(woofer);

    const tweeter = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 24, 24, 0, Math.PI * 2, 0, Math.PI / 1.6),
      new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.3, metalness: 0.4 }),
    );
    tweeter.rotation.x = Math.PI;
    tweeter.position.set(0, 0.55, 0.63);
    group.add(tweeter);
  } else if (kind === "mixing-console") {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.3, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.7 }),
    );
    group.add(body);

    const stripMaterial = new THREE.MeshStandardMaterial({
      color: 0x3d3d44,
      roughness: 0.6,
    });
    const knobMaterial = new THREE.MeshStandardMaterial({
      color: 0xdddddd,
      roughness: 0.4,
      metalness: 0.3,
    });
    const faderMaterial = new THREE.MeshStandardMaterial({
      color: 0xe8b23d,
      roughness: 0.5,
    });

    const channels = 8;
    const spacing = 2.6 / channels;
    for (let i = 0; i < channels; i += 1) {
      const x = -1.3 + spacing * i + spacing / 2;

      const strip = new THREE.Mesh(new THREE.BoxGeometry(spacing * 0.8, 0.04, 1.5), stripMaterial);
      strip.position.set(x, 0.17, 0);
      group.add(strip);

      for (let k = 0; k < 3; k += 1) {
        const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 16), knobMaterial);
        knob.position.set(x, 0.2, -0.55 + k * 0.35);
        group.add(knob);
      }

      const fader = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.2), faderMaterial);
      fader.position.set(x, 0.2, 0.55);
      group.add(fader);
    }
  } else {
    // Generic placeholder for any hotspot without a dedicated shape yet.
    group.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 1.2, 1.2),
        new THREE.MeshStandardMaterial({ color: 0x3d3d44, roughness: 0.7 }),
      ),
    );
  }

  return group;
}

// Points the camera at the object's actual bounding-sphere center and backs
// it off just far enough to fit the whole object in frame, accounting for
// both vertical AND horizontal FOV (whichever is tighter for the current
// container's aspect ratio). Unlike rescaling the object to a fixed target
// size, this adapts to whatever units/scale a real scan comes in at — a
// speaker exported in centimeters and one exported in meters both end up
// framed the same way, with nothing clipped off the edges.
function fitCameraToObject(object, camera, controls, padding = 1.1) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = size.length() / 2 || 1;

  const vFov = (camera.fov * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const limitingFov = Math.min(vFov, hFov);
  const distance = (radius / Math.sin(limitingFov / 2)) * padding;

  const direction = new THREE.Vector3(0, 0.35, 1).normalize();
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.near = Math.max(distance / 100, 0.01);
  camera.far = distance * 100;
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.minDistance = distance * 0.3;
  controls.maxDistance = distance * 4;
  controls.update();
}

function GearModelViewer({ url, kind, height = 340 }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let frameId;
    const width = mount.clientWidth;
    const heightPx = mount.clientHeight;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(40, width / heightPx, 0.1, 100);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, heightPx);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(3, 4, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8fb8ff, 0.4);
    fill.position.set(-4, -1, -2);
    scene.add(fill);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 2.2;

    let currentObject = buildPlaceholder(kind);
    scene.add(currentObject);
    fitCameraToObject(currentObject, camera, controls);

    if (url) {
      const loader = new GLTFLoader();
      loader.load(
        url,
        (gltf) => {
          if (disposed) return;
          scene.remove(currentObject);
          currentObject = gltf.scene;
          scene.add(currentObject);
          fitCameraToObject(currentObject, camera, controls);
        },
        undefined,
        (err) => {
          // Keep the placeholder on screen — a missing/broken scan
          // shouldn't blank out the panel, just silently fall back.
          console.warn(`[gear-model] failed to load ${url}, using placeholder`, err);
        },
      );
    }

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
      renderer.setSize(w, h);
      // Re-fit since a narrower/wider container can change which axis
      // (vertical vs horizontal FOV) is the tighter constraint.
      fitCameraToObject(currentObject, camera, controls);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(mount);

    return () => {
      disposed = true;
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
    };
    // Re-running on url/kind change intentionally rebuilds the whole scene —
    // simplest correct behavior for what's a fairly lightweight preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, kind]);

  return (
    <div
      ref={mountRef}
      // No border/radius of its own — this fills whatever container it's
      // dropped into (see .topic-model-box in CoursePage.css), which owns
      // the frame styling so it can match sibling media boxes exactly.
      style={{
        width: "100%",
        height: `${height}px`,
        background:
          "radial-gradient(circle at 50% 40%, rgba(255,255,255,0.08), rgba(0,0,0,0.25))",
        touchAction: "none",
      }}
    />
  );
}

export default GearModelViewer;
