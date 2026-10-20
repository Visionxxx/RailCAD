/**
 * Genererer testfiler i fixtures/dxf/:
 *  - RailCAD-eksporter av eksempelprosjektene (R12 og R2007)
 *  - kartunderlag (SYNTETISK testdata, ikke reelt kartgrunnlag) i flere varianter:
 *    lokale koordinater, UTM-32/33-lignende store koordinater, og millimeter som enhet.
 *
 *   npx tsx scripts/generate-dxf-samples.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { DxfWriter, LWPolylineFlags, Units, point3d } from '@tarikjabiri/dxf';
import { loadProject } from '@railcad/domain';
import { exportDxf, writeR12, type DxfEntity } from '@railcad/dxf';
import { geometryEngine as engine } from '@railcad/geometry-ts';
import lodalen from '../fixtures/demo-lodalen.json';
import verksted from '../fixtures/demo-verksted.json';

const OUT = 'fixtures/dxf';
mkdirSync(OUT, { recursive: true });

// ---------- 1) RailCAD-eksporter ----------
for (const [name, data] of [
  ['verksted', verksted],
  ['lodalen', lodalen],
] as const) {
  const r = loadProject(data);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  for (const v of ['R12', 'R2007'] as const) {
    writeFileSync(`${OUT}/railcad-${name}-${v.toLowerCase()}.dxf`, exportDxf(r.project, engine, v));
  }
}

// ---------- 2) Syntetisk kartunderlag ----------
type V = [number, number, number?]; // x, y, bulge (som i LWPOLYLINE)
type Prim =
  | { k: 'poly'; layer: string; pts: V[]; closed: boolean }
  | { k: 'line'; layer: string; a: [number, number]; b: [number, number] }
  | { k: 'arc'; layer: string; c: [number, number]; r: number; a0: number; a1: number }
  | { k: 'circle'; layer: string; c: [number, number]; r: number }
  | { k: 'text'; layer: string; at: [number, number]; h: number; value: string; rot?: number };

const LAYER_DEFS = [
  { name: 'EIENDOM', color: 1 },
  { name: 'BYGG', color: 8 },
  { name: 'VEG', color: 9 },
  { name: 'SPOR_EKSISTERENDE', color: 3 },
  { name: 'MAST', color: 5 },
  { name: 'TEKST', color: 7 },
];

/** Posisjoner følger Lodalen-eksempelplanen (x 37–900, y 53–178), så filen passer som bakgrunn. */
function siteplan(): Prim[] {
  const P: Prim[] = [];
  const rect = (layer: string, x0: number, y0: number, x1: number, y1: number): Prim => ({
    k: 'poly',
    layer,
    closed: true,
    pts: [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ],
  });
  // Eiendomsgrense (mot klokka) med to avrundede hjørner. Bulge hører til segmentet som STARTER i
  // punktet; 90° sveip ⇒ bulge = tan(90°/4) = 0.4142.
  P.push({
    k: 'poly',
    layer: 'EIENDOM',
    closed: true,
    pts: [
      [0, -20],
      [900, -20, 0.4142],
      [960, 40],
      [960, 200, 0.3],
      [940, 230],
      [20, 230],
      [0, 210],
    ],
  });
  // Bygninger
  P.push(rect('BYGG', 200, 10, 520, 38)); // hall 1
  P.push(rect('BYGG', 560, 8, 700, 30)); // hall 2
  P.push(rect('BYGG', 100, 12, 135, 34)); // verksted
  P.push(rect('BYGG', 720, -8, 748, 6)); // skur
  P.push(rect('BYGG', 40, 195, 95, 216)); // administrasjon
  P.push({
    k: 'poly',
    layer: 'BYGG',
    closed: true,
    pts: [
      [300, 195],
      [360, 195],
      [370, 205],
      [360, 216],
      [300, 216],
    ],
  });
  // Veier: nordlig vei med bue, sørlig vei, kantlinjer, rundkjøring
  P.push({
    k: 'poly',
    layer: 'VEG',
    closed: false,
    pts: [
      [0, 222],
      [400, 222],
      [700, 222, -0.1],
      [900, 210],
    ],
  });
  P.push({
    k: 'poly',
    layer: 'VEG',
    closed: false,
    pts: [
      [0, 214],
      [400, 214],
      [700, 214, -0.1],
      [892, 203],
    ],
  });
  P.push({ k: 'line', layer: 'VEG', a: [0, -12], b: [880, -12] });
  P.push({ k: 'line', layer: 'VEG', a: [0, -5], b: [870, -5] });
  P.push({ k: 'circle', layer: 'VEG', c: [930, -4], r: 18 });
  P.push({ k: 'arc', layer: 'VEG', c: [930, -4], r: 26, a0: 100, a1: 250 });
  // Eksisterende spor (andre geometrityper enn planen): LINE, ARC og LWPOLYLINE med bulge
  for (const y of [43, 48])
    P.push({ k: 'line', layer: 'SPOR_EKSISTERENDE', a: [100, y], b: [480, y] });
  P.push({ k: 'arc', layer: 'SPOR_EKSISTERENDE', c: [480, 143], r: 95, a0: 270, a1: 300 });
  P.push({
    k: 'poly',
    layer: 'SPOR_EKSISTERENDE',
    closed: false,
    pts: [
      [100, 53],
      [250, 53],
      [300, 58, 0.05],
      [380, 76],
      [480, 76],
    ],
  });
  // Kontaktledningsmaster langs nordsiden (25 m avstand)
  for (let x = 50; x <= 850; x += 25) P.push({ k: 'circle', layer: 'MAST', c: [x, 192], r: 0.4 });
  // Tekst
  P.push({ k: 'text', layer: 'TEKST', at: [330, 20], h: 4, value: 'Hall 1 (syntetisk)' });
  P.push({ k: 'text', layer: 'TEKST', at: [590, 16], h: 4, value: 'Hall 2 (syntetisk)' });
  P.push({ k: 'text', layer: 'TEKST', at: [20, 224], h: 3, value: 'Nordre vei', rot: 0 });
  P.push({ k: 'text', layer: 'TEKST', at: [900, 100], h: 3, value: 'Eiendomsgrense', rot: 90 });
  P.push({
    k: 'text',
    layer: 'TEKST',
    at: [20, -35],
    h: 4,
    value: 'Kartunderlag - SYNTETISK TESTDATA, ikke reelt kartgrunnlag',
  });
  // Nordpil
  P.push({ k: 'line', layer: 'TEKST', a: [980, 60], b: [980, 90] });
  P.push({ k: 'line', layer: 'TEKST', a: [980, 90], b: [975, 80] });
  P.push({ k: 'line', layer: 'TEKST', a: [980, 90], b: [985, 80] });
  P.push({ k: 'text', layer: 'TEKST', at: [977, 93], h: 4, value: 'N' });
  return P;
}

