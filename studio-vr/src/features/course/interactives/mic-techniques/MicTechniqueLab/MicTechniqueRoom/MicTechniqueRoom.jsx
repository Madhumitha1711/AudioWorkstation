'use client'; // harmless no-op outside Next.js App Router; keeps this usable there too.

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import './MicTechniqueRoom.css';

/**
 * <MicTechniqueRoom />
 *
 * An interactive 3D teaching aid for microphone TECHNIQUE (chapter 7,
 * "Microphone Techniques and Stereo Recording" — courseData.js
 * TOPICS[id="stereo-overheads"]), the companion to <MikingRoom /> (chapter
 * 6, "Placement" subchapter, MicPlacementLab.jsx). Where MikingRoom lets you
 * move a SOURCE around a fixed mic to explore raw distance/angle, this one
 * fixes the source in place and lets you compare the five real-world
 * TECHNIQUES engineers actually reach for — Close, Spot, Distant/Room,
 * Stereo, and Multi Miking — each with its own predefined mic position(s)
 * authored for that technique. A mic type picker (the same five mic types
 * as MikingRoom) applies across every technique. Polar pattern is
 * deliberately NOT selectable here — that's chapter 6's
 * MicPolarPatternLab's job; this lab stays focused on technique/placement
 * rather than duplicating the pattern-gain lesson (which also means no
 * Proximity Effect step, since that technique's whole point is a
 * cardioid-vs-omni pattern comparison).
 *
 * Placement is driven by clickable 3D hotspots, not DOM buttons: every
 * technique marks its own candidate mic position(s) as glowing markers in
 * the room (Close/Spot/Distant/Room always have exactly 3; Stereo shows one
 * per capsule in the active preset; Multi Miking shows one per layer
 * available for the active source). Clicking a hotspot moves the single
 * active mic there (Close/Spot/Distant/Room) or toggles a numbered mic
 * on/off at that position (Stereo, Multi Miking — see TECHNIQUES' `mode`
 * field and buildHotspots()/activePlacements() below). A visually-hidden
 * button list (syncHotspotAccessibleList) mirrors every hotspot for
 * keyboard and screen-reader use.
 *
 * Usage:
 *   import MicTechniqueRoom from './MicTechniqueRoom/MicTechniqueRoom';
 *
 *   function Page() {
 *     return (
 *       <div style={{ height: '100vh' }}>
 *         <MicTechniqueRoom />
 *       </div>
 *     );
 *   }
 *
 * Requirements:
 *   npm install three
 *
 * The component fills its parent — give the parent an explicit height
 * (100vh for a full-page embed, or a fixed px value for a smaller one).
 *
 * Fonts: this reuses the same font stack as MikingRoom — see the note at
 * the top of MikingRoom.css. Falls back to system fonts if they're missing.
 *
 * Props:
 *   className  - extra class name(s) merged onto the root element
 *   style      - extra inline styles merged onto the root element
 *   theme      - 'light' | 'dark' | undefined, set as a data-theme attribute
 *                on the root element — see the identical prop on MikingRoom
 *                for why this is now mostly a no-op (colors come from the
 *                app's own theme tokens, see the top of MicTechniqueRoom.css).
 *   embedded   - true when mounted inside a lesson's interactive block
 *                (see InteractiveSection.jsx) — suppresses the internal
 *                topbar header, same convention as MikingRoom.
 *   onInteract - called once, the first time the visitor does something
 *                meaningful (pick a technique/source/mic type/placement) —
 *                marks a lesson's interactive step complete.
 *
 * Audio: same status as MikingRoom — no playback is wired up yet (there are
 * no recorded clips for this chapter's technique/source/mic combinations).
 * This purely renders the geometry; playback can be layered on later the
 * same way MicPolarPatternLab's clip player was.
 */
