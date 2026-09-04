/* ============================================================
   The execution-field scene.

   This module is the lazily-loaded chunk: nothing here is imported
   until the hero is on screen, motion is allowed and first paint
   has happened. Everything three.js touches lives behind this
   boundary so it never reaches the initial bundle.

   What the scene represents — every element is load-bearing:

     · a sparse point field          the surrounding state space
     · a boundary plane              the authorization boundary ∂E
     · a gate opening in that plane  where authorized transitions cross
     · a marked volume               Ω, the configured forbidden region
     · one authorized trajectory     crosses the gate, reaches execution
     · one proposed trajectory       terminates at the plane, short of Ω

   Nothing drifts for effect. The camera moves a few degrees, the
   field breathes by a fraction of a unit, and the trajectories
   run on a slow cycle. The hero text stays dominant.
   ============================================================ */

import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  LineBasicMaterial,
  LineSegments,
  Line,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
} from "three";

export interface FieldPalette {
  /** Neutral structure — the environment and its boundaries. */
  ink: string;
  /** Authorized transition, committed execution. */
  accent: string;
  /** Blocked transition, forbidden region. */
  omega: string;
  /** Page ground, used to keep the field from floating on nothing. */
  bg: string;
}

export interface FieldHandle {
  /** Advance one frame. The host owns requestAnimationFrame. */
  frame(tSeconds: number): void;
  resize(width: number, height: number, dpr: number): void;
  setPalette(p: FieldPalette): void;
  dispose(): void;
}

/* The boundary plane stands at x = 0; the field runs along ±x. */
const BOUNDARY_X = 0;
const GATE_HALF = 0.95;

