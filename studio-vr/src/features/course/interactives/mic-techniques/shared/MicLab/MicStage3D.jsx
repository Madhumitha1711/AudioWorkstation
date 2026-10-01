import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { canvasFont } from "../../../../../../theme/fonts";
import "./micLab.css";

// MicStage3D — the 3D room shared by the Ch.7 mic labs:
// MicTechniqueGuideLab (a fixed, refresher view of each technique) and
// MicPlacementGuideLab (the interactive placement lab). Same 6 × 4.5 × 3 m
// room, look and orbit camera as the original 3D mic rooms, and the
// same models from public/3D assets/ (drum kit, electric guitar, tabla,
// snare), driven entirely by one `view` prop:
//
//   { kind: "single", source, spots, current, best?, hotspots?, frame }
//       one mic on a stand. `spots` = [{ id, label, m, off?, corner? }]
//       (m = metres in front of the source, off = degrees off-axis). With
//       `hotspots` every spot is a clickable floor spot →
//       onHotspot("spot", id). frame "close" = close-up camera on the
//       source; "full" = side-on view of the whole 3 m range.
//   { kind: "stereo", source, pair, side? }
//       a stereo technique straight in front of the source: XY / ORTF /
//       AB / MS / Blumlein, Overheads (drums), Decca Tree / Outriggers
//       (ensemble). Every mic on its own straight stand, with its pickup
//       lobe and a dashed line along its axis.
//   { kind: "ensemble", ens, layers, ghosts?, spot? }
//       band / chamber / choir with mic layers (close / main / spots /
//       room). `ghosts` shows switched-off layers faintly. With `spot`
//       (Spot Miking) only the main pair + one spot mic on that player are
//       shown, and the other players are floor spots → onHotspot("target", id).
//   { kind: "multi", target, mics }
//       several mics on one source: snare top/bottom, kick in/out, guitar
//       amp close on-axis / off-axis / room.
//
// Sources with no model (voice, groups of players, the amp) are simple
// built shapes. A figure-8 mic is drawn as an upright side-address ribbon;
// cardioid / omni as an end-address pencil mic on a clip mount.
//
// Structure: the Three.js scene lives
// in refs outside React's render cycle. One effect builds the renderer /
// room / camera once (and tears everything down); a second rebuilds only
// the `content` group whenever `view` changes. GLB models are cached at
// module level (16–24 MB each), so switching views never re-downloads them,
// and a model arriving for a view that's already gone is dropped (build
// token). The camera is framed per view (presetFor) and never moves when a
// position / pair / layer is picked. Colours come from the --ml-* tokens
// in micLab.css (room surfaces mixed from the course theme); the scene is
// rebuilt when <html data-theme> or the brand palette changes.

const ROOM_W = 6.0;
const ROOM_D = 4.5;
const ROOM_H = 3.0;
const SRC_Z = -1.5; // where a single source stands (it faces +z, toward the camera)

// ---------------------------------------------------------------- models
const MODEL_BASE = "/3D%20assets/"; // "3D assets" — space is URL-encoded
const gltfLoader = new GLTFLoader();
const modelCache = new Map(); // url -> Promise<Object3D> template (always cloned)

function loadModel(file) {
  const url = MODEL_BASE + file;
  if (!modelCache.has(url)) {
    modelCache.set(
      url,
      new Promise((resolve, reject) => {
        gltfLoader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
      }),
    );
  }
  return modelCache.get(url);
}

// Clone a cached model, sit it on the floor, scale its largest side to
// `size` metres. Nodes are flagged so clearing the scene never disposes the
// cached template's shared geometry.
function instantiate(template, size, rotY = 0) {
  const clone = template.clone(true);
  clone.traverse((n) => (n.userData.shared = true));
  const box = new THREE.Box3().setFromObject(clone);
  const s = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  clone.position.set(-c.x, -box.min.y, -c.z);
  const wrap = new THREE.Group();
  wrap.add(clone);
  wrap.scale.setScalar(size / (Math.max(s.x, s.y, s.z) || 1));
  wrap.rotation.y = rotY;
  return wrap;
}

// Model per source (size in metres for the largest side, rotation).
const MODELS = {
  guitar: { file: "electric_guitar.glb", size: 1.05, rotY: 0 }, // front already faces +z (toward the mic)
  drums: { file: "drum_kit.glb", size: 1.4, rotY: 0 },
  solo: { file: "tabla_drums.glb", size: 1.4, rotY: 0 },
};

// Where each single source is "heard" from (relative to its base), and how
// far in front of that point the body of the source extends.
const SOURCE_AIM = {
  voice: { y: 1.55, z: 0.12, front: 0.08 },
  guitar: { y: 0.5, z: 0, front: 0.25 },
  drums: { y: 0.7, z: 0, front: 0.5 },
  solo: { y: 0.45, z: 0, front: 0.35 },
  ensemble: { y: 1.3, z: 0.4, front: 0.3 },
};

// ---------------------------------------------------------------- helpers
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

function zCyl(rTop, rBot, h, seg = 16) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  g.rotateX(Math.PI / 2);
  return g;
}

// Polar pickup as a closed surface around +Z (lathe of r(θ) about Y, then
// turned so Y → Z).
function lobeGeometry(kind, scale) {
  const pts = [];
  for (let i = 0; i <= 48; i++) {
    const t = (i / 48) * Math.PI;
    const g = kind === "omni" ? 1 : kind === "fig8" ? Math.abs(Math.cos(t)) : 0.5 + 0.5 * Math.cos(t);
    pts.push(new THREE.Vector2(Math.max(1e-4, g * scale * Math.sin(t)), g * scale * Math.cos(t)));
  }
  const geo = new THREE.LatheGeometry(pts, 32);
  geo.rotateX(Math.PI / 2);
  return geo;
}

