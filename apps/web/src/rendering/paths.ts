import type { ArcGeometry, TrackGeometry } from '@railcad/domain';
import type { Bounds } from '@railcad/geometry-api';
import { geometryEngine as engine } from '../engine';

const pathCache = new WeakMap<TrackGeometry, string>();
const boundsCache = new WeakMap<TrackGeometry, Bounds>();

/** Cachet avgrensningsboks. Geometriobjekter er uforanderlige, så objektidentitet er nøkkel. */
export function cachedBounds(g: TrackGeometry): Bounds {
  let b = boundsCache.get(g);
  if (!b) {
    b = engine.bounds(g);
    boundsCache.set(g, b);
  }
  return b;
}

const f = (n: number) => +n.toFixed(6);

/**
 * SVG-sti i verdenskoordinater (Y opp). `sweep-flag = 1` betyr mot klokka i dette systemet,
 * dvs. venstrekurve. Buer deles i biter ≤ 180° så endepunktene aldri er tvetydige.
 */
export function trackPath(g: TrackGeometry): string {
  let d = pathCache.get(g);
  if (d !== undefined) return d;
  if (g.kind === 'line') {
    const e = engine.endPose(g).point;
    d = `M${f(g.start[0])} ${f(g.start[1])}L${f(e[0])} ${f(e[1])}`;
  } else {
    d = arcPath(g);
  }
  pathCache.set(g, d);
  return d;
}

function arcPath(g: ArcGeometry): string {
  const r = Math.abs(g.signedRadiusM);
  const length = engine.length(g);
  const pieces = Math.max(1, Math.ceil(g.sweepRad / Math.PI));
  const flag = g.signedRadiusM > 0 ? 1 : 0;
  let d = `M${f(g.start[0])} ${f(g.start[1])}`;
  for (let i = 1; i <= pieces; i++) {
    const p = engine.poseAt(g, (length * i) / pieces).point;
    d += `A${f(r)} ${f(r)} 0 0 ${flag} ${f(p[0])} ${f(p[1])}`;
  }
  return d;
}

export const GAUGE_M = 1.435; // normalspor – kun for skjematisk visning

/** Skjematisk skinnevisning: to parallelle skinner (null hvis forskyvningen er ugyldig). */
export function railPaths(g: TrackGeometry): string[] {
  const out: string[] = [];
  for (const side of [-1, 1]) {
    const o = engine.offset(g, (side * GAUGE_M) / 2);
    if (o) out.push(trackPath(o));
  }
  return out;
}
