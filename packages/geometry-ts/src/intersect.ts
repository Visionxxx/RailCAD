import type { TrackGeometry, Vec2 } from '@railcad/domain';
import { TOLERANCES, type Intersection, type IntersectionItem } from '@railcad/geometry-api';
import { arcCenter, bounds, length, poseAt } from './track';
import { cross, dist, dot, mod2pi, normalizeAngle, sub, unit, TWO_PI } from './vec';

interface Hit {
  point: Vec2;
  /** Avstand langs hver akse fra start, meter. */
  s1: number;
  s2: number;
  /** Lengde av overlapp, meter (bare overlapp). */
  overlapM?: number;
}

/** Er vinkelen `ang` innenfor buen (start `a0`, retning `sgn`, sveip)? Returnerer avstand langs buen eller null. */
function arcParam(
  ang: number,
  a0: number,
  sgn: number,
  sweep: number,
  r: number,
  tolM: number,
): number | null {
  const delta = mod2pi((ang - a0) * sgn);
  const total = sweep * r;
  if (delta * r <= total + tolM) return Math.min(delta * r, total);
  // like før start (litt bak 0)?
  if ((TWO_PI - delta) * r <= tolM) return 0;
  return null;
}

function lineLine(a: TrackGeometry & { kind: 'line' }, b: TrackGeometry & { kind: 'line' }): Hit[] {
  const d1 = unit(a.headingRad);
  const d2 = unit(b.headingRad);
  const w = sub(b.start, a.start);
  const denom = cross(d1, d2);
  if (Math.abs(denom) < 1e-12) {
    // Parallelle: overlapp bare hvis de ligger på samme linje.
    if (Math.abs(cross(w, d1)) > 1e-6) return [];
    const t0 = dot(w, d1);
    const t1 = t0 + b.lengthM * dot(d2, d1);
    const lo = Math.max(0, Math.min(t0, t1));
    const hi = Math.min(a.lengthM, Math.max(t0, t1));
    if (hi - lo <= 1e-6) return [];
    const mid = (lo + hi) / 2;
    const point: Vec2 = [a.start[0] + d1[0] * mid, a.start[1] + d1[1] * mid];
    return [{ point, s1: mid, s2: dist(point, b.start), overlapM: hi - lo }];
  }
  const t = cross(w, d2) / denom;
  const u = cross(w, d1) / denom;
  const tol = TOLERANCES.intersectionEndM;
  if (t < -tol || t > a.lengthM + tol || u < -tol || u > b.lengthM + tol) return [];
  const tc = Math.min(Math.max(t, 0), a.lengthM);
  const uc = Math.min(Math.max(u, 0), b.lengthM);
  return [{ point: [a.start[0] + d1[0] * tc, a.start[1] + d1[1] * tc], s1: tc, s2: uc }];
}

function lineArc(l: TrackGeometry & { kind: 'line' }, a: TrackGeometry & { kind: 'arc' }): Hit[] {
  const c = arcCenter(a);
  const r = Math.abs(a.signedRadiusM);
  const d = unit(l.headingRad);
  const f = sub(l.start, c);
  const b = dot(d, f);
  const disc = b * b - (dot(f, f) - r * r);
  if (disc < -1e-9 * Math.max(1, r * r)) return [];
  const root = Math.sqrt(Math.max(0, disc));
  const roots = root < 1e-7 ? [-b] : [-b - root, -b + root]; // tangering = ett punkt
  const a0 = Math.atan2(a.start[1] - c[1], a.start[0] - c[0]);
  const sgn = Math.sign(a.signedRadiusM);
  const tol = TOLERANCES.intersectionEndM;
  const hits: Hit[] = [];
  for (const t of roots) {
    if (t < -tol || t > l.lengthM + tol) continue;
    const tc = Math.min(Math.max(t, 0), l.lengthM);
    const p: Vec2 = [l.start[0] + d[0] * tc, l.start[1] + d[1] * tc];
    const s2 = arcParam(Math.atan2(p[1] - c[1], p[0] - c[0]), a0, sgn, a.sweepRad, r, tol);
    if (s2 !== null) hits.push({ point: p, s1: tc, s2 });
  }
  return hits;
}

/** CCW-intervall [start, start+len] for en bue. */
function ccwInterval(a: TrackGeometry & { kind: 'arc' }, c: Vec2): [number, number] {
  const a0 = Math.atan2(a.start[1] - c[1], a.start[0] - c[0]);
  return a.signedRadiusM > 0 ? [a0, a.sweepRad] : [a0 - a.sweepRad, a.sweepRad];
}

