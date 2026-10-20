import type { Vec2 } from '@railcad/domain';
import type { SnapKind, SnapQuery, SnapResult, TrackRef } from '@railcad/geometry-api';
import { arcCenter, bounds, closestPoint, endPose } from './track';
import { add, dist, mul, norm, rotate, sub } from './vec';

/** Lavere tall = høyere prioritet når flere snap-punkter ligger innenfor toleransen. */
const RANK: Record<SnapKind, number> = { endpoint: 0, center: 1, tangent: 2, nearest: 3, grid: 4 };

/**
 * Tangentpunkter på en sirkel sett fra et eksternt punkt P:
 * vinkelen ved sentrum mellom C→P og C→T er acos(r / |CP|).
 */
export function tangentPoints(center: Vec2, radius: number, from: Vec2): Vec2[] {
  const v = sub(from, center);
  const d = norm(v);
  if (d <= radius) return [];
  const alpha = Math.acos(radius / d);
  const dir = mul(v, radius / d);
  return [add(center, rotate(dir, alpha)), add(center, rotate(dir, -alpha))];
}

export function snap(tracks: Iterable<TrackRef>, q: SnapQuery): SnapResult | null {
  const on = new Set(q.kinds);
  const tol = q.toleranceM;
  let best: SnapResult | null = null;

  const consider = (kind: SnapKind, point: Vec2, objectId?: string) => {
    const distanceM = dist(point, q.cursor);
    if (distanceM > tol) return;
    if (
      !best ||
      RANK[kind] < RANK[best.kind] ||
      (RANK[kind] === RANK[best.kind] && distanceM < best.distanceM)
    ) {
      best = { kind, point, objectId, distanceM };
    }
  };

  for (const t of tracks) {
    if (q.excludeIds?.has(t.id)) continue;
    const g = t.geometry;
    if (g.kind === 'arc' && on.has('center')) consider('center', arcCenter(g), t.id);
    const b = bounds(g);
    if (
      q.cursor[0] < b.minX - tol || q.cursor[0] > b.maxX + tol ||
      q.cursor[1] < b.minY - tol || q.cursor[1] > b.maxY + tol
    ) {
      continue;
    }
    if (on.has('endpoint')) {
      consider('endpoint', g.start, t.id);
      consider('endpoint', endPose(g).point, t.id);
    }
    if (g.kind === 'arc' && on.has('tangent') && q.reference) {
      const r = Math.abs(g.signedRadiusM);
      for (const p of tangentPoints(arcCenter(g), r, q.reference)) {
        // Kun tangentpunkter som faktisk ligger på buen (nærmeste punkt = punktet selv).
        if (closestPoint(g, p).distanceM < 1e-9 * Math.max(1, r)) consider('tangent', p, t.id);
      }
    }
    if (on.has('nearest')) consider('nearest', closestPoint(g, q.cursor).point, t.id);
  }

  if (on.has('grid') && q.gridStepM && q.gridStepM > 0) {
    const s = q.gridStepM;
    consider('grid', [Math.round(q.cursor[0] / s) * s, Math.round(q.cursor[1] / s) * s]);
  }
  return best;
}
