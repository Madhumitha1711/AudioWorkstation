'use client'; // harmless no-op outside Next.js App Router; keeps this usable there too.

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import './MikingRoom.css';

/**
 * <MikingRoom />
 *
 * An interactive 3D teaching aid for microphone placement: an abstract room
 * you can orbit/zoom, a mic rig whose type + polar pattern you can switch
 * (highlighted with a 3D sensitivity lobe), and six sound sources you can
 * drop onto five predefined floor spots — the mic's height and how far its
 * pattern "reaches" follow whatever is placed.
 *
 * Usage:
 *   import MikingRoom from './MikingRoom/MikingRoom';
 *
 *   function Page() {
 *     return (
 *       <div style={{ height: '100vh' }}>
 *         <MikingRoom />
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
 * Fonts: add the Google Fonts <link> from the top of MikingRoom.css to your
 * app's index.html <head>. Without it the component falls back to system
 * fonts and still looks fine.
 *
 * Props:
 *   className  - extra class name(s) merged onto the root element
 *   style      - extra inline styles merged onto the root element
 *   theme      - 'light' | 'dark' | undefined, set as a data-theme attribute
 *                on the root element. Colors themselves now come from the
 *                app's own theme tokens (--bg/--text/--accent/etc., see the
 *                top of MikingRoom.css) inherited from wherever this is
 *                mounted, so this prop no longer forces a different local
 *                palette — it's kept for any standalone [data-theme] CSS
 *                you want to add outside the app, and is otherwise a
 *                harmless no-op when embedded in the course.
 *   embedded   - true when this is mounted inside a lesson's interactive
 *                block (see InteractiveSection.jsx / MicPlacementLab.jsx)
 *                rather than as its own full page — suppresses the
 *                internal "Miking Techniques" header so it doesn't
 *                duplicate the section's own title.
 *   onInteract - called once, the first time the visitor does something
 *                meaningful with the scene (pick a source/spot/mic
 *                type/pattern) — used to mark a lesson's interactive step
 *                complete, same as every other lab in the LABS map.
 */