const place = (p: Prim, dx: number, dy: number, s: number): Prim => {
  const pt = (q: [number, number]): [number, number] => [(q[0] + dx) * s, (q[1] + dy) * s];
  switch (p.k) {
    case 'poly':
      return { ...p, pts: p.pts.map(([x, y, b]) => [(x + dx) * s, (y + dy) * s, b] as V) };
    case 'line':
      return { ...p, a: pt(p.a), b: pt(p.b) };
    case 'arc':
      return { ...p, c: pt(p.c), r: p.r * s };
    case 'circle':
      return { ...p, c: pt(p.c), r: p.r * s };
    case 'text':
      return { ...p, at: pt(p.at), h: p.h * s };
  }
};

function writeSiteR2007(prims: Prim[], units: Units): string {
  const w = new DxfWriter();
  w.setUnits(units);
  for (const l of LAYER_DEFS) w.addLayer(l.name, l.color, 'CONTINUOUS');
  for (const p of prims) {
    if (p.k === 'poly') {
      w.addLWPolyline(
        p.pts.map(([x, y, bulge]) => ({ point: { x, y }, bulge: bulge ?? 0 })),
        { layerName: p.layer, flags: p.closed ? LWPolylineFlags.Closed : LWPolylineFlags.None },
      );
    } else if (p.k === 'line') {
      w.addLine(point3d(p.a[0], p.a[1]), point3d(p.b[0], p.b[1]), { layerName: p.layer });
    } else if (p.k === 'arc') {
      w.addArc(point3d(p.c[0], p.c[1]), p.r, p.a0, p.a1, { layerName: p.layer });
    } else if (p.k === 'circle') {
      w.addCircle(point3d(p.c[0], p.c[1]), p.r, { layerName: p.layer });
    } else {
      w.addText(point3d(p.at[0], p.at[1]), p.h, p.value, {
        layerName: p.layer,
        rotation: p.rot ?? 0,
      });
    }
  }
  return w.stringify();
}

