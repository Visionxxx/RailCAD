import {
  isCrossing,
  isTrack,
  isTurnout,
  type RailObject,
  type TrackGeometry,
} from '@railcad/domain';
import { lerpElevation, type SegmentElevation } from '@railcad/geometry-ts';
import { geometryEngine as engine } from '../engine';

/** En polylinje i 3D (meter). `z` er null der koten er ukjent (tegnes da på nivå 0 og merkes). */
export interface Polyline3D {
  objectId: string;
  points: Array<{ x: number; y: number; z: number | null; headingRad: number }>;
}

const STEP_M = 2;
const MAX_POINTS = 400;

/**
 * Samler sporakser som punktrekker med kote, til skrivebeskyttet 3D-oversikt. Koten interpoleres
 * lineært mellom portkotene (samme modell som lengdeprofilen); ukjent kote gir z = null.
 */
export function collectPolylines(
  objects: readonly RailObject[],
  segmentsOf: (o: RailObject) => { segments: TrackGeometry[]; z: SegmentElevation[] } | null,
): Polyline3D[] {
  const out: Polyline3D[] = [];
  for (const o of objects) {
    if (!isTrack(o) && !isTurnout(o) && !isCrossing(o)) continue;
    const se = segmentsOf(o);
    if (!se) continue;
    se.segments.forEach((g, i) => {
      const len = engine.length(g);
      const n = Math.min(MAX_POINTS, Math.max(1, Math.ceil(len / STEP_M)));
      const e = se.z[i];
      const points = [];
      for (let k = 0; k <= n; k++) {
        const s = (len * k) / n;
        const pose = engine.poseAt(g, s);
        const p = pose.point;
        const z = e ? lerpElevation(e.zStart ?? undefined, e.zEnd ?? undefined, s, len) : undefined;
        points.push({ x: p[0], y: p[1], z: z ?? null, headingRad: pose.headingRad });
      }
      out.push({ objectId: o.id, points });
    });
  }
  return out;
}

/** Sporvidde for skjematisk skinnevisning (som i 2D-visningen; ikke overbygningsprosjektering). */
export const GAUGE_M = 1.435;

/** Skinnehodets midtlinje: aksen forskjøvet ±GAUGE_M/2 vinkelrett på retningen (positiv = venstre). */
export function railPoint(
  p: { x: number; y: number; headingRad: number },
  side: 1 | -1,
): { x: number; y: number } {
  const o = (side * GAUGE_M) / 2;
  return { x: p.x - Math.sin(p.headingRad) * o, y: p.y + Math.cos(p.headingRad) * o };
}
