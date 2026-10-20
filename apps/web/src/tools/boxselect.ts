import {
  isCrossing,
  isDimension,
  isTrack,
  isTurnout,
  type RailObject,
  type TrackGeometry,
  type Vec2,
} from '@railcad/domain';
import type { Bounds, GeometryEngine } from '@railcad/geometry-api';
import { cachedBounds } from '../rendering/paths';
import { cachedCrossingLayout } from '../rendering/crossings';
import { cachedTurnoutLayout } from '../rendering/turnouts';

/** Aksejustert rektangel i verdenskoordinater fra to motstående hjørner. */
export function rectFromCorners(a: Vec2, b: Vec2): Bounds {
  return {
    minX: Math.min(a[0], b[0]),
    maxX: Math.max(a[0], b[0]),
    minY: Math.min(a[1], b[1]),
    maxY: Math.max(a[1], b[1]),
  };
}

const inside = (b: Bounds, r: Bounds) =>
  b.minX >= r.minX && b.maxX <= r.maxX && b.minY >= r.minY && b.maxY <= r.maxY;

const pointIn = (p: Vec2, r: Bounds) =>
  p[0] >= r.minX && p[0] <= r.maxX && p[1] >= r.minY && p[1] <= r.maxY;

/** Skjærer linjestykket p0–p1 rektangelet (Liang–Barsky)? */
export function segmentIntersectsRect(p0: Vec2, p1: Vec2, r: Bounds): boolean {
  if (pointIn(p0, r) || pointIn(p1, r)) return true;
  let t0 = 0;
  let t1 = 1;
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return (
    clip(-dx, p0[0] - r.minX) &&
    clip(dx, r.maxX - p0[0]) &&
    clip(-dy, p0[1] - r.minY) &&
    clip(dy, r.maxY - p0[1])
  );
}

/** Berører aksen rektangelet? Buer samples tett nok (≤ 2°) til at ingen hjørner overses. */
export function geometryIntersectsRect(
  g: TrackGeometry,
  r: Bounds,
  engine: GeometryEngine,
): boolean {
  const len = engine.length(g);
  const steps = g.kind === 'line' ? 1 : Math.max(2, Math.ceil((g.sweepRad * 180) / Math.PI / 2));
  let prev = engine.poseAt(g, 0).point;
  for (let i = 1; i <= steps; i++) {
    const next = engine.poseAt(g, (len * i) / steps).point;
    if (segmentIntersectsRect(prev, next, r)) return true;
    prev = next;
  }
  return false;
}

/**
 * Objekter valgt av en valgboks. «Window» (dra mot høyre): hele objektet må ligge innenfor.
 * «Crossing» (dra mot venstre): alt boksen berører.
 */
export function objectsInRect(
  objects: readonly RailObject[],
  byId: ReadonlyMap<string, RailObject>,
  rect: Bounds,
  crossing: boolean,
  engine: GeometryEngine,
): string[] {
  const hitsGeometry = (g: TrackGeometry) =>
    crossing ? geometryIntersectsRect(g, rect, engine) : inside(cachedBounds(g), rect);
  const ids: string[] = [];
  for (const o of objects) {
    if (isTrack(o)) {
      if (hitsGeometry(o.geometry)) ids.push(o.id);
    } else if (isCrossing(o)) {
      const segs = cachedCrossingLayout(o).segments;
      if (crossing ? segs.some(hitsGeometry) : segs.every(hitsGeometry)) ids.push(o.id);
    } else if (isTurnout(o)) {
      const segs = cachedTurnoutLayout(o)?.segments ?? [];
      if (segs.length && (crossing ? segs.some(hitsGeometry) : segs.every(hitsGeometry)))
        ids.push(o.id);
    } else if (isDimension(o)) {
      const layout = engine.dimensionLayout(o.dimension, (id) => {
        const t = byId.get(id);
        return t && isTrack(t) ? t.geometry : undefined;
      });
      if (layout && hitsGeometry(layout.line)) ids.push(o.id);
    }
  }
  return ids;
}
