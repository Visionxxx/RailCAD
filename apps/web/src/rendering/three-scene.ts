import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  GridHelper,
  Line,
  LineBasicMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Polyline3D } from './scene3d';

/**
 * Enkel 3D-scene: sporakser som linjer. Modellens (x, y, z) → three (x, z·k, −y), så «opp» er y.
 * Lastes først når 3D-oversikten åpnes (three er stor).
 */
export function createScene(host: HTMLElement, lines: Polyline3D[], exaggeration: number) {
  const renderer = new WebGLRenderer({ antialias: true });
  const w = host.clientWidth || 800;
  const h = host.clientHeight || 500;
  renderer.setSize(w, h);
  const dark = document.documentElement.dataset.theme !== 'light';
  const scene = new Scene();
  scene.background = new Color(dark ? 0x14171c : 0xf4f5f7);
  host.appendChild(renderer.domElement);

  const camera = new PerspectiveCamera(50, w / h, 0.1, 1e6);
  const controls = new OrbitControls(camera, renderer.domElement);
  const known = new LineBasicMaterial({ color: dark ? 0x4aa3ff : 0x0b5fc0 });
  const unknown = new LineBasicMaterial({ color: 0x8a8f98 });

  const objects: Line[] = [];
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

  const build = (k: number) => {
    for (const o of objects) {
      scene.remove(o);
      o.geometry.dispose();
    }
    objects.length = 0;
    for (const l of lines) {
      const pos: number[] = [];
      for (const p of l.points) pos.push(p.x - cx, (p.z ?? 0) * k, -(p.y - cy));
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(pos, 3));
      const line = new Line(g, l.points.some((p) => p.z === null) ? unknown : known);
      scene.add(line);
      objects.push(line);
    }
  };
  build(exaggeration);

  const grid = new GridHelper(size * 1.4, 20, 0x666b73, 0x3a3f47);
  grid.position.y = Math.min(minZ, 0) * exaggeration - 0.01;
  scene.add(grid);

  camera.position.set(size * 0.6, size * 0.6 + (maxZ - minZ) * exaggeration, size * 0.9);
  controls.update();

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
    dispose() {
      cancelAnimationFrame(raf);
      controls.dispose();
      for (const o of objects) o.geometry.dispose();
      known.dispose();
      unknown.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
