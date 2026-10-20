import type { ArcGeometry, LineGeometry, TrackGeometry, Vec2 } from '@railcad/domain';
import type { Bounds, ClosestPoint, Pose } from '@railcad/geometry-api';
import {
  add,
  dist,
  dot,
  leftNormal,
  mod2pi,
  mul,
  norm,
  rotate,
  rotateAbout,
  sub,
  unit,
  TWO_PI,
} from './vec';

export function length(g: TrackGeometry): number {
  return g.kind === 'line' ? g.lengthM : Math.abs(g.signedRadiusM) * g.sweepRad;
}

export function arcCenter(g: ArcGeometry): Vec2 {
  return add(g.start, mul(leftNormal(g.headingRad), g.signedRadiusM));
}

export function poseAt(g: TrackGeometry, sIn: number): Pose {
  const total = length(g);
  const s = Math.min(Math.max(sIn, 0), total);
  if (g.kind === 'line') {
    if (s === 0) return { point: g.start, headingRad: g.headingRad };
    return { point: add(g.start, mul(unit(g.headingRad), s)), headingRad: g.headingRad };
  }
  if (s === 0) return { point: g.start, headingRad: g.headingRad };
  const phi = s / g.signedRadiusM; // fortegn følger krumningsretning
  const c = arcCenter(g);
  return {
    point: add(c, rotate(sub(g.start, c), phi)),
    headingRad: g.headingRad + phi,
  };
}

export const startPose = (g: TrackGeometry): Pose => poseAt(g, 0);
export const endPose = (g: TrackGeometry): Pose => poseAt(g, length(g));

export function closestPoint(g: TrackGeometry, p: Vec2): ClosestPoint {
  if (g.kind === 'line') {
    const d = unit(g.headingRad);
    const s = Math.min(Math.max(dot(sub(p, g.start), d), 0), g.lengthM);
    const point = s === 0 ? g.start : add(g.start, mul(d, s));
    return { point, s, distanceM: dist(p, point) };
  }
  const c = arcCenter(g);
  const r = Math.abs(g.signedRadiusM);
  const v = sub(p, c);
  const vLen = norm(v);
  const sgn = Math.sign(g.signedRadiusM);
  const a0 = Math.atan2(g.start[1] - c[1], g.start[0] - c[0]);
  const delta = vLen === 0 ? 0 : mod2pi((Math.atan2(v[1], v[0]) - a0) * sgn);
  if (vLen > 0 && delta <= g.sweepRad) {
    const point = add(c, mul(v, r / vLen));
    return { point, s: delta * r, distanceM: dist(p, point) };
  }
  const total = length(g);
  const end = endPose(g).point;
  const dStart = dist(p, g.start);
  const dEnd = dist(p, end);
  return dStart <= dEnd
    ? { point: g.start, s: 0, distanceM: dStart }
    : { point: end, s: total, distanceM: dEnd };
}

export function bounds(g: TrackGeometry): Bounds {
  const a = g.start;
  const b = endPose(g).point;
  const out: Bounds = {
    minX: Math.min(a[0], b[0]),
    minY: Math.min(a[1], b[1]),
    maxX: Math.max(a[0], b[0]),
    maxY: Math.max(a[1], b[1]),
  };
  if (g.kind === 'arc') {
    const c = arcCenter(g);
    const r = Math.abs(g.signedRadiusM);
    const sgn = Math.sign(g.signedRadiusM);
    const a0 = Math.atan2(a[1] - c[1], a[0] - c[0]);
    for (let k = 0; k < 4; k++) {
      const ang = (k * Math.PI) / 2;
      if (mod2pi((ang - a0) * sgn) <= g.sweepRad) {
        const x = c[0] + r * Math.cos(ang);
        const y = c[1] + r * Math.sin(ang);
        out.minX = Math.min(out.minX, x);
        out.maxX = Math.max(out.maxX, x);
        out.minY = Math.min(out.minY, y);
        out.maxY = Math.max(out.maxY, y);
      }
    }
  }
  return out;
}

export function offset(g: TrackGeometry, d: number): TrackGeometry | null {
  const start = add(g.start, mul(leftNormal(g.headingRad), d));
  if (g.kind === 'line') return { ...g, start };
  const radius = g.signedRadiusM - d; // sentrum er fast; venstre forskyvning krymper venstrekurver
  if (radius === 0 || Math.sign(radius) !== Math.sign(g.signedRadiusM)) return null;
  return { ...g, start, signedRadiusM: radius };
}

export function signedOffsetOf(g: TrackGeometry, p: Vec2): number {
  if (g.kind === 'line') return dot(sub(p, g.start), leftNormal(g.headingRad));
  return g.signedRadiusM - Math.sign(g.signedRadiusM) * dist(p, arcCenter(g));
}

export function translate(g: TrackGeometry, dx: number, dy: number): TrackGeometry {
  return { ...g, start: [g.start[0] + dx, g.start[1] + dy] };
}

export function rotateGeometry(g: TrackGeometry, pivot: Vec2, angle: number): TrackGeometry {
  return { ...g, start: rotateAbout(g.start, pivot, angle), headingRad: g.headingRad + angle };
}

/**
 * Sirkelbue fra `start` med tangent `headingRad` som går gjennom `end`.
 * I lokalt system (x langs tangenten, y til venstre) er R = (x² + y²) / (2y).
 */
export function arcFromStartTangentEnd(
  start: Vec2,
  headingRad: number,
  end: Vec2,
  minLengthM: number,
  maxRadiusM: number,
): ArcGeometry | null {
  const local = rotate(sub(end, start), -headingRad);
  const [x, y] = local;
  if (Math.hypot(x, y) < minLengthM || y === 0) return null;
  const r = (x * x + y * y) / (2 * Math.abs(y)); // radius > 0 i speilet system
  if (!Number.isFinite(r) || r > maxRadiusM) return null;
  let sweep = Math.atan2(x, r - Math.abs(y));
  if (sweep <= 0) sweep += TWO_PI;
  if (!(sweep > 0 && sweep < TWO_PI)) return null;
  return { kind: 'arc', start, headingRad, signedRadiusM: y > 0 ? r : -r, sweepRad: sweep };
}

export type { LineGeometry };