export function createExecutionField(
  canvas: HTMLCanvasElement,
  opts: { width: number; height: number; dpr: number; pointCount: number; palette: FieldPalette },
): FieldHandle {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false, // The scene is points and thin lines; MSAA buys little and costs fill rate.
    alpha: true,
    powerPreference: "low-power",
  });
  renderer.setClearAlpha(0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(34, opts.width / opts.height, 0.1, 200);

  const colInk = new Color(opts.palette.ink);
  const colAccent = new Color(opts.palette.accent);
  const colOmega = new Color(opts.palette.omega);

  /* ---------- State point field ----------
     Positions are generated once into a BufferGeometry and never
     rewritten from the CPU. The drift is a vertex-shader function of
     time and a per-point phase, so the whole field costs one draw call
     and no per-frame allocation. */
  const count = opts.pointCount;
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const scales = new Float32Array(count);
  /* A per-point tone selector: most of the field is neutral, a thin
     minority sits inside Ω and is marked as such. */
  const tones = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // Wider than tall, deeper than wide: a field the camera looks along.
    const x = (Math.random() - 0.5) * 26;
    const y = (Math.random() - 0.5) * 11;
    const z = (Math.random() - 0.5) * 17 - 3.0;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    phases[i] = Math.random() * Math.PI * 2;
    // Depth-graded size so the field reads as a volume, not a sheet.
    scales[i] = 0.30 + Math.random() * 0.42;
    tones[i] = insideOmega(x, y, z) ? 1 : 0;
  }

  const fieldGeo = new BufferGeometry();
  fieldGeo.setAttribute("position", new BufferAttribute(positions, 3));
  fieldGeo.setAttribute("aPhase", new BufferAttribute(phases, 1));
  fieldGeo.setAttribute("aScale", new BufferAttribute(scales, 1));
  fieldGeo.setAttribute("aTone", new BufferAttribute(tones, 1));

  const fieldMat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    // Normal blending, not additive: additive adds light to the background,
    // which on a near-white ground erases the field entirely.
    uniforms: {
      uTime: { value: 0 },
      uInk: { value: colInk.clone() },
      uOmega: { value: colOmega.clone() },
      uDpr: { value: opts.dpr },
      uOpacity: { value: 0 }, // faded in once the first frame is on screen
    },
    vertexShader: /* glsl */ `
      attribute float aPhase;
      attribute float aScale;
      attribute float aTone;
      uniform float uTime;
      uniform float uDpr;
      varying float vTone;
      varying float vFade;

      void main() {
        vTone = aTone;
        vec3 p = position;
        // Minimal movement: a fraction of a unit, so the field reads as
        // a settled structure rather than drifting dust.
        p.y += sin(uTime * 0.16 + aPhase) * 0.16;
        p.x += cos(uTime * 0.11 + aPhase * 1.7) * 0.12;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        // Fade the far field so the volume has depth without fog cost.
        vFade = clamp(1.0 - (-mv.z - 14.0) / 30.0, 0.25, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aScale * uDpr * (120.0 / -mv.z);
      }
    `,
    fragmentShader: /* glsl */ `
      precision mediump float;
      uniform vec3 uInk;
      uniform vec3 uOmega;
      uniform float uOpacity;
      varying float vTone;
      varying float vFade;

      void main() {
        // Round point with a soft edge — no texture fetch.
        vec2 d = gl_PointCoord - vec2(0.5);
        float r = dot(d, d);
        if (r > 0.25) discard;
        float a = smoothstep(0.25, 0.02, r);
        vec3 c = mix(uInk, uOmega, vTone);
        gl_FragColor = vec4(c, a * vFade * uOpacity * (0.20 + vTone * 0.26));
      }
    `,
  });

  const field = new Points(fieldGeo, fieldMat);
  scene.add(field);

  /* ---------- Authorization boundary ----------
     A framed plane with mullions and a gate opening, built as line
     segments. It is architecture, not a lit slab. */
  const boundary = new LineSegments(
    buildBoundaryGeometry(),
    new LineBasicMaterial({ transparent: true, opacity: 0 }),
  );
  (boundary.material as LineBasicMaterial).color = colInk.clone();
  scene.add(boundary);

  const gate = new LineSegments(
    buildGateGeometry(),
    new LineBasicMaterial({ transparent: true, opacity: 0 }),
  );
  (gate.material as LineBasicMaterial).color = colAccent.clone();
  scene.add(gate);

  /* ---------- Ω ----------
     A wireframe volume, marked rather than filled. */
  const omega = new LineSegments(
    buildOmegaGeometry(),
    new LineBasicMaterial({ transparent: true, opacity: 0 }),
  );
  (omega.material as LineBasicMaterial).color = colOmega.clone();
  scene.add(omega);

  /* ---------- Trajectories ----------
     CatmullRom through control points, sampled once. The draw-in is a
     draw-range animation rather than a geometry rewrite, so no buffer
     is touched per frame. */
  const authorized = makeTrajectory(
    [
      new Vector3(-10.5, -1.15, 2.4),
      new Vector3(-6.4, -0.5, 1.15),
      new Vector3(-3.0, -0.12, 0.36),
      new Vector3(BOUNDARY_X, 0, 0),
      new Vector3(3.4, 0.25, -0.5),
      new Vector3(6.6, 0.5, -1.0),
      new Vector3(8.6, 0.66, -1.35),
    ],
    colAccent,
  );
  scene.add(authorized.line);

  const proposed = makeTrajectory(
    [
      new Vector3(-10.5, -1.15, 2.4),
      new Vector3(-6.9, 0.5, 1.6),
      new Vector3(-3.8, 1.6, 1.0),
      new Vector3(-1.3, 2.25, 0.7),
      // Terminates ON the plane, away from the gate opening.
      new Vector3(BOUNDARY_X, 2.45, 0.62),
    ],
    colOmega,
  );
  scene.add(proposed.line);

  /* The execution node the authorized path reaches. */
  const execNode = new Points(
    (() => {
      const g = new BufferGeometry();
      g.setAttribute("position", new BufferAttribute(new Float32Array([8.6, 0.66, -1.35]), 3));
      return g;
    })(),
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uColor: { value: colAccent.clone() }, uOpacity: { value: 0 }, uDpr: { value: opts.dpr } },
      vertexShader: /* glsl */ `
        uniform float uDpr;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = 9.0 * uDpr * (170.0 / -mv.z);
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() {
          vec2 d = gl_PointCoord - vec2(0.5);
          float r = dot(d, d);
          if (r > 0.25) discard;
          // Ring plus core, so it reads as a marked state.
          float core = smoothstep(0.045, 0.02, r);
          float ring = smoothstep(0.25, 0.19, r) * (1.0 - smoothstep(0.14, 0.10, r));
          gl_FragColor = vec4(uColor, (core + ring * 0.75) * uOpacity);
        }
      `,
    }),
  );
  scene.add(execNode);

  /* ---------- Camera ----------
     The hero is a different shape on every viewport, so the distance is
     solved from the aspect rather than fixed: whichever of the two axes
     is the binding constraint sets it. Looking slightly left of the
     boundary places the geometry right of centre, clear of the type
     column. */
  /* FIT_X is measured from the look point, not from the world origin: the
     camera looks left of the boundary to push the geometry right of the
     type column, and that offset has to be inside the fitted half-extent
     or the execution node and Ω crop off the right edge. */
  const FIT_X = 10.6;
  const FIT_Y = 5.0;
  const LOOK = new Vector3(-1.6, 0.15, 0);
  const camBase = new Vector3(LOOK.x, LOOK.y + 1.5, 24);

  function frameCamera() {
    const vHalf = Math.tan((camera.fov * Math.PI) / 180 / 2);
    const dY = FIT_Y / vHalf;
    const dX = FIT_X / (vHalf * camera.aspect);
    camBase.z = Math.max(dX, dY) * 1.08;
  }

  camera.position.copy(camBase);
  camera.lookAt(LOOK);

  let intro = 0; // 0 → 1 once, on first frames
  let disposed = false;

  function frame(t: number) {
    if (disposed) return;

    // Everything fades up once; nothing pulses on a loop.
    intro = Math.min(1, intro + 0.012);
    const ease = 1 - Math.pow(1 - intro, 3);

    fieldMat.uniforms.uTime.value = t;
    fieldMat.uniforms.uOpacity.value = ease;

    (boundary.material as LineBasicMaterial).opacity = ease * 0.5;
    (omega.material as LineBasicMaterial).opacity = ease * 0.42;
    (gate.material as LineBasicMaterial).opacity = ease * 0.75;

    /* Trajectory cycle: draw in, hold, clear, repeat. The proposed path
       is offset so the two do not resolve together — the point is that
       one arrives and one does not. */
    const CYCLE = 13.0;
    const c = (t % CYCLE) / CYCLE;
    authorized.setProgress(segment(c, 0.04, 0.42, 0.86));
    proposed.setProgress(segment(c, 0.16, 0.50, 0.86));

    // The execution node activates only once the authorized path arrives.
    const arrived = segment(c, 0.04, 0.42, 0.86) >= 0.999 ? 1 : 0;
    const em = execNode.material as ShaderMaterial;
    em.uniforms.uOpacity.value += (arrived * ease - em.uniforms.uOpacity.value) * 0.06;

    // A few degrees of drift. Slow enough to read as a settled view.
    camera.position.x = camBase.x + Math.sin(t * 0.055) * 0.9;
    camera.position.y = camBase.y + Math.sin(t * 0.041 + 1.1) * 0.45;
    camera.position.z = camBase.z + Math.cos(t * 0.037) * 0.7;
    camera.lookAt(LOOK);

    renderer.render(scene, camera);
  }

  function resize(width: number, height: number, dpr: number) {
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = width < 760 ? 40 : 34;
    camera.updateProjectionMatrix();
    frameCamera();
    fieldMat.uniforms.uDpr.value = dpr;
    (execNode.material as ShaderMaterial).uniforms.uDpr.value = dpr;
  }

  function setPalette(p: FieldPalette) {
    colInk.set(p.ink);
    colAccent.set(p.accent);
    colOmega.set(p.omega);
    fieldMat.uniforms.uInk.value.copy(colInk);
    fieldMat.uniforms.uOmega.value.copy(colOmega);
    (boundary.material as LineBasicMaterial).color.copy(colInk);
    (gate.material as LineBasicMaterial).color.copy(colAccent);
    (omega.material as LineBasicMaterial).color.copy(colOmega);
    authorized.setColor(colAccent);
    proposed.setColor(colOmega);
    (execNode.material as ShaderMaterial).uniforms.uColor.value.copy(colAccent);
  }

  function dispose() {
    disposed = true;
    fieldGeo.dispose();
    fieldMat.dispose();
    boundary.geometry.dispose();
    (boundary.material as LineBasicMaterial).dispose();
    gate.geometry.dispose();
    (gate.material as LineBasicMaterial).dispose();
    omega.geometry.dispose();
    (omega.material as LineBasicMaterial).dispose();
    authorized.dispose();
    proposed.dispose();
    execNode.geometry.dispose();
    (execNode.material as ShaderMaterial).dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  resize(opts.width, opts.height, opts.dpr);
  setPalette(opts.palette);

  return { frame, resize, setPalette, dispose };
}

