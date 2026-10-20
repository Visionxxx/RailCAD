import {
  backgroundToWorld,
  backgroundWorldCorners,
  type Background,
  type DxfBackground,
  type DxfPrim,
  type Vec2,
} from '@railcad/domain';
import type { Bounds } from '@railcad/geometry-api';

export interface BackgroundPath {
  layer: number;
  /** AutoCAD-fargenummer (ACI). */
  color: number;
  /** SVG-sti i innholdskoordinater (Y opp). */
  d: string;
}

/** Grunnfargene i AutoCADs fargepalett; øvrige nummer vises nøytralt grå. */
const ACI: Record<number, string> = {
  1: '#ff4d4d',
  2: '#ffe14d',
  3: '#4dff7a',
  4: '#4de6ff',
  5: '#6b8cff',
  6: '#ff4dff',
  8: '#808080',
  9: '#c0c0c0',
};
/** ACI 0/7/256 betyr «forgrunnsfarge» (hvit på mørk, svart på lys bakgrunn). */
export function aciColor(aci: number): string {
  return ACI[aci] ?? (aci === 0 || aci === 7 || aci === 256 ? 'var(--text)' : '#9aa3b2');
}

const f = (n: number) => +n.toFixed(4);

function arcSegments(cx: number, cy: number, r: number, a0Deg: number, a1Deg: number): string {
  let sweep = a1Deg - a0Deg;
  while (sweep <= 0) sweep += 360;
  const pieces = Math.max(1, Math.ceil(sweep / 180));
  const rad = (d: number) => (d * Math.PI) / 180;
  const at = (deg: number) => `${f(cx + r * Math.cos(rad(deg)))} ${f(cy + r * Math.sin(rad(deg)))}`;
  let d = `M${at(a0Deg)}`;
  for (let i = 1; i <= pieces; i++)
    d += `A${f(r)} ${f(r)} 0 0 1 ${at(a0Deg + (sweep * i) / pieces)}`;
  return d;
}

/** Polylinje med bulge: buesegment fra (x1,y1) til (x2,y2). Positiv bulge = mot klokka. */
function bulgeArc(x2: number, y2: number, x1: number, y1: number, bulge: number): string {
  const chord = Math.hypot(x2 - x1, y2 - y1);
  if (chord === 0) return '';
  const theta = 4 * Math.atan(Math.abs(bulge));
  const r = chord / (2 * Math.sin(theta / 2));
  return `A${f(r)} ${f(r)} 0 ${theta > Math.PI ? 1 : 0} ${bulge > 0 ? 1 : 0} ${f(x2)} ${f(y2)}`;
}

function primPath(p: DxfPrim): string {
  switch (p[0]) {
    case 'L':
      return `M${f(p[2])} ${f(p[3])}L${f(p[4])} ${f(p[5])}`;
    case 'A':
      return arcSegments(p[2], p[3], p[4], p[5], p[6]);
    case 'C':
      return (
        arcSegments(p[2], p[3], p[4], 0, 180) +
        arcSegments(p[2], p[3], p[4], 180, 360).replace(/^M[^A]*/, '')
      );
    case 'P': {
      const v = p[3];
      const n = v.length / 3;
      let d = `M${f(v[0] as number)} ${f(v[1] as number)}`;
      const segs = p[2] ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const j = (i + 1) % n;
        const [x1, y1, b] = [v[3 * i] as number, v[3 * i + 1] as number, v[3 * i + 2] as number];
        const [x2, y2] = [v[3 * j] as number, v[3 * j + 1] as number];
        d += b ? bulgeArc(x2, y2, x1, y1, b) : `L${f(x2)} ${f(y2)}`;
      }
      return d;
    }
    default:
      return ''; // tekst tegnes i skjermlaget
  }
}

const cache = new WeakMap<DxfBackground, BackgroundPath[]>();

/** SVG-stier per lag (cachet pr. bakgrunnsobjekt – uforanderlige, så identitet er nøkkel). */
export function backgroundPaths(bg: DxfBackground): BackgroundPath[] {
  const hit = cache.get(bg);
  if (hit) return hit;
  const byLayer = new Map<number, string[]>();
  for (const p of bg.prims) {
    const d = primPath(p);
    if (!d) continue;
    const list = byLayer.get(p[1]);
    if (list) list.push(d);
    else byLayer.set(p[1], [d]);
  }
  const out = [...byLayer.entries()].map(([layer, parts]) => ({
    layer,
    color: bg.layers[layer]?.color ?? 7,
    d: parts.join(''),
  }));
  cache.set(bg, out);
  return out;
}

/** Verdensrektangel (aksejustert omriss av det evt. roterte innholdet). */
export function backgroundWorldBounds(bg: Background): Bounds {
  const c = backgroundWorldCorners(bg);
  return {
    minX: Math.min(...c.map((p) => p[0])),
    maxX: Math.max(...c.map((p) => p[0])),
    minY: Math.min(...c.map((p) => p[1])),
    maxY: Math.max(...c.map((p) => p[1])),
  };
}

export interface BackgroundLabel {
  key: string;
  text: string;
  /** Verdensposisjon. */
  x: number;
  y: number;
  /** Høyde i meter og verdensrotasjon i grader. */
  heightM: number;
  rotationDeg: number;
}

/** Tekst-primitiver i verdenskoordinater (tegnes i skjermlaget). */
export function backgroundLabels(bg: DxfBackground): BackgroundLabel[] {
  const out: BackgroundLabel[] = [];
  bg.prims.forEach((p, i) => {
    if (p[0] !== 'T') return;
    const [x, y] = backgroundToWorld(bg.placement, [p[2], p[3]]);
    out.push({
      key: `${bg.id}-${i}`,
      text: p[6],
      x,
      y,
      heightM: p[4] * bg.placement.scaleMPerUnit,
      rotationDeg: p[5] + (bg.placement.rotationRad * 180) / Math.PI,
    });
  });
  return out;
}

/** Nærmeste hjørne/endepunkt/sentrum i bakgrunnen (verdenskoordinater) innen `tolM`, for snapping. */
export function snapToBackground(
  bgs: readonly Background[],
  world: Vec2,
  tolM: number,
): Vec2 | null {
  let best: Vec2 | null = null;
  let bestD = tolM;
  const test = (px: number, py: number, bg: DxfBackground) => {
    const w = backgroundToWorld(bg.placement, [px, py]);
    const d = Math.hypot(w[0] - world[0], w[1] - world[1]);
    if (d <= bestD) {
      bestD = d;
      best = w;
    }
  };
  for (const bg of bgs) {
    if (bg.kind !== 'dxf' || !bg.visible) continue;
    // Grovt forfilter i innholdskoordinater: hopp over bakgrunner langt unna.
    const b = backgroundWorldBounds(bg);
    if (
      world[0] < b.minX - tolM ||
      world[0] > b.maxX + tolM ||
      world[1] < b.minY - tolM ||
      world[1] > b.maxY + tolM
    )
      continue;
    for (const p of bg.prims) {
      if (p[0] === 'L') {
        test(p[2], p[3], bg);
        test(p[4], p[5], bg);
      } else if (p[0] === 'P') {
        for (let i = 0; i < p[3].length; i += 3) test(p[3][i] as number, p[3][i + 1] as number, bg);
      } else if (p[0] === 'C' || p[0] === 'A') {
        test(p[2], p[3], bg);
      }
    }
  }
  return best;
}