// Text label as a sprite. sizeAttenuation is off, so `size` is a fraction
// of the view height and labels stay readable at any zoom.
function textSprite(text, color, { size = 0.045, weight = 600, bg = null } = {}) {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  const font = canvasFont(44, { weight });
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 28;
  c.width = w;
  c.height = 64;
  ctx.font = font;
  if (bg) {
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(0, 4, w, 56, 28);
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false }),
  );
  sprite.scale.set((size * w) / 64, size, 1);
  sprite.renderOrder = 10;
  return sprite;
}

// Text printed flat on the floor grid. `facing` is where the reader stands:
// "side" = the Mono camera on +x (text runs along the source→mic line),
// "front" = the Stereo / Ensemble camera on +z.
function floorText(text, color, { height = 0.07, weight = 600, facing = "front" } = {}) {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  const font = canvasFont(56, { weight });
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 16;
  c.width = w;
  c.height = 72;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, 38);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry((height * w) / 72, height),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2; // lie flat, text up = -z
  const g = new THREE.Group();
  if (facing === "side") g.rotation.y = Math.PI / 2; // text runs along -z, up = -x
  g.add(mesh);
  g.position.y = 0.006;
  return g;
}

// Resolve a CSS colour token (which may be a var()/color-mix() chain, e.g.
// the floor is mixed from the theme's --bg / --text / --brand-accent) to a
// THREE.Color: the browser computes it on a probe element, then a 1×1
// canvas turns whatever format it reports (rgb(), color(srgb …), …) into
// plain RGB bytes.
function resolveToken(el, name, fallback) {
  const probe = document.createElement("span");
  probe.style.cssText = `position:absolute;visibility:hidden;color:var(${name}, ${fallback})`;
  el.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const ctx = c.getContext("2d");
  ctx.fillStyle = fallback;
  ctx.fillStyle = computed;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
}

function safeColor(str, fallback) {
  try {
    const c = new THREE.Color();
    c.setStyle(str || fallback);
    return c;
  } catch {
    return new THREE.Color(fallback);
  }
}