/* ---------- geometry helpers ---------- */

/** Ω occupies a box beyond the boundary and off the authorized axis. */
function insideOmega(x: number, y: number, z: number): boolean {
  return (
    x > OMEGA_BOX.x0 && x < OMEGA_BOX.x1 &&
    y > OMEGA_BOX.y0 && y < OMEGA_BOX.y1 &&
    z > OMEGA_BOX.z0 && z < OMEGA_BOX.z1
  );
}

/* Ω: beyond the boundary and above the authorized axis, sized so it reads
   as one marked region in the frame rather than filling it. */
const OMEGA_BOX = { x0: 2.6, x1: 6.6, y0: 1.15, y1: 3.5, z0: -2.2, z1: 1.0 };

function buildOmegaGeometry(): BufferGeometry {
  const { x0, x1, y0, y1, z0, z1 } = OMEGA_BOX;
  const c: [number, number, number][] = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  const edges: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const v: number[] = [];
  edges.forEach(([a, b]) => v.push(...c[a], ...c[b]));
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(v), 3));
  return g;
}

/** The boundary plane: frame, mullions and a ground trace, at x = 0. */
function buildBoundaryGeometry(): BufferGeometry {
  const yTop = 4.3;
  const yBot = -4.3;
  const zA = -6.2;
  const zB = 6.2;
  const v: number[] = [];
  const seg = (a: number[], b: number[]) => v.push(...a, ...b);

  seg([BOUNDARY_X, yBot, zA], [BOUNDARY_X, yTop, zA]);
  seg([BOUNDARY_X, yTop, zA], [BOUNDARY_X, yTop, zB]);
  seg([BOUNDARY_X, yTop, zB], [BOUNDARY_X, yBot, zB]);
  seg([BOUNDARY_X, yBot, zB], [BOUNDARY_X, yBot, zA]);

  // Mullions, skipping the gate opening so the aperture reads as real.
  const MULLIONS = 8;
  for (let i = 1; i < MULLIONS; i++) {
    const z = zA + ((zB - zA) * i) / MULLIONS;
    if (Math.abs(z) < GATE_HALF + 0.5) continue;
    seg([BOUNDARY_X, yBot, z], [BOUNDARY_X, yTop, z]);
  }
  return positionGeometry(v);
}

