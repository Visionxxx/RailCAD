import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  Euler,
  Float32BufferAttribute,
  GridHelper,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { railPoint, type Polyline3D } from './scene3d';

// Skjematiske mål (meter). Ikke overbygningsprosjektering.
const RAIL_W = 0.12; // litt bredere enn et skinnehode (≈ 0,07) for å synes
const RAIL_H = 0.18;
const BALLAST_HALF_W = 1.8;
const BALLAST_H = 0.3;
const SLEEPER_LEN = 2.6;
const SLEEPER_W = 0.26;
const SLEEPER_H = 0.2;
const SLEEPER_SPACING = 0.6;
const MAX_SLEEPERS = 60000;

type P3 = { x: number; y: number; z: number };

/** Avlang boks langs en punktrekke: bredde `w`, fra høyde `base` og `h` oppover (z skaleres med k). */
function stripGeometry(
  pts: P3[],
  k: number,
  cx: number,
  cy: number,
  w: number,
  base: number,
  h: number,
) {
  const pos: number[] = [];
  const idx: number[] = [];
  const hw = w / 2;
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const nx = -dy * hw;
    const ny = dx * hw;
    const y = p.z * k + base;
    const X = p.x - cx;
    const Z = -(p.y - cy);
    // nedre venstre/høyre, øvre venstre/høyre
    pos.push(X - nx, y, Z + ny, X + nx, y, Z - ny, X - nx, y + h, Z + ny, X + nx, y + h, Z - ny);
    if (i > 0) {
      const o = (i - 1) * 4;
      const n = i * 4;
      for (const [s, t] of [
        [0, 1],
        [1, 3],
        [3, 2],
        [2, 0],
      ] as const)
        idx.push(o + s, n + s, o + t, o + t, n + s, n + t);
    }
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * 3D-scene: sporbunn (singel), sviller og to skinner per akse (skjematisk sporvidde). Modellens
 * (x, y, z) → three (x, z·k, −y), så «opp» er y. Lastes først når 3D-oversikten åpnes.
 * Klikk (uten dra) på skinne eller sporbunn rapporteres med objekt-ID.
 */
export function createScene(
  host: HTMLElement,
  lines: Polyline3D[],
  exaggeration: number,
  onPick: (objectId: string | null) => void,
) {
  const renderer = new WebGLRenderer({ antialias: true });
  const w = host.clientWidth || 800;
  const h = host.clientHeight || 500;
  renderer.setSize(w, h);
  const dark = document.documentElement.dataset.theme !== 'light';
  const scene = new Scene();
  scene.background = new Color(dark ? 0x14171c : 0xdfe6ee);
  scene.add(new AmbientLight(0xffffff, 1.5));
  const sun = new DirectionalLight(0xffffff, 1.8);
  sun.position.set(1, 2, 0.6);
  scene.add(sun);
  host.appendChild(renderer.domElement);

  const camera = new PerspectiveCamera(50, w / h, 0.05, 1e6);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.maxPolarAngle = Math.PI / 2 - 0.02; // ikke under bakken
  controls.minDistance = 2;

  const railMat = new MeshLambertMaterial({ color: dark ? 0xd5dbe3 : 0x6b7480 });
  const railUnknown = new MeshLambertMaterial({ color: 0x9a8f7a });
  const railPicked = new MeshLambertMaterial({ color: 0xffb020 });
  const ballastMat = new MeshLambertMaterial({ color: dark ? 0x4a4d52 : 0x9a9fa6 });
  const ballastPicked = new MeshLambertMaterial({ color: 0x8a6a2a });
  const sleeperMat = new MeshLambertMaterial({ color: dark ? 0x2b2622 : 0x5a4a3c });

  const meshes: Mesh[] = []; // kan treffes med klikk
  let sleepers: InstancedMesh | null = null;
  let selected: string | null = null;
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity,
    minZ = 0,
    maxZ = 0;
  for (const l of lines)
    for (const p of l.points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
      if (p.z !== null) {
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
      }
    }
  if (!lines.length) {
    minX = minY = -10;
    maxX = maxY = 10;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const size = Math.max(maxX - minX, maxY - minY, 20);

  const materialFor = (m: Mesh) =>
    m.userData.kind === 'ballast'
      ? m.userData.objectId === selected
        ? ballastPicked
        : ballastMat
      : m.userData.objectId === selected
        ? railPicked
        : m.userData.unknown
          ? railUnknown
          : railMat;
  const refreshMaterials = () => meshes.forEach((m) => (m.material = materialFor(m)));

  const sleeperBox = new BoxGeometry(SLEEPER_W, SLEEPER_H, SLEEPER_LEN);
  const build = (k: number) => {
    for (const m of meshes) {
      scene.remove(m);
      m.geometry.dispose();
    }
    meshes.length = 0;
    if (sleepers) {
      scene.remove(sleepers);
      sleepers.dispose();
      sleepers = null;
    }
    const mats: Matrix4[] = [];
    for (const l of lines) {
      const unk = l.points.some((p) => p.z === null);
      const axis = l.points.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 }));
      const add = (geo: BufferGeometry, kind: 'rail' | 'ballast') => {
        const mesh = new Mesh(geo, ballastMat);
        mesh.userData = { objectId: l.objectId, unknown: unk, kind };
        mesh.material = materialFor(mesh);
        scene.add(mesh);
        meshes.push(mesh);
      };
      add(stripGeometry(axis, k, cx, cy, BALLAST_HALF_W * 2, -BALLAST_H, BALLAST_H), 'ballast');
      for (const side of [1, -1] as const) {
        const pts = l.points.map((p) => ({ ...railPoint(p, side), z: p.z ?? 0 }));
        add(stripGeometry(pts, k, cx, cy, RAIL_W, SLEEPER_H, RAIL_H), 'rail');
      }
      // Sviller med fast avstand langs aksen (posisjon og retning interpoleres mellom punktene).
      let acc = 0; // lengde til starten av dette punktparet
      let next = SLEEPER_SPACING / 2;
      for (let i = 1; i < l.points.length && mats.length < MAX_SLEEPERS; i++) {
        const a = l.points[i - 1]!;
        const b = l.points[i]!;
        const seg = Math.hypot(b.x - a.x, b.y - a.y);
        for (; next <= acc + seg && mats.length < MAX_SLEEPERS; next += SLEEPER_SPACING) {
          const t = seg > 0 ? (next - acc) / seg : 0;
          const x = a.x + (b.x - a.x) * t - cx;
          const z = (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * t;
          const yy = -(a.y + (b.y - a.y) * t - cy);
          const heading = a.headingRad + (b.headingRad - a.headingRad) * t;
          mats.push(
            new Matrix4().compose(
              new Vector3(x, z * k + SLEEPER_H / 2, yy),
              new Quaternion().setFromEuler(new Euler(0, heading, 0)),
              new Vector3(1, 1, 1),
            ),
          );
        }
        acc += seg;
      }
    }
    if (mats.length) {
      sleepers = new InstancedMesh(sleeperBox, sleeperMat, mats.length);
      mats.forEach((m, i) => sleepers!.setMatrixAt(i, m));
      sleepers.instanceMatrix.needsUpdate = true;
      scene.add(sleepers);
    }
  };
  build(exaggeration);

  const grid = new GridHelper(
    size * 1.3,
    Math.min(40, Math.max(8, Math.round((size * 1.3) / 25))),
    0x555a62,
    0x2c3037,
  );
  const placeGrid = (k: number) => (grid.position.y = Math.min(minZ, 0) * k - BALLAST_H - 0.02);
  placeGrid(exaggeration);
  scene.add(grid);

  // Kamera skrått ovenfra mot midten av anlegget.
  const dist = Math.max(size * 0.4, 25);
  const setView = (mode: 'fit' | 'top' | 'side') => {
    const lift = (maxZ - minZ) * exaggeration;
    if (mode === 'top') camera.position.set(0, dist * 1.4 + lift, 0.001);
    else if (mode === 'side') camera.position.set(0, dist * 0.25 + lift / 2, dist * 1.2);
    else camera.position.set(dist * 0.25, dist * 0.7 + lift, dist * 0.7);
    controls.target.set(0, 0, 0);
    controls.update();
  };
  setView('fit');

  // Klikk vs. dra: bare et klikk uten bevegelse velger.
  const ray = new Raycaster();
  let down: { x: number; y: number } | null = null;
  const el = renderer.domElement;
  const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
  const onUp = (e: PointerEvent) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || e.button !== 0) return;
    const r = el.getBoundingClientRect();
    const ndc = new Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(meshes, false)[0];
    selected = (hit?.object.userData.objectId as string | undefined) ?? null;
    refreshMaterials();
    onPick(selected);
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointerup', onUp);

  let raf = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    renderer.render(scene, camera);
  };
  loop();

  return {
    setView,
    setExaggeration(v: number) {
      build(v);
      placeGrid(v);
    },
    /** Test-/hjelpekrok: velg et objekt uten museklikk. */
    select(id: string | null) {
      selected = id;
      refreshMaterials();
      onPick(id);
    },
    dispose() {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      controls.dispose();
      for (const m of meshes) m.geometry.dispose();
      sleepers?.dispose();
      sleeperBox.dispose();
      for (const m of [railMat, railUnknown, railPicked, ballastMat, ballastPicked, sleeperMat])
        m.dispose();
      renderer.dispose();
      el.remove();
    },
  };
}