/** R12 har ingen LWPOLYLINE/CIRCLE: polylinjer (også med bulge) skrives som LINE/ARC, sirkler som to halvbuer. */
function r12Entities(prims: Prim[]): DxfEntity[] {
  const out: DxfEntity[] = [];
  const seg = (layer: string, a: V, b: [number, number]) => {
    const bulge = a[2] ?? 0;
    if (!bulge) {
      out.push({ kind: 'line', layer, a: [a[0], a[1]], b });
      return;
    }
    const theta = 4 * Math.atan(bulge); // fortegnet sveip
    const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
    const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const h =
      r * Math.cos(Math.abs(theta) / 2) * Math.sign(theta) * (Math.abs(theta) > Math.PI ? -1 : 1);
    const nx = -(b[1] - a[1]) / chord;
    const ny = (b[0] - a[0]) / chord;
    const c: [number, number] = [mid[0] + nx * h, mid[1] + ny * h];
    const ang = (q: [number, number]) =>
      ((Math.atan2(q[1] - c[1], q[0] - c[0]) * 180) / Math.PI + 360) % 360;
    const [s0, s1] = theta > 0 ? [ang([a[0], a[1]]), ang(b)] : [ang(b), ang([a[0], a[1]])];
    out.push({ kind: 'arc', layer, center: c, radius: r, startDeg: s0, endDeg: s1 });
  };
  for (const p of prims) {
    if (p.k === 'poly') {
      const n = p.pts.length;
      for (let i = 0; i < (p.closed ? n : n - 1); i++) {
        const a = p.pts[i] as V;
        const b = p.pts[(i + 1) % n] as V;
        seg(p.layer, a, [b[0], b[1]]);
      }
    } else if (p.k === 'line') out.push({ kind: 'line', layer: p.layer, a: p.a, b: p.b });
    else if (p.k === 'arc')
      out.push({
        kind: 'arc',
        layer: p.layer,
        center: p.c,
        radius: p.r,
        startDeg: p.a0,
        endDeg: p.a1,
      });
    else if (p.k === 'circle') {
      out.push({ kind: 'arc', layer: p.layer, center: p.c, radius: p.r, startDeg: 0, endDeg: 180 });
      out.push({
        kind: 'arc',
        layer: p.layer,
        center: p.c,
        radius: p.r,
        startDeg: 180,
        endDeg: 360,
      });
    } else
      out.push({
        kind: 'text',
        layer: p.layer,
        at: p.at,
        height: p.h,
        rotationDeg: p.rot ?? 0,
        value: p.value,
      });
  }
  return out;
}

const base = siteplan();
const variants: Array<{ file: string; dx: number; dy: number; s: number; units: Units }> = [
  { file: 'kartunderlag-lokal-r2007.dxf', dx: 0, dy: 0, s: 1, units: Units.Meters },
  // Store koordinater (UTM-32/33-lignende, Oslo-området) – tester presisjon og «zoom til alt»
  { file: 'kartunderlag-utm-r2007.dxf', dx: 262000, dy: 6649500, s: 1, units: Units.Meters },
  // Millimeter som enhet – tester skalering ved import
  { file: 'kartunderlag-mm-r2007.dxf', dx: 0, dy: 0, s: 1000, units: Units.Millimeters },
];
for (const v of variants) {
  writeFileSync(
    `${OUT}/${v.file}`,
    writeSiteR2007(
      base.map((p) => place(p, v.dx, v.dy, v.s)),
      v.units,
    ),
  );
}
writeFileSync(
  `${OUT}/kartunderlag-lokal-r12.dxf`,
  writeR12(
    r12Entities(base),
    'Kartunderlag SYNTETISK testdata - ikke reelt kartgrunnlag',
    LAYER_DEFS,
  ),
);
console.log(`Skrev DXF-filer til ${OUT}/`);