export default function MikingRoom({ className, style, theme, embedded = false, onInteract }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const fallbackRef = useRef(null);
  const hintRef = useRef(null);
  const resetBtnRef = useRef(null);
  const rDistRef = useRef(null);
  const rAzRef = useRef(null);
  const rElRef = useRef(null);
  const sourceTypeRowRef = useRef(null);
  const spotListRef = useRef(null);
  const clearSpotsBtnRef = useRef(null);
  const typeRowRef = useRef(null);
  const patternRowRef = useRef(null);

  // Fires onInteract once, the first time the visitor does something
  // meaningful with the scene — kept as refs (not React state) since the
  // whole scene below is imperative and only mounts once.
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
    const rDist = rDistRef.current;
    const rAz = rAzRef.current;
    const rEl = rElRef.current;
    const sourceTypeRow = sourceTypeRowRef.current;
    const spotList = spotListRef.current;
    const clearSpotsBtn = clearSpotsBtnRef.current;
    const typeRow = typeRowRef.current;
    const patternRow = patternRowRef.current;

    if (!root || !stage || !canvas) return undefined;

    // Everything below is intentionally plain imperative JS (not React state)
    // — it's a direct, faithful port of a tested Three.js scene, and mixing
    // that kind of per-frame / per-drag mutable state into React state would
    // only add re-render overhead and stale-closure risk for no benefit.
    // React's job here is just to mount the DOM once and clean it up once.

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

    // ---- Room geometry (metres) ----
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
    // Works whether the host app's three.js is old (outputEncoding) or new
    // (outputColorSpace) — the property name changed around three r152.
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

    // Everything buildScene() creates lives under this one group, so a theme
    // change can clear + rebuild just the room without ever touching the mic
    // rig or the placed sources (which are separate top-level groups).
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

      const bg = token('--mkr-bg', '#eef1ef');
      const wallColor = token('--mkr-room-wall', '#26302d');
      const floorColor = token('--mkr-room-floor', '#c7cdca');
      const minorColor = token('--mkr-grid-minor', '#9aa39f');
      const majorColor = token('--mkr-accent', '#a8672a');
      const accentInk = token('--mkr-accent-strong', '#8c521e');

      scene.background = new THREE.Color(bg);
      scene.fog = new THREE.Fog(new THREE.Color(bg).getHex(), 6.5, 15);

      // Lights
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

      // Floor
      const floorGeo = new THREE.PlaneGeometry(ROOM_W, ROOM_D);
      const floorMat = new THREE.MeshLambertMaterial({ color: floorColor });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      roomGroup.add(floor);

      // Grid
      roomGroup.add(buildGrid(ROOM_W, ROOM_D, 0.5, minorColor, majorColor));

      // Walls (faint, abstract)
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

      // Ceiling (very faint)
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

      // Scale label
      const scaleSprite = makeScaleLabel('0.5 m grid', majorColor);
      scaleSprite.position.set(halfW - 0.65, 0.02, halfD - 0.32);
      roomGroup.add(scaleSprite);
    }

    buildScene();

    // ---- Mic rig: type + polar pattern, highlighted in place ----
    const micRig = new THREE.Group();
    scene.add(micRig);

    const MIC_BODY_MAT = new THREE.MeshStandardMaterial({ color: '#7d8588', roughness: 0.32, metalness: 0.6 });
    const MIC_GRILLE_MAT = new THREE.MeshStandardMaterial({ color: '#aab1b4', roughness: 0.55, metalness: 0.35 });
    const MIC_SLOT_MAT = new THREE.MeshStandardMaterial({ color: '#101214', roughness: 0.55, metalness: 0.15 });
    const CONTACT_MAT = new THREE.MeshStandardMaterial({ color: '#33373a', roughness: 0.45, metalness: 0.3 });
    const STAND_MAT = new THREE.MeshStandardMaterial({ color: '#6c7476', roughness: 0.4, metalness: 0.6 });
    const WOOD_MAT = new THREE.MeshStandardMaterial({ color: '#5b4636', roughness: 0.85, metalness: 0 });

    const MIC_TILT = -0.18; // slight downward angle, like a mic clipped on a boom stand
    const MIC_BODY_SCALE = 1.6; // mics are small — scale the body up so it reads clearly next to its own pattern lobe
    const LOBE_SCALE = 0.32; // kept modest so it doesn't swallow sources placed at the Close/Spot positions

    // Soft white-to-transparent radial gradient, shared by every glow decal
    // (mic pattern glow, contact-mic surface glow) — tinted per-use via the
    // material's own `color`, so we upload this canvas texture once instead
    // of baking a new one on every single mic-rig rebuild.
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

    // The coverage beam connecting mic to source: a soft repeating glow rather
    // than a flat line, drifting gently toward the mic to read as a signal,
    // not a ruler.
    let activeBeamTexture = null;
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

    const PATTERNS = {
      cardioid: {
        label: 'Cardioid',
        gain: (t) => 0.5 * (1 + Math.cos(t)),
        blurb: 'Most sensitive to the front, rejecting the rear. The default for close and spot miking.',
      },
      omni: {
        label: 'Omni',
        gain: () => 1,
        blurb: 'Picks up evenly from every direction. Used for room, ambience, and distant miking.',
      },
      bidirectional: {
        label: 'Bidirectional',
        gain: (t) => Math.abs(Math.cos(t)),
        blurb:
          'Equally sensitive front and back, silent at the sides. The pattern behind Blumlein and M/S side capture.',
      },
    };

    function zCyl(rTop, rBot, h) {
      const g = new THREE.CylinderGeometry(rTop, rBot, h, 16);
      g.rotateX(Math.PI / 2); // extend along Z instead of Y
      return g;
    }

    // Which of the three patterns this session models as realistic for each mic type.
    // (Contact mics get an empty list — see the dedicated handling below.)
    const MIC_TYPES = [
      {
        id: 'dynamic', label: 'Dynamic', hasStand: true, patterns: ['cardioid'],
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
        id: 'condenser-fet', label: 'FET Condenser', hasStand: true, patterns: ['cardioid', 'omni'],
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
        id: 'condenser-tube', label: 'Tube Condenser', hasStand: true, patterns: ['cardioid', 'omni', 'bidirectional'],
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
        id: 'ribbon', label: 'Ribbon', hasStand: true, patterns: ['bidirectional', 'cardioid'],
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
        id: 'contact', label: 'Contact', hasStand: false, patterns: [],
        blurb:
          'A piezo transducer coupled straight to a vibrating surface — it senses structure-borne vibration, not air pressure.',
        build(head) {
          const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 20), CONTACT_MAT);
          head.add(puck);
        },
      },
    ];

    function buildLobeGeometry(gainFn, segments, scale) {
      const profile = [];
      const STEPS = 48;
      for (let i = 0; i <= STEPS; i++) {
        const t = (i / STEPS) * Math.PI;
        const r = gainFn(t) * scale;
        const x = Math.max(r * Math.sin(t), 0);
        const y = r * Math.cos(t);
        profile.push(new THREE.Vector2(x, y));
      }
      return new THREE.LatheGeometry(profile, segments);
    }

    function addStand(parent, capsuleY) {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.02, 20), STAND_MAT);
      base.position.y = 0.01;
      const poleHeight = capsuleY - 0.08;
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

    const micState = { type: 'dynamic', pattern: 'cardioid' };

    function buildMicRig() {
      clearGroup(micRig);
      activeBeamTexture = null;
      const typeDef = MIC_TYPES.find((t) => t.id === micState.type);

      // Aim height follows whatever source is currently placed — a kick drum
      // and a standing vocalist don't get miked from the same height.
      const activeSourceDef = activeSpotId ? SOURCE_TYPES.find((t) => t.id === sourceState.type) : null;
      const capsuleY = !typeDef.hasStand ? 0.36 : activeSourceDef ? activeSourceDef.aimHeight : 1.32;

      micRig.position.set(0, 0, 0.4);

      if (typeDef.hasStand) addStand(micRig, capsuleY);
      else addContactSurface(micRig, capsuleY);

      const head = new THREE.Group();
      head.position.y = capsuleY;
      if (typeDef.hasStand) head.rotation.x = MIC_TILT;
      micRig.add(head);

      const bodyGroup = new THREE.Group();
      bodyGroup.scale.setScalar(MIC_BODY_SCALE);
      head.add(bodyGroup);
      typeDef.build(bodyGroup);

      // A small dedicated light on the mic itself, so it reads as a lit
      // object rather than blending into the room's ambient fill.
      const keyLight = new THREE.PointLight(0xfff2df, 1.1, 2.4, 2);
      keyLight.position.set(0.32, 0.28, -0.22);
      head.add(keyLight);

      const accent = token('--mkr-accent', '#a8672a');
      const accentStrong = token('--mkr-accent-strong', '#8c521e');

      if (typeDef.patterns.length > 0) {
        // The pattern shape stays a fixed reference size at the mic — it
        // represents the capsule's directional character, not a literal
        // reach, so it never balloons out to room-scale for a far spot. A
        // separate thin beam (below) is what actually connects the mic to
        // wherever the source is placed.
        const lobeGeo = buildLobeGeometry(PATTERNS[micState.pattern].gain, 40, LOBE_SCALE);
        const lobeGroup = new THREE.Group();
        lobeGroup.rotation.x = -Math.PI / 2; // lathe's +Y tip -> local -Z (front)
        lobeGroup.add(
          new THREE.Mesh(
            lobeGeo,
            new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })
          ),
          new THREE.Mesh(
            lobeGeo,
            new THREE.MeshBasicMaterial({ color: accentStrong, wireframe: true, transparent: true, opacity: 0.55, depthWrite: false })
          )
        );
        head.add(lobeGroup);

        const axisLen = LOBE_SCALE + 0.08;
        const axisGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -axisLen)]);
        head.add(new THREE.Line(axisGeo, new THREE.LineBasicMaterial({ color: accentStrong, transparent: true, opacity: 0.6 })));

        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 8), new THREE.MeshBasicMaterial({ color: accentStrong, transparent: true, opacity: 0.85 }));
        tip.position.set(0, 0, -axisLen);
        tip.rotation.x = -Math.PI / 2;
        head.add(tip);

        const glow = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), makeGlowMaterial(accent));
        glow.rotation.x = -Math.PI / 2;
        glow.position.set(0, 0.004, 0);
        micRig.add(glow);

        // Coverage beam: a soft tapered ray from the capsule to the active
        // source, so the highlight visibly reaches the spot regardless of
        // how far it is — brighter and thicker where the pattern is more
        // sensitive in that direction, with a slow drifting glow so it reads
        // as signal rather than a static ruler.
        if (activeSpotId) {
          const beamSpot = SPOTS.find((s) => s.id === activeSpotId);
          const beamSourceDef = SOURCE_TYPES.find((t) => t.id === sourceState.type);
          if (beamSpot && beamSourceDef) {
            const angleRad = THREE.MathUtils.degToRad(SPOT_DEFS[activeSpotId].angle);
            const gainAtAngle = Math.max(PATTERNS[micState.pattern].gain(angleRad), 0.08);
            const beamStart = new THREE.Vector3(0, capsuleY, 0);
            const beamEnd = new THREE.Vector3(beamSpot.x, beamSourceDef.aimHeight, beamSpot.z - MIC_ANCHOR_Z);
            const beamDir = beamEnd.clone().sub(beamStart);
            const beamLen = beamDir.length();
            if (beamLen > 0.001) {
              const beamRadiusMic = 0.014 + gainAtAngle * 0.016;
              const beamRadiusSrc = beamRadiusMic * 0.32;
              const beamGeo = new THREE.CylinderGeometry(beamRadiusSrc, beamRadiusMic, beamLen, 12, 1, true);
              BEAM_TEXTURE.repeat.set(1, Math.max(1, beamLen / 0.42));
              const beamMat = new THREE.MeshBasicMaterial({
                color: accentStrong,
                map: BEAM_TEXTURE,
                transparent: true,
                opacity: 0.35 + gainAtAngle * 0.55,
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
              });
              const beam = new THREE.Mesh(beamGeo, beamMat);
              beam.position.copy(beamStart).add(beamEnd).multiplyScalar(0.5);
              beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), beamDir.clone().normalize());
              micRig.add(beam);
              activeBeamTexture = BEAM_TEXTURE;

              const capMat = new THREE.MeshBasicMaterial({ color: accentStrong, transparent: true, opacity: 0.9, depthWrite: false });
              const capMic = new THREE.Mesh(new THREE.SphereGeometry(beamRadiusMic * 1.4, 12, 10), capMat);
              capMic.position.copy(beamStart);
              const capSrc = new THREE.Mesh(new THREE.SphereGeometry(beamRadiusSrc * 1.8, 10, 8), capMat);
              capSrc.position.copy(beamEnd);
              micRig.add(capMic, capSrc);
            }
          }
        }
      } else {
        // Contact mics don't radiate a directional pattern into the air —
        // instead, show vibration coupling straight through the mounting surface.
        const rippleGroup = buildContactRipple(accent, accentStrong);
        rippleGroup.position.set(0, capsuleY + 0.002, 0);
        micRig.add(rippleGroup);

        const surfaceGlow = new THREE.Mesh(new THREE.CircleGeometry(0.24, 32), makeGlowMaterial(accent));
        surfaceGlow.rotation.x = -Math.PI / 2;
        surfaceGlow.position.set(0, capsuleY + 0.001, 0);
        micRig.add(surfaceGlow);
      }
    }

    function setPillState(row, activeId, attr) {
      Array.prototype.forEach.call(row.children, (btn) => {
        const active = btn.getAttribute(attr) === activeId;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }

    function refreshMicPanel() {
      const typeDef = MIC_TYPES.find((t) => t.id === micState.type);
      const isContact = typeDef.patterns.length === 0;

      // Coerce to a pattern this mic type actually supports.
      if (!isContact && typeDef.patterns.indexOf(micState.pattern) === -1) {
        micState.pattern = typeDef.patterns[0];
      }

      setPillState(typeRow, micState.type, 'data-type');
      setPillState(patternRow, micState.pattern, 'data-pattern');

      Array.prototype.forEach.call(patternRow.children, (btn) => {
        const pid = btn.getAttribute('data-pattern');
        const eligible = !isContact && typeDef.patterns.indexOf(pid) !== -1;
        btn.disabled = !eligible;
        btn.title = isContact
          ? 'Not applicable — contact mics have no air-facing polar pattern'
          : eligible
            ? ''
            : 'Not modeled for this mic type';
      });

      buildMicRig();
    }

    function onTypeRowClick(e) {
      const btn = e.target.closest('button[data-type]');
      if (!btn) return;
      markInteracted();
      micState.type = btn.getAttribute('data-type');
      refreshMicPanel();
    }
    function onPatternRowClick(e) {
      const btn = e.target.closest('button[data-pattern]');
      if (!btn || btn.disabled) return;
      markInteracted();
      micState.pattern = btn.getAttribute('data-pattern');
      refreshMicPanel();
    }
    typeRow.addEventListener('click', onTypeRowClick);
    patternRow.addEventListener('click', onPatternRowClick);
    onCleanup(() => typeRow.removeEventListener('click', onTypeRowClick));
    onCleanup(() => patternRow.removeEventListener('click', onPatternRowClick));

    // ---- Sound sources: pick a type, drop it on a predefined spot ----
    const sourcesGroup = new THREE.Group();
    const spotMarkersGroup = new THREE.Group();
    scene.add(spotMarkersGroup, sourcesGroup);

    // Shared hardware (stands, posts, rims) stays a common brushed steel —
    // every stand in the room is plausibly the same chrome hardware.
    // Everything a player's hand or eye would actually judge by material —
    // a drum shell, a guitar top, an amp's tolex — gets its own realistic,
    // distinct color so the six sources read as six different objects
    // rather than one re-skinned prop.
    const SRC_METAL = new THREE.MeshStandardMaterial({ color: '#aab1b4', roughness: 0.35, metalness: 0.5 });

    const GUITAR_BODY_MAT = new THREE.MeshStandardMaterial({ color: '#c9922f', roughness: 0.42, metalness: 0 }); // spruce/amber top
    const GUITAR_NECK_MAT = new THREE.MeshStandardMaterial({ color: '#4a2c1a', roughness: 0.55, metalness: 0 }); // rosewood neck

    const AMP_CAB_MAT = new THREE.MeshStandardMaterial({ color: '#5c2226', roughness: 0.8, metalness: 0 }); // oxblood tolex
    const AMP_GRILLE_MAT = new THREE.MeshStandardMaterial({ color: '#181513', roughness: 0.7, metalness: 0.05 }); // black cloth

    const SNARE_SHELL_MAT = new THREE.MeshStandardMaterial({ color: '#cfd4d6', roughness: 0.22, metalness: 0.85 }); // polished steel
    const SNARE_HEAD_MAT = new THREE.MeshStandardMaterial({ color: '#f1ece0', roughness: 0.55, metalness: 0 }); // coated mylar

    const KICK_SHELL_MAT = new THREE.MeshStandardMaterial({ color: '#6d2a1f', roughness: 0.5, metalness: 0 }); // mahogany wrap
    const KICK_HEAD_MAT = new THREE.MeshStandardMaterial({ color: '#1c1a18', roughness: 0.5, metalness: 0 }); // black batter head

    const ETHNIC_BODY_MAT = new THREE.MeshStandardMaterial({ color: '#8a4a2a', roughness: 0.68, metalness: 0 }); // carved hardwood
    const ETHNIC_HEAD_MAT = new THREE.MeshStandardMaterial({ color: '#d9b98c', roughness: 0.6, metalness: 0 }); // rawhide

    // Positions sit out along the mic's -Z listening axis, from its anchor at (0, ·, 0.4).
    const MIC_ANCHOR_X = 0;
    const MIC_ANCHOR_Z = 0.4;
    const SPOT_DEFS = {
      close: { dist: 0.3, angle: 0 },
      spot: { dist: 0.8, angle: 0 },
      room: { dist: 1.8, angle: 0 },
      left: { dist: 0.9, angle: -30 },
      right: { dist: 0.9, angle: 30 },
    };
    const SPOTS = Object.keys(SPOT_DEFS).map((id) => {
      const def = SPOT_DEFS[id];
      const a = THREE.MathUtils.degToRad(def.angle);
      const x = MIC_ANCHOR_X + def.dist * Math.sin(a);
      const z = MIC_ANCHOR_Z - def.dist * Math.cos(a);
      return { id, x, z };
    });

    function zCylSrc(rTop, rBot, h) {
      return zCyl(rTop, rBot, h);
    } // alias for readability below

    const SOURCE_TYPES = [
      {
        id: 'vocal', label: 'Vocal / VO', aimHeight: 1.44,
        blurb: 'The classic close-miking subject — a cardioid dynamic or condenser, 10–20 cm off-axis to tame plosives.',
        build(g) {
          const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.02, 20), SRC_METAL);
          base.position.y = 0.01;
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.42, 12), SRC_METAL);
          pole.position.y = 0.72;
          g.add(base, pole);
          // Mouth-height marker, drawn as small radiating rings rather than a
          // body — this stands in for "voice source" without implying a figure.
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
        id: 'guitar', label: 'Guitar', aimHeight: 0.62,
        blurb: 'Close- or spot-miked around the 12th fret, sometimes blended with a room mic for body.',
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
        id: 'amp', label: 'Amp', aimHeight: 0.25,
        blurb: 'Multi-miked — one capsule close on-axis to the cone, another off-axis, plus a room mic for blend.',
        build(g) {
          const cab = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.5, 0.32), AMP_CAB_MAT);
          cab.position.y = 0.25;
          const speaker = new THREE.Mesh(zCylSrc(0.16, 0.16, 0.02), AMP_GRILLE_MAT);
          speaker.position.set(0, 0.25, -0.17);
          g.add(cab, speaker);
        },
      },
      {
        id: 'snare', label: 'Snare', aimHeight: 0.44,
        blurb: 'Multi-miked top and bottom, the two capsules combined and checked for phase.',
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
        id: 'kick', label: 'Kick', aimHeight: 0.3,
        blurb: 'Miked in and out — one capsule inside the shell, one outside for club and body.',
        build(g) {
          const shell = new THREE.Mesh(zCylSrc(0.3, 0.3, 0.45), KICK_SHELL_MAT);
          shell.position.y = 0.3;
          const head = new THREE.Mesh(zCylSrc(0.29, 0.29, 0.012), KICK_HEAD_MAT);
          head.position.set(0, 0.3, -0.23);
          g.add(shell, head);
        },
      },
      {
        id: 'ethnic', label: 'Ethnic Instrument', aimHeight: 0.5,
        blurb: 'Solo ethnic and hand-percussion instruments are usually close-miked to capture detail without bleed.',
        build(g) {
          const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.09, 0.58, 20), ETHNIC_BODY_MAT);
          body.position.y = 0.29;
          const head = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.02, 20), ETHNIC_HEAD_MAT);
          head.position.y = 0.59;
          g.add(body, head);
        },
      },
    ];

    // Only one instrument at one spot at a time — placing a new one clears the last.
    let activeSpotId = null;
    const sourceState = { type: 'vocal' };

    function disposeGroupGeometry(group) {
      group.traverse((node) => {
        if (node.geometry) node.geometry.dispose();
      });
    }

    function buildSourceScene() {
      while (sourcesGroup.children.length) disposeGroupGeometry(sourcesGroup.children.pop());
      while (spotMarkersGroup.children.length) disposeGroupGeometry(spotMarkersGroup.children.pop());

      const accent = token('--mkr-accent', '#a8672a');
      const line = token('--mkr-line-solid', '#ccd3d0'); // must be a fully
      // opaque color for THREE.Color — see the comment on --mkr-line-solid
      // in MikingRoom.css; --mkr-line itself stays translucent for its CSS
      // (DOM border) uses elsewhere in this file.

      SPOTS.forEach((spot) => {
        const occupantId = spot.id === activeSpotId ? sourceState.type : null;

        // Floor marker ring — brighter and filled when occupied, a faint
        // dashed-feeling outline when empty so the predefined spot is still legible.
        const ringColor = occupantId ? accent : line;
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.19, 0.21, 40),
          new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: occupantId ? 0.7 : 0.55, side: THREE.DoubleSide, depthWrite: false })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(spot.x, 0.004, spot.z);
        spotMarkersGroup.add(ring);

        // Empty spots are just the ring — names and distances live in the side
        // panel, where they stay legible instead of stacking up as overlapping 3D labels.
        if (occupantId) {
          const typeDef = SOURCE_TYPES.find((t) => t.id === occupantId);
          const sourceGroup = new THREE.Group();
          sourceGroup.position.set(spot.x, 0, spot.z);
          const dx = MIC_ANCHOR_X - spot.x;
          const dz = MIC_ANCHOR_Z - spot.z;
          sourceGroup.rotation.y = Math.atan2(-dx, -dz);
          typeDef.build(sourceGroup);

          // A dedicated light on the source itself, so it reads clearly
          // against the room regardless of camera angle or theme — same
          // treatment as the mic.
          const srcLight = new THREE.PointLight(0xfff2df, 1.15, 3.2, 2);
          srcLight.position.set(0.35, 0.95, -0.25);
          sourceGroup.add(srcLight);

          sourcesGroup.add(sourceGroup);
        }
      });
    }

    function refreshSourcePanel() {
      setPillState(sourceTypeRow, sourceState.type, 'data-source');
      setPillState(spotList, activeSpotId, 'data-spot');

      buildSourceScene();
      buildMicRig(); // the mic's height and how far its pattern reaches follow the active source
    }

    function onSourceTypeRowClick(e) {
      const btn = e.target.closest('button[data-source]');
      if (!btn) return;
      markInteracted();
      sourceState.type = btn.getAttribute('data-source');
      refreshSourcePanel();
    }
    function onSpotListClick(e) {
      const row = e.target.closest('button[data-spot]');
      if (!row) return;
      markInteracted();
      const spotId = row.getAttribute('data-spot');
      // Only one instrument at one spot at a time: clicking the active spot
      // clears it, clicking any other spot moves the current instrument there instead.
      activeSpotId = activeSpotId === spotId ? null : spotId;
      refreshSourcePanel();
    }
    function onClearSpotsClick() {
      activeSpotId = null;
      refreshSourcePanel();
    }
    sourceTypeRow.addEventListener('click', onSourceTypeRowClick);
    spotList.addEventListener('click', onSpotListClick);
    clearSpotsBtn.addEventListener('click', onClearSpotsClick);
    onCleanup(() => sourceTypeRow.removeEventListener('click', onSourceTypeRowClick));
    onCleanup(() => spotList.removeEventListener('click', onSpotListClick));
    onCleanup(() => clearSpotsBtn.removeEventListener('click', onClearSpotsClick));

    refreshSourcePanel();
    refreshMicPanel();

    // Re-tint the scene if the system theme flips while the page is open.
    let mq = null;
    let onThemeChange = null;
    if (window.matchMedia) {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
      onThemeChange = () => {
        buildScene();
        buildMicRig();
        buildSourceScene();
      };
      if (mq.addEventListener) mq.addEventListener('change', onThemeChange);
      else if (mq.addListener) mq.addListener(onThemeChange);
      onCleanup(() => {
        if (!mq || !onThemeChange) return;
        if (mq.removeEventListener) mq.removeEventListener('change', onThemeChange);
        else if (mq.removeListener) mq.removeListener(onThemeChange);
      });
    }

    // ---- Orbit + zoom camera (no pan — keeps the view locked to the room) ----
    const spherical = { radius: 5.4, theta: 1.0, phi: 1.08 };
    const goal = { radius: 5.4, theta: 1.0, phi: 1.08 };
    const DEFAULTS = { radius: 5.4, theta: 1.0, phi: 1.08 };

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

    // ---- Pointer / wheel / touch input ----
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

    // ---- Readout ----
    function fmtDeg(rad) {
      return Math.round((rad * 180) / Math.PI);
    }
    function updateReadout() {
      if (!rDist || !rAz || !rEl) return;
      rDist.textContent = `${spherical.radius.toFixed(1)} m`;
      const az = ((fmtDeg(spherical.theta) % 360) + 360) % 360;
      rAz.textContent = `${az}°`;
      const el = 90 - fmtDeg(spherical.phi);
      rEl.textContent = `${el}°`;
    }

    // ---- Render loop ----
    function tick() {
      if (cancelled) return;
      updateCamera();
      updateReadout();
      if (activeBeamTexture && !REDUCE_MOTION) {
        activeBeamTexture.offset.y -= 0.01;
      }
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      teardown.forEach((fn) => fn());

      // Full one-time disposal of everything the scene ever allocated.
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

  const rootClassName = ['miking-room', embedded && 'mkr-embedded', className].filter(Boolean).join(' ');

  return (
    <div className={rootClassName} style={style} data-theme={theme} ref={rootRef}>
      {!embedded && (
        <header className="mkr-topbar">
          <div className="mkr-eyebrow">Miking Techniques</div>
          <h1 className="mkr-title">03 — Sources &amp; Placement</h1>
          <p className="mkr-subtitle">
            Pick a mic type and polar pattern, then drop a sound source onto one of the predefined spots to set up a
            scene. Audio playback per spot, and the close/spot/distant/stereo techniques themselves, arrive next.
          </p>
        </header>
      )}

      <div className="mkr-stage">
        {/* The actual 3D view + its floating HUD bits (hint/readout/
            fallback) — sized by ResizeObserver off THIS element (see the
            resize() effect below), not the whole stage, so the controls
            bar below it (.mkr-controls) gets real layout space instead of
            floating on top of the room and covering part of it. Stacking
            the controls under the room instead of beside it (as two side
            panels used to) gives the room the full width of the frame. */}
        <div className="mkr-viewport" ref={stageRef}>
          <canvas className="mkr-canvas" aria-hidden="true" ref={canvasRef} />
          <p className="mkr-sr-only">
            Interactive 3D view of an abstract studio room, roughly six by four and a half metres with a half-metre
            reference grid on the floor, and a microphone on a stand near the centre. Drag to orbit the camera around
            the room; scroll or pinch to zoom. A reset view control is provided. Below the room, four rows of
            controls let you pick a sound source and place it on one of five predefined floor spots in front of the
            mic, and pick the mic's type and polar pattern, which changes the microphone model and draws its
            sensitivity lobe as a highlighted 3D shape around it. The exact distance, azimuth, and elevation of a
            placed source are announced in the readout, bottom right of the room.
          </p>

          <div className="mkr-hint" ref={hintRef}>
            <span className="mkr-hint-row">
              <kbd>drag</kbd> rotate
            </span>
            <span className="mkr-hint-row">
              <kbd>scroll</kbd> zoom
            </span>
            <button className="mkr-reset-btn" type="button" ref={resetBtnRef}>
              Reset view
            </button>
          </div>

          <div className="mkr-webgl-fallback" ref={fallbackRef} hidden>
            <p>
              The 3D preview couldn&rsquo;t load in this browser.
              <br />
              Your device or browser may not support WebGL.
            </p>
          </div>
        </div>

        {/* One horizontal bar under the room instead of two side panels —
            each row keeps just a short label (not a heading/blurb) plus its
            options as pills, so the room above keeps the full width of the
            frame instead of ~440px of it going to two side columns. */}
        <div className="mkr-controls">
          <div className="mkr-ctrl-row">
            <span className="mkr-ctrl-label">Source</span>
            <div className="mkr-pill-row" ref={sourceTypeRowRef}>
              <button className="mkr-pill" type="button" data-source="vocal">Vocal / VO</button>
              <button className="mkr-pill" type="button" data-source="guitar">Guitar</button>
              <button className="mkr-pill" type="button" data-source="amp">Amp</button>
              <button className="mkr-pill" type="button" data-source="snare">Snare</button>
              <button className="mkr-pill" type="button" data-source="kick">Kick</button>
              <button className="mkr-pill" type="button" data-source="ethnic">Ethnic Instrument</button>
            </div>
          </div>
          <div className="mkr-ctrl-row">
            <span className="mkr-ctrl-label">Place at</span>
            <div className="mkr-pill-row" ref={spotListRef}>
              <button className="mkr-pill" type="button" data-spot="close">Close</button>
              <button className="mkr-pill" type="button" data-spot="spot">Spot</button>
              <button className="mkr-pill" type="button" data-spot="room">Room</button>
              <button className="mkr-pill" type="button" data-spot="left">Left flank</button>
              <button className="mkr-pill" type="button" data-spot="right">Right flank</button>
            </div>
            <button className="mkr-pill mkr-pill-muted" type="button" ref={clearSpotsBtnRef}>
              Clear
            </button>
          </div>
          <div className="mkr-ctrl-row">
            <span className="mkr-ctrl-label">Mic type</span>
            <div className="mkr-pill-row" ref={typeRowRef}>
              <button className="mkr-pill" type="button" data-type="dynamic">Dynamic</button>
              <button className="mkr-pill" type="button" data-type="condenser-fet">FET Condenser</button>
              <button className="mkr-pill" type="button" data-type="condenser-tube">Tube Condenser</button>
              <button className="mkr-pill" type="button" data-type="ribbon">Ribbon</button>
              <button className="mkr-pill" type="button" data-type="contact">Contact</button>
            </div>
          </div>
          <div className="mkr-ctrl-row">
            <span className="mkr-ctrl-label">Pattern</span>
            <div className="mkr-pill-row" ref={patternRowRef}>
              <button className="mkr-pill" type="button" data-pattern="cardioid">Cardioid</button>
              <button className="mkr-pill" type="button" data-pattern="omni">Omni</button>
              <button className="mkr-pill" type="button" data-pattern="bidirectional">Bidirectional</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