export default function MicTechniqueRoom({ className, style, theme, embedded = false, onInteract }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const fallbackRef = useRef(null);
  const hintRef = useRef(null);
  const resetBtnRef = useRef(null);
  const infoPanelRef = useRef(null);
  const infoPanelToggleRef = useRef(null);

  const sourceRowRef = useRef(null);
  const micTypeRowRef = useRef(null);
  const techniqueRowRef = useRef(null);
  const techniqueBlurbRef = useRef(null);
  const micTypeBlurbRef = useRef(null);

  // Placement/layer selection moved from DOM pill rows to clickable 3D
  // hotspots (see the hotspot system in the effect below) — hotspotListRef
  // is its visually-hidden, keyboard/screen-reader-accessible twin, not a
  // visible control row. presetRowRef/multiPresetRowRef stay real pill
  // rows: which named stereo pairing (X-Y vs ORTF vs...), or which
  // multi-mic layout (Snare vs Kick vs...), is still a technique choice,
  // not a "where does the mic go" choice hotspots make sense for.
  const hotspotListRef = useRef(null);
  const presetRowRef = useRef(null);
  const multiPresetRowRef = useRef(null);
  // Multi Miking's visible Layers row — one toggle pill per mic position,
  // plus a Clear-all button — doing the same thing as clicking the 3D
  // hotspots, just as an always-visible on-screen control. See
  // syncMultiLayerRow/onClearMultiLayers.
  const multiLayerRowRef = useRef(null);
  const clearLayersBtnRef = useRef(null);

  const singleReadoutRef = useRef(null);
  const rDistanceRef = useRef(null);
  const rAxisRef = useRef(null);
  const rNotesRef = useRef(null);

  const stereoReadoutRef = useRef(null);
  const rSpacingRef = useRef(null);
  const rAngleRef = useRef(null);
  const rMonoRef = useRef(null);
  const rMonoFillRef = useRef(null);

  // Fires onInteract once, the first time the visitor does something
  // meaningful with the scene — same pattern as MikingRoom.
  const firedRef = useRef(false);
  const onInteractRef = useRef(onInteract);
  onInteractRef.current = onInteract;

  useEffect(() => {
    const root = rootRef.current;
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const fallback = fallbackRef.current;
    const hint = hintRef.current;
    const resetBtn = resetBtnRef.current;
    const infoPanel = infoPanelRef.current;
    const infoPanelToggle = infoPanelToggleRef.current;

    const sourceRow = sourceRowRef.current;
    const micTypeRow = micTypeRowRef.current;
    const techniqueRow = techniqueRowRef.current;
    const techniqueBlurb = techniqueBlurbRef.current;
    const micTypeBlurb = micTypeBlurbRef.current;

    const hotspotList = hotspotListRef.current;
    const presetRow = presetRowRef.current;
    const multiPresetRow = multiPresetRowRef.current;
    const multiLayerRow = multiLayerRowRef.current;
    const clearLayersBtn = clearLayersBtnRef.current;

    const singleReadout = singleReadoutRef.current;
    const rDistance = rDistanceRef.current;
    const rAxis = rAxisRef.current;
    const rNotes = rNotesRef.current;

    const stereoReadout = stereoReadoutRef.current;
    const rSpacing = rSpacingRef.current;
    const rAngle = rAngleRef.current;
    const rMono = rMonoRef.current;
    const rMonoFill = rMonoFillRef.current;

    if (!root || !stage || !canvas) return undefined;

    // Everything below is intentionally plain imperative JS (not React
    // state) — same rationale as MikingRoom: this is a direct port of a
    // tested Three.js scene, and per-frame/per-drag mutable state belongs
    // outside React's render cycle.

    let cancelled = false;
    let rafId = null;
    const teardown = [];
    function onCleanup(fn) {
      teardown.push(fn);
    }

    function markInteracted() {
      if (firedRef.current) return;
      firedRef.current = true;
      onInteractRef.current?.();
    }

    function token(name, fallbackColor) {
      const v = getComputedStyle(root).getPropertyValue(name).trim();
      return v || fallbackColor;
    }

    // ---- Room geometry (metres) — identical to MikingRoom's room ----
    const ROOM_W = 6.0; // x
    const ROOM_D = 4.5; // z
    const ROOM_H = 3.0; // y
    const halfW = ROOM_W / 2;
    const halfD = ROOM_D / 2;

    // ---- Scene ----
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch (err) {
      if (fallback) fallback.hidden = false;
      return undefined;
    }
    if ('outputColorSpace' in renderer) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else {
      renderer.outputEncoding = THREE.sRGBEncoding;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const target = new THREE.Vector3(0, 1.3, 0);

    function tagSRGB(tex) {
      if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
      else tex.encoding = THREE.sRGBEncoding;
      return tex;
    }

    const roomGroup = new THREE.Group();
    scene.add(roomGroup);

    function buildGrid(width, depth, spacing, minorColor, majorColor) {
      const group = new THREE.Group();
      const nx = Math.round(width / spacing);
      const nz = Math.round(depth / spacing);
      const minorPts = [];
      const majorPts = [];

      function isMeterLine(v) {
        return Math.abs(v - Math.round(v)) < 1e-6;
      }

      for (let i = 0; i <= nx; i++) {
        const x = -width / 2 + i * spacing;
        const pts = isMeterLine(x) ? majorPts : minorPts;
        pts.push(x, 0, -depth / 2, x, 0, depth / 2);
      }
      for (let j = 0; j <= nz; j++) {
        const z = -depth / 2 + j * spacing;
        const pts2 = isMeterLine(z) ? majorPts : minorPts;
        pts2.push(-width / 2, 0, z, width / 2, 0, z);
      }

      function makeLines(arr, color, opacity) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
        const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
        return new THREE.LineSegments(geo, mat);
      }

      const minorLines = makeLines(minorPts, minorColor, 0.35);
      const majorLines = makeLines(majorPts, majorColor, 0.55);
      minorLines.position.y = 0.002;
      majorLines.position.y = 0.003;
      group.add(minorLines, majorLines);
      return group;
    }

    function makeScaleLabel(text, color) {
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = 80;
      const ctx = c.getContext('2d');
      ctx.font = '600 40px "IBM Plex Mono", monospace';
      ctx.fillStyle = color;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 4, 42);
      const tex = tagSRGB(new THREE.CanvasTexture(c));
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(0.9, 0.225, 1);
      return sprite;
    }

    // A small round numbered badge ("1", "2", "3"...) rendered as a
    // canvas-texture sprite — same technique as makeScaleLabel above, just
    // circular and centered so it reads as a chip rather than a text label.
    // Used two ways: dimmed, on an unplaced hotspot marker (invites a
    // click) and, once placed, full-strength above the mic rig itself (see
    // buildOneMicRig's `badgeNumber` param) — see the hotspot system below.
    function makeNumberSprite(number, fillColor, opacity, scale) {
      const c = document.createElement('canvas');
      c.width = 96;
      c.height = 96;
      const ctx = c.getContext('2d');
      ctx.globalAlpha = opacity;
      ctx.beginPath();
      ctx.arc(48, 48, 44, 0, Math.PI * 2);
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 48px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(number), 48, 54);
      const tex = tagSRGB(new THREE.CanvasTexture(c));
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(scale, scale, 1);
      return sprite;
    }

    function clearRoomGroup() {
      while (roomGroup.children.length) {
        const child = roomGroup.children.pop();
        child.traverse((node) => {
          if (node.geometry) node.geometry.dispose();
        });
      }
    }

    function buildScene() {
      clearRoomGroup();

      const bg = token('--mtr-bg', '#eef1ef');
      const wallColor = token('--mtr-room-wall', '#26302d');
      const floorColor = token('--mtr-room-floor', '#c7cdca');
      const minorColor = token('--mtr-grid-minor', '#9aa39f');
      const majorColor = token('--mtr-accent', '#a8672a');
      const accentInk = token('--mtr-accent-strong', '#8c521e');

      scene.background = new THREE.Color(bg);
      scene.fog = new THREE.Fog(new THREE.Color(bg).getHex(), 6.5, 15);

      const hemi = new THREE.HemisphereLight(
        new THREE.Color(bg).lerp(new THREE.Color('#ffffff'), 0.5),
        new THREE.Color(floorColor),
        0.85
      );
      const sun = new THREE.DirectionalLight(
        new THREE.Color(accentInk).lerp(new THREE.Color('#ffffff'), 0.6),
        0.55
      );
      sun.position.set(3.5, 5.5, 2.5);
      roomGroup.add(hemi, sun);

      const floorGeo = new THREE.PlaneGeometry(ROOM_W, ROOM_D);
      const floorMat = new THREE.MeshLambertMaterial({ color: floorColor });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      roomGroup.add(floor);

      roomGroup.add(buildGrid(ROOM_W, ROOM_D, 0.5, minorColor, majorColor));

      const wallMat = new THREE.MeshBasicMaterial({
        color: wallColor,
        transparent: true,
        opacity: 0.055,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const wallGeoWD = new THREE.PlaneGeometry(ROOM_W, ROOM_H);
      const wallGeoDD = new THREE.PlaneGeometry(ROOM_D, ROOM_H);

      const wallBack = new THREE.Mesh(wallGeoWD, wallMat);
      wallBack.position.set(0, ROOM_H / 2, -halfD);
      roomGroup.add(wallBack);

      const wallFront = new THREE.Mesh(wallGeoWD, wallMat);
      wallFront.position.set(0, ROOM_H / 2, halfD);
      wallFront.rotation.y = Math.PI;
      roomGroup.add(wallFront);

      const wallLeft = new THREE.Mesh(wallGeoDD, wallMat);
      wallLeft.position.set(-halfW, ROOM_H / 2, 0);
      wallLeft.rotation.y = Math.PI / 2;
      roomGroup.add(wallLeft);

      const wallRight = new THREE.Mesh(wallGeoDD, wallMat);
      wallRight.position.set(halfW, ROOM_H / 2, 0);
      wallRight.rotation.y = -Math.PI / 2;
      roomGroup.add(wallRight);

      const ceilMat = new THREE.MeshBasicMaterial({
        color: wallColor,
        transparent: true,
        opacity: 0.028,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), ceilMat);
      ceiling.position.set(0, ROOM_H, 0);
      ceiling.rotation.x = Math.PI / 2;
      roomGroup.add(ceiling);

      const scaleSprite = makeScaleLabel('0.5 m grid', majorColor);
      scaleSprite.position.set(halfW - 0.65, 0.02, halfD - 0.32);
      roomGroup.add(scaleSprite);
    }

    buildScene();

    // ---- 3D asset loading (public/3D assets/) -----------------------
    // A handful of instrument types below (SOURCE_TYPES) are dressed with
    // real scanned/downloaded GLTF models — see the credits in each file's
    // embedded `asset.extras` (all CC-BY-4.0, via Sketchfab). Every model
    // arrives in a different native scale/pivot (Sketchfab/FBX exports are
    // inconsistent unit-wise), so instantiateModel() re-derives real-world
    // size purely from each model's own runtime bounding box — the
    // `targetSize` arguments below are metres, independent of whatever
    // units the source file used. Models are fetched once (modelCache) and
    // cloned per placement; the anchor stays empty until each model
    // streams in (or stays empty for good if the fetch ever fails — see
    // the .catch()s), rather than showing a temporary placeholder shape.
    const MODEL_BASE = '/3D%20assets/'; // "3D assets" — space is URL-encoded
    const gltfLoader = new GLTFLoader();
    const modelCache = new Map(); // url -> Promise<THREE.Object3D> (raw loaded template — always cloned before use, never added to the scene graph directly)
    let sourceBuildToken = 0; // bumped every buildSourceObject() call so a late-arriving model from an already-abandoned source type is dropped instead of appearing on the wrong instrument

    function loadRawModel(url) {
      if (!modelCache.has(url)) {
        modelCache.set(
          url,
          new Promise((resolve, reject) => {
            gltfLoader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
          })
        );
      }
      return modelCache.get(url);
    }

    // Clones the cached template, centers it on X/Z, drops its lowest
    // point to local y=0, and scales its largest bounding-box dimension to
    // `targetSize` metres — so callers can treat the returned group's
    // origin exactly like any procedurally-built group's floor/mount
    // anchor. `rotationY` is a per-asset fudge factor for whichever way
    // the source file happened to be facing when it was authored — tweak
    // it (in the SOURCE_TYPES config just below) after eyeballing the
    // model in `npm run dev` if it's facing the wrong way.
    function instantiateModel(filename, targetSize, rotationY = 0) {
      return loadRawModel(MODEL_BASE + filename).then((original) => {
        const clone = original.clone(true);
        const box = new THREE.Box3().setFromObject(clone);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        clone.position.set(-center.x, -box.min.y, -center.z);
        const wrapper = new THREE.Group();
        wrapper.add(clone);
        wrapper.scale.setScalar(targetSize / maxDim);
        wrapper.rotation.y = rotationY;
        return wrapper;
      });
    }

    // Prefetch every glb this room can show, right away — loadRawModel()
    // above already caches by URL, so kicking these off immediately (in
    // parallel, via the browser's own HTTP concurrency) means each model
    // is already loaded — or at least well underway — by the time a
    // visitor actually picks that source, instead of only starting the
    // fetch at that moment and visibly waiting on it. The .catch() here
    // just swallows the prefetch's own promise rejection so a failed
    // fetch doesn't surface as an unhandled-rejection warning before the
    // source is even selected — instantiateModel()'s own .catch() in each
    // SOURCE_TYPES.build() below still fires normally (same cached,
    // already-settled promise) and logs/handles it if that source is ever
    // actually chosen.
    ['electric_guitar.glb', 'generic_snare_drum_with_tama_stagemaster_stand.glb', 'drum_kit.glb', 'tabla_drums.glb'].forEach(
      (filename) => {
        loadRawModel(MODEL_BASE + filename).catch(() => {});
      }
    );

    // ---- Mic rig materials/geometry helpers — identical to MikingRoom ----
    const MIC_BODY_MAT = new THREE.MeshStandardMaterial({ color: '#7d8588', roughness: 0.32, metalness: 0.6 });
    const MIC_GRILLE_MAT = new THREE.MeshStandardMaterial({ color: '#aab1b4', roughness: 0.55, metalness: 0.35 });
    const MIC_SLOT_MAT = new THREE.MeshStandardMaterial({ color: '#101214', roughness: 0.55, metalness: 0.15 });
    const CONTACT_MAT = new THREE.MeshStandardMaterial({ color: '#33373a', roughness: 0.45, metalness: 0.3 });
    const STAND_MAT = new THREE.MeshStandardMaterial({ color: '#6c7476', roughness: 0.4, metalness: 0.6 });
    const WOOD_MAT = new THREE.MeshStandardMaterial({ color: '#5b4636', roughness: 0.85, metalness: 0 });

    const MIC_TILT = -0.18;
    const MIC_BODY_SCALE = 1.6;
    const AIM_INDICATOR_LEN = 0.16; // small fixed-length line/tip showing capsule aim — no lobe mesh to size against anymore

    const REDUCE_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    function makeGlowTexture() {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const ctx = c.getContext('2d');
      const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    }
    const GLOW_TEXTURE = makeGlowTexture();
    function makeGlowMaterial(color) {
      return new THREE.MeshBasicMaterial({
        map: GLOW_TEXTURE,
        color,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
    }

    function makeBeamTexture() {
      const c = document.createElement('canvas');
      c.width = 32;
      c.height = 128;
      const ctx = c.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0.0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.3, 'rgba(255,255,255,0.85)');
      grad.addColorStop(0.5, 'rgba(255,255,255,1)');
      grad.addColorStop(0.7, 'rgba(255,255,255,0.85)');
      grad.addColorStop(1.0, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 32, 128);
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      return tex;
    }
    const BEAM_TEXTURE = makeBeamTexture();
    const activeBeamTextures = []; // one per rendered beam this frame — drifted together in the render loop

    function zCyl(rTop, rBot, h) {
      const g = new THREE.CylinderGeometry(rTop, rBot, h, 16);
      g.rotateX(Math.PI / 2);
      return g;
    }

    // Identical five mic types/builds as MikingRoom (minus the eligible-
    // pattern lists MikingRoom's own picker needs — polar pattern isn't
    // selectable in this lab, see the header comment) — switching gear
    // should still look the same whether you're on the Placement lesson or
    // this Technique lesson. `hasStand` is what still matters here: it's
    // what decides stand-mounted-in-air vs. surface-coupled contact mic.
    const MIC_TYPES = [
      {
        id: 'dynamic', label: 'Dynamic', hasStand: true,
        blurb: 'Rugged moving-coil capsule that handles high SPL without power. A live-vocal and guitar-amp workhorse.',
        build(head) {
          const grille = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), MIC_GRILLE_MAT);
          grille.position.z = -0.02;
          const body = new THREE.Mesh(zCyl(0.022, 0.024, 0.14), MIC_BODY_MAT);
          body.position.z = 0.08;
          head.add(grille, body);
        },
      },
      {
        id: 'condenser-fet', label: 'FET Condenser', hasStand: true,
        blurb: 'Solid-state condenser with a polarized diaphragm. Detailed and sensitive, but needs phantom power.',
        build(head) {
          const grille = new THREE.Mesh(zCyl(0.026, 0.026, 0.06), MIC_GRILLE_MAT);
          grille.position.z = -0.03;
          const body = new THREE.Mesh(zCyl(0.014, 0.014, 0.16), MIC_BODY_MAT);
          body.position.z = 0.09;
          head.add(grille, body);
        },
      },
      {
        id: 'condenser-tube', label: 'Tube Condenser', hasStand: true,
        blurb: 'A condenser capsule driven by a tube stage. Warmer coloration, often switchable between patterns.',
        build(head) {
          const grille = new THREE.Mesh(zCyl(0.042, 0.042, 0.09), MIC_GRILLE_MAT);
          grille.position.z = -0.045;
          const body = new THREE.Mesh(zCyl(0.03, 0.03, 0.2), MIC_BODY_MAT);
          body.position.z = 0.13;
          head.add(grille, body);
        },
      },
      {
        id: 'ribbon', label: 'Ribbon', hasStand: true,
        blurb: 'A corrugated ribbon suspended in a magnet gap. Smooth top end, naturally bidirectional.',
        build(head) {
          const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.05, 0.18), MIC_BODY_MAT);
          body.position.z = 0.02;
          const slot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.01, 0.1), MIC_SLOT_MAT);
          slot.position.z = -0.03;
          head.add(body, slot);
        },
      },
      {
        id: 'contact', label: 'Contact', hasStand: false,
        blurb: 'A piezo transducer coupled straight to a vibrating surface — it senses structure-borne vibration, not air pressure.',
        build(head) {
          const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 20), CONTACT_MAT);
          head.add(puck);
        },
      },
    ];

    function addStand(parent, capsuleY) {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.02, 20), STAND_MAT);
      base.position.y = 0.01;
      const poleHeight = Math.max(capsuleY - 0.08, 0.05);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, poleHeight, 12), STAND_MAT);
      pole.position.y = 0.02 + poleHeight / 2;
      const clip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.035, 10), STAND_MAT);
      clip.position.y = capsuleY - 0.03;
      parent.add(base, pole, clip);
    }

    function buildContactRipple(color, colorStrong) {
      const group = new THREE.Group();
      const rings = [0.09, 0.16, 0.23];
      rings.forEach((r, i) => {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(r - 0.006, r, 40),
          new THREE.MeshBasicMaterial({
            color: i === 0 ? colorStrong : color,
            transparent: true,
            opacity: 0.55 - i * 0.14,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = i * 0.001;
        group.add(ring);
      });
      return group;
    }

    function addContactSurface(parent, topY) {
      const surface = new THREE.Mesh(new THREE.BoxGeometry(0.42, topY, 0.3), WOOD_MAT);
      surface.position.y = topY / 2;
      parent.add(surface);
    }

    function clearGroup(group) {
      while (group.children.length) {
        const child = group.children.pop();
        child.traverse((node) => {
          if (node.geometry) node.geometry.dispose();
        });
      }
    }

    // ---- Sound sources — identical six types/builds as MikingRoom, minus
    // the "occupant on/off" toggle: this lab's source is always present
    // (the technique determines mic placement, not whether a source
    // exists), fixed at SOURCE_ANCHOR below instead of movable spots. ----
    const SRC_METAL = new THREE.MeshStandardMaterial({ color: '#aab1b4', roughness: 0.35, metalness: 0.5 });
    const AMP_CAB_MAT = new THREE.MeshStandardMaterial({ color: '#5c2226', roughness: 0.8, metalness: 0 });
    const AMP_GRILLE_MAT = new THREE.MeshStandardMaterial({ color: '#181513', roughness: 0.7, metalness: 0.05 });
    const ETHNIC_BODY_MAT = new THREE.MeshStandardMaterial({ color: '#8a4a2a', roughness: 0.68, metalness: 0 });
    const ETHNIC_HEAD_MAT = new THREE.MeshStandardMaterial({ color: '#d9b98c', roughness: 0.6, metalness: 0 });

    function zCylSrc(rTop, rBot, h) {
      return zCyl(rTop, rBot, h);
    }

    const SOURCE_TYPES = [
      {
        id: 'vocal', label: 'Vocal / VO', aimHeight: 1.44, nearClearanceM: 0.08,
        build(g) {
          const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.02, 20), SRC_METAL);
          base.position.y = 0.01;
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.42, 12), SRC_METAL);
          pole.position.y = 0.72;
          g.add(base, pole);
          [0.045, 0.085, 0.125].forEach((r, i) => {
            const ring = new THREE.Mesh(
              new THREE.RingGeometry(Math.max(r - 0.01, 0.001), r, 24),
              new THREE.MeshBasicMaterial({ color: '#c98a63', transparent: true, opacity: 0.6 - i * 0.15, side: THREE.DoubleSide, depthWrite: false })
            );
            ring.position.y = 1.44;
            g.add(ring);
          });
        },
      },
      {
        id: 'guitar', label: 'Guitar', aimHeight: 0.48, nearClearanceM: 0.28,
        build(g, token) {
          // rotationY = Math.PI — the model faces away from the mic by default; flipped 180° to face it.
          instantiateModel('electric_guitar.glb', 1.05, Math.PI)
            .then((model) => {
              if (token !== sourceBuildToken || cancelled) return;
              g.add(model);
            })
            .catch((err) => console.error('[MicTechniqueRoom] electric_guitar.glb failed to load', err));
        },
      },
      {
        id: 'amp', label: 'Amp', aimHeight: 0.25, nearClearanceM: 0.34,
        build(g) {
          const cab = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.5, 0.32), AMP_CAB_MAT);
          cab.position.y = 0.25;
          const speaker = new THREE.Mesh(zCylSrc(0.16, 0.16, 0.02), AMP_GRILLE_MAT);
          speaker.position.set(0, 0.25, -0.17);
          g.add(cab, speaker);
        },
      },
      {
        id: 'snare', label: 'Snare', aimHeight: 0.59, nearClearanceM: 0.26,
        build(g, token) {
          instantiateModel('generic_snare_drum_with_tama_stagemaster_stand.glb', 0.6, 0)
            .then((model) => {
              if (token !== sourceBuildToken || cancelled) return;
              g.add(model);
            })
            .catch((err) => console.error('[MicTechniqueRoom] generic_snare_drum_with_tama_stagemaster_stand.glb failed to load', err));
        },
      },
      {
        id: 'kick', label: 'Kick', aimHeight: 0.31, nearClearanceM: 0.4,
        build(g, token) {
          // A full kit — mic'ing "the kick" realistically happens in the
          // context of a whole kit anyway, and the kick-in/kick-out
          // placements below are still anchored at this same source
          // position regardless of which mesh renders here.
          instantiateModel('drum_kit.glb', 1.4, 0)
            .then((model) => {
              if (token !== sourceBuildToken || cancelled) return;
              g.add(model);
            })
            .catch((err) => console.error('[MicTechniqueRoom] drum_kit.glb failed to load', err));
        },
      },
      {
        id: 'ethnic', label: 'Ethnic Instrument', aimHeight: 0.5, nearClearanceM: 0.3,
        build(g, token) {
          // A full kit — mic'ing "the kick" realistically happens in the
          // context of a whole kit anyway, and the kick-in/kick-out
          // placements below are still anchored at this same source
          // position regardless of which mesh renders here.
          instantiateModel('tabla_drums.glb', 1.4, 0)
            .then((model) => {
              if (token !== sourceBuildToken || cancelled) return;
              g.add(model);
            })
            .catch((err) => console.error('[MicTechniqueRoom] drum_kit.glb failed to load', err));
        },
      },
    ];

    // ---- Technique data — five real-world techniques, each with its own
    // predefined mic position(s) authored directly (not derived from a
    // formula) so every placement looks intentional and teaches something
    // specific. Distances are metres; `angle` places the mic around the
    // source on a circle (0 = directly in front, e.g. 45 = 45° around from
    // there) — purely a visual/geometric cue here (no pattern picker to
    // compute pickup gain from — see the header comment on why). It's
    // position-only: every mic still turns to face the source head-on (see
    // yawToFace below), so a large `angle` reads as "off to the side of the
    // source" rather than "capsule twisted away from it" — the latter sent
    // the aim arrow and coverage beam wildly off into the room for the
    // bigger angles below (e.g. multi-room's 110°) instead of toward
    // anything a viewer could relate to the source.
    //
    // Stereo Miking's presets are the one exception, and use a different
    // field (`yawOffsetDeg`, per mic, inside each preset's `mics` array
    // below) instead of `angle` — a stereo pair's whole identity IS the
    // angle between its two capsules (X-Y's 90° crossed pair vs. ORTF's
    // 110°, say), so that rotation has to be real, not just implied by
    // position. buildOneMicRig adds it on top of face-the-source, and the
    // coverage beam deliberately ignores it and always draws straight to
    // the source anyway — see the comment on the beam below for why. ----
    const TECHNIQUES = {
      close: {
        label: 'Close Miking',
        mode: 'single',
        blurb: 'Two inches to about a foot from the source. Direct sound dominates, the room barely registers, and isolation from everything else is close to total. The 3 hotspots below are spread apart in the room for a clearer side-by-side look — the Distance readout still reports each one’s real, true-to-life distance from the source.',
        spots: [
          { id: 'close-2in', tag: '2 in · on-axis', dist: 0.05, angle: 0, distanceLabel: '2 in', axisLabel: 'On-axis · 0°', character: 'Maximum warmth, strong proximity effect' },
          { id: 'close-6in', tag: '6 in · on-axis', dist: 0.15, angle: 0, distanceLabel: '6 in', axisLabel: 'On-axis · 0°', character: 'Full and present, moderate proximity effect' },
          { id: 'close-offaxis', tag: '4 in · 45° off-axis', dist: 0.1, angle: 45, distanceLabel: '4 in', axisLabel: 'Off-axis · 45°', character: 'Softer top end, fewer plosives' },
        ],
      },
      spot: {
        label: 'Spot Miking',
        mode: 'single',
        blurb: 'A dedicated close mic on one performer inside a larger ensemble, blended underneath the main/room mics rather than replacing them.',
        spots: [
          { id: 'spot-soloist', tag: 'Soloist', dist: 0.25, angle: 15, distanceLabel: '8 in', axisLabel: 'Featured performer', character: 'Close, present — sits on top of the mix' },
          { id: 'spot-section', tag: 'Section', dist: 0.4, angle: 35, distanceLabel: '14 in', axisLabel: 'Section reinforcement', character: 'Adds clarity without dominating' },
          { id: 'spot-mainpair', tag: 'Main pair (context)', dist: 2.2, angle: 80, heightM: 1.9, distanceLabel: '18 ft', axisLabel: 'Main/room pair', character: 'What the spot mic gets blended under' },
        ],
      },
      distant: {
        label: 'Distant / Room Miking',
        mode: 'single',
        blurb: 'Pull back several feet and the room stops being background noise — a natural, cohesive picture of the whole source, at the cost of up-close detail.',
        spots: [
          { id: 'distant-near', tag: '6 ft · on-axis', dist: 1.0, angle: 0, distanceLabel: '6 ft', axisLabel: 'On-axis · 0°', character: 'Some room, still fairly direct' },
          { id: 'distant-mid', tag: '12 ft · on-axis', dist: 1.8, angle: 0, distanceLabel: '12 ft', axisLabel: 'On-axis · 0°', character: 'Balanced room/direct blend' },
          { id: 'distant-far', tag: '20 ft · corner', dist: 2.6, angle: 60, heightM: 1.9, distanceLabel: '20 ft', axisLabel: 'Off-axis, room corner', character: 'Mostly ambience, minimal detail' },
        ],
      },
      stereo: {
        label: 'Stereo Miking',
        mode: 'stereo',
        blurb: 'Two (or three) mics, one stereo image — spacing and the angle between capsules decide the width and how safely it folds to mono. Coincident/near-coincident pairs (X-Y, M-S, ORTF, Blumlein) fold down safely; spaced pairs (AB, Outrigger, Decca Tree) are wider but riskier. Keep the 3:1 rule in mind whenever two mics can hear the source. Every preset loads at its own capsule position(s) by default — click a hotspot to pull that one mic back out (or back in) and hear the difference.',
        // Each preset is `mics: [{tag, xOffsetM, distM, yawOffsetDeg, heightM?}]`
        // rather than the old fixed left/right-only shape, so a preset can
        // use two capsules (most of these) or three (Decca Tree's L/C/R).
        // xOffsetM is lateral position relative to the source's centerline;
        // distM is how far back from the source (clearance gets added on
        // top, same as every other technique); yawOffsetDeg is the extra
        // rotation on top of facing the source — see buildOneMicRig's
        // header comment for why that's a real rotation here and nowhere
        // else. heightM overrides the default capsule height (used to
        // stack M-S's Side capsule above its Mid, and to lift Overhead).
        presets: {
          ab: {
            id: 'ab', label: 'AB (Spaced Pair)',
            mics: [
              { tag: 'Left', xOffsetM: -0.45, distM: 1.3, yawOffsetDeg: 0 },
              { tag: 'Right', xOffsetM: 0.45, distM: 1.3, yawOffsetDeg: 0 },
            ],
            spacingLabel: '3 ft apart', angleLabel: '0° (parallel)',
            monoLabel: 'Weak — check for cancellation', monoPct: 40,
          },
          xy: {
            id: 'xy', label: 'X-Y',
            mics: [
              { tag: 'Left', xOffsetM: -0.01, distM: 1.3, yawOffsetDeg: -45 },
              { tag: 'Right', xOffsetM: 0.01, distM: 1.3, yawOffsetDeg: 45 },
            ],
            spacingLabel: '~0 in (coincident)', angleLabel: '90° crossed',
            monoLabel: 'Excellent — phase-coherent', monoPct: 98,
          },
          ms: {
            id: 'ms', label: 'M-S (Mid-Side)',
            mics: [
              { tag: 'Mid', xOffsetM: 0, distM: 1.3, yawOffsetDeg: 0 },
              { tag: 'Side', xOffsetM: 0, distM: 1.3, yawOffsetDeg: 90, heightM: 1 },
            ],
            spacingLabel: '~0 in (coincident, stacked)', angleLabel: '90° side-facing',
            monoLabel: 'Excellent — mono is just the Mid signal', monoPct: 99,
          },
          ortf: {
            id: 'ortf', label: 'ORTF',
            mics: [
              { tag: 'Left', xOffsetM: -0.085, distM: 1.3, yawOffsetDeg: -55 },
              { tag: 'Right', xOffsetM: 0.085, distM: 1.3, yawOffsetDeg: 55 },
            ],
            spacingLabel: '6.7 in (17 cm)', angleLabel: '110° apart',
            monoLabel: 'Very good — near-coincident', monoPct: 85,
          },
          overhead: {
            id: 'overhead', label: 'Overhead',
            mics: [
              { tag: 'Left', xOffsetM: -0.5, distM: 1.6, yawOffsetDeg: -15, heightM: 2.1 },
              { tag: 'Right', xOffsetM: 0.5, distM: 1.6, yawOffsetDeg: 15, heightM: 2.1 },
            ],
            spacingLabel: '3.3 ft apart, elevated', angleLabel: '30° apart, angled in',
            monoLabel: 'Good — moderate coincidence', monoPct: 65,
          },
          blumlein: {
            id: 'blumlein', label: 'Blumlein',
            mics: [
              { tag: 'Left', xOffsetM: -0.01, distM: 1.3, yawOffsetDeg: -45 },
              { tag: 'Right', xOffsetM: 0.01, distM: 1.3, yawOffsetDeg: 45 },
            ],
            spacingLabel: '~0 in (coincident)', angleLabel: '90° crossed, figure-8s',
            monoLabel: 'Excellent — phase-coherent, captures the room behind too', monoPct: 97,
          },
          decca: {
            id: 'decca', label: 'Decca Tree',
            mics: [
              { tag: 'Left', xOffsetM: -1, distM: 2, yawOffsetDeg: 0 },
              { tag: 'Center', xOffsetM: 0, distM: 1.5, yawOffsetDeg: 0 },
              { tag: 'Right', xOffsetM: 1, distM: 2, yawOffsetDeg: 0 },
            ],
            spacingLabel: '6.5 ft L–R, center forward', angleLabel: '0° (parallel omnis)',
            monoLabel: 'Good — wide but center-anchored', monoPct: 60,
          },
          outrigger: {
            id: 'outrigger', label: 'Outrigger',
            mics: [
              { tag: 'Left', xOffsetM: -1.8, distM: 1.5, yawOffsetDeg: -10 },
              { tag: 'Right', xOffsetM: 1.8, distM: 1.5, yawOffsetDeg: 10 },
            ],
            spacingLabel: '11.8 ft apart (wide)', angleLabel: '20° apart, slight toe-in',
            monoLabel: 'Fair — wide spacing risks phase issues', monoPct: 35,
          },
        },
      },
      multi: {
        label: 'Multi Miking',
        mode: 'multi',
        blurb: 'Several mics on one source at once, each its own channel, balanced together afterward. Pick a preset below and its first mic loads by default — Snare, Kick, and Amp each get their own textbook layout; every other source gets a generic close/support/overhead/room spread. Click a hotspot or a Layers pill to toggle any other mic on (or back off) and hear a multi-miked source built up one layer at a time.',
        // Layers are source-specific (unlike every other technique's
        // `spots`, which are the same regardless of source) because real
        // multi-mic setups genuinely differ per instrument — a snare gets
        // top+bottom, a kick gets in+out, a guitar amp gets close pair +
        // room. `default` is the fallback for any source without its own
        // entry (Vocal, Guitar, Ethnic Instrument) so nothing regresses for
        // those — see activePlacements()'s 'multi' branch and
        // refreshTechniqueUI's layer-row rebuild.
        spotsBySource: {
          snare: [
            { id: 'snare-top', tag: 'Top', dist: 0.05, angle: 45, distanceLabel: '2 in above rim', axisLabel: 'Off-axis · 45°', character: 'Crack & stick attack' },
            { id: 'snare-bottom', tag: 'Bottom', dist: 0.06, angle: 0, heightM: 0.24, distanceLabel: '2 in under the snares', axisLabel: 'Underneath, on the wires', character: 'Buzz & snap — usually phase-flipped against the top mic' },
          ],
          kick: [
            { id: 'kick-in', tag: 'In', dist: 0.05, angle: 0, distanceLabel: '2 in inside shell', axisLabel: 'On-axis into beater', character: 'Punch & attack' },
            { id: 'kick-out', tag: 'Out', dist: 0.5, angle: 0, distanceLabel: '18 in outside port', axisLabel: 'On-axis, outside shell', character: 'Roundness & low-end body' },
          ],
          amp: [
            { id: 'amp-close-on', tag: 'Close on-axis', dist: 0.03, angle: 0, distanceLabel: 'On the grille · on-axis', axisLabel: 'On-axis · 0°', character: 'Brightest, most present tone' },
            { id: 'amp-close-off', tag: 'Close off-axis', dist: 0.03, angle: 40, distanceLabel: 'On the grille · off-axis', axisLabel: 'Off-axis · 40°', character: 'Warmer, less fizz/harshness' },
            { id: 'amp-room', tag: 'Room', dist: 2, angle: 30, heightM: 1.3, distanceLabel: '~7 ft back', axisLabel: 'Room, off-axis', character: 'Ambience & natural decay' },
          ],
          default: [
            { id: 'multi-close', tag: 'Close', dist: 0.15, angle: 0, distanceLabel: '6 in', axisLabel: 'On-axis close', character: 'Detail & attack' },
            { id: 'multi-support', tag: 'Off-axis support', dist: 0.3, angle: 45, distanceLabel: '12 in', axisLabel: 'Off-axis · 45°', character: 'Body & blend' },
            { id: 'multi-left', tag: 'Overhead L', dist: 1.2, angle: -30, heightM: 2.1, distanceLabel: '4 ft', axisLabel: 'Spaced pair (left)', character: 'Stereo width' },
            { id: 'multi-right', tag: 'Overhead R', dist: 1.2, angle: 30, heightM: 2.1, distanceLabel: '4 ft', axisLabel: 'Spaced pair (right)', character: 'Stereo width' },
            { id: 'multi-room', tag: 'Room', dist: 2.4, angle: 110, heightM: 1.9, distanceLabel: '8 ft', axisLabel: 'Distant, off-axis', character: 'Ambience & glue' },
          ],
        },
      },
    };

    // Source sits fixed near one side of the room; every technique's mics
    // are placed relative to it (the inverse of MikingRoom, where the mic
    // is fixed and the source moves — here we often need MORE THAN ONE mic
    // around the same source at once, so the source has to be the anchor).
    const SOURCE_ANCHOR_X = 0;
    const SOURCE_ANCHOR_Z = 0.9;

    function computeSpotPosition(sourcePos, dist, angleDeg, heightOverride, sourceAimHeight) {
      const rad = THREE.MathUtils.degToRad(angleDeg);
      const x = sourcePos.x + dist * Math.sin(rad);
      const z = sourcePos.z - dist * Math.cos(rad);
      const y = heightOverride != null ? heightOverride : sourceAimHeight;
      return new THREE.Vector3(x, y, z);
    }

    // Yaws an object at `fromPos` so its local -Z ("front", matching the
    // mic capsule convention below and the source builds' own front) faces
    // `targetPos` — every mic rig turns to look straight at the source
    // no matter how far around it `placement.angle` has moved the mic, so
    // the aim arrow and the coverage beam (both driven off this same yaw —
    // see buildOneMicRig) always point at the source. "Off-axis" placements
    // communicate their angle through *position* alone (see the TECHNIQUES
    // comment above); this used to also add that angle as extra yaw on top
    // of facing the source, which for the wider angles (spot-mainpair's
    // 80°, multi-room's 110°, etc.) rotated the capsule well past the
    // source and sent the arrow/beam off into empty space instead.
    function yawToFace(fromPos, targetPos) {
      const dx = fromPos.x - targetPos.x;
      const dz = fromPos.z - targetPos.z;
      return Math.atan2(dx, dz);
    }

    // ---- Live state ----
    const state = {
      technique: 'close',
      sourceType: 'vocal',
      micType: 'dynamic',
      placementId: 'close-2in', // close/spot/distant: single active spot
      layerIds: new Set(), // multi: layers placed by clicking their hotspot — starts empty, build it up
      stereoPlaced: new Set(), // stereo: mic *indices* (into the active preset's `mics` array) placed by clicking their hotspot
      presetId: 'ab', // stereo
    };

    const sourceGroup = new THREE.Group();
    const micRigsGroup = new THREE.Group();
    const beamsGroup = new THREE.Group();
    const hotspotsGroup = new THREE.Group();
    scene.add(sourceGroup, micRigsGroup, beamsGroup, hotspotsGroup);

    // ---- Hotspots — clickable 3D markers that replace the old DOM
    // pill-buttons for "where does the mic go": one marker per candidate
    // mic position for the active technique (single mode's 3 authored
    // spots; the active stereo preset's mic slots; the active source's
    // multi-mic layers). Clicking a marker (or its accessible-list twin,
    // see syncHotspotAccessibleList) moves/places a mic there — see
    // buildHotspots() below, called alongside buildMicRigs() everywhere the
    // old code called the latter alone. `hotspotInteractables` is what
    // hitTestHotspot() raycasts against; `pendingHotspotMeshes` is just the
    // unplaced markers' core+glow meshes, gently pulsed in the render loop
    // so an empty stereo/multi scene still reads as "click me".
    const raycaster = new THREE.Raycaster();
    const pointerNDC = new THREE.Vector2();
    const HOTSPOT_FLOOR_Y = 0.02; // just above the floor/grid (which sit at y=0/0.002/0.003) to avoid z-fighting
    let hotspotInteractables = [];
    let pendingHotspotMeshes = [];

    function hitTestHotspot(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNDC, camera);
      const meshes = hotspotInteractables.map((h) => h.mesh);
      const hits = raycaster.intersectObjects(meshes, false);
      if (!hits.length) return null;
      return hotspotInteractables.find((h) => h.mesh === hits[0].object) || null;
    }

    function sourceAnchorPos(aimHeight) {
      return new THREE.Vector3(SOURCE_ANCHOR_X, aimHeight, SOURCE_ANCHOR_Z);
    }

    function buildSourceObject() {
      clearGroup(sourceGroup);
      sourceBuildToken += 1;
      const typeDef = SOURCE_TYPES.find((t) => t.id === state.sourceType);
      const g = new THREE.Group();
      g.position.set(SOURCE_ANCHOR_X, 0, SOURCE_ANCHOR_Z);
      typeDef.build(g, sourceBuildToken);
      const srcLight = new THREE.PointLight(0xfff2df, 1.15, 3.2, 2);
      srcLight.position.set(0.35, typeDef.aimHeight + 0.4, -0.25);
      g.add(srcLight);
      sourceGroup.add(g);
    }

    // Returns the list of {id, tag, dist, angle, heightM?, distanceLabel,
    // axisLabel, character, pos} placements that should have a mic rig
    // right now, given the active technique + its own selection state.
    // Close Miking's 3 real positions (2 in, 6 in, 4 in-off-axis) sit only
    // centimetres from the source and, for the 2in/6in pair, on the exact
    // same on-axis line — rendered at their true authored distance, they'd
    // sit a couple centimetres apart at most, making the three impossible
    // to tell apart or compare side by side. So Close Miking is the one
    // technique whose mic doesn't render at its literal authored
    // dist/angle: it renders — hotspot marker AND, once clicked, the mic
    // itself — fanned out from the source at a spread-apart angle instead,
    // purely so the three are visually distinguishable and comparable. The
    // readout's Distance/Axis/Notes text (spot.distanceLabel/axisLabel/
    // character) still reports the real "2 in / 6 in / 4 in off-axis"
    // numbers regardless — only the 3D position is stylized. Used by both
    // activePlacements() (the actual placed mic) and buildHotspots() (the
    // clickable marker), so they always land on exactly the same point —
    // no separate marker-to-real guide line needed for this technique (see
    // addMarker's elevation-only guide below).
    //
    // The fan radius MUST stay closer to the source than Spot Miking's
    // nearest real spot (`spot-soloist`, dist: 0.25) — Close Miking should
    // always read as closer than Spot Miking, technique names and all, so
    // this is built from the same `clearance` (source-surface offset) Spot
    // Miking's own spots use, plus a fixed pad well under Spot's 0.25,
    // rather than a flat radius that could end up farther out than Spot's
    // spots for some source (a kick's clearance alone is 0.4m). Adjacent
    // markers are still ~55-60° apart (CLOSE_MARKER_FAN_DEG) to stay
    // clickably separate despite the smaller radius — see the reduced
    // `hitRadius` passed to addMarker below for the other half of that.
    const CLOSE_MARKER_FAN_DEG = { 'close-2in': -60, 'close-6in': 0, 'close-offaxis': 60 };
    const CLOSE_MARKER_RADIUS_PAD = 0.16; // stays under Spot Miking's 0.25 dist by ~0.09m at any clearance
    function closeMarkerPos(spotId, sourcePos, sourceDef) {
      const angle = CLOSE_MARKER_FAN_DEG[spotId];
      if (angle == null) return null;
      const radius = sourceDef.nearClearanceM + CLOSE_MARKER_RADIUS_PAD;
      return computeSpotPosition(sourcePos, radius, angle, null, sourceDef.aimHeight);
    }

    function activePlacements() {
      const def = TECHNIQUES[state.technique];
      const sourceDef = SOURCE_TYPES.find((t) => t.id === state.sourceType);
      const sourcePos = sourceAnchorPos(sourceDef.aimHeight);
      // Every technique's authored `dist`/`centerDist` is measured from the
      // SOURCE'S SURFACE (matching how "2 inches from the source" is
      // actually meant), not from its anchor point at the model's center —
      // sources have real size (a kick shell alone is ~0.3m in radius), so
      // without this a "2 in" close-mic spot would render the mic buried
      // inside the source's geometry instead of just off its surface.
      const clearance = sourceDef.nearClearanceM;

      if (def.mode === 'single') {
        const spot = def.spots.find((s) => s.id === state.placementId) || def.spots[0];
        const pos =
          (state.technique === 'close' && closeMarkerPos(spot.id, sourcePos, sourceDef)) ||
          computeSpotPosition(sourcePos, spot.dist + clearance, spot.angle, spot.heightM, sourceDef.aimHeight);
        return [{ ...spot, pos }];
      }
      if (def.mode === 'multi') {
        // Badge number is the spot's fixed position in the SOURCE'S full
        // layer list (not the filtered-down active subset) so "Top" stays
        // mic 1 and "Bottom" stays mic 2 for a snare regardless of which
        // are currently toggled on — matches the number on its hotspot.
        const spots = def.spotsBySource[state.sourceType] || def.spotsBySource.default;
        return spots
          .map((spot, i) => ({ ...spot, badgeNumber: i + 1 }))
          .filter((s) => state.layerIds.has(s.id))
          .map((spot) => ({ ...spot, pos: computeSpotPosition(sourcePos, spot.dist + clearance, spot.angle, spot.heightM, sourceDef.aimHeight) }));
      }
      if (def.mode === 'stereo') {
        // Generalized over `preset.mics` (2 capsules for most presets, 3
        // for Decca Tree's L/C/R) instead of a hardcoded left/right pair —
        // see the TECHNIQUES.stereo header comment for the per-mic shape.
        // Only mics the visitor has clicked into place (state.stereoPlaced,
        // keyed by array index) render a rig — see buildHotspots().
        const preset = def.presets[state.presetId];
        const y = sourceDef.aimHeight + 0.15;
        return preset.mics
          .map((mic, i) => {
            const distM = mic.distM + clearance;
            return {
              id: `${preset.id}-${i}`, tag: `${mic.tag} capsule`, yawOffsetDeg: mic.yawOffsetDeg || 0,
              distanceLabel: `${distM.toFixed(1)} m out`, axisLabel: `${mic.tag} channel`, character: preset.label,
              badgeNumber: i + 1,
              pos: new THREE.Vector3(sourcePos.x + (mic.xOffsetM || 0), mic.heightM != null ? mic.heightM : y, sourcePos.z - distM),
            };
          })
          .filter((_, i) => state.stereoPlaced.has(i));
      }
      return [];
    }

    // Builds one mic rig (stand/contact-surface + head + body + aim
    // indicator) at `placement.pos`, yawed to face the source head-on, plus
    // `placement.yawOffsetDeg` of extra rotation on top when the placement
    // needs one (see the TECHNIQUES/yawToFace comments above) — same
    // body-building code as MikingRoom's buildMicRig(), just parameterized
    // per-rig instead of operating on one fixed global rig. No
    // polar-pattern lobe here (see the header comment — pattern isn't
    // selectable in this lab), just a plain aim line/tip showing which way
    // the capsule faces, and a fixed-appearance coverage beam to the source
    // (no gain math to modulate it by, since there's no pattern to compute
    // gain from).
    //
    // `yawOffsetDeg` only exists for Stereo Miking's paired/tripled capsules
    // (AB/XY/M-S/ORTF/Overhead/Blumlein/Decca Tree/Outrigger all cross or
    // spread their capsules by a specific angle — that angle IS the
    // technique). Every other technique leaves it unset, so those rigs
    // point exactly at the source with nothing added, per the earlier fix.
    function buildOneMicRig(typeDef, placement, sourcePos, accent, accentStrong, badgeNumber) {
      const rig = new THREE.Group();
      const capsuleY = !typeDef.hasStand ? 0.36 : placement.pos.y;
      rig.position.set(placement.pos.x, 0, placement.pos.z);
      rig.rotation.y = yawToFace(placement.pos, sourcePos) + THREE.MathUtils.degToRad(placement.yawOffsetDeg || 0);

      if (typeDef.hasStand) addStand(rig, capsuleY);
      else addContactSurface(rig, capsuleY);

      // Stereo/multi mics only — a floating numbered badge above the
      // capsule (a pure +y local offset stays vertical no matter how the
      // rig is yawed, so this is safe to add before the rotation-sensitive
      // pieces below). Single-mode techniques pass no badgeNumber — one
      // active mic at a time doesn't need numbering.
      if (badgeNumber != null) {
        const badge = makeNumberSprite(badgeNumber, accentStrong, 1, 0.17);
        badge.position.set(0, capsuleY + 0.24, 0);
        rig.add(badge);
      }

      const head = new THREE.Group();
      head.position.y = capsuleY;
      if (typeDef.hasStand) head.rotation.x = MIC_TILT;
      rig.add(head);

      const bodyGroup = new THREE.Group();
      bodyGroup.scale.setScalar(MIC_BODY_SCALE);
      head.add(bodyGroup);
      typeDef.build(bodyGroup);

      const keyLight = new THREE.PointLight(0xfff2df, 1.1, 2.4, 2);
      keyLight.position.set(0.32, 0.28, -0.22);
      head.add(keyLight);

      if (typeDef.hasStand) {
        const axisLen = AIM_INDICATOR_LEN;
        const axisGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -axisLen)]);
        head.add(new THREE.Line(axisGeo, new THREE.LineBasicMaterial({ color: accentStrong, transparent: true, opacity: 0.6 })));

        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 8), new THREE.MeshBasicMaterial({ color: accentStrong, transparent: true, opacity: 0.85 }));
        tip.position.set(0, 0, -axisLen);
        tip.rotation.x = -Math.PI / 2;
        head.add(tip);

        const glow = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), makeGlowMaterial(accent));
        glow.rotation.x = -Math.PI / 2;
        glow.position.set(0, 0.004, 0);
        rig.add(glow);

        // Coverage beam to the source — world-space (added to beamsGroup,
        // a sibling of every rig, not a child of this rotated rig) so its
        // own orientation math isn't compounded by the rig's yaw. Fixed
        // thickness/opacity — there's no pattern-derived gain left to
        // modulate it by, so it just shows which mic connects to what.
        //
        // Always a straight line to the source — deliberately NOT reusing
        // rig.rotation.y here, because that now carries `yawOffsetDeg` for
        // Stereo Miking's crossed/spread capsules (see buildOneMicRig's
        // header comment). If the beam followed the capsule's own angle
        // instead, an X-Y or ORTF pair's beams would shoot off well past
        // the source instead of visibly connecting to it. For every other
        // technique (yawOffsetDeg unset) the rig already points exactly at
        // the source, so this straight line and the aim arrow coincide
        // anyway — this is the same "beam always reaches the source" model
        // MikingRoom uses for its own (always-fixed) boresight arrow.
        const beamStart = new THREE.Vector3(rig.position.x, capsuleY, rig.position.z);
        const beamEnd = sourcePos;
        const beamDir = beamEnd.clone().sub(beamStart).normalize();
        const beamLen = beamStart.distanceTo(beamEnd);
        if (beamLen > 0.001) {
          const beamRadiusMic = 0.02;
          const beamRadiusSrc = beamRadiusMic * 0.32;
          const beamGeo = new THREE.CylinderGeometry(beamRadiusSrc, beamRadiusMic, beamLen, 12, 1, true);
          BEAM_TEXTURE.repeat.set(1, Math.max(1, beamLen / 0.42));
          const beamMat = new THREE.MeshBasicMaterial({
            color: accentStrong,
            map: BEAM_TEXTURE,
            transparent: true,
            opacity: 0.55,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          });
          const beam = new THREE.Mesh(beamGeo, beamMat);
          beam.position.copy(beamStart).add(beamEnd).multiplyScalar(0.5);
          beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), beamDir);
          beamsGroup.add(beam);
          activeBeamTextures.push(BEAM_TEXTURE);

          const capMat = new THREE.MeshBasicMaterial({ color: accentStrong, transparent: true, opacity: 0.9, depthWrite: false });
          const capMic = new THREE.Mesh(new THREE.SphereGeometry(beamRadiusMic * 1.4, 12, 10), capMat);
          capMic.position.copy(beamStart);
          const capSrc = new THREE.Mesh(new THREE.SphereGeometry(beamRadiusSrc * 1.8, 10, 8), capMat);
          capSrc.position.copy(beamEnd);
          beamsGroup.add(capMic, capSrc);
        }
      } else {
        const rippleGroup = buildContactRipple(accent, accentStrong);
        rippleGroup.position.set(0, capsuleY + 0.002, 0);
        rig.add(rippleGroup);

        const surfaceGlow = new THREE.Mesh(new THREE.CircleGeometry(0.24, 32), makeGlowMaterial(accent));
        surfaceGlow.rotation.x = -Math.PI / 2;
        surfaceGlow.position.set(0, capsuleY + 0.001, 0);
        rig.add(surfaceGlow);
      }

      return rig;
    }

    function buildMicRigs() {
      clearGroup(micRigsGroup);
      clearGroup(beamsGroup);
      activeBeamTextures.length = 0;

      const typeDef = MIC_TYPES.find((t) => t.id === state.micType);
      const sourceDef = SOURCE_TYPES.find((t) => t.id === state.sourceType);
      const sourcePos = sourceAnchorPos(sourceDef.aimHeight);
      const accent = token('--mtr-accent', '#a8672a');
      const accentStrong = token('--mtr-accent-strong', '#8c521e');

      activePlacements().forEach((placement) => {
        micRigsGroup.add(buildOneMicRig(typeDef, placement, sourcePos, accent, accentStrong, placement.badgeNumber));
      });
    }

    // ---- Hotspot markers + the state-mutating actions behind them — one
    // marker per candidate mic position for the active technique. Shared by
    // both the 3D click path (hitTestHotspot -> onSelect, wired on the
    // canvas's pointer handlers below) and the accessible button-list twin
    // (syncHotspotAccessibleList) so keyboard/screen-reader visitors have
    // the same control a mouse/touch visitor gets from clicking in the
    // scene. ----
    function selectSinglePlacement(spotId) {
      if (state.placementId === spotId) return;
      markInteracted();
      state.placementId = spotId;
      refreshTechniqueUI();
      buildMicRigs();
      buildHotspots();
      refreshReadouts();
    }
    function toggleStereoMic(index) {
      markInteracted();
      if (state.stereoPlaced.has(index)) state.stereoPlaced.delete(index);
      else state.stereoPlaced.add(index);
      buildMicRigs();
      buildHotspots();
      refreshReadouts();
    }
    function toggleMultiLayer(spotId) {
      markInteracted();
      if (state.layerIds.has(spotId)) state.layerIds.delete(spotId);
      else state.layerIds.add(spotId);
      buildMicRigs();
      buildHotspots();
      refreshReadouts();
    }
    // Multi Miking's Clear button (see the Layers row JSX) — drops every
    // placed mic at once instead of toggling them off one by one.
    function onClearMultiLayers() {
      if (state.layerIds.size === 0) return;
      markInteracted();
      state.layerIds = new Set();
      buildMicRigs();
      buildHotspots();
      refreshReadouts();
    }

    function buildHotspots() {
      clearGroup(hotspotsGroup);
      hotspotInteractables = [];
      pendingHotspotMeshes = [];

      const def = TECHNIQUES[state.technique];
      const sourceDef = SOURCE_TYPES.find((t) => t.id === state.sourceType);
      const sourcePos = sourceAnchorPos(sourceDef.aimHeight);
      const clearance = sourceDef.nearClearanceM;
      const accent = token('--mtr-accent', '#a8672a');
      const accentStrong = token('--mtr-accent-strong', '#8c521e');

      // active = a mic already sits here (single mode's current spot, or a
      // placed stereo/multi mic). Inactive markers pulse gently (see tick())
      // and, for stereo/multi, carry a dim number so a visitor knows which
      // mic clicking them will place — the mic's own bright badge (added in
      // buildOneMicRig) takes over once it's actually there.
      function addMarker(pos, active, number, onSelect, hitRadius = 0.16) {
        // The clickable marker always sits on the floor at this spot's
        // (x, z), even when the real mic position is elevated (Overhead's
        // 2.1m, Spot Miking's main-pair context spot at 1.9m, Close
        // Miking's mouth-height fan, etc.) — a floor footprint is easy to
        // see and click from any camera angle, where a marker floating at
        // head height or higher can be hard to spot or hidden behind gear.
        // A faint dashed guide line (below) stands in for "the real
        // position is up there" when that's true.
        const group = new THREE.Group();
        group.position.set(pos.x, HOTSPOT_FLOOR_Y, pos.z);

        const color = active ? accentStrong : accent;
        const core = new THREE.Mesh(
          new THREE.SphereGeometry(active ? 0.055 : 0.045, 16, 12),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: active ? 0.95 : 0.5 })
        );
        group.add(core);

        const glow = new THREE.Sprite(makeGlowMaterial(color));
        glow.scale.setScalar(active ? 0.5 : 0.36);
        group.add(glow);

        if (number != null && !active) {
          const badge = makeNumberSprite(number, accent, 0.6, 0.13);
          badge.position.set(0, 0.15, 0);
          group.add(badge);
        }

        // Elevated spot — a thin dashed line from the floor marker straight
        // up to the real mic height, so clicking the floor dot doesn't read
        // as "the mic sits on the floor here".
        const elevation = pos.y - HOTSPOT_FLOOR_Y;
        if (elevation > 0.15) {
          const guideGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, elevation, 0)]);
          const guide = new THREE.Line(guideGeo, new THREE.LineDashedMaterial({ color, transparent: true, opacity: active ? 0.55 : 0.3, dashSize: 0.05, gapSize: 0.04 }));
          guide.computeLineDistances();
          group.add(guide);
        }

        // Larger invisible sphere as the actual click/tap target — the
        // visible marker stays small so it doesn't crowd the scene, but a
        // 0.045-0.055 radius sphere is a hard target to hit precisely.
        // Object3D.visible only affects rendering, not raycasting, so this
        // stays hit-testable. See hitTestHotspot() above. Close Miking
        // passes a smaller hitRadius (its 3 markers sit closer together,
        // by design — see CLOSE_MARKER_RADIUS_PAD above — than the default
        // 0.16 comfortably allows without overlapping).
        const hit = new THREE.Mesh(new THREE.SphereGeometry(hitRadius, 8, 6), new THREE.MeshBasicMaterial());
        hit.visible = false;
        group.add(hit);

        hotspotsGroup.add(group);
        hotspotInteractables.push({ mesh: hit, onSelect });
        // Store each mesh's own base scale alongside it — tick()'s pulse is
        // a multiplier, not an absolute (core and glow start at different
        // scales; overwriting either with the raw multiplier would size it
        // wrong instead of just breathing it in and out).
        if (!active) {
          pendingHotspotMeshes.push({ mesh: core, base: core.scale.x }, { mesh: glow, base: glow.scale.x });
        }
      }

      if (def.mode === 'single') {
        def.spots.forEach((spot) => {
          // Close Miking's marker (and, once clicked, the mic itself — see
          // closeMarkerPos/activePlacements above) renders fanned out
          // instead of at the spot's literal authored position, so the 3
          // real-world-tiny distances are actually distinguishable and
          // comparable in the room.
          const pos =
            (state.technique === 'close' && closeMarkerPos(spot.id, sourcePos, sourceDef)) ||
            computeSpotPosition(sourcePos, spot.dist + clearance, spot.angle, spot.heightM, sourceDef.aimHeight);
          const active = spot.id === state.placementId;
          const hitRadius = state.technique === 'close' ? 0.1 : 0.16;
          addMarker(pos, active, null, () => selectSinglePlacement(spot.id), hitRadius);
        });
      } else if (def.mode === 'stereo') {
        const preset = def.presets[state.presetId];
        const y = sourceDef.aimHeight + 0.15;
        preset.mics.forEach((mic, i) => {
          const distM = mic.distM + clearance;
          const pos = new THREE.Vector3(sourcePos.x + (mic.xOffsetM || 0), mic.heightM != null ? mic.heightM : y, sourcePos.z - distM);
          const active = state.stereoPlaced.has(i);
          addMarker(pos, active, i + 1, () => toggleStereoMic(i));
        });
      } else if (def.mode === 'multi') {
        const spots = def.spotsBySource[state.sourceType] || def.spotsBySource.default;
        spots.forEach((spot, i) => {
          const pos = computeSpotPosition(sourcePos, spot.dist + clearance, spot.angle, spot.heightM, sourceDef.aimHeight);
          const active = state.layerIds.has(spot.id);
          addMarker(pos, active, i + 1, () => toggleMultiLayer(spot.id));
        });
      }

      syncHotspotAccessibleList();
      syncMultiLayerRow();
    }

    // Keyboard/screen-reader-accessible twin of the 3D hotspots — a plain
    // (visually-hidden, see .mtr-sr-only) list of buttons doing exactly what
    // clicking the matching marker does. Rebuilt fresh each time buildHotspots()
    // runs so it never drifts out of sync with what's actually placed.
    function syncHotspotAccessibleList() {
      if (!hotspotList) return;
      const def = TECHNIQUES[state.technique];
      hotspotList.innerHTML = '';

      function addButton(kind, id, label, pressed) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mtr-pill';
        btn.textContent = label;
        btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
        btn.addEventListener('click', () => {
          if (kind === 'single') selectSinglePlacement(id);
          else if (kind === 'stereo') toggleStereoMic(id);
        });
        hotspotList.appendChild(btn);
      }

      if (def.mode === 'single') {
        def.spots.forEach((spot) => addButton('single', spot.id, `Move mic to ${spot.tag}`, spot.id === state.placementId));
      } else if (def.mode === 'stereo') {
        const preset = def.presets[state.presetId];
        preset.mics.forEach((mic, i) => addButton('stereo', i, `Mic ${i + 1} — ${mic.tag}`, state.stereoPlaced.has(i)));
      }
      // Multi Miking gets no entry here — its Layers row (see
      // syncMultiLayerRow below) is a real, always-visible pill row rather
      // than a hidden accessible-only twin, so it already serves keyboard
      // and screen-reader visitors without a duplicate hidden list.
    }

    // Multi Miking's visible "Layers" row — one toggle pill per candidate
    // mic position for the active source, doing exactly what clicking the
    // matching 3D hotspot does (toggleMultiLayer), plus a "Clear" button
    // (onClearMultiLayers) to drop everything at once. Rebuilt alongside
    // the hotspots/accessible list every time buildHotspots() runs, so it
    // never drifts out of sync with what's actually placed.
    function syncMultiLayerRow() {
      if (!multiLayerRow) return;
      multiLayerRow.innerHTML = '';
      if (state.technique !== 'multi') return;
      const spots = TECHNIQUES.multi.spotsBySource[state.sourceType] || TECHNIQUES.multi.spotsBySource.default;
      spots.forEach((spot) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mtr-chip';
        btn.innerHTML = '<span class="mtr-chip-dot" aria-hidden="true"></span>' + spot.tag;
        const active = state.layerIds.has(spot.id);
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        btn.addEventListener('click', () => toggleMultiLayer(spot.id));
        multiLayerRow.appendChild(btn);
      });
    }

    function setPillState(row, activeId, attr) {
      if (!row) return;
      Array.prototype.forEach.call(row.children, (btn) => {
        const active = btn.getAttribute(attr) === activeId;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }

    // Shows only the sub-control row(s) + readout block relevant to the
    // active technique's `mode`. Placement/layer selection itself no longer
    // has a DOM row (see the hotspot system above) — only the stereo preset
    // picker remains as a button row, since which named pairing (X-Y vs
    // ORTF vs...) is a choice hotspots don't make sense for.
    function refreshControlsVisibility() {
      const mode = TECHNIQUES[state.technique].mode;
      // Multi Miking replaces the generic Source row with its own preset
      // row (Snare/Kick/Amp/...) — see onMultiPresetRowClick — since which
      // source you're multi-miking IS the preset there; every other
      // technique keeps the plain Source row.
      if (sourceRow) sourceRow.closest('.mtr-ctrl-row').hidden = mode === 'multi';
      if (multiPresetRow) multiPresetRow.closest('.mtr-ctrl-row').hidden = mode !== 'multi';
      if (multiLayerRow) multiLayerRow.closest('.mtr-ctrl-row').hidden = mode !== 'multi';
      if (presetRow) presetRow.closest('.mtr-ctrl-row').hidden = mode !== 'stereo';
      if (singleReadout) singleReadout.hidden = mode !== 'single';
      if (stereoReadout) stereoReadout.hidden = mode !== 'stereo';
    }

    function refreshReadouts() {
      const def = TECHNIQUES[state.technique];
      const placements = activePlacements();

      if (def.mode === 'single') {
        const p = placements[0];
        if (rDistance) rDistance.textContent = p.distanceLabel;
        if (rAxis) rAxis.textContent = p.axisLabel;
        if (rNotes) rNotes.textContent = p.character;
      } else if (def.mode === 'stereo') {
        const preset = def.presets[state.presetId];
        if (rSpacing) rSpacing.textContent = preset.spacingLabel;
        if (rAngle) rAngle.textContent = preset.angleLabel;
        if (rMono) rMono.textContent = preset.monoLabel;
        if (rMonoFill) rMonoFill.style.width = `${preset.monoPct}%`;
      }
    }

    function refreshTechniqueUI() {
      const def = TECHNIQUES[state.technique];
      setPillState(techniqueRow, state.technique, 'data-technique');
      if (techniqueBlurb) techniqueBlurb.textContent = def.blurb;
      if (def.mode === 'single' && !def.spots.some((s) => s.id === state.placementId)) {
        state.placementId = def.spots[0].id;
      }
      if (def.mode === 'stereo') setPillState(presetRow, state.presetId, 'data-preset');
      if (def.mode === 'multi') setPillState(multiPresetRow, state.sourceType, 'data-multipreset');
      refreshControlsVisibility();
    }

    function refreshAll() {
      setPillState(micTypeRow, state.micType, 'data-type');
      setPillState(sourceRow, state.sourceType, 'data-source');
      if (micTypeBlurb) {
        const activeMicType = MIC_TYPES.find((t) => t.id === state.micType);
        micTypeBlurb.textContent = activeMicType ? activeMicType.blurb : '';
      }
      refreshTechniqueUI();
      buildSourceObject();
      buildMicRigs();
      buildHotspots();
      refreshReadouts();
    }

    // Just the first mic in a source's real-world layout (e.g. Snare's
    // "Top", or "Close" for sources on the generic default layout) — what
    // "picking a preset loads the mic" means for Multi Miking. Shared by
    // onMultiPresetRowClick and onTechniqueRowClick (entering Multi Miking
    // loads the current source's first layer immediately, same as picking
    // that preset explicitly would); click a hotspot or a Layers pill
    // afterward to toggle on more mics from there.
    function firstMultiLayerId(sourceId) {
      const spots = TECHNIQUES.multi.spotsBySource[sourceId] || TECHNIQUES.multi.spotsBySource.default;
      return new Set([spots[0].id]);
    }

    // Every mic index in a stereo preset, all placed at once — what "load
    // the mics at their preset position by default" means for Stereo
    // Miking. Clicking a hotspot afterward still toggles that one mic off
    // (or back on), same as before — this only changes where things start.
    function loadedStereoPlaced(presetId) {
      const preset = TECHNIQUES.stereo.presets[presetId];
      return new Set(preset.mics.map((_, i) => i));
    }

    // ---- Event wiring ----
    function onSourceRowClick(e) {
      const btn = e.target.closest('button[data-source]');
      if (!btn) return;
      markInteracted();
      state.sourceType = btn.getAttribute('data-source');
      refreshAll();
    }
    function onMicTypeRowClick(e) {
      const btn = e.target.closest('button[data-type]');
      if (!btn) return;
      markInteracted();
      state.micType = btn.getAttribute('data-type');
      refreshAll();
    }
    function onTechniqueRowClick(e) {
      const btn = e.target.closest('button[data-technique]');
      if (!btn) return;
      markInteracted();
      state.technique = btn.getAttribute('data-technique');
      // Both Stereo and Multi Miking load their current preset's mics right
      // away when you switch onto the technique (same as picking that
      // preset explicitly would) — clicking a hotspot afterward still
      // toggles an individual mic off/back on to explore from there.
      state.stereoPlaced = state.technique === 'stereo' ? loadedStereoPlaced(state.presetId) : new Set();
      state.layerIds = state.technique === 'multi' ? firstMultiLayerId(state.sourceType) : new Set();
      refreshTechniqueUI();
      buildMicRigs();
      buildHotspots();
      refreshReadouts();
    }
    // Picking a stereo preset (AB/XY/ORTF/...) loads every mic in it right
    // away — same "load the mic(s) there" default Multi Miking's own
    // preset row gives you (onMultiPresetRowClick below). Clicking a
    // hotspot afterward still toggles that one mic off (or back on).
    function onPresetRowClick(e) {
      const btn = e.target.closest('button[data-preset]');
      if (!btn) return;
      markInteracted();
      state.presetId = btn.getAttribute('data-preset');
      state.stereoPlaced = loadedStereoPlaced(state.presetId);
      refreshTechniqueUI();
      buildMicRigs();
      buildHotspots();
      refreshReadouts();
    }
    // Multi Miking's own preset row (Vocal/Guitar/Amp/Snare/Kick/Ethnic) —
    // stands in for the plain Source row while Multi Miking is active (see
    // refreshControlsVisibility): picking one sets the source AND loads
    // every one of that source's mics immediately, the same "load the mic
    // there" behavior onTechniqueRowClick gives you when you first switch
    // into Multi Miking.
    function onMultiPresetRowClick(e) {
      const btn = e.target.closest('button[data-multipreset]');
      if (!btn) return;
      markInteracted();
      state.sourceType = btn.getAttribute('data-multipreset');
      state.layerIds = firstMultiLayerId(state.sourceType);
      refreshAll();
    }
    sourceRow.addEventListener('click', onSourceRowClick);
    micTypeRow.addEventListener('click', onMicTypeRowClick);
    techniqueRow.addEventListener('click', onTechniqueRowClick);
    presetRow.addEventListener('click', onPresetRowClick);
    multiPresetRow.addEventListener('click', onMultiPresetRowClick);
    clearLayersBtn.addEventListener('click', onClearMultiLayers);
    onCleanup(() => sourceRow.removeEventListener('click', onSourceRowClick));
    onCleanup(() => micTypeRow.removeEventListener('click', onMicTypeRowClick));
    onCleanup(() => techniqueRow.removeEventListener('click', onTechniqueRowClick));
    onCleanup(() => presetRow.removeEventListener('click', onPresetRowClick));
    onCleanup(() => multiPresetRow.removeEventListener('click', onMultiPresetRowClick));
    onCleanup(() => clearLayersBtn.removeEventListener('click', onClearMultiLayers));

    refreshAll();

    // Re-tint the scene if the system theme flips while the page is open —
    // same as MikingRoom.
    let mq = null;
    let onThemeChange = null;
    if (window.matchMedia) {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
      onThemeChange = () => {
        buildScene();
        buildSourceObject();
        buildMicRigs();
        buildHotspots();
      };
      if (mq.addEventListener) mq.addEventListener('change', onThemeChange);
      else if (mq.addListener) mq.addListener(onThemeChange);
      onCleanup(() => {
        if (!mq || !onThemeChange) return;
        if (mq.removeEventListener) mq.removeEventListener('change', onThemeChange);
        else if (mq.removeListener) mq.removeListener(onThemeChange);
      });
    }

    // ---- Orbit + zoom camera (no pan) — identical controller to MikingRoom ----
    const spherical = { radius: 5.6, theta: 1.0, phi: 1.08 };
    const goal = { radius: 5.6, theta: 1.0, phi: 1.08 };
    const DEFAULTS = { radius: 5.6, theta: 1.0, phi: 1.08 };

    const MIN_RADIUS = 1.2;
    const MAX_RADIUS = 8.5;
    const MIN_PHI = 0.35;
    const MAX_PHI = 1.48;

    function clampGoal() {
      goal.radius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, goal.radius));
      goal.phi = Math.max(MIN_PHI, Math.min(MAX_PHI, goal.phi));
    }

    function updateCamera() {
      const s = spherical;
      const g = goal;
      const damp = 0.09;
      s.radius += (g.radius - s.radius) * damp;
      s.theta += (g.theta - s.theta) * damp;
      s.phi += (g.phi - s.phi) * damp;

      const x = target.x + s.radius * Math.sin(s.phi) * Math.sin(s.theta);
      const y = target.y + s.radius * Math.cos(s.phi);
      const z = target.z + s.radius * Math.sin(s.phi) * Math.cos(s.theta);
      camera.position.set(x, y, z);
      camera.lookAt(target);
    }

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let downX = 0;
    let downY = 0;
    let downTime = 0;
    let hintFaded = false;
    const ROTATE_SPEED = 0.0055;
    const ZOOM_SPEED = 0.0022;
    const CLICK_MOVE_TOLERANCE = 6; // px — below this, a pointerdown->up is a "click" on a hotspot, not a drag
    const CLICK_TIME_TOLERANCE = 600; // ms

    function fadeHint() {
      if (!hintFaded && hint) {
        hint.classList.add('is-faded');
        hintFaded = true;
      }
    }

    function onPointerDown(e) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      downX = e.clientX;
      downY = e.clientY;
      downTime = performance.now();
      canvas.classList.add('is-dragging');
      canvas.setPointerCapture(e.pointerId);
      fadeHint();
    }
    function onPointerMove(e) {
      if (!dragging) {
        // Not dragging — this is just a hover, so probe for a hotspot under
        // the cursor and swap in a pointer cursor as an affordance (the
        // canvas's own CSS default is 'grab', for orbiting).
        canvas.style.cursor = hitTestHotspot(e.clientX, e.clientY) ? 'pointer' : '';
        return;
      }
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      goal.theta -= dx * ROTATE_SPEED;
      goal.phi -= dy * ROTATE_SPEED;
      clampGoal();
    }
    function endDrag(e) {
      dragging = false;
      canvas.classList.remove('is-dragging');
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch (err) {
        /* pointer may already be released */
      }
    }
    // A pointerup that barely moved and didn't take long is a click/tap
    // rather than an orbit-drag — raycast it against the active hotspot
    // markers and fire whichever one it landed on. pointercancel (e.g. an
    // interrupted touch) skips this and goes straight to endDrag, below.
    function onPointerUp(e) {
      endDrag(e);
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      const dt = performance.now() - downTime;
      if (Math.hypot(dx, dy) <= CLICK_MOVE_TOLERANCE && dt <= CLICK_TIME_TOLERANCE) {
        const hit = hitTestHotspot(e.clientX, e.clientY);
        if (hit) hit.onSelect();
      }
    }
    function onWheel(e) {
      e.preventDefault();
      goal.radius += e.deltaY * ZOOM_SPEED * (goal.radius * 0.35 + 1);
      clampGoal();
      fadeHint();
    }

    let pinchStartDist = null;
    let pinchStartRadius = null;
    function touchDist(t) {
      const dx = t[0].clientX - t[1].clientX;
      const dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
    function onTouchStart(e) {
      if (e.touches.length === 2) {
        pinchStartDist = touchDist(e.touches);
        pinchStartRadius = goal.radius;
      }
    }
    function onTouchMove(e) {
      if (e.touches.length === 2 && pinchStartDist) {
        const d = touchDist(e.touches);
        goal.radius = pinchStartRadius * (pinchStartDist / d);
        clampGoal();
        fadeHint();
      }
    }
    function onTouchEnd(e) {
      if (e.touches.length < 2) pinchStartDist = null;
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: true });
    canvas.addEventListener('touchend', onTouchEnd);
    onCleanup(() => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', endDrag);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    });

    function onResetClick() {
      goal.radius = DEFAULTS.radius;
      goal.theta = DEFAULTS.theta;
      goal.phi = DEFAULTS.phi;
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', onResetClick);
      onCleanup(() => resetBtn.removeEventListener('click', onResetClick));
    }

    // Minimize/expand the technique info panel (blurb + readouts) beside
    // the room — collapses down to just its title bar so the panel can be
    // tucked away without losing the room underneath it, same simple
    // classList-toggle approach as fadeHint()'s .is-faded above.
    function onInfoPanelToggleClick() {
      const collapsed = infoPanel.classList.toggle('is-collapsed');
      infoPanelToggle.textContent = collapsed ? '+' : '\u2212';
      infoPanelToggle.setAttribute('aria-label', collapsed ? 'Expand technique info panel' : 'Minimize technique info panel');
      infoPanelToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }
    if (infoPanel && infoPanelToggle) {
      infoPanelToggle.addEventListener('click', onInfoPanelToggleClick);
      onCleanup(() => infoPanelToggle.removeEventListener('click', onInfoPanelToggleClick));
    }

    // ---- Resize ----
    function resize() {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    }
    let resizeObserver = null;
    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(stage);
      onCleanup(() => resizeObserver.disconnect());
    } else {
      window.addEventListener('resize', resize);
      onCleanup(() => window.removeEventListener('resize', resize));
    }
    resize();

    // ---- Render loop ----
    function tick() {
      if (cancelled) return;
      updateCamera();
      if (activeBeamTextures.length && !REDUCE_MOTION) {
        BEAM_TEXTURE.offset.y -= 0.01;
      }
      if (pendingHotspotMeshes.length && !REDUCE_MOTION) {
        // Gentle breathing scale on every unplaced hotspot's core+glow
        // meshes — the only cue (besides the dim number badge) that these
        // are clickable, since they otherwise sit small and low-opacity.
        const s = 1 + Math.sin(performance.now() * 0.0025) * 0.15;
        pendingHotspotMeshes.forEach((entry) => entry.mesh.scale.setScalar(entry.base * s));
      }
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      teardown.forEach((fn) => fn());

      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
        mats.forEach((m) => {
          Object.keys(m).forEach((key) => {
            const value = m[key];
            if (value && value.isTexture && typeof value.dispose === 'function') value.dispose();
          });
          m.dispose();
        });
      });
      GLOW_TEXTURE.dispose();
      BEAM_TEXTURE.dispose();
      renderer.dispose();
    };
  }, []);

  const rootClassName = ['mic-technique-room', embedded && 'mtr-embedded', className].filter(Boolean).join(' ');

  // Small icon set for the Source / Multi-mic preset tile grids, one per
  // source id — lets each source read at a glance instead of as plain text
  // in a pill. Identical set as MikingRoom.jsx's own SOURCE_ICONS, brought
  // over from design/mic-setup-redesign.html's presetIcon().
  const SOURCE_ICONS = {
    vocal: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <rect x="9" y="2" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <line x1="12" y1="18" x2="12" y2="22" />
      </svg>
    ),
    guitar: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <circle cx="8" cy="16" r="5" />
        <path d="M11 12l7-9" />
        <path d="M15 2l3 3" />
      </svg>
    ),
    amp: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <circle cx="9" cy="12" r="3" />
        <circle cx="16" cy="7" r="1" />
        <circle cx="16" cy="17" r="1" />
      </svg>
    ),
    snare: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <ellipse cx="12" cy="8" rx="8" ry="3" />
        <path d="M4 8v6c0 1.7 3.6 3 8 3s8-1.3 8-3V8" />
      </svg>
    ),
    kick: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
    ethnic: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <ellipse cx="12" cy="6" rx="7" ry="2.5" />
        <path d="M5 6l2 13h10l2-13" />
        <path d="M8.5 12h7" />
      </svg>
    ),
  };

  return (
    <div className={rootClassName} style={style} data-theme={theme} ref={rootRef}>
      {!embedded && (
        <header className="mtr-topbar">
          <div className="mtr-eyebrow">Microphone Techniques &amp; Stereo Recording</div>
          <h1 className="mtr-title">07 — Technique &amp; Placement</h1>
          <p className="mtr-subtitle">
            Pick a source and a mic type, then compare Close, Spot, Distant/Room, Stereo, and Multi Miking — each
            technique marks its own candidate mic position(s) as clickable hotspots in the room below. Click one to
            move (or add) a mic there.
          </p>
        </header>
      )}

      <div className="mtr-stage">
        <div className="mtr-viewport" ref={stageRef}>
          <canvas className="mtr-canvas" aria-hidden="true" ref={canvasRef} />
          <p className="mtr-sr-only">
            Interactive 3D view of an abstract studio room with a sound source fixed near one side and one or more
            microphones placed around it. Drag to orbit the camera around the room; scroll or pinch to zoom. A reset
            view control is provided. Below the room, controls let you pick a microphone type, then choose one of
            five miking techniques — Close, Spot, Distant/Room, Stereo, or Multi Miking. Each technique marks up to
            a few candidate mic positions as glowing hotspots on the room's floor (a thin dashed line rises to the
            real position when it's elevated, such as an overhead pair); clicking one moves the mic there
            (Close/Spot/Distant/Room) or toggles a numbered mic on or off at that position (Stereo, Multi Miking).
            Stereo has a preset row for picking which named pairing — X-Y, ORTF, and so on — and Multi Miking has
            its own preset row for picking which source to multi-mic — Snare, Kick, Amp, and so on; picking a
            stereo preset loads every mic in it at its real position immediately, and a hotspot click just
            toggles one mic back out (or back in) from there, while picking a multi-mic preset loads just that
            source's first mic (e.g. Snare's "Top") by default. Multi Miking also shows a Layers row of buttons
            — one per mic position for the current source, doing exactly what clicking the matching hotspot
            does — plus a Clear button that removes every placed mic at once. For Close/Spot/Distant/Room and
            Stereo Miking, the same hotspot actions are also available, for keyboard and screen-reader use, as a
            list of buttons below the room. A readout reports distance and axis (or stereo
            spacing/angle/mono-compatibility) for the current selection.
          </p>

          <div className="mtr-hint" ref={hintRef}>
            <span className="mtr-hint-row">
              <kbd>drag</kbd> rotate
            </span>
            <span className="mtr-hint-row">
              <kbd>scroll</kbd> zoom
            </span>
            <span className="mtr-hint-row">
              <kbd>click</kbd> place mic
            </span>
            <button className="mtr-reset-btn" type="button" ref={resetBtnRef}>
              Reset view
            </button>
          </div>

          {/* The active technique's full write-up, floated beside the 3D
              room instead of stacked below the controls (see the
              mtr-technique-grid comment in MicTechniqueRoom.css) — keeps
              the description visible without costing the controls bar any
              height, so the room itself keeps most of the frame. */}
          <div className="mtr-info-panel" ref={infoPanelRef}>
            <div className="mtr-info-head">
              <p className="mtr-info-title">Technique</p>
              <button
                className="mtr-info-toggle"
                type="button"
                ref={infoPanelToggleRef}
                aria-expanded="true"
                aria-label="Minimize technique info panel"
              >
                {'\u2212'}
              </button>
            </div>
            <div className="mtr-info-body">
              <p className="mtr-technique-blurb" ref={techniqueBlurbRef} />

              <div className="mtr-readout-row" ref={singleReadoutRef}>
                <div className="mtr-readout">
                  <div className="mtr-readout-label">Distance</div>
                  <div className="mtr-readout-value" ref={rDistanceRef} />
                </div>
                <div className="mtr-readout">
                  <div className="mtr-readout-label">Axis</div>
                  <div className="mtr-readout-value" ref={rAxisRef} />
                </div>
                <div className="mtr-readout">
                  <div className="mtr-readout-label">Notes</div>
                  <div className="mtr-readout-value" ref={rNotesRef} />
                </div>
              </div>

              <div className="mtr-readout-row" ref={stereoReadoutRef} hidden>
                <div className="mtr-readout">
                  <div className="mtr-readout-label">Capsule spacing</div>
                  <div className="mtr-readout-value" ref={rSpacingRef} />
                </div>
                <div className="mtr-readout">
                  <div className="mtr-readout-label">Angle apart</div>
                  <div className="mtr-readout-value" ref={rAngleRef} />
                </div>
                <div className="mtr-readout mtr-readout-meter">
                  <div className="mtr-readout-label">Mono compatibility</div>
                  <div className="mtr-readout-value" ref={rMonoRef} />
                  <div className="mtr-meter-track">
                    <div className="mtr-meter-fill" ref={rMonoFillRef} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mtr-webgl-fallback" ref={fallbackRef} hidden>
            <p>
              The 3D preview couldn&rsquo;t load in this browser.
              <br />
              Your device or browser may not support WebGL.
            </p>
          </div>
        </div>

        <div className="mtr-controls">
          <div className="mtr-ctrl-row">
            <span className="mtr-ctrl-label">Source</span>
            <div className="mtr-tile-grid" ref={sourceRowRef}>
              <button className="mtr-tile" type="button" data-source="vocal">{SOURCE_ICONS.vocal}<span>Vocal / VO</span></button>
              <button className="mtr-tile" type="button" data-source="guitar">{SOURCE_ICONS.guitar}<span>Guitar</span></button>
              <button className="mtr-tile" type="button" data-source="amp">{SOURCE_ICONS.amp}<span>Amp</span></button>
              <button className="mtr-tile" type="button" data-source="snare">{SOURCE_ICONS.snare}<span>Snare</span></button>
              <button className="mtr-tile" type="button" data-source="kick">{SOURCE_ICONS.kick}<span>Kick</span></button>
              <button className="mtr-tile" type="button" data-source="ethnic">{SOURCE_ICONS.ethnic}<span>Ethnic Instrument</span></button>
            </div>
          </div>
          <div className="mtr-ctrl-row">
            <span className="mtr-ctrl-label">Mic type</span>
            <div className="mtr-ctrl-col">
              <div className="mtr-segmented" ref={micTypeRowRef}>
                <button className="mtr-segmented-btn" type="button" data-type="dynamic">Dynamic</button>
                <button className="mtr-segmented-btn" type="button" data-type="condenser-fet">FET Condenser</button>
                <button className="mtr-segmented-btn" type="button" data-type="condenser-tube">Tube Condenser</button>
                <button className="mtr-segmented-btn" type="button" data-type="ribbon">Ribbon</button>
                <button className="mtr-segmented-btn" type="button" data-type="contact">Contact</button>
              </div>
              <p className="mtr-blurb" ref={micTypeBlurbRef} />
            </div>
          </div>
          <div className="mtr-ctrl-row mtr-technique-row">
            <span className="mtr-ctrl-label">Technique</span>
            <div className="mtr-technique-grid" ref={techniqueRowRef}>
              <button className="mtr-technique-card" type="button" data-technique="close">
                <span className="mtr-tc-name"><span className="mtr-tc-dot" />Close Miking</span>
              </button>
              <button className="mtr-technique-card" type="button" data-technique="spot">
                <span className="mtr-tc-name"><span className="mtr-tc-dot" />Spot Miking</span>
              </button>
              <button className="mtr-technique-card" type="button" data-technique="distant">
                <span className="mtr-tc-name"><span className="mtr-tc-dot" />Distant / Room</span>
              </button>
              <button className="mtr-technique-card" type="button" data-technique="stereo">
                <span className="mtr-tc-name"><span className="mtr-tc-dot" />Stereo Miking</span>
              </button>
              <button className="mtr-technique-card" type="button" data-technique="multi">
                <span className="mtr-tc-name"><span className="mtr-tc-dot" />Multi Miking</span>
              </button>
            </div>
          </div>

          {/* Keyboard/screen-reader twin of the 3D hotspots — see
              syncHotspotAccessibleList in the effect above. Visually
              hidden (.mtr-sr-only) since sighted mouse/touch visitors place
              mics by clicking the glowing markers in the room itself;
              rebuilt fresh every time the hotspots are, so it can never
              show a stale set of buttons. */}
          <div className="mtr-hotspot-list mtr-sr-only" ref={hotspotListRef} aria-live="polite" />

          <div className="mtr-ctrl-row" hidden>
            <span className="mtr-ctrl-label">Stereo preset</span>
            <div className="mtr-preset-grid" ref={presetRowRef}>
              <button className="mtr-preset-card" type="button" data-preset="ab">
                <span className="mtr-tc-name"><span className="mtr-tc-dot" />AB (Spaced Pair)</span>
              </button>
              <button className="mtr-preset-card" type="button" data-preset="xy">
                <span className="mtr-tc-name"><span className="mtr-tc-dot" />X-Y</span>
              </button>
              <button className="mtr-preset-card" type="button" data-preset="ms">
                <span className="mtr-tc-name"><span className="mtr-tc-dot" />M-S</span>
              </button>
              <button className="mtr-preset-card" type="button" data-preset="ortf">
                <span className="mtr-tc-name"><span className="mtr-tc-dot" />ORTF</span>
              </button>
              <button className="mtr-preset-card" type="button" data-preset="overhead">
                <span className="mtr-tc-name"><span className="mtr-tc-dot" />Overhead</span>
              </button>
              <button className="mtr-preset-card" type="button" data-preset="blumlein">
                <span className="mtr-tc-name"><span className="mtr-tc-dot" />Blumlein</span>
              </button>
              <button className="mtr-preset-card" type="button" data-preset="decca">
                <span className="mtr-tc-name"><span className="mtr-tc-dot" />Decca Tree</span>
              </button>
              <button className="mtr-preset-card" type="button" data-preset="outrigger">
                <span className="mtr-tc-name"><span className="mtr-tc-dot" />Outrigger</span>
              </button>
            </div>
          </div>

          {/* Multi Miking's own preset row — stands in for the plain
              Source row while this technique is active (see
              refreshControlsVisibility). Picking one sets the source AND
              loads every mic in that source's real-world layout right
              away (onMultiPresetRowClick) — "Snare" is its own preset
              rather than "pick Snare, then also toggle on Top and
              Bottom" because that's the whole point of Multi Miking: you
              see the full multi-mic setup for a source at a glance. */}
          <div className="mtr-ctrl-row" hidden>
            <span className="mtr-ctrl-label">Multi-mic preset</span>
            <div className="mtr-tile-grid" ref={multiPresetRowRef}>
              <button className="mtr-tile" type="button" data-multipreset="vocal">{SOURCE_ICONS.vocal}<span>Vocal / VO</span></button>
              <button className="mtr-tile" type="button" data-multipreset="guitar">{SOURCE_ICONS.guitar}<span>Guitar</span></button>
              <button className="mtr-tile" type="button" data-multipreset="amp">{SOURCE_ICONS.amp}<span>Amp</span></button>
              <button className="mtr-tile" type="button" data-multipreset="snare">{SOURCE_ICONS.snare}<span>Snare</span></button>
              <button className="mtr-tile" type="button" data-multipreset="kick">{SOURCE_ICONS.kick}<span>Kick</span></button>
              <button className="mtr-tile" type="button" data-multipreset="ethnic">{SOURCE_ICONS.ethnic}<span>Ethnic Instrument</span></button>
            </div>
          </div>

          {/* Multi Miking's visible Layers row — an always-on-screen twin
              of the 3D hotspots (see syncMultiLayerRow in the effect
              above): one chip per candidate mic position for the current
              source, toggled the same way clicking a hotspot does, plus a
              Clear-all link. The current source's first mic (e.g.
              Snare's "Top", or "Close" on the generic layout) loads by
              default — see firstMultiLayerId. */}
          <div className="mtr-ctrl-row" hidden>
            <span className="mtr-ctrl-label">Layers</span>
            <div className="mtr-chip-row" ref={multiLayerRowRef} />
            <button className="mtr-clear-link" type="button" ref={clearLayersBtnRef}>Clear all</button>
          </div>
        </div>
      </div>
    </div>
  );
}