// ---------------------------------------------------------------- component
export default function MicStage3D({ view, onHotspot }) {
  const wrapRef = useRef(null);
  const onSelectRef = useRef(onHotspot);
  useEffect(() => {
    onSelectRef.current = onHotspot;
  }, [onHotspot]);
  const canvasRef = useRef(null);
  const apiRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(0);
  const [hinted, setHinted] = useState(false);

  // ---- one-time scene setup ----
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return undefined;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch {
      setFailed(true);
      return undefined;
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.05, 60);
    const roomGroup = new THREE.Group();
    const content = new THREE.Group();
    scene.add(roomGroup, content);

    const tok = (name, fb) => getComputedStyle(wrap).getPropertyValue(name).trim() || fb;
    let colors = {};
    function readColors() {
      colors = {
        bg: resolveToken(wrap, "--ml-screen-bg", "#0e0e11"),
        floor: resolveToken(wrap, "--ml-floor", "#1b1c21"),
        wall: resolveToken(wrap, "--ml-wall", "#c9c6cf"),
        grid: resolveToken(wrap, "--ml-grid", "#3a3a44"),
        label: tok("--ml-label", "#8b8890"),
        labelBg: tok("--ml-label-bg", "rgba(0,0,0,0.55)"),
        src: safeColor(tok("--ml-src", "#c9c6cf"), "#c9c6cf"),
        accent: resolveToken(wrap, "--brand-accent", "#5fd9a0"),
        lobe: safeColor(tok("--ml-lobe", "#54d6e0"), "#54d6e0"),
        lobeB: safeColor(tok("--ml-lobe-b", "#e8934a"), "#e8934a"),
        good: safeColor(tok("--ml-good", "#5fd9a0"), "#5fd9a0"),
        layer: {
          close: safeColor(tok("--ml-c-close", "#e8934a"), "#e8934a"),
          main: safeColor(tok("--ml-c-main", "#54d6e0"), "#54d6e0"),
          spots: safeColor(tok("--ml-c-spots", "#a78bfa"), "#a78bfa"),
          room: safeColor(tok("--ml-c-room", "#6fa8e0"), "#6fa8e0"),
        },
      };
    }

    // ---- room ----
    function buildRoom() {
      roomGroup.clear();
      scene.background = colors.bg;
      scene.fog = new THREE.Fog(colors.bg.getHex(), 7, 16);
      roomGroup.add(new THREE.HemisphereLight(colors.bg.clone().lerp(new THREE.Color("#ffffff"), 0.6), colors.floor, 1.1));
      const sun = new THREE.DirectionalLight(0xffffff, 1.1);
      sun.position.set(3, 5.5, 3);
      roomGroup.add(sun);
      const fill = new THREE.DirectionalLight(0xffffff, 0.45);
      fill.position.set(-3, 3, 2);
      roomGroup.add(fill);

      const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), new THREE.MeshLambertMaterial({ color: colors.floor }));
      floor.rotation.x = -Math.PI / 2;
      roomGroup.add(floor);
      const grid = new THREE.GridHelper(ROOM_W, 12, colors.grid, colors.grid);
      grid.scale.z = ROOM_D / ROOM_W;
      grid.position.y = 0.002;
      grid.material.transparent = true;
      grid.material.opacity = 0.5;
      roomGroup.add(grid);

      const wallMat = new THREE.MeshBasicMaterial({ color: colors.wall, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false });
      [
        [ROOM_W, 0, -ROOM_D / 2, 0],
        [ROOM_D, -ROOM_W / 2, 0, Math.PI / 2],
        [ROOM_D, ROOM_W / 2, 0, -Math.PI / 2],
      ].forEach(([w, x, z, ry]) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, ROOM_H), wallMat);
        m.position.set(x, ROOM_H / 2, z);
        m.rotation.y = ry;
        roomGroup.add(m);
      });
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(ROOM_W, ROOM_H, ROOM_D)),
        new THREE.LineBasicMaterial({ color: colors.wall, transparent: true, opacity: 0.12 }),
      );
      edges.position.y = ROOM_H / 2;
      roomGroup.add(edges);
    }

    // ---- materials ----
    const MIC_BODY = new THREE.MeshStandardMaterial({ color: "#7d8588", roughness: 0.32, metalness: 0.6 });
    const MIC_GRILLE = new THREE.MeshStandardMaterial({ color: "#b8bfc2", roughness: 0.5, metalness: 0.4 });
    const STAND = new THREE.MeshStandardMaterial({ color: "#6c7476", roughness: 0.4, metalness: 0.6 });
    const ghostCache = new Map();
    const keepMats = new Set([MIC_BODY, MIC_GRILLE, STAND]); // shared — never disposed with the content
    function ghostOf(mat) {
      if (!ghostCache.has(mat)) {
        const g = mat.clone();
        g.transparent = true;
        g.opacity = 0.16;
        g.depthWrite = false;
        ghostCache.set(mat, g);
        keepMats.add(g);
      }
      return ghostCache.get(mat);
    }

    // Floor stand for a mic whose capsule is at `pos`, aimed along `aimDir`.
    // The pole rises under the middle of the mic body (not under the
    // capsule tip) and holds it with a short swivel clip, so the mic sits
    // on top of the stand like a real clip mount — no L-shaped corner.
    //
    // A side-address (figure-8 / ribbon) mic stands upright on the pole, so
    // its stand comes straight up underneath the capsule.
    function standUnder(pos, aimDir, ghost = false, sideAddress = false) {
      const g = new THREE.Group();
      const mount = sideAddress ? pos.clone() : pos.clone().sub(aimDir.clone().multiplyScalar(0.07)); // body centre
      const top = Math.max(mount.y - (sideAddress ? 0.105 : 0.045), 0.06);
      const mat = ghost ? ghostOf(STAND) : STAND;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, top, 10), mat);
      pole.position.set(mount.x, top / 2, mount.z);
      const clip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.012, 0.03, 12), mat);
      clip.position.set(mount.x, top + 0.015, mount.z);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.02, 18), mat);
      foot.position.set(mount.x, 0.01, mount.z);
      g.add(pole, clip, foot);
      return g;
    }

    // A mic on a stand at `pos`, capsule aimed at `aim`. Optional polar
    // lobe + aim line in `color`; `ghost` = switched-off layer.
    function micRig({ pos, aim, color, pattern = "cardioid", lobe = 0, ghost = false, dir = null, stand = true, line = true }) {
      const g = new THREE.Group();
      const head = new THREE.Group();
      head.position.copy(pos);
      if (dir) head.lookAt(pos.clone().add(dir));
      else head.lookAt(aim);
      const ringMat = new THREE.MeshBasicMaterial({ color, transparent: ghost, opacity: ghost ? 0.25 : 1 });
      if (pattern === "fig8") {
        // Figure-8 = a side-address ribbon mic: an upright flat body that
        // hears equally from its front and back faces (both along +/-Z).
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.15, 0.03), ghost ? ghostOf(MIC_BODY) : MIC_BODY);
        const faceGeo = new THREE.BoxGeometry(0.046, 0.11, 0.004);
        const front = new THREE.Mesh(faceGeo, ghost ? ghostOf(MIC_GRILLE) : MIC_GRILLE);
        front.position.set(0, 0.01, 0.016);
        const back = new THREE.Mesh(faceGeo, ghost ? ghostOf(MIC_GRILLE) : MIC_GRILLE);
        back.position.set(0, 0.01, -0.016);
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.012, 0.032), ringMat);
        band.position.y = -0.06;
        head.add(body, front, back, band);
      } else {
        // End-address pencil mic (cardioid / omni): pickup off the tip (+Z).
        const body = new THREE.Mesh(zCyl(0.018, 0.018, 0.16), ghost ? ghostOf(MIC_BODY) : MIC_BODY);
        body.position.z = -0.07;
        const grille = new THREE.Mesh(zCyl(0.026, 0.026, 0.05), ghost ? ghostOf(MIC_GRILLE) : MIC_GRILLE);
        grille.position.z = 0.03;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.006, 8, 20), ringMat);
        head.add(body, grille, ring);
      }
      if (lobe && !ghost) {
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(lobeGeometry(pattern, lobe), mat);
        const wire = new THREE.LineSegments(
          new THREE.EdgesGeometry(lobeGeometry(pattern, lobe), 25),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 }),
        );
        head.add(mesh, wire);
      }
      g.add(head);
      if (stand) {
        const aimDir = dir ? dir.clone().normalize() : aim.clone().sub(pos).normalize();
        g.add(standUnder(pos, aimDir, ghost, pattern === "fig8"));
      }
      if (line && !ghost && aim) {
        const geo = new THREE.BufferGeometry().setFromPoints([pos, aim]);
        const l = new THREE.Line(geo, new THREE.LineDashedMaterial({ color, dashSize: 0.06, gapSize: 0.05, transparent: true, opacity: 0.7 }));
        l.computeLineDistances();
        g.add(l);
      }
      return g;
    }

    // Simple standing / seated figure facing +z.
    const FIG = new THREE.MeshStandardMaterial({ color: "#9aa3a8", roughness: 0.8 });
    function figure({ x = 0, z = 0, scale = 1, seated = false, rot = 0 } = {}) {
      const g = new THREE.Group();
      const mat = FIG.clone();
      mat.color = colors.src.clone().multiplyScalar(0.85);
      const legH = seated ? 0.45 : 0.8;
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.5, 4, 12), mat);
      torso.position.y = legH + 0.36;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), mat);
      head.position.y = legH + 0.8;
      g.add(torso, head);
      if (seated) {
        const chair = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.45, 0.4), mat);
        chair.position.set(0, 0.225, -0.05);
        g.add(chair);
      } else {
        const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, legH, 10), mat);
        legs.position.y = legH / 2;
        g.add(legs);
      }
      g.position.set(x, 0, z);
      g.rotation.y = rot;
      g.scale.setScalar(scale);
      return g;
    }

    // Arc of positions around (cx, cz), facing +z.
    function arc(count, radius, spreadDeg, cz) {
      const out = [];
      for (let i = 0; i < count; i++) {
        const a = THREE.MathUtils.degToRad(-spreadDeg / 2 + (count === 1 ? spreadDeg / 2 : (spreadDeg * i) / (count - 1)));
        out.push({ x: radius * Math.sin(a), z: cz - radius * Math.cos(a), rot: -a * 0.6 });
      }
      return out;
    }

    function label(text, x, y, z, color) {
      const s = textSprite(text, color || colors.label, { size: 0.017, weight: 500, bg: colors.labelBg });
      s.position.set(x, y, z);
      return s;
    }

    // ---- content builders ----
    let buildToken = 0;
    let pending = 0;
    const bump = (d) => {
      pending += d;
      setLoading(pending);
    };

    function addModel(group, key, x, z, token, rotY) {
      const m = MODELS[key];
      bump(1);
      loadModel(m.file)
        .then((tpl) => {
          if (token !== buildToken) return;
          const inst = instantiate(tpl, m.size, rotY ?? m.rotY);
          inst.position.set(x, 0, z);
          group.add(inst);
        })
        .catch((err) => console.error(`[MicStage3D] ${m.file} failed to load`, err))
        .finally(() => bump(-1));
    }

    function addSource(group, source, token) {
      if (MODELS[source]) addModel(group, source, 0, SRC_Z, token);
      else if (source === "voice") group.add(figure({ z: SRC_Z }));
      else if (source === "ensemble") arc(7, 1.2, 110, SRC_Z + 0.9).forEach((p) => group.add(figure({ ...p, scale: 0.92 })));
    }

    const aimOf = (source) => v3(0, SOURCE_AIM[source].y, SRC_Z + SOURCE_AIM[source].z);

    function disposeContent() {
      content.traverse((n) => {
        if (n.userData.shared) return;
        if (n.geometry) n.geometry.dispose();
        if (n.material && !keepMats.has(n.material)) {
          if (n.material.map) n.material.map.dispose();
          n.material.dispose();
        }
      });
      content.clear();
    }

    const cam = { target: v3(0, 1, -0.4), goalTarget: v3(0, 1, -0.4), r: 5.4, goalR: 5.4, theta: 0.6, goalTheta: 0.6, phi: 1.12, goalPhi: 1.12 };
    // A hotspot on the floor: a ring (accent = where the mic is now, green =
    // sweet spot) and, for spots the mic isn't on, a pulsing filled disc
    // you click to move it there. A larger transparent disc is the click
    // target so the spot is easy to hit from any angle.
    function floorSpot(x, z, { on, isBest = false, hotspot, hitR = 0.18, k = 1 }) {
      const ringColor = on ? colors.accent : isBest ? colors.good : colors.accent;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.1 * k, 0.13 * k, 40),
        new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: on || isBest ? 0.95 : 0.55, side: THREE.DoubleSide, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.006, z);
      content.add(ring);
      if (on) {
        const fill = new THREE.Mesh(
          new THREE.CircleGeometry(0.1 * k, 40),
          new THREE.MeshBasicMaterial({ color: colors.accent, transparent: true, opacity: 0.35, depthWrite: false }),
        );
        fill.rotation.x = -Math.PI / 2;
        fill.position.set(x, 0.005, z);
        content.add(fill);
        return;
      }
      const dot = new THREE.Mesh(
        new THREE.CircleGeometry(0.075 * k, 32),
        new THREE.MeshBasicMaterial({ color: isBest ? colors.good : colors.accent, transparent: true, opacity: 0.6, depthWrite: false }),
      );
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(x, 0.007, z);
      const hit = new THREE.Mesh(
        new THREE.CircleGeometry(hitR, 24),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      hit.rotation.x = -Math.PI / 2;
      hit.position.set(x, 0.008, z);
      hit.userData.hotspot = dot.userData.hotspot = ring.userData.hotspot = hotspot;
      content.add(dot, hit);
      hotspots.push(hit, dot, ring);
      pulsing.push(dot);
    }

    // ================================================================
    // Scene builders, one per view kind
    // ================================================================

    // Where a single-mic spot sits: `m` metres in front of the source's
    // body along an angle `off` (degrees, 0 = on-axis), or the room corner.
    function spotPos(source, spot) {
      const aim = aimOf(source);
      if (spot.corner) return v3(-2.35, 2.0, 1.75);
      const front = SOURCE_AIM[source].front;
      const a = THREE.MathUtils.degToRad(spot.off || 0);
      const dist = front + spot.m;
      const y = spot.m >= 1 && aim.y < 1.2 ? Math.min(aim.y + 0.5 * spot.m, 1.5) : aim.y;
      return v3(aim.x + Math.sin(a) * dist, y, aim.z + Math.cos(a) * dist);
    }

    // single: one mic on a stand. `spots` are the positions it can take
    // (floor hotspots when `hotspots` is on), `current` is where it is.
    function buildSingle(v, token) {
      addSource(content, v.source, token);
      const aim = aimOf(v.source);
      const close = v.frame === "close";
      const accentHex = `#${colors.accent.getHexString()}`;
      v.spots.forEach((spot, i) => {
        const p = spotPos(v.source, spot);
        const on = spot.id === v.current;
        if (v.hotspots) {
          const tight = close || spot.m < 0.5;
          floorSpot(p.x, p.z, { on, isBest: spot.id === v.best, hotspot: { type: "spot", id: spot.id }, hitR: tight ? 0.06 : 0.18, k: tight ? (close ? 0.4 : 0.55) : 1 });
        }
        if (v.hotspots || on) {
          // label printed on the grid beside the spot; close spots are only
          // centimetres apart, so labels alternate rows
          const t = floorText(spot.label, on ? accentHex : colors.label, { facing: "side", height: close ? 0.045 : 0.15 });
          t.position.x = p.x + (close ? (i % 2 ? 0.2 : 0.11) : i % 2 ? 0.62 : 0.3);
          t.position.z = p.z;
          content.add(t);
        }
      });
      const cur = v.spots.find((s) => s.id === v.current) || v.spots[0];
      content.add(micRig({ pos: spotPos(v.source, cur), aim, color: colors.accent, lobe: close ? 0.16 : 0.32 }));
    }

    // Stereo: the pair stands straight in front of the source, facing it.
    // `r` = distance from the source's aim point, `y` = rig height, `ab` =
    // AB spacing.
    const PAIR_SETUP = {
      voice: { r: 0.9, y: 1.6, ab: 0.4 },
      guitar: { r: 1.0, y: 0.85, ab: 0.5 },
      drums: { r: 1.0, y: 1.85, ab: 0.7 }, // in front of the kit, high, angled down
      solo: { r: 1.2, y: 1.1, ab: 0.6 },
      ensemble: { r: 2.1, y: 2.0, ab: 0.9 },
    };

    const dashed = (from, to, color, opacity = 0.75) => {
      const l = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([from, to]),
        new THREE.LineDashedMaterial({ color, dashSize: 0.05, gapSize: 0.04, transparent: true, opacity }),
      );
      l.computeLineDistances();
      content.add(l);
    };

    // Mic on its own straight stand + a dashed line along its pickup axis
    // (both ways for a figure-8).
    function axisMic({ p, dir, c, k = "cardioid", lobe = 0.32, reach = 1 }) {
      const axis = dir.clone().normalize();
      content.add(micRig({ pos: p, aim: null, dir: axis, color: c, pattern: k, lobe, stand: false, line: false }));
      content.add(standUnder(p, axis, false, k === "fig8"));
      dashed(p, p.clone().add(axis.clone().multiplyScalar(reach)), c);
      if (k === "fig8") dashed(p, p.clone().sub(axis.clone().multiplyScalar(reach * 0.6)), c);
    }

    function buildStereo(v, token) {
      addSource(content, v.source, token);
      const aim = aimOf(v.source);
      const setup = PAIR_SETUP[v.source];
      const center = v3(aim.x, setup.y, aim.z + setup.r);
      const d = aim.clone().sub(center).normalize();
      let right = new THREE.Vector3().crossVectors(d, v3(0, 1, 0));
      if (right.length() < 0.3) right = v3(1, 0, 0);
      right.normalize();
      const up = new THREE.Vector3().crossVectors(right, d).normalize();
      const rot = (deg) => d.clone().applyAxisAngle(up, THREE.MathUtils.degToRad(deg));
      const A = colors.lobe;
      const B = colors.lobeB;
      const C = colors.good;
      const R = (m) => right.clone().multiplyScalar(m);
      const reach = Math.min(center.distanceTo(aim), 1.2);
      const toward = (p, target) => target.clone().sub(p);
      const caps = [];
      switch (v.pair) {
        case "xy": // coincident pairs sit a few cm apart so each mic has its own stand
          caps.push({ p: center.clone().sub(R(0.03)), dir: rot(45), c: A });
          caps.push({ p: center.clone().add(R(0.03)), dir: rot(-45), c: B });
          break;
        case "ortf":
          caps.push({ p: center.clone().sub(R(0.085)), dir: rot(55), c: A });
          caps.push({ p: center.clone().add(R(0.085)), dir: rot(-55), c: B });
          break;
        case "ab":
          caps.push({ p: center.clone().sub(R(setup.ab / 2)), dir: d, c: A, k: "omni", lobe: 0.2 });
          caps.push({ p: center.clone().add(R(setup.ab / 2)), dir: d, c: B, k: "omni", lobe: 0.2 });
          break;
        case "ms":
          caps.push({ p: center.clone().sub(R(0.04)), dir: d, c: A });
          caps.push({ p: center.clone().add(R(0.05)), dir: right.clone(), c: B, k: "fig8", lobe: 0.12 + 0.5 * (v.side ?? 0.6) });
          break;
        case "overhead": {
          // spaced pair high over the front of the kit, each aimed down at
          // its side of the cymbals
          const L = center.clone().sub(R(0.45));
          const Rr = center.clone().add(R(0.45));
          caps.push({ p: L, dir: toward(L, v3(-0.35, 0.95, aim.z)), c: A });
          caps.push({ p: Rr, dir: toward(Rr, v3(0.35, 0.95, aim.z)), c: B });
          break;
        }
        case "decca":
        case "outrigger": {
          // Decca Tree: L / R wide apart, the centre mic forward of them
          const y = 2.45;
          const Lp = v3(-0.85, y, aim.z + 2.25);
          const Rp = v3(0.85, y, aim.z + 2.25);
          const Cp = v3(0, y, aim.z + 1.7);
          caps.push({ p: Lp, dir: toward(Lp, v3(-0.6, 1.2, aim.z)), c: A, k: "omni", lobe: 0.2 });
          caps.push({ p: Rp, dir: toward(Rp, v3(0.6, 1.2, aim.z)), c: B, k: "omni", lobe: 0.2 });
          caps.push({ p: Cp, dir: toward(Cp, aim), c: C, k: "omni", lobe: 0.2 });
          if (v.pair === "outrigger") {
            const OL = v3(-2.3, 2.2, aim.z + 1.3);
            const OR = v3(2.3, 2.2, aim.z + 1.3);
            caps.push({ p: OL, dir: toward(OL, v3(-1.1, 1.2, aim.z)), c: A, k: "omni", lobe: 0.2 });
            caps.push({ p: OR, dir: toward(OR, v3(1.1, 1.2, aim.z)), c: B, k: "omni", lobe: 0.2 });
          }
          break;
        }
        case "blumlein":
        default:
          caps.push({ p: center.clone().sub(R(0.05)), dir: rot(45), c: A, k: "fig8" });
          caps.push({ p: center.clone().add(R(0.05)), dir: rot(-45), c: B, k: "fig8" });
      }
      caps.forEach((c) => axisMic({ ...c, reach }));
    }

    // Ensemble set-ups. `layers` = mic layers switched on; with `ghosts`
    // the switched-off layers stay as faint ghosts. With `spot` set (the
    // Spot Miking view) the scene shows the main pair for context plus one
    // spot mic on the chosen player/section, and the other players get
    // floor hotspots.
    function ensembleSpots(ens) {
      if (ens === "band") {
        return [
          { id: "vocal", pos: v3(0, 1.55, 0.4), aim: v3(0, 1.55, 0.15) },
          { id: "drums", pos: v3(0.3, 0.85, -0.95), aim: v3(0.15, 0.65, -1.2) },
          { id: "guitar", pos: v3(1.25, 0.5, -0.25), aim: v3(1.4, 0.5, -0.7) },
          { id: "bass", pos: v3(-1.25, 0.5, -0.25), aim: v3(-1.4, 0.5, -0.7) },
          { id: "keys", pos: v3(-0.9, 1.15, 0.45), aim: v3(-0.9, 0.9, 0.1) },
        ];
      }
      if (ens === "chamber") {
        return arc(4, 1.0, 120, -0.4).map((s, i) => ({
          id: ["vln1", "vln2", "viola", "cello"][i],
          pos: v3(s.x * 0.85, i === 3 ? 1.1 : 1.45, s.z + 0.6),
          aim: v3(s.x, i === 3 ? 0.8 : 1.0, s.z),
        }));
      }
      return [-40, -13, 13, 40].map((deg, i) => {
        const a = THREE.MathUtils.degToRad(deg);
        return {
          id: ["s", "a", "t", "b"][i],
          pos: v3(0.75 * Math.sin(a), 1.9, 0.6 - 0.75 * Math.cos(a)),
          aim: v3(1.6 * Math.sin(a), 1.3, 0.6 - 1.6 * Math.cos(a)),
        };
      });
    }

    function buildEnsemble(v, token) {
      const on = new Set(v.layers || []);
      const ghosts = v.ghosts !== false && !v.spot;
      const rig = (layer, pos, aim, pattern = "cardioid") => {
        if (!on.has(layer) && !ghosts) return;
        content.add(micRig({ pos, aim, color: colors.layer[layer], ghost: !on.has(layer), pattern, lobe: 0, line: on.has(layer) }));
      };
      const room = () => {
        rig("room", v3(-2.5, 2.1, 1.9), v3(0, 1.2, -1));
        rig("room", v3(2.5, 2.1, 1.9), v3(0, 1.2, -1));
      };
      const mainPair = (y, z, aim) => {
        rig("main", v3(-0.09, y, z), aim);
        rig("main", v3(0.09, y, z), aim);
      };
      const spots = ensembleSpots(v.ens);
      // spot mics: either every one as a layer, or (Spot Miking) the chosen
      // one plus floor hotspots for the rest
      const spotLayer = () => {
        if (v.spot) {
          spots.forEach((s) => {
            if (s.id === v.spot) {
              content.add(micRig({ pos: s.pos, aim: s.aim, color: colors.layer.spots, lobe: 0.22 }));
              floorSpot(s.pos.x, s.pos.z, { on: true, hotspot: null });
            } else {
              floorSpot(s.pos.x, s.pos.z, { on: false, hotspot: { type: "target", id: s.id }, hitR: 0.2 });
            }
          });
        } else if (v.ens !== "band") {
          spots
            .filter((s) => v.ens === "choir" || s.id === "vln1" || s.id === "cello")
            .forEach((s) => rig("spots", s.pos, s.aim));
        }
      };

      if (v.ens === "band") {
        addModel(content, "drums", 0, -1.4, token);
        addModel(content, "guitar", 1.4, -0.7, token, -Math.PI * 0.15); // angled in toward the centre
        addModel(content, "guitar", -1.4, -0.7, token, Math.PI * 0.15);
        const keys = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.35), new THREE.MeshStandardMaterial({ color: "#2b2d33", roughness: 0.6 }));
        keys.position.set(-0.9, 0.85, 0.1);
        const keyLegs = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.05), new THREE.MeshStandardMaterial({ color: "#4a4d55" }));
        keyLegs.position.set(-0.9, 0.4, 0.1);
        content.add(keys, keyLegs, figure({ x: 0, z: 0.1 }) /* lead vocal, centre of the room */);
        [
          ["Drums", 0, 1.35, -1.4],
          ["Guitar", 1.4, 1.35, -0.7],
          ["Bass", -1.4, 1.35, -0.7],
          ["Keys", -0.9, 1.2, 0.1],
          ["Vocal", 0, 2.0, 0.1],
        ].forEach(([t, x, y, z]) => content.add(label(t, x, y, z)));
        if (v.spot) spotLayer();
        else {
          rig("close", v3(0, 0.45, -0.75), v3(0, 0.35, -1.2)); // kick
          spots.forEach((s) => rig("close", s.pos, s.aim)); // snare, guitar, bass, keys, vocal
        }
        mainPair(1.9, 1.2, v3(0, 1.0, -0.8));
        if (!v.spot) room();
      } else if (v.ens === "chamber") {
        const seats = arc(4, 1.0, 120, -0.4);
        seats.forEach((p) => content.add(figure({ ...p, seated: true })));
        ["Vln I", "Vln II", "Viola", "Cello"].forEach((t, i) => content.add(label(t, seats[i].x, 1.6, seats[i].z)));
        spotLayer();
        mainPair(2.2, 1.4, v3(0, 1.0, -1.0));
        if (!v.spot) room();
      } else {
        const rows = [arc(7, 1.3, 110, 0.6), arc(8, 1.75, 105, 0.6), arc(9, 2.2, 100, 0.6)];
        rows.forEach((row, r) => row.forEach((p) => content.add(figure({ ...p, scale: 0.85 + r * 0.06 }))));
        ["S", "A", "T", "B"].forEach((t, i) => {
          const a = THREE.MathUtils.degToRad(-45 + i * 30);
          content.add(label(t, 2.4 * Math.sin(a), 2.15, 0.6 - 2.4 * Math.cos(a)));
        });
        spotLayer();
        mainPair(2.5, 1.5, v3(0, 1.3, -1.0));
        if (!v.spot) room();
      }
    }

    // Multi miking: two or three mics on ONE source, each its own colour,
    // switched on/off from the card (`mics`).
    const MULTI = {
      snare: {
        // scaled so the drum is a real 14" (~35 cm) snare: shell from
        // ~0.67 m to the top head at ~0.8 m, centred over the stand
        model: { file: "generic_snare_drum_with_tama_stagemaster_stand.glb", size: 0.8 },
        mics: [
          { id: "top", label: "Top", pos: v3(0, 0.9, SRC_Z + 0.27), aim: v3(0, 0.8, SRC_Z + 0.1) },
          { id: "bottom", label: "Bottom", pos: v3(0, 0.56, SRC_Z + 0.25), aim: v3(0, 0.66, SRC_Z + 0.08) },
        ],
      },
      kick: {
        model: { file: "drum_kit.glb", size: 1.4 },
        mics: [
          // kick front head at ~SRC_Z + 0.55, centre ~0.28 m high
          { id: "in", label: "In", pos: v3(0, 0.28, SRC_Z + 0.48), aim: v3(0, 0.28, SRC_Z + 0.15) },
          { id: "out", label: "Out", pos: v3(0, 0.28, SRC_Z + 0.95), aim: v3(0, 0.28, SRC_Z + 0.58) },
        ],
      },
      amp: {
        mics: [
          // grille face at SRC_Z + 0.14; both close mics stand a hand-span
          // off it and well apart, so neither looks pushed into the cabinet
          { id: "on", label: "On-axis", pos: v3(0, 0.3, SRC_Z + 0.32), aim: v3(0, 0.3, SRC_Z + 0.14) },
          { id: "off", label: "Off-axis", pos: v3(0.3, 0.3, SRC_Z + 0.28), aim: v3(0.04, 0.3, SRC_Z + 0.14) },
          { id: "room", label: "Room", pos: v3(0, 1.3, SRC_Z + 2.0), aim: v3(0, 0.35, SRC_Z + 0.15) },
        ],
      },
    };

    function buildAmp() {
      const g = new THREE.Group();
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.52, 0.28), new THREE.MeshStandardMaterial({ color: "#2a2b30", roughness: 0.8 }));
      cab.position.y = 0.26;
      const grille = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.42), new THREE.MeshStandardMaterial({ color: "#3d3a36", roughness: 0.95 }));
      grille.position.set(0, 0.28, 0.141);
      const cone = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.14, 40), new THREE.MeshStandardMaterial({ color: "#1b1b1e", roughness: 0.6, side: THREE.DoubleSide }));
      cone.position.set(0, 0.3, 0.143);
      const cap = new THREE.Mesh(new THREE.CircleGeometry(0.03, 24), new THREE.MeshStandardMaterial({ color: "#55565c", roughness: 0.4, metalness: 0.4 }));
      cap.position.set(0, 0.3, 0.144);
      g.add(cab, grille, cone, cap);
      g.position.z = SRC_Z;
      return g;
    }

    function buildMulti(v, token) {
      const def = MULTI[v.target];
      if (def.model) {
        bump(1);
        loadModel(def.model.file)
          .then((tpl) => {
            if (token !== buildToken) return;
            const inst = instantiate(tpl, def.model.size, 0);
            inst.position.set(0, 0, SRC_Z);
            content.add(inst);
          })
          .catch((err) => console.error(`[MicStage3D] ${def.model.file} failed to load`, err))
          .finally(() => bump(-1));
      } else content.add(buildAmp());
      const palette = [colors.lobe, colors.lobeB, colors.layer.room];
      const on = new Set(v.mics || []);
      def.mics.forEach((m, i) => {
        const c = palette[i % palette.length];
        const isOn = on.has(m.id);
        content.add(micRig({ pos: m.pos, aim: m.aim, color: c, ghost: !isOn, lobe: isOn ? 0.14 : 0, line: isOn }));
        // labels stagger upward so neighbouring mics' names don't overlap
        if (isOn) content.add(label(m.label, m.pos.x, m.pos.y + 0.1 + i * 0.09, m.pos.z, `#${c.getHexString()}`));
      });
    }

    // ================================================================
    // Camera framing — fixed per view, keyed so picking a mic position,
    // pair or layer never moves the camera; only a new tab (or a new
    // source in the close-up views) re-frames.
    // ================================================================
    function presetFor(v) {
      if (v.kind === "single") {
        if (v.frame === "close") {
          const aim = aimOf(v.source);
          // close enough to read centimetres, far enough to keep the floor
          // spots under the mic in view
          return { key: `single-close-${v.source}`, target: v3(0, aim.y * 0.5, aim.z + SOURCE_AIM[v.source].front + 0.15), r: 1.4 + aim.y * 1.1, angles: [1.2, 1.02] };
        }
        return { key: "single-full", target: v3(0, 0.8, 0.25), r: 6.6, angles: [1.38, 1.2] };
      }
      if (v.kind === "stereo") return { key: "stereo", target: v3(0, 0.9, 0.2), r: 7.2, angles: [0.75, 1.08] };
      if (v.kind === "multi") {
        const f = {
          snare: [v3(0, 0.65, SRC_Z + 0.15), 2.2, [0.95, 1.1]],
          kick: [v3(0, 0.45, SRC_Z + 0.55), 2.8, [1.05, 1.15]],
          amp: [v3(0, 0.55, SRC_Z + 0.9), 3.6, [0.7, 1.1]], // three-quarter: the two close mics read apart, room mic behind
        }[v.target];
        return { key: `multi-${v.target}`, target: f[0], r: f[1], angles: f[2] };
      }
      return { key: "ensemble", target: v3(0, 0.95, 0), r: 7.4, angles: [0.45, 0.92] };
    }
    let presetKey = null;
    let lastPreset = null;
    function applyPreset(p) {
      cam.goalTarget.copy(p.target);
      cam.goalR = p.r;
      [cam.goalTheta, cam.goalPhi] = p.angles;
      presetKey = p.key;
      lastPreset = p;
    }

    let currentView = null;
    const hotspots = []; // clickable floor spots — userData.hotspot = { type: "spot" | "target", id }
    const pulsing = [];
    function update(v) {
      currentView = v;
      buildToken += 1;
      disposeContent();
      hotspots.length = 0;
      pulsing.length = 0;
      if (v.kind === "single") buildSingle(v, buildToken);
      else if (v.kind === "stereo") buildStereo(v, buildToken);
      else if (v.kind === "multi") buildMulti(v, buildToken);
      else buildEnsemble(v, buildToken);
      const p = presetFor(v);
      if (p.key !== presetKey) applyPreset(p);
    }

    readColors();
    buildRoom();
    apiRef.current = { update };
    if (wrap.dataset.view) update(JSON.parse(wrap.dataset.view));

    // Re-read theme tokens when the app theme flips.
    const mo = new MutationObserver(() => {
      readColors();
      buildRoom();
      if (currentView) update(currentView);
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });

    // ---- orbit camera: drag to orbit, wheel / pinch to zoom ----
    const MIN_R = 1.2;
    const MAX_R = 9;
    let drag = null;
    const clamp = () => {
      cam.goalR = Math.max(MIN_R, Math.min(MAX_R, cam.goalR));
      cam.goalPhi = Math.max(0.3, Math.min(1.48, cam.goalPhi));
    };
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    function hotspotAt(e) {
      if (!hotspots.length) return null;
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(hotspots, false)[0];
      return hit ? hit.object.userData.hotspot : null;
    }
    let down = null;
    const onDown = (e) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
      drag = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add("is-dragging");
      setHinted(true);
    };
    const onMove = (e) => {
      if (!drag) {
        canvas.style.cursor = hotspotAt(e) ? "pointer" : "";
        return;
      }
      cam.goalTheta -= (e.clientX - drag.x) * 0.0055;
      cam.goalPhi -= (e.clientY - drag.y) * 0.0055;
      drag = { x: e.clientX, y: e.clientY };
      clamp();
    };
    const onUp = (e) => {
      // a short, still press is a click — on a hotspot it moves the mic
      if (down && e.type === "pointerup" && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 && performance.now() - down.t < 600) {
        const hs = hotspotAt(e);
        if (hs) onSelectRef.current?.(hs.type, hs.id);
      }
      down = null;
      drag = null;
      canvas.classList.remove("is-dragging");
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    };
    const onWheel = (e) => {
      e.preventDefault();
      cam.goalR += e.deltaY * 0.0022 * (cam.goalR * 0.35 + 1);
      clamp();
      setHinted(true);
    };
    let pinch = null;
    const dist2 = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e) => {
      if (e.touches.length === 2) pinch = { d: dist2(e.touches), r: cam.goalR };
    };
    const onTouchMove = (e) => {
      if (e.touches.length === 2 && pinch) {
        cam.goalR = (pinch.r * pinch.d) / dist2(e.touches);
        clamp();
      }
    };
    const onTouchEnd = (e) => {
      if (e.touches.length < 2) pinch = null;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchmove", onTouchMove, { passive: true });
    canvas.addEventListener("touchend", onTouchEnd);

    apiRef.current.reset = () => {
      if (lastPreset) applyPreset(lastPreset);
    };

    const resize = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const tick = () => {
      const k = reduce ? 1 : 0.09;
      cam.r += (cam.goalR - cam.r) * k;
      cam.theta += (cam.goalTheta - cam.theta) * k;
      cam.phi += (cam.goalPhi - cam.phi) * k;
      cam.target.lerp(cam.goalTarget, k);
      camera.position.set(
        cam.target.x + cam.r * Math.sin(cam.phi) * Math.sin(cam.theta),
        cam.target.y + cam.r * Math.cos(cam.phi),
        cam.target.z + cam.r * Math.sin(cam.phi) * Math.cos(cam.theta),
      );
      camera.lookAt(cam.target);
      if (pulsing.length && !reduce) {
        const k2 = 1 + Math.sin(performance.now() * 0.004) * 0.25;
        pulsing.forEach((m) => m.scale.setScalar(k2));
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      buildToken += 1;
      mo.disconnect();
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      disposeContent();
      scene.traverse((n) => {
        if (n.userData.shared) return;
        if (n.geometry) n.geometry.dispose();
      });
      ghostCache.forEach((m) => m.dispose());
      keepMats.forEach((m) => m.dispose());
      FIG.dispose();
      renderer.dispose();
      apiRef.current = null;
    };
  }, []);

  // ---- rebuild the scene content when the view changes ----
  const viewKey = JSON.stringify(view);
  useEffect(() => {
    if (wrapRef.current) wrapRef.current.dataset.view = viewKey;
    apiRef.current?.update(JSON.parse(viewKey));
  }, [viewKey]);

  return (
    <div className="ml-stage" ref={wrapRef}>
      <canvas ref={canvasRef} className="ml-canvas" aria-label="3D view of the room and microphone setup. Drag to orbit, scroll to zoom." />
      {failed && <div className="ml-stage-msg">3D view isn't available in this browser.</div>}
      {!failed && loading > 0 && <div className="ml-stage-loading">Loading 3D model…</div>}
      {!failed && (
        <>
          <span className={`ml-stage-hint${hinted ? " is-faded" : ""}`}>
            {view.hotspots
              ? "Click a spot on the floor to move the mic · drag to orbit"
              : view.spot
                ? "Click a spot on the floor to move the spot mic · drag to orbit"
                : "Drag to orbit · scroll to zoom"}
          </span>
          <button type="button" className="ml-stage-reset" onClick={() => apiRef.current?.reset()}>
            Reset view
          </button>
        </>
      )}
    </div>
  );
}
