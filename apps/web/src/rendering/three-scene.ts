import {
  AmbientLight,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  GridHelper,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { railPoint, type Polyline3D } from './scene3d';

const RAIL_W = 0.07; // skinnehode, skjematisk
const RAIL_H = 0.18;

/** Skinne som lang boks langs punktrekken (4 sideflater). Høyden z skaleres, tverrsnittet ikke. */
function railGeometry(
  pts: Array<{ x: number; y: number; z: number }>,
  k: number,
  cx: number,
  cy: number,
  vis: number,
) {
  const pos: number[] = [];
  const idx: number[] = [];
  const hw = (RAIL_W * vis) / 2;
  const height = RAIL_H * vis;
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    let dx = b.x - a.x,
      dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const nx = -dy * hw,
      ny = dx * hw;
    const y = p.z * k;
    const X = p.x - cx,
      Z = -(p.y - cy);
    // fire hjørner: nedre venstre/høyre, øvre venstre/høyre
    pos.push(
      X - nx,
      y,
      Z + ny,
      X + nx,
      y,
      Z - ny,
      X - nx,
      y + height,
      Z + ny,
      X + nx,
      y + height,
      Z - ny,
    );
    if (i > 0) {
      const o = (i - 1) * 4,
        n = i * 4;
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
 * 3D-scene: skinner (to per akse, skjematisk sporvidde) som meshes. Modellens (x, y, z) →
 * three (x, z·k, −y), så «opp» er y. Lastes først når 3D-oversikten åpnes (three er stor).
 * Klikk (uten dra) på en skinne rapporteres med objekt-ID.
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
  scene.background = new Color(dark ? 0x14171c : 0xf4f5f7);
  scene.add(new AmbientLight(0xffffff, 1.6));
  const sun = new DirectionalLight(0xffffff, 1.6);
  sun.position.set(1, 2, 1);
  scene.add(sun);
  host.appendChild(renderer.domElement);

  const camera = new PerspectiveCamera(50, w / h, 0.1, 1e6);
  const controls = new OrbitControls(camera, renderer.domElement);
  const known = new MeshLambertMaterial({ color: dark ? 0x7fb8ff : 0x2a6fc0 });
  const unknown = new MeshLambertMaterial({ color: 0x8a8f98 });
  const picked = new MeshLambertMaterial({ color: 0xffb020 });

  const meshes: Mesh[] = [];
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
  const cx = (minX + maxX) / 2,
    cy = (minY + maxY) / 2;
  const size = Math.max(maxX - minX, maxY - minY, 20);

  // Ved oversikt over store anlegg ville ekte skinnebredde (7 cm) vært usynlig: tverrsnittet forstørres
  // (sporvidden er ekte).
  const vis = Math.max(1, size / 120);
  const materialFor = (m: Mesh) =>
    m.userData.objectId === selected ? picked : m.userData.unknown ? unknown : known;
  const refreshMaterials = () => meshes.forEach((m) => (m.material = materialFor(m)));

  const build = (k: number) => {
    for (const m of meshes) {
      scene.remove(m);
      m.geometry.dispose();
    }
    meshes.length = 0;
    for (const l of lines) {
      const unk = l.points.some((p) => p.z === null);
      for (const side of [1, -1] as const) {
        const pts = l.points.map((p) => ({ ...railPoint(p, side), z: p.z ?? 0 }));
        const mesh = new Mesh(railGeometry(pts, k, cx, cy, vis), known);
        mesh.userData = { objectId: l.objectId, unknown: unk };
        mesh.material = materialFor(mesh);
        scene.add(mesh);
        meshes.push(mesh);
      }
    }
  };
  build(exaggeration);

  const grid = new GridHelper(
    size * 1.3,
    Math.min(60, Math.max(10, Math.round((size * 1.3) / 10))),
    0x666b73,
    0x3a3f47,
  );
  grid.position.y = Math.min(minZ, 0) * exaggeration - 0.01;
  scene.add(grid);

  // Kamera skrått ovenfra, tilpasset utstrekningen.
  camera.position.set(size * 0.15, size * 0.55 + (maxZ - minZ) * exaggeration, size * 0.55);
  controls.update();

  // Klikk vs. dra: bare et klikk uten bevegelse velger.
  const ray = new Raycaster();
  ray.params.Line = { threshold: 0.5 };
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
    setExaggeration(v: number) {
      build(v);
      grid.position.y = Math.min(minZ, 0) * v - 0.01;
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
      known.dispose();
      unknown.dispose();
      picked.dispose();
      renderer.dispose();
      el.remove();
    },
  };
}
