'use client'; // harmless no-op outside Next.js App Router; keeps this usable there too.

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
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

  const sourceRowRef = useRef(null);
  const micTypeRowRef = useRef(null);
  const techniqueRowRef = useRef(null);
  const techniqueBlurbRef = useRef(null);

  const placementRowRef = useRef(null);
  const layerRowRef = useRef(null);
  const clearLayersBtnRef = useRef(null);
  const presetRowRef = useRef(null);

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

    const sourceRow = sourceRowRef.current;
    const micTypeRow = micTypeRowRef.current;
    const techniqueRow = techniqueRowRef.current;
    const techniqueBlurb = techniqueBlurbRef.current;

    const placementRow = placementRowRef.current;
    const layerRow = layerRowRef.current;
    const clearLayersBtn = clearLayersBtnRef.current;
    const presetRow = presetRowRef.current;

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
    const GUITAR_BODY_MAT = new THREE.MeshStandardMaterial({ color: '#c9922f', roughness: 0.42, metalness: 0 });
    const GUITAR_NECK_MAT = new THREE.MeshStandardMaterial({ color: '#4a2c1a', roughness: 0.55, metalness: 0 });
    const AMP_CAB_MAT = new THREE.MeshStandardMaterial({ color: '#5c2226', roughness: 0.8, metalness: 0 });
    const AMP_GRILLE_MAT = new THREE.MeshStandardMaterial({ color: '#181513', roughness: 0.7, metalness: 0.05 });
    const SNARE_SHELL_MAT = new THREE.MeshStandardMaterial({ color: '#cfd4d6', roughness: 0.22, metalness: 0.85 });
    const SNARE_HEAD_MAT = new THREE.MeshStandardMaterial({ color: '#f1ece0', roughness: 0.55, metalness: 0 });
    const KICK_SHELL_MAT = new THREE.MeshStandardMaterial({ color: '#6d2a1f', roughness: 0.5, metalness: 0 });
    const KICK_HEAD_MAT = new THREE.MeshStandardMaterial({ color: '#1c1a18', roughness: 0.5, metalness: 0 });
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
        id: 'guitar', label: 'Guitar', aimHeight: 0.62, nearClearanceM: 0.28,
        build(g) {
          const base = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.02, 20), SRC_METAL);
          base.position.y = 0.01;
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 10), SRC_METAL);
          post.position.y = 0.11;
          const bodyGeo = new THREE.SphereGeometry(0.22, 20, 16);
          bodyGeo.scale(1, 1.05, 0.32);
          const body = new THREE.Mesh(bodyGeo, GUITAR_BODY_MAT);
          body.position.y = 0.44;
          const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.56, 0.04), GUITAR_NECK_MAT);
          neck.position.set(0, 0.94, 0.02);
          neck.rotation.x = 0.1;
          g.add(base, post, body, neck);
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
        id: 'snare', label: 'Snare', aimHeight: 0.44, nearClearanceM: 0.26,
        build(g) {
          const base = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.02, 20), SRC_METAL);
          base.position.y = 0.01;
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.33, 10), SRC_METAL);
          post.position.y = 0.18;
          const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.14, 24), SNARE_SHELL_MAT);
          shell.position.y = 0.42;
          const headTop = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.012, 24), SNARE_HEAD_MAT);
          headTop.position.y = 0.49;
          g.add(base, post, shell, headTop);
        },
      },
      {
        id: 'kick', label: 'Kick', aimHeight: 0.3, nearClearanceM: 0.4,
        build(g) {
          const shell = new THREE.Mesh(zCylSrc(0.3, 0.3, 0.45), KICK_SHELL_MAT);
          shell.position.y = 0.3;
          const head = new THREE.Mesh(zCylSrc(0.29, 0.29, 0.012), KICK_HEAD_MAT);
          head.position.set(0, 0.3, -0.23);
          g.add(shell, head);
        },
      },
      {
        id: 'ethnic', label: 'Ethnic Instrument', aimHeight: 0.5, nearClearanceM: 0.3,
        build(g) {
          const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.09, 0.58, 20), ETHNIC_BODY_MAT);
          body.position.y = 0.29;
          const head = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.02, 20), ETHNIC_HEAD_MAT);
          head.position.y = 0.59;
          g.add(body, head);
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
    // anything a viewer could relate to the source. ----
    const TECHNIQUES = {
      close: {
        label: 'Close Miking',
        mode: 'single',
        blurb: 'Two inches to about a foot from the source. Direct sound dominates, the room barely registers, and isolation from everything else is close to total.',
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
        blurb: 'Two mics, one stereo image — spacing and angle between the capsules decide the width and how safely it folds to mono. Keep the 3:1 rule in mind whenever two mics can hear the same source.',
        presets: {
          spaced: { id: 'spaced', label: 'Spaced Pair', centerDist: 1.3, pairSeparationM: 0.9, yawSplitDeg: 4, spacingLabel: '3 ft apart', angleLabel: '0° (parallel)', monoLabel: 'Weak — check for cancellation', monoPct: 40 },
          xy: { id: 'xy', label: 'X-Y', centerDist: 1.3, pairSeparationM: 0.02, yawSplitDeg: 45, spacingLabel: '~0 in (coincident)', angleLabel: '90° crossed', monoLabel: 'Excellent — phase-coherent', monoPct: 98 },
          ortf: { id: 'ortf', label: 'ORTF', centerDist: 1.3, pairSeparationM: 0.17, yawSplitDeg: 55, spacingLabel: '6.7 in (17 cm)', angleLabel: '110° apart', monoLabel: 'Very good — near-coincident', monoPct: 85 },
        },
      },
      multi: {
        label: 'Multi Miking',
        mode: 'multi',
        blurb: 'Several mics on one source at once, each its own channel, balanced together afterward. Toggle layers on and off to hear a multi-miked source as the small mix it really is.',
        spots: [
          { id: 'multi-close', tag: 'Close', dist: 0.15, angle: 0, distanceLabel: '6 in', axisLabel: 'On-axis close', character: 'Detail & attack' },
          { id: 'multi-support', tag: 'Off-axis support', dist: 0.3, angle: 45, distanceLabel: '12 in', axisLabel: 'Off-axis · 45°', character: 'Body & blend' },
          { id: 'multi-left', tag: 'Overhead L', dist: 1.2, angle: -30, heightM: 2.1, distanceLabel: '4 ft', axisLabel: 'Spaced pair (left)', character: 'Stereo width' },
          { id: 'multi-right', tag: 'Overhead R', dist: 1.2, angle: 30, heightM: 2.1, distanceLabel: '4 ft', axisLabel: 'Spaced pair (right)', character: 'Stereo width' },
          { id: 'multi-room', tag: 'Room', dist: 2.4, angle: 110, heightM: 1.9, distanceLabel: '8 ft', axisLabel: 'Distant, off-axis', character: 'Ambience & glue' },
        ],
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
      layerIds: new Set(['multi-close']), // multi: toggled active layers
      presetId: 'spaced', // stereo
    };

    const sourceGroup = new THREE.Group();
    const micRigsGroup = new THREE.Group();
    const beamsGroup = new THREE.Group();
    scene.add(sourceGroup, micRigsGroup, beamsGroup);

    function sourceAnchorPos(aimHeight) {
      return new THREE.Vector3(SOURCE_ANCHOR_X, aimHeight, SOURCE_ANCHOR_Z);
    }

    function buildSourceObject() {
      clearGroup(sourceGroup);
      const typeDef = SOURCE_TYPES.find((t) => t.id === state.sourceType);
      const g = new THREE.Group();
      g.position.set(SOURCE_ANCHOR_X, 0, SOURCE_ANCHOR_Z);
      typeDef.build(g);
      const srcLight = new THREE.PointLight(0xfff2df, 1.15, 3.2, 2);
      srcLight.position.set(0.35, typeDef.aimHeight + 0.4, -0.25);
      g.add(srcLight);
      sourceGroup.add(g);
    }

    // Returns the list of {id, tag, dist, angle, heightM?, distanceLabel,
    // axisLabel, character, pos} placements that should have a mic rig
    // right now, given the active technique + its own selection state.
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
        return [{ ...spot, pos: computeSpotPosition(sourcePos, spot.dist + clearance, spot.angle, spot.heightM, sourceDef.aimHeight) }];
      }
      if (def.mode === 'multi') {
        return def.spots
          .filter((s) => state.layerIds.has(s.id))
          .map((spot) => ({ ...spot, pos: computeSpotPosition(sourcePos, spot.dist + clearance, spot.angle, spot.heightM, sourceDef.aimHeight) }));
      }
      if (def.mode === 'stereo') {
        const preset = def.presets[state.presetId];
        const half = preset.pairSeparationM / 2;
        const z = sourcePos.z - (preset.centerDist + clearance);
        const y = sourceDef.aimHeight + 0.15;
        return [
          {
            id: 'stereo-a', tag: 'Left capsule', angle: -preset.yawSplitDeg,
            distanceLabel: `${preset.centerDist.toFixed(1)} m out`, axisLabel: 'Left channel', character: preset.label,
            pos: new THREE.Vector3(sourcePos.x - half, y, z),
          },
          {
            id: 'stereo-b', tag: 'Right capsule', angle: preset.yawSplitDeg,
            distanceLabel: `${preset.centerDist.toFixed(1)} m out`, axisLabel: 'Right channel', character: preset.label,
            pos: new THREE.Vector3(sourcePos.x + half, y, z),
          },
        ];
      }
      return [];
    }

    // Builds one mic rig (stand/contact-surface + head + body + aim
    // indicator) at `placement.pos`, yawed to face the source head-on
    // (placement.angle only moved where the rig sits, not which way it's
    // turned — see the TECHNIQUES/yawToFace comments above) — same
    // body-building code as MikingRoom's buildMicRig(), just parameterized
    // per-rig instead of operating on one fixed global rig. No
    // polar-pattern lobe here (see the header comment — pattern isn't
    // selectable in this lab), just a plain aim line/tip showing which way
    // the capsule faces, and a fixed-appearance coverage beam to the source
    // (no gain math to modulate it by, since there's no pattern to compute
    // gain from).
    function buildOneMicRig(typeDef, placement, sourcePos, accent, accentStrong) {
      const rig = new THREE.Group();
      const capsuleY = !typeDef.hasStand ? 0.36 : placement.pos.y;
      rig.position.set(placement.pos.x, 0, placement.pos.z);
      rig.rotation.y = yawToFace(placement.pos, sourcePos);

      if (typeDef.hasStand) addStand(rig, capsuleY);
      else addContactSurface(rig, capsuleY);

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
        // Direction matches the aim arrow above exactly: same head-local -Z
        // axis, rotated by the same two transforms in the same order
        // (MIC_TILT around local X first, then the rig's yaw around Y) —
        // computed here rather than reused from the arrow because the arrow
        // is a Line/Mesh under `head`, not a plain vector. Since rig.rotation.y
        // now always points straight at the source (see yawToFace), this
        // lines the beam up with both the arrow AND the source at once —
        // MIC_TILT's small fixed downward tilt is the only thing that can
        // still make it land a bit short of dead-center on the source.
        const beamStart = new THREE.Vector3(rig.position.x, capsuleY, rig.position.z);
        const beamDir = new THREE.Vector3(0, 0, -1)
          .applyAxisAngle(new THREE.Vector3(1, 0, 0), MIC_TILT)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), rig.rotation.y);
        const beamLen = beamStart.distanceTo(sourcePos);
        if (beamLen > 0.001) {
          const beamEnd = beamStart.clone().addScaledVector(beamDir, beamLen);
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
          // Marks where the beam's aim actually lands — coincides with
          // sourcePos only when the mic is on-axis; for off-axis
          // placements this is deliberately offset from the source,
          // same as the arrow it's now aligned with.
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
        micRigsGroup.add(buildOneMicRig(typeDef, placement, sourcePos, accent, accentStrong));
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
    function setPillMultiState(row, activeIds, attr) {
      if (!row) return;
      Array.prototype.forEach.call(row.children, (btn) => {
        const active = activeIds.has(btn.getAttribute(attr));
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }

    // Shows only the sub-control row(s) + readout block relevant to the
    // active technique's `mode` — one generic controls bar serves all five
    // techniques instead of five separate panels.
    function refreshControlsVisibility() {
      const mode = TECHNIQUES[state.technique].mode;
      if (placementRow) placementRow.closest('.mtr-ctrl-row').hidden = mode !== 'single';
      if (layerRow) layerRow.closest('.mtr-ctrl-row').hidden = mode !== 'multi';
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

    // Close/Spot/Distant share one "Place at" row, but each has its own
    // 2-3 spots at different distances/angles — unlike the source/mic-type/
    // pattern rows (same options everywhere), this row's buttons have to be
    // rebuilt from the active technique's `spots` list, not just re-marked.
    let placementRowTechnique = null;
    function rebuildPlacementRow(technique, spots) {
      if (placementRowTechnique === technique) return;
      placementRowTechnique = technique;
      placementRow.innerHTML = '';
      spots.forEach((spot) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mtr-pill';
        btn.setAttribute('data-placement', spot.id);
        btn.textContent = spot.tag;
        placementRow.appendChild(btn);
      });
    }

    function refreshTechniqueUI() {
      const def = TECHNIQUES[state.technique];
      setPillState(techniqueRow, state.technique, 'data-technique');
      if (techniqueBlurb) techniqueBlurb.textContent = def.blurb;
      if (def.mode === 'single') {
        if (!def.spots.some((s) => s.id === state.placementId)) state.placementId = def.spots[0].id;
        rebuildPlacementRow(state.technique, def.spots);
        setPillState(placementRow, state.placementId, 'data-placement');
      }
      if (def.mode === 'multi') setPillMultiState(layerRow, state.layerIds, 'data-layer');
      if (def.mode === 'stereo') setPillState(presetRow, state.presetId, 'data-preset');
      refreshControlsVisibility();
    }

    function refreshAll() {
      setPillState(micTypeRow, state.micType, 'data-type');
      setPillState(sourceRow, state.sourceType, 'data-source');
      refreshTechniqueUI();
      buildSourceObject();
      buildMicRigs();
      refreshReadouts();
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
      refreshTechniqueUI();
      buildMicRigs();
      refreshReadouts();
    }
    function onPlacementRowClick(e) {
      const btn = e.target.closest('button[data-placement]');
      if (!btn) return;
      markInteracted();
      state.placementId = btn.getAttribute('data-placement');
      refreshTechniqueUI();
      buildMicRigs();
      refreshReadouts();
    }
    function onLayerRowClick(e) {
      const btn = e.target.closest('button[data-layer]');
      if (!btn) return;
      markInteracted();
      const id = btn.getAttribute('data-layer');
      if (state.layerIds.has(id)) state.layerIds.delete(id);
      else state.layerIds.add(id);
      refreshTechniqueUI();
      buildMicRigs();
      refreshReadouts();
    }
    function onClearLayersClick() {
      state.layerIds.clear();
      refreshTechniqueUI();
      buildMicRigs();
      refreshReadouts();
    }
    function onPresetRowClick(e) {
      const btn = e.target.closest('button[data-preset]');
      if (!btn) return;
      markInteracted();
      state.presetId = btn.getAttribute('data-preset');
      refreshTechniqueUI();
      buildMicRigs();
      refreshReadouts();
    }
    sourceRow.addEventListener('click', onSourceRowClick);
    micTypeRow.addEventListener('click', onMicTypeRowClick);
    techniqueRow.addEventListener('click', onTechniqueRowClick);
    placementRow.addEventListener('click', onPlacementRowClick);
    layerRow.addEventListener('click', onLayerRowClick);
    clearLayersBtn.addEventListener('click', onClearLayersClick);
    presetRow.addEventListener('click', onPresetRowClick);
    onCleanup(() => sourceRow.removeEventListener('click', onSourceRowClick));
    onCleanup(() => micTypeRow.removeEventListener('click', onMicTypeRowClick));
    onCleanup(() => techniqueRow.removeEventListener('click', onTechniqueRowClick));
    onCleanup(() => placementRow.removeEventListener('click', onPlacementRowClick));
    onCleanup(() => layerRow.removeEventListener('click', onLayerRowClick));
    onCleanup(() => clearLayersBtn.removeEventListener('click', onClearLayersClick));
    onCleanup(() => presetRow.removeEventListener('click', onPresetRowClick));

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
    let hintFaded = false;
    const ROTATE_SPEED = 0.0055;
    const ZOOM_SPEED = 0.0022;

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
      canvas.classList.add('is-dragging');
      canvas.setPointerCapture(e.pointerId);
      fadeHint();
    }
    function onPointerMove(e) {
      if (!dragging) return;
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
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: true });
    canvas.addEventListener('touchend', onTouchEnd);
    onCleanup(() => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', endDrag);
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

  return (
    <div className={rootClassName} style={style} data-theme={theme} ref={rootRef}>
      {!embedded && (
        <header className="mtr-topbar">
          <div className="mtr-eyebrow">Microphone Techniques &amp; Stereo Recording</div>
          <h1 className="mtr-title">07 — Technique &amp; Placement</h1>
          <p className="mtr-subtitle">
            Pick a source and a mic type, then compare Close, Spot, Distant/Room, Stereo, and Multi Miking — each
            technique places its own mic(s) at positions authored for that technique.
          </p>
        </header>
      )}

      <div className="mtr-stage">
        <div className="mtr-viewport" ref={stageRef}>
          <canvas className="mtr-canvas" aria-hidden="true" ref={canvasRef} />
          <p className="mtr-sr-only">
            Interactive 3D view of an abstract studio room with a sound source fixed near one side and one or more
            microphones placed around it. Drag to orbit the camera around the room; scroll or pinch to zoom. A reset
            view control is provided. Below the room, controls let you pick a sound source and a microphone type,
            then choose one of five miking techniques — Close, Spot, Distant/Room, Stereo, or Multi Miking — each
            with its own predefined mic position(s). A readout reports distance and axis for the current selection.
          </p>

          <div className="mtr-hint" ref={hintRef}>
            <span className="mtr-hint-row">
              <kbd>drag</kbd> rotate
            </span>
            <span className="mtr-hint-row">
              <kbd>scroll</kbd> zoom
            </span>
            <button className="mtr-reset-btn" type="button" ref={resetBtnRef}>
              Reset view
            </button>
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
            <div className="mtr-pill-row" ref={sourceRowRef}>
              <button className="mtr-pill" type="button" data-source="vocal">Vocal / VO</button>
              <button className="mtr-pill" type="button" data-source="guitar">Guitar</button>
              <button className="mtr-pill" type="button" data-source="amp">Amp</button>
              <button className="mtr-pill" type="button" data-source="snare">Snare</button>
              <button className="mtr-pill" type="button" data-source="kick">Kick</button>
              <button className="mtr-pill" type="button" data-source="ethnic">Ethnic Instrument</button>
            </div>
          </div>
          <div className="mtr-ctrl-row">
            <span className="mtr-ctrl-label">Mic type</span>
            <div className="mtr-pill-row" ref={micTypeRowRef}>
              <button className="mtr-pill" type="button" data-type="dynamic">Dynamic</button>
              <button className="mtr-pill" type="button" data-type="condenser-fet">FET Condenser</button>
              <button className="mtr-pill" type="button" data-type="condenser-tube">Tube Condenser</button>
              <button className="mtr-pill" type="button" data-type="ribbon">Ribbon</button>
              <button className="mtr-pill" type="button" data-type="contact">Contact</button>
            </div>
          </div>
          <div className="mtr-ctrl-row mtr-technique-row">
            <span className="mtr-ctrl-label">Technique</span>
            <div className="mtr-pill-row" ref={techniqueRowRef}>
              <button className="mtr-pill mtr-pill-technique" type="button" data-technique="close">Close Miking</button>
              <button className="mtr-pill mtr-pill-technique" type="button" data-technique="spot">Spot Miking</button>
              <button className="mtr-pill mtr-pill-technique" type="button" data-technique="distant">Distant / Room Miking</button>
              <button className="mtr-pill mtr-pill-technique" type="button" data-technique="stereo">Stereo Miking</button>
              <button className="mtr-pill mtr-pill-technique" type="button" data-technique="multi">Multi Miking</button>
            </div>
          </div>
          <p className="mtr-technique-blurb" ref={techniqueBlurbRef} />

          <div className="mtr-ctrl-row">
            <span className="mtr-ctrl-label">Place at</span>
            <div className="mtr-pill-row" ref={placementRowRef}>
              <button className="mtr-pill" type="button" data-placement="close-2in">2 in · on-axis</button>
              <button className="mtr-pill" type="button" data-placement="close-6in">6 in · on-axis</button>
              <button className="mtr-pill" type="button" data-placement="close-offaxis">4 in · 45° off-axis</button>
            </div>
          </div>

          <div className="mtr-ctrl-row" hidden>
            <span className="mtr-ctrl-label">Layers</span>
            <div className="mtr-pill-row" ref={layerRowRef}>
              <button className="mtr-pill mtr-pill-layer" type="button" data-layer="multi-close">
                Close
              </button>
              <button className="mtr-pill mtr-pill-layer" type="button" data-layer="multi-support">
                Off-axis support
              </button>
              <button className="mtr-pill mtr-pill-layer" type="button" data-layer="multi-left">
                Overhead L
              </button>
              <button className="mtr-pill mtr-pill-layer" type="button" data-layer="multi-right">
                Overhead R
              </button>
              <button className="mtr-pill mtr-pill-layer" type="button" data-layer="multi-room">
                Room
              </button>
            </div>
            <button className="mtr-pill mtr-pill-muted" type="button" ref={clearLayersBtnRef}>
              Clear
            </button>
          </div>

          <div className="mtr-ctrl-row" hidden>
            <span className="mtr-ctrl-label">Stereo preset</span>
            <div className="mtr-pill-row" ref={presetRowRef}>
              <button className="mtr-pill" type="button" data-preset="spaced">Spaced Pair</button>
              <button className="mtr-pill" type="button" data-preset="xy">X-Y</button>
              <button className="mtr-pill" type="button" data-preset="ortf">ORTF</button>
            </div>
          </div>

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
    </div>
  );
}