/** The gate: an aperture in the plane, on the authorized axis. */
function buildGateGeometry(): BufferGeometry {
  const yB = -1.35;
  const yT = 1.35;
  const v: number[] = [];
  const seg = (a: number[], b: number[]) => v.push(...a, ...b);
  seg([BOUNDARY_X, yB, -GATE_HALF], [BOUNDARY_X, yT, -GATE_HALF]);
  seg([BOUNDARY_X, yB, GATE_HALF], [BOUNDARY_X, yT, GATE_HALF]);
  seg([BOUNDARY_X, yT, -GATE_HALF], [BOUNDARY_X, yT, GATE_HALF]);
  seg([BOUNDARY_X, yB, -GATE_HALF], [BOUNDARY_X, yB, GATE_HALF]);
  return positionGeometry(v);
}

function positionGeometry(v: number[]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(v), 3));
  return g;
}

/**
 * A trajectory sampled from a Catmull-Rom curve.
 *
 * Progress is applied with setDrawRange, so revealing the path costs an
 * index count rather than a buffer upload.
 */
function makeTrajectory(points: Vector3[], color: Color) {
  const SAMPLES = 220;
  const curve = new CatmullRomCurve3(points, false, "catmullrom", 0.4);
  const pts = curve.getPoints(SAMPLES - 1);
  const arr = new Float32Array(SAMPLES * 3);
  pts.forEach((p, i) => {
    arr[i * 3] = p.x;
    arr[i * 3 + 1] = p.y;
    arr[i * 3 + 2] = p.z;
  });
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(arr, 3));
  geo.setDrawRange(0, 0);

  const mat = new LineBasicMaterial({ transparent: true, opacity: 0.85 });
  mat.color = color.clone();
  const line = new Line(geo, mat);

  return {
    line,
    setProgress(p: number) {
      geo.setDrawRange(0, Math.max(0, Math.round(p * SAMPLES)));
      mat.opacity = p > 0 ? 0.85 : 0;
    },
    setColor(c: Color) {
      mat.color.copy(c);
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

/**
 * Draw in over [a, b], hold until c, then clear.
 * Returns 0 outside the window, so a cleared path is genuinely absent
 * rather than drawn at zero alpha.
 */
function segment(t: number, a: number, b: number, c: number): number {
  if (t < a) return 0;
  if (t < b) {
    const k = (t - a) / (b - a);
    return 1 - Math.pow(1 - k, 3);
  }
  if (t < c) return 1;
  return 0;
}