function arcArc(p: TrackGeometry & { kind: 'arc' }, q: TrackGeometry & { kind: 'arc' }): Hit[] {
  const c1 = arcCenter(p);
  const c2 = arcCenter(q);
  const r1 = Math.abs(p.signedRadiusM);
  const r2 = Math.abs(q.signedRadiusM);
  const d = dist(c1, c2);
  const tol = TOLERANCES.intersectionEndM;
  const sgn1 = Math.sign(p.signedRadiusM);
  const sgn2 = Math.sign(q.signedRadiusM);
  const a01 = Math.atan2(p.start[1] - c1[1], p.start[0] - c1[0]);
  const a02 = Math.atan2(q.start[1] - c2[1], q.start[0] - c2[0]);

  if (d < 1e-6 && Math.abs(r1 - r2) < 1e-6) {
    // Samme sirkel: overlapp av sirkelintervallene.
    const [s1, l1] = ccwInterval(p, c1);
    const [s2, l2] = ccwInterval(q, c2);
    const off = mod2pi(s2 - s1);
    let best = 0;
    let bestStart = 0;
    for (const o of [off, off - TWO_PI]) {
      const lo = Math.max(0, o);
      const hi = Math.min(l1, o + l2);
      if (hi - lo > best) {
        best = hi - lo;
        bestStart = lo;
      }
    }
    if (best * r1 <= 1e-6) return [];
    const midAng = s1 + bestStart + best / 2;
    const point: Vec2 = [c1[0] + r1 * Math.cos(midAng), c1[1] + r1 * Math.sin(midAng)];
    const s1m = arcParam(midAng, a01, sgn1, p.sweepRad, r1, tol) ?? 0;
    const s2m = arcParam(midAng, a02, sgn2, q.sweepRad, r2, tol) ?? 0;
    return [{ point, s1: s1m, s2: s2m, overlapM: best * r1 }];
  }
  if (d < 1e-12) return []; // konsentriske, ulik radius
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - a * a;
  if (h2 < -1e-9 * Math.max(1, r1 * r1)) return [];
  const h = h2 < 1e-12 ? 0 : Math.sqrt(h2);
  const ex = (c2[0] - c1[0]) / d;
  const ey = (c2[1] - c1[1]) / d;
  const base: Vec2 = [c1[0] + a * ex, c1[1] + a * ey];
  const pts: Vec2[] =
    h === 0
      ? [base]
      : [
          [base[0] - h * ey, base[1] + h * ex],
          [base[0] + h * ey, base[1] - h * ex],
        ];
  const hits: Hit[] = [];
  for (const pt of pts) {
    const s1 = arcParam(Math.atan2(pt[1] - c1[1], pt[0] - c1[0]), a01, sgn1, p.sweepRad, r1, tol);
    const s2 = arcParam(Math.atan2(pt[1] - c2[1], pt[0] - c2[0]), a02, sgn2, q.sweepRad, r2, tol);
    if (s1 !== null && s2 !== null) hits.push({ point: pt, s1, s2 });
  }
  return hits;
}

function segmentHits(a: TrackGeometry, b: TrackGeometry): Hit[] {
  if (a.kind === 'line' && b.kind === 'line') return lineLine(a, b);
  if (a.kind === 'line' && b.kind === 'arc') return lineArc(a, b);
  if (a.kind === 'arc' && b.kind === 'line') {
    return lineArc(b, a).map((h) => ({ ...h, s1: h.s2, s2: h.s1 }));
  }
  return arcArc(a as never, b as never);
}

const acute = (h1: number, h2: number) => {
  const d = Math.abs(normalizeAngle(h1 - h2));
  return d > Math.PI / 2 ? Math.PI - d : d;
};

/**
 * Finner steder der akser fra ulike objekter krysser, berører eller overlapper. Ende mot ende
 * ignoreres (mulig kobling). Grovfiltrering med avgrensningsbokser (sveip langs x).
 */
export function findIntersections(items: readonly IntersectionItem[]): Intersection[] {
  const boxes = items.map((it) => {
    const bs = it.segments.map((g) => bounds(g));
    return {
      it,
      segBounds: bs,
      minX: Math.min(...bs.map((b) => b.minX)),
      maxX: Math.max(...bs.map((b) => b.maxX)),
      minY: Math.min(...bs.map((b) => b.minY)),
      maxY: Math.max(...bs.map((b) => b.maxY)),
    };
  });
  boxes.sort((x, y) => x.minX - y.minX);
  const out: Intersection[] = [];
  const endTol = TOLERANCES.intersectionEndM;

  for (let i = 0; i < boxes.length; i++) {
    const A = boxes[i] as (typeof boxes)[number];
    for (let j = i + 1; j < boxes.length; j++) {
      const B = boxes[j] as (typeof boxes)[number];
      if (B.minX > A.maxX + endTol) break;
      if (B.minY > A.maxY + endTol || B.maxY < A.minY - endTol) continue;

      const found: Intersection[] = [];
      A.it.segments.forEach((ga, ia) => {
        const ba = A.segBounds[ia]!;
        B.it.segments.forEach((gb, ib) => {
          const bb = B.segBounds[ib]!;
          if (
            ba.minX > bb.maxX + endTol ||
            ba.maxX < bb.minX - endTol ||
            ba.minY > bb.maxY + endTol ||
            ba.maxY < bb.minY - endTol
          ) {
            return;
          }
          const la = length(ga);
          const lb = length(gb);
          for (const h of segmentHits(ga, gb)) {
            const endA = h.s1 <= endTol || h.s1 >= la - endTol;
            const endB = h.s2 <= endTol || h.s2 >= lb - endTol;
            const [first, second] = A.it.id < B.it.id ? [A.it.id, B.it.id] : [B.it.id, A.it.id];
            const base = { a: first, b: second, point: h.point };
            if (h.overlapM !== undefined) {
              found.push({ ...base, kind: 'overlap', angleRad: 0, overlapM: h.overlapM });
              continue;
            }
            if (endA && endB) continue; // ende mot ende = mulig kobling
            const angleRad = acute(poseAt(ga, h.s1).headingRad, poseAt(gb, h.s2).headingRad);
            if (endA || endB) {
              found.push({ ...base, kind: 'touch', angleRad, endOf: endA ? A.it.id : B.it.id });
            } else {
              found.push({ ...base, kind: 'crossing', angleRad });
            }
          }
        });
      });
      // Samme sted funnet via flere segmenter (f.eks. skjøt i en sporveksel): behold ett treff.
      for (const f of found) {
        const dup = out.find(
          (o) => o.a === f.a && o.b === f.b && o.kind === f.kind && dist(o.point, f.point) < 1e-3,
        );
        if (!dup) out.push(f);
      }
    }
  }
  return out.sort((x, y) => (x.a + x.b).localeCompare(y.a + y.b) || x.point[0] - y.point[0]);
}
